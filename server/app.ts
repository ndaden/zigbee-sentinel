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
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      const battery = db.getBatteryHistory(device.ieee_address, limit);
      const events = db.getEventHistory(limit, device.ieee_address);

      return reply.status(200).send({ battery, events });
    }
  );

  app.post<{ Params: { ieee: string } }>(
    '/api/devices/:ieee/diagnose',
    async (req, reply) => {
      const { ieee } = req.params;
      const device = db.getDevice(ieee) || db.getDeviceByFriendlyName(ieee);

      if (!device) {
        return reply.status(404).send({ error: `Device '${ieee}' not found` });
      }

      const batteryHistory = db.getBatteryHistory(device.ieee_address);
      const report = DiagnosticEngine.analyze(device, batteryHistory as any);

      return reply.status(200).send(report);
    }
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

  // Serve static files from dist/ if available
  const distPath = path.resolve(process.cwd(), 'dist');
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
