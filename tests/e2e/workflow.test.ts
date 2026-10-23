import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/app.js';
import { DatabaseService } from '../../server/db/index.js';

describe('E2E Diagnostic & Reconnect Workflow', () => {
  let app: FastifyInstance;
  let db: DatabaseService;

  const distClientDir = path.resolve(process.cwd(), 'dist/client');
  const distClientHtml = path.join(distClientDir, 'index.html');
  let fixtureCreated = false;

  beforeAll(() => {
    if (!fs.existsSync(distClientHtml)) {
      fs.mkdirSync(distClientDir, { recursive: true });
      fs.writeFileSync(
        distClientHtml,
        '<!DOCTYPE html><html><head><title>Zigbee Sentinel</title></head><body><div id="root"></div></body></html>',
        'utf-8'
      );
      fixtureCreated = true;
    }
  });

  afterAll(() => {
    if (fixtureCreated && fs.existsSync(distClientHtml)) {
      fs.unlinkSync(distClientHtml);
    }
  });

  beforeEach(async () => {
    db = new DatabaseService(':memory:');
    app = await buildApp({ db, mockMqtt: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('Test 1: Full offline sensor diagnostic workflow (dead battery -> permit join)', async () => {
    // 1. Fetch devices and locate Capteur Porte Entree
    const devicesRes = await app.inject({ method: 'GET', url: '/api/devices' });
    expect(devicesRes.statusCode).toBe(200);
    const devices = JSON.parse(devicesRes.payload);

    const doorSensor = devices.find(
      (d: any) => d.friendly_name === 'Capteur Porte Entree'
    );
    expect(doorSensor).toBeDefined();
    expect(doorSensor.status).toBe('offline');
    expect(doorSensor.battery).toBe(12);
    expect(doorSensor.type).toBe('EndDevice');

    // 2. Request diagnostic on Capteur Porte Entree
    const diagRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${doorSensor.ieee_address}/diagnose`,
    });
    expect(diagRes.statusCode).toBe(200);
    const diag = JSON.parse(diagRes.payload);

    expect(diag.likelyCause).toBe('dead_battery');
    expect(diag.severity).toBe('critical');
    expect(diag.verdict).toContain('pile');
    expect(diag.recommendedActions.length).toBeGreaterThan(0);

    // Verify permit_join action is proposed
    const permitJoinAction = diag.recommendedActions.find(
      (a: any) => a.type === 'permit_join' || a.id === 'permit_join'
    );
    expect(permitJoinAction).toBeDefined();

    // 3. Trigger permit join as recommended
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/bridge/permit-join',
      payload: { time: 120 },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinData = JSON.parse(joinRes.payload);
    expect(joinData.success).toBe(true);
    expect(joinData.time).toBe(120);
  });

  it('Test 2: Offline router diagnostic workflow (mains power loss -> ping device)', async () => {
    // 1. Fetch devices and locate Ampoule Cuisine
    const devicesRes = await app.inject({ method: 'GET', url: '/api/devices' });
    expect(devicesRes.statusCode).toBe(200);
    const devices = JSON.parse(devicesRes.payload);

    const router = devices.find(
      (d: any) => d.friendly_name === 'Ampoule Cuisine'
    );
    expect(router).toBeDefined();
    expect(router.status).toBe('offline');
    expect(router.type).toBe('Router');
    expect(router.power_source).toBe('Mains');

    // 2. Run diagnostic
    const diagRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${router.ieee_address}/diagnose`,
    });
    expect(diagRes.statusCode).toBe(200);
    const diag = JSON.parse(diagRes.payload);

    expect(diag.likelyCause).toBe('mains_power_loss');
    expect(diag.severity).toBe('critical');
    expect(diag.recommendedActions.some((a: any) => a.id === 'ping')).toBe(true);
    expect(diag.recommendedActions.some((a: any) => a.id === 'interview')).toBe(true);

    // 3. Trigger ping on offline router -> should fail gracefully
    const pingRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${router.ieee_address}/ping`,
    });
    expect(pingRes.statusCode).toBe(200);
    const pingData = JSON.parse(pingRes.payload);
    expect(pingData.success).toBe(false);
    expect(pingData.friendly_name).toBe('Ampoule Cuisine');
    expect(pingData.ieee).toBe(router.ieee_address);

    // 4. Trigger ping on online router (Prise Salon) -> should succeed
    const onlineRouter = devices.find(
      (d: any) => d.friendly_name === 'Prise Salon'
    );
    expect(onlineRouter).toBeDefined();

    const onlinePingRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${onlineRouter.ieee_address}/ping`,
    });
    expect(onlinePingRes.statusCode).toBe(200);
    const onlinePingData = JSON.parse(onlinePingRes.payload);
    expect(onlinePingData.success).toBe(true);
  });

  it('Test 3: History API verification (seeded battery history and event logs)', async () => {
    const doorSensorIeee = '0x00158d0001aaaa04';

    // 1. Fetch full history for Capteur Porte Entree
    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/devices/${doorSensorIeee}/history`,
    });
    expect(historyRes.statusCode).toBe(200);
    const history = JSON.parse(historyRes.payload);

    // Check battery history
    expect(history.battery).toBeDefined();
    expect(history.battery.length).toBeGreaterThanOrEqual(4);
    const batteryLevels = history.battery.map((b: any) => b.battery);
    expect(batteryLevels).toEqual(expect.arrayContaining([45, 28, 18, 12]));

    // Check event history
    expect(history.events).toBeDefined();
    expect(history.events.length).toBeGreaterThanOrEqual(2);
    const eventTypes = history.events.map((e: any) => e.event_type);
    expect(eventTypes).toContain('connected');
    expect(eventTypes).toContain('disconnected');

    // 2. Check query limit works
    const limitedRes = await app.inject({
      method: 'GET',
      url: `/api/devices/${doorSensorIeee}/history?limit=2`,
    });
    expect(limitedRes.statusCode).toBe(200);
    const limitedHistory = JSON.parse(limitedRes.payload);
    expect(limitedHistory.battery.length).toBe(2);

    // 3. Unknown device returns 404
    const notFoundRes = await app.inject({
      method: 'GET',
      url: '/api/devices/0xnonexistent/history',
    });
    expect(notFoundRes.statusCode).toBe(404);
  });

  it('Test 4: Static files serving check (GET / returns HTML)', async () => {
    // 1. Root should return index.html
    const rootRes = await app.inject({
      method: 'GET',
      url: '/',
    });
    expect(rootRes.statusCode).toBe(200);
    expect(rootRes.headers['content-type']).toContain('text/html');
    expect(rootRes.payload).toContain('<!DOCTYPE html>');
    expect(rootRes.payload).toContain('Zigbee Sentinel');

    // 2. SPA client-side fallback route
    const spaRes = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });
    expect(spaRes.statusCode).toBe(200);
    expect(spaRes.headers['content-type']).toContain('text/html');

    // 3. Unknown API route returns 404 JSON, not HTML
    const apiRes = await app.inject({
      method: 'GET',
      url: '/api/nonexistent-endpoint',
    });
    expect(apiRes.statusCode).toBe(404);
    const apiError = JSON.parse(apiRes.payload);
    expect(apiError.error).toBe('Endpoint not found');
  });
});
