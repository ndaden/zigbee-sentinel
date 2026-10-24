import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../../server/app.js';
import { DatabaseService } from '../../server/db/index.js';

describe('Fastify REST API & WebSocket Server', () => {
  let app: any;
  let db: DatabaseService;

  beforeEach(async () => {
    db = new DatabaseService(':memory:');
    db.upsertDevice({
      ieee_address: '0x111',
      friendly_name: 'Lampe Bureau',
      type: 'Router',
      status: 'online',
      linkquality: 100,
      battery: null,
    });

    app = await buildApp({ db, mockMqtt: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  describe('REST Endpoints', () => {
    it('GET /api/devices should return all devices', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/devices',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.length).toBe(1);
      expect(body[0].friendly_name).toBe('Lampe Bureau');
      expect(body[0].ieee_address).toBe('0x111');
    });

    it('GET /api/devices/:ieee/history should return battery and event history', async () => {
      const now = Date.now();
      db.recordBattery('0x111', 95, now - 1000);
      db.recordEvent('0x111', 'connected', undefined, now - 1000);

      const res = await app.inject({
        method: 'GET',
        url: '/api/devices/0x111/history',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.battery).toBeDefined();
      expect(body.events).toBeDefined();
      expect(body.battery.length).toBe(1);
      expect(body.battery[0].battery).toBe(95);
      expect(body.events.length).toBe(1);
      expect(body.events[0].event_type).toBe('connected');
    });

    it('GET /api/devices/:ieee/history should sanitize limit query parameter gracefully', async () => {
      // Test invalid non-number fallback to default 100
      const invalidRes = await app.inject({
        method: 'GET',
        url: '/api/devices/0x111/history?limit=invalid',
      });
      expect(invalidRes.statusCode).toBe(200);

      // Test negative number fallback to default 100
      const negRes = await app.inject({
        method: 'GET',
        url: '/api/devices/0x111/history?limit=-5',
      });
      expect(negRes.statusCode).toBe(200);

      // Test upper clamp at 1000
      const largeRes = await app.inject({
        method: 'GET',
        url: '/api/devices/0x111/history?limit=5000',
      });
      expect(largeRes.statusCode).toBe(200);
    });

    it('GET /api/devices/:ieee/history should return 404 for unknown device', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/devices/0x999/history',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeDefined();
    });

    it('POST /api/devices/:ieee/diagnose should return diagnostic report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/diagnose',
      });
      expect(res.statusCode).toBe(200);
      const report = JSON.parse(res.payload);
      expect(report.verdict).toBeDefined();
      expect(report.recommendedActions).toBeDefined();
      expect(report.severity).toBeDefined();
      expect(report.details).toBeDefined();
    });

    it('POST /api/devices/:ieee/diagnose should return 404 for unknown device', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x999/diagnose',
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeDefined();
    });

    it('POST /api/devices/:ieee/ping should return ping command response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/ping',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBeDefined();
      expect(body.ieee).toBe('0x111');
    });

    it('POST /api/devices/:ieee/ping should return 404 for unknown device', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x999/ping',
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/devices/:ieee/interview should return interview command response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/interview',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBeDefined();
      expect(body.ieee).toBe('0x111');
    });

    it('POST /api/devices/:ieee/interview should return 404 for unknown device', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x999/interview',
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/bridge/permit-join should trigger permit join', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/bridge/permit-join',
        payload: { time: 60 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBeDefined();
      expect(body.time).toBe(60);
    });

    it('POST /api/devices/:ieee/diagnose should succeed with empty JSON body without 400 error', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/diagnose',
        headers: { 'content-type': 'application/json' },
      });
      expect(res.statusCode).toBe(200);
      const report = JSON.parse(res.payload);
      expect(report.verdict).toBeDefined();
    });

    it('GET /api/devices/:ieee/diagnose should also return diagnostic report', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/devices/0x111/diagnose',
      });
      expect(res.statusCode).toBe(200);
      const report = JSON.parse(res.payload);
      expect(report.verdict).toBeDefined();
    });

    it('POST /api/devices/:ieee/configure should trigger device reconfiguration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/configure',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.ieee).toBe('0x111');
      expect(body.friendly_name).toBe('Lampe Bureau');
    });

    it('POST /api/devices/:ieee/reset should remove and permit join', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/devices/0x111/reset',
        payload: { permitJoinTime: 120 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.permitJoinTime).toBe(120);
    });

    it('POST /api/bridge/restart should trigger Zigbee2MQTT restart', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/bridge/restart',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.message).toBeDefined();
    });

    it('GET /api/status should return bridge, coordinator, and MQTT connection status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/status',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.mqttConnected).toBeDefined();
      expect(body.bridge).toBeDefined();
    });
  });

  describe('WebSocket Server', () => {
    it('should send initial_state on connection and broadcast updates', async () => {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 8090;

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

      const receivedMessages: any[] = [];
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {});
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          receivedMessages.push(msg);
          if (receivedMessages.length === 1) {
            resolve();
          }
        });
        ws.on('error', reject);
      });

      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      expect(receivedMessages[0].type).toBe('initial_state');
      expect(receivedMessages[0].data.devices).toBeDefined();
      expect(receivedMessages[0].data.devices.length).toBe(1);
      expect(receivedMessages[0].data.devices[0].friendly_name).toBe('Lampe Bureau');

      // Test broadcasting a device update via MQTT handler
      const messagePromise = new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'device_updated') {
            resolve(msg);
          }
        });
      });

      // Emulate MQTT message arriving
      app.mqttService.handleMessage(
        'zigbee2mqtt/Lampe Bureau',
        Buffer.from(JSON.stringify({ linkquality: 180 }))
      );

      const updateMsg = await messagePromise;
      expect(updateMsg.type).toBe('device_updated');
      expect(updateMsg.data.linkquality).toBe(180);

      ws.close();
    });
  });
});
