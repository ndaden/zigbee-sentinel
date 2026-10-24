import path from 'node:path';
import fs from 'node:fs';
import fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { DatabaseService } from './db/index.js';
import { MqttService } from './mqtt/client.js';
import { runMqttMock } from './mqtt/mock.js';
import { DiagnosticEngine } from './diagnostic/engine.js';
import { WebSocketManager } from './ws/server.js';
import { fetchJeedomDevices, matchJeedomDeviceToZigbee } from './jeedom/client.js';

export interface BuildAppOptions {
  db?: DatabaseService;
  mqttService?: MqttService;
  mockMqtt?: boolean;
  baseTopic?: string;
  enableStatic?: boolean;
  logger?: boolean | any;
  seedMock?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = fastify({
    logger: options.logger ?? false,
  });

  // Tolerate empty JSON bodies gracefully without failing with FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string | Buffer, done) => {
      try {
        const str = typeof body === 'string' ? body : body?.toString('utf-8');
        const json = str && str.trim() !== '' ? JSON.parse(str) : {};
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  const db = options.db ?? new DatabaseService();
  const isMock = options.mockMqtt ?? process.env.MOCK_MQTT === 'true';
  const mqttService =
    options.mqttService ??
    new MqttService({
      db,
      mock: isMock,
      baseTopic: options.baseTopic,
    });

  // If mock mode is requested and database is empty (or explicitly requested), start full mock simulation
  let mockSimulator: { stop: () => void } | null = null;
  const shouldSeedMock = options.seedMock ?? (isMock && db.getDevices().length === 0);
  if (shouldSeedMock) {
    mockSimulator = runMqttMock(mqttService, db);
  }

  // If mock mode is requested and mockSimulator was not started,
  // respond to requests in mock mode so ping/interview/permit_join don't timeout.
  let removeMockResponder: (() => void) | null = null;
  if (isMock && !mockSimulator) {
    const baseTopic = mqttService.baseTopic;
    const mockResponder = (topic: string, message: Buffer) => {
      try {
        const payload = JSON.parse(message.toString('utf-8'));
        if (topic === `${baseTopic}/bridge/request/device/ping`) {
          const id = payload.id;
          const dev = db.getDevices().find((d) => d.friendly_name === id || d.ieee_address === id);
          const isOnline = dev ? dev.status === 'online' : true;
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/ping`,
            Buffer.from(
              JSON.stringify({
                data: { id },
                status: isOnline ? 'ok' : 'error',
                ...(isOnline ? {} : { error: `Device '${id}' did not respond to ping` }),
              })
            )
          );
        } else if (topic === `${baseTopic}/bridge/request/device/interview`) {
          const id = payload.id;
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/interview`,
            Buffer.from(JSON.stringify({ data: { id }, status: 'ok' }))
          );
        } else if (topic === `${baseTopic}/bridge/request/device/configure`) {
          const id = payload.id;
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/configure`,
            Buffer.from(JSON.stringify({ data: { id }, status: 'ok' }))
          );
        } else if (topic === `${baseTopic}/bridge/request/device/remove`) {
          const id = payload.id;
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/device/remove`,
            Buffer.from(JSON.stringify({ data: { id, block: false, force: true }, status: 'ok' }))
          );
        } else if (topic === `${baseTopic}/bridge/request/restart`) {
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/restart`,
            Buffer.from(JSON.stringify({ data: {}, status: 'ok' }))
          );
        } else if (topic === `${baseTopic}/bridge/request/permit_join`) {
          const time = payload.time ?? 120;
          const value = payload.value !== false;
          mqttService.handleMessage(
            `${baseTopic}/bridge/response/permit_join`,
            Buffer.from(JSON.stringify({ data: { time, value }, status: 'ok' }))
          );
        }
      } catch {
        // Ignore unparseable
      }
    };

    mqttService.on('publish', mockResponder);
    removeMockResponder = () => {
      mqttService.off('publish', mockResponder);
    };
  }

  const wsManager = new WebSocketManager(db, mqttService);

  // Expose services on Fastify instance
  app.decorate('db', db);
  app.decorate('mqttService', mqttService);
  app.decorate('wsManager', wsManager);

  // Register WebSocket plugin
  await app.register(fastifyWebsocket);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket, _req) => {
    wsManager.handleConnection(socket);
  });

  // REST API Routes
  app.get('/api/devices', async (_req, reply) => {
    const devices = db.getDevices();
    return reply.status(200).send(devices);
  });

  app.get<{ Params: { ieee: string }; Querystring: { limit?: string } }>(
    '/api/devices/:ieee/history',
    async (req, reply) => {
      const { ieee } = req.params;
      const parsed = parseInt(req.query.limit || '', 10);
      const limit = Number.isInteger(parsed) && parsed > 0 ? Math.min(1000, parsed) : 100;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      const battery = db.getBatteryHistory(device.ieee_address, limit);
      const events = db.getEventHistory(limit, device.ieee_address);

      return reply.status(200).send({ battery, events });
    }
  );

  const handleDiagnose = async (
    req: { params: { ieee: string } },
    reply: { status: (code: number) => { send: (body: any) => any } }
  ) => {
    const { ieee } = req.params;
    const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

    if (!device) {
      return reply.status(404).send({ error: `Device '${ieee}' not found` });
    }

    const batteryHistory = db.getBatteryHistory(device.ieee_address);
    const report = DiagnosticEngine.analyze(device, batteryHistory);

    return reply.status(200).send(report);
  };

  app.get<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/diagnose',
    handleDiagnose
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/diagnose',
    handleDiagnose
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/ping',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      if (!mqttService) {
        return reply.status(503).send({ error: 'MQTT service not available' });
      }

      const success = await mqttService.pingDevice(device.friendly_name);
      return reply.status(200).send({
        success,
        ieee: device.ieee_address,
        friendly_name: device.friendly_name,
      });
    }
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/interview',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      if (!mqttService) {
        return reply.status(503).send({ error: 'MQTT service not available' });
      }

      const success = await mqttService.reinterviewDevice(device.friendly_name);
      return reply.status(200).send({
        success,
        ieee: device.ieee_address,
        friendly_name: device.friendly_name,
      });
    }
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/configure',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      if (!mqttService) {
        return reply.status(503).send({ error: 'MQTT service not available' });
      }

      const success = await mqttService.configureDevice(device.friendly_name);
      return reply.status(200).send({
        success,
        ieee: device.ieee_address,
        friendly_name: device.friendly_name,
      });
    }
  );

  app.post<{ Params: { ieee: string }; Body?: { permitJoinTime?: number } }>(
    '/api/devices/:ieee/reset',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      if (!mqttService) {
        return reply.status(503).send({ error: 'MQTT service not available' });
      }

      const permitJoinTime = req.body?.permitJoinTime ?? 120;

      // Save pending restoration to guarantee full identity and Jeedom scenarios preservation upon re-joining
      db.savePendingRestoration(
        device.ieee_address,
        device.friendly_name,
        device.custom_name,
        Math.max(600, permitJoinTime + 600)
      );

      const success = await mqttService.resetDevice(device.friendly_name, permitJoinTime);

      wsManager.broadcast({
        type: 'device_repairing_started',
        data: {
          ieee: device.ieee_address,
          friendly_name: device.friendly_name,
          custom_name: device.custom_name,
          permitJoinTime,
        },
      });

      return reply.status(200).send({
        success,
        ieee: device.ieee_address,
        friendly_name: device.friendly_name,
        custom_name: device.custom_name,
        permitJoinTime,
        preservation: true,
      });
    }
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/cancel-repair',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      db.cancelPendingRestoration(device.ieee_address);
      return reply.status(200).send({
        success: true,
        ieee: device.ieee_address,
      });
    }
  );

  app.post<{ Body?: { time?: number; seconds?: number } }>(
    '/api/bridge/permit-join',
    async (req, reply) => {
      if (!mqttService) {
        return reply.status(503).send({ error: 'MQTT service not available' });
      }

      const body = req.body || {};
      const seconds = body.time ?? body.seconds ?? 120;
      const success = await mqttService.permitJoin(seconds);

      return reply.status(200).send({ success, time: seconds });
    }
  );

  app.post('/api/bridge/restart', async (_req, reply) => {
    if (!mqttService) {
      return reply.status(503).send({ error: 'MQTT service not available' });
    }

    const success = await mqttService.restartBridge();
    return reply.status(200).send({
      success,
      message: success
        ? 'Commande de redémarrage transmise avec succès au pont Zigbee2MQTT'
        : 'Le pont Zigbee2MQTT n’a pas répondu à la commande de redémarrage dans le délai imparti',
    });
  });

  app.post<{ Params: { ieee: string }; Body?: { custom_name?: string } }>(
    '/api/devices/:ieee/rename',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      const customName = req.body?.custom_name?.trim() || null;
      db.updateDeviceCustomName(device.ieee_address, customName);

      const updated = db.getDevice(device.ieee_address);
      if (updated) {
        wsManager.broadcast({ type: 'device_updated', data: updated });
      }

      return reply.status(200).send({
        success: true,
        ieee: device.ieee_address,
        custom_name: customName,
      });
    }
  );

  app.get('/api/jeedom/status', async (_req, reply) => {
    const configured = Boolean(
      process.env.JEEDOM_API_KEY && process.env.JEEDOM_API_KEY.trim() !== ''
    );
    return reply.status(200).send({
      configured,
      url: process.env.JEEDOM_URL || 'http://127.0.0.1',
    });
  });

  app.post<{ Body?: { apiKey?: string; url?: string } }>(
    '/api/jeedom/sync',
    async (req, reply) => {
      const apiKey = req.body?.apiKey || process.env.JEEDOM_API_KEY || '';
      const url = req.body?.url || process.env.JEEDOM_URL || 'http://127.0.0.1';

      if (!apiKey || apiKey.trim() === '') {
        return reply.status(400).send({
          error:
            'Clé API Jeedom manquante. Veuillez renseigner JEEDOM_API_KEY ou fournir la clé dans la requête.',
        });
      }

      try {
        const jeedomDevices = await fetchJeedomDevices(url, apiKey);
        const zigbeeDevices = db.getDevices();

        const synced: Array<{ ieee: string; previousName: string; newName: string }> = [];

        for (const eq of jeedomDevices) {
          const match = matchJeedomDeviceToZigbee(eq, zigbeeDevices);
          if (match) {
            const rawHumanName = eq.humanName || eq.name;
            const newName = rawHumanName.trim();
            if (newName) {
              db.updateDeviceCustomName(match.ieee_address, newName);
              const updated = db.getDevice(match.ieee_address);
              if (updated) {
                wsManager.broadcast({ type: 'device_updated', data: updated });
              }
              synced.push({
                ieee: match.ieee_address,
                previousName: match.friendly_name,
                newName,
              });
            }
          }
        }

        return reply.status(200).send({
          success: true,
          count: synced.length,
          totalJeedomDevices: jeedomDevices.length,
          synced,
        });
      } catch (err: any) {
        return reply.status(500).send({
          error: err?.message || 'Erreur lors de la synchronisation avec Jeedom',
        });
      }
    }
  );

  app.get('/api/status', async (_req, reply) => {
    const bridgeState = mqttService
      ? mqttService.getHandler().getBridgeState()
      : { state: 'offline', info: null };
    const isConnected = mqttService ? mqttService.isConnected() : false;

    return reply.status(200).send({
      mqttConnected: isConnected,
      bridge: bridgeState.state,
      bridgeState: bridgeState.state,
      bridgeInfo: bridgeState.info,
      coordinator: bridgeState.info?.coordinator ?? null,
    });
  });

  // Serve static files from dist/client if available
  const distPath = path.resolve(process.cwd(), 'dist/client');
  if (
    options.enableStatic !== false &&
    fs.existsSync(distPath) &&
    fs.existsSync(path.join(distPath, 'index.html'))
  ) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Cleanup hook
  app.addHook('onClose', async () => {
    if (mockSimulator) {
      mockSimulator.stop();
    }
    if (removeMockResponder) {
      removeMockResponder();
    }
    wsManager.close();
  });

  return app;
}
