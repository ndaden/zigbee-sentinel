import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MqttHandler } from '../../server/mqtt/handlers.js';
import { DatabaseService } from '../../server/db/index.js';
import { MqttService } from '../../server/mqtt/client.js';
import { runMqttMock } from '../../server/mqtt/mock.js';

describe('MqttHandler', () => {
  let db: DatabaseService;
  let handler: MqttHandler;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    handler = new MqttHandler(db, 'zigbee2mqtt');
  });

  afterEach(() => {
    db.close();
  });

  it('should parse zigbee2mqtt/bridge/devices and register all devices', () => {
    const rawDevices = JSON.stringify([
      {
        ieee_address: '0x001',
        friendly_name: 'Coordinator',
        type: 'Coordinator'
      },
      {
        ieee_address: '0x002',
        friendly_name: 'Ampoule Salon',
        type: 'Router',
        model_id: 'LWB010',
        definition: { vendor: 'Philips', model: 'Hue White' },
        power_source: 'Mains'
      },
      {
        ieee_address: '0x003',
        friendly_name: 'Capteur Porte',
        type: 'EndDevice',
        model_id: 'MCCGQ11LM',
        definition: { vendor: 'Aqara', model: 'Door Sensor' },
        power_source: 'Battery'
      }
    ]);

    handler.handleMessage('zigbee2mqtt/bridge/devices', Buffer.from(rawDevices));

    const devices = db.getDevices();
    expect(devices.length).toBe(2); // Coordinator excluded
    expect(devices.find(d => d.ieee_address === '0x002')?.vendor).toBe('Philips');
    expect(devices.find(d => d.ieee_address === '0x002')?.model).toBe('Hue White');
    expect(devices.find(d => d.ieee_address === '0x002')?.power_source).toBe('Mains');
    expect(devices.find(d => d.ieee_address === '0x003')?.vendor).toBe('Aqara');
  });

  it('should update battery and linkquality from device state topic', () => {
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice'
    });

    const state = JSON.stringify({
      battery: 84,
      linkquality: 125,
      contact: true
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte', Buffer.from(state));

    const device = db.getDevice('0x003');
    expect(device?.battery).toBe(84);
    expect(device?.linkquality).toBe(125);

    // Battery should also be recorded in history
    const batteryHistory = db.getBatteryHistory('0x003');
    expect(batteryHistory.length).toBe(1);
    expect(batteryHistory[0].battery).toBe(84);
  });

  it('should transition offline device to online and record connected event when telemetry arrives', () => {
    const t0 = Date.now() - 10000;
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice',
      status: 'offline'
    });
    db.recordEvent('0x003', 'disconnected', undefined, t0);

    const state = JSON.stringify({
      battery: 88,
      linkquality: 110
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte', Buffer.from(state));

    const device = db.getDevice('0x003');
    expect(device?.status).toBe('online');
    expect(device?.battery).toBe(88);

    const events = db.getEventHistory(10, '0x003');
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('connected');
    expect(events[0].duration_offline_ms).toBeGreaterThanOrEqual(9000);
  });

  it('should update availability status when availability message arrives', () => {
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice',
      status: 'online'
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte/availability', Buffer.from('offline'));

    const device = db.getDevice('0x003');
    expect(device?.status).toBe('offline');

    // Should record disconnected event
    const events = db.getEventHistory(10, '0x003');
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('disconnected');
  });

  it('should record duration_offline_ms when transitioning back to online', () => {
    const t0 = Date.now() - 5000;
    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice',
      status: 'online'
    });

    // Device goes offline at t0
    db.recordEvent('0x003', 'disconnected', undefined, t0);
    db.upsertDevice({
      ieee_address: '0x003',
      status: 'offline'
    });

    // Availability returns online
    handler.handleMessage('zigbee2mqtt/Capteur Porte/availability', Buffer.from('online'));

    const device = db.getDevice('0x003');
    expect(device?.status).toBe('online');

    const events = db.getEventHistory(10, '0x003');
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('connected');
    expect(events[0].duration_offline_ms).toBeGreaterThanOrEqual(4000);
  });

  it('should notify callback on device update and bridge status', () => {
    const notifySpy = vi.fn();
    handler.setListener(notifySpy);

    handler.handleMessage('zigbee2mqtt/bridge/state', Buffer.from('online'));
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bridge_status',
        data: expect.objectContaining({ state: 'online' })
      })
    );

    db.upsertDevice({
      ieee_address: '0x003',
      friendly_name: 'Capteur Porte',
      type: 'EndDevice'
    });

    handler.handleMessage('zigbee2mqtt/Capteur Porte/availability', Buffer.from('online'));
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'device_updated',
        data: expect.objectContaining({ ieee_address: '0x003', status: 'online' })
      })
    );
  });

  it('should handle bridge/response messages and log diagnostic results', () => {
    db.upsertDevice({
      ieee_address: '0x002',
      friendly_name: 'Ampoule Salon',
      type: 'Router'
    });

    const responsePayload = JSON.stringify({
      data: { id: 'Ampoule Salon' },
      status: 'ok'
    });

    handler.handleMessage('zigbee2mqtt/bridge/response/device/ping', Buffer.from(responsePayload));

    const logs = db.getDiagnosticLogs('0x002');
    expect(logs.length).toBe(1);
    expect(logs[0].action_type).toBe('ping');
    expect(logs[0].status).toBe('success');
  });

  it('should automatically restore identity and rename device on bridge/event device_joined', async () => {
    const mockRename = vi.fn().mockResolvedValue(true);
    handler.setRenameCallback(mockRename);

    const ieee = '0x00158d0001a2b3c4';
    db.savePendingRestoration(ieee, 'Capteur Porte Entree', '[Entrée] Porte Principale', 300);

    const notifications: any[] = [];
    handler.setListener((n) => notifications.push(n));

    // Simulate device joining with raw IEEE address as friendly_name
    handler.handleMessage(
      'zigbee2mqtt/bridge/event',
      Buffer.from(
        JSON.stringify({
          type: 'device_joined',
          data: {
            ieee_address: ieee,
            friendly_name: ieee,
          },
        })
      )
    );

    // Wait microtask
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRename).toHaveBeenCalledWith(ieee, 'Capteur Porte Entree');

    const dev = db.getDevice(ieee);
    expect(dev?.friendly_name).toBe('Capteur Porte Entree');
    expect(dev?.custom_name).toBe('[Entrée] Porte Principale');
    expect(dev?.status).toBe('online');

    const restoration = db.getPendingRestoration(ieee);
    expect(restoration?.status).toBe('restored');

    const restoredNotif = notifications.find((n) => n.type === 'device_restored');
    expect(restoredNotif).toBeDefined();
    expect(restoredNotif.data.friendly_name).toBe('Capteur Porte Entree');
    expect(restoredNotif.data.custom_name).toBe('[Entrée] Porte Principale');
  });
});

describe('MqttService and runMqttMock', () => {
  let db: DatabaseService;
  let service: MqttService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    service = new MqttService({
      brokerUrl: 'mqtt://127.0.0.1:1883',
      baseTopic: 'zigbee2mqtt',
      db,
      mock: true
    });
  });

  afterEach(async () => {
    await service.close();
    db.close();
  });

  it('should initialize in mock mode and populate 4 mock devices', async () => {
    runMqttMock(service, db);

    const devices = db.getDevices();
    expect(devices.length).toBe(4);

    const onlineRouter = devices.find(d => d.type === 'Router' && d.status === 'online');
    const offlineRouter = devices.find(d => d.type === 'Router' && d.status === 'offline');
    const onlineSensor = devices.find(d => d.type === 'EndDevice' && d.status === 'online');
    const offlineSensor = devices.find(d => d.type === 'EndDevice' && d.status === 'offline');

    expect(onlineRouter).toBeDefined();
    expect(offlineRouter).toBeDefined();
    expect(onlineSensor).toBeDefined();
    expect(offlineSensor).toBeDefined();
    expect(offlineSensor?.battery).toBeLessThanOrEqual(15);
  });

  it('should execute pingDevice and receive mock response', async () => {
    runMqttMock(service, db);

    const devices = db.getDevices();
    const target = devices.find(d => d.status === 'online')!;

    const result = await service.pingDevice(target.friendly_name);
    expect(result).toBe(true);
  });

  it('should return false when pinging an offline device in mock mode', async () => {
    runMqttMock(service, db);

    const devices = db.getDevices();
    const offlineTarget = devices.find(d => d.status === 'offline')!;

    const result = await service.pingDevice(offlineTarget.friendly_name);
    expect(result).toBe(false);
  });

  it('should execute permitJoin and receive mock response', async () => {
    runMqttMock(service, db);

    const result = await service.permitJoin(60);
    expect(result).toBe(true);
  });

  it('should execute reinterviewDevice and receive mock response', async () => {
    runMqttMock(service, db);

    const devices = db.getDevices();
    const target = devices[0];

    const result = await service.reinterviewDevice(target.friendly_name);
    expect(result).toBe(true);
  });

  it('should parse auth string into username and password', () => {
    const authService = new MqttService({
      db,
      auth: 'jeedom:d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi',
      mock: true,
    });

    expect(authService.getUsername()).toBe('jeedom');
    expect(authService.getPassword()).toBe('d0R25N0IGWBuCu6IV7whLgTq4qfU1xSZ3dgib58rN1wiQ6nyz85dmbZotMCvcJUi');
  });

  it('should correctly handle passwords containing colons', () => {
    const authService = new MqttService({
      db,
      auth: 'custom_user:pass:word:with:colons',
      mock: true,
    });

    expect(authService.getUsername()).toBe('custom_user');
    expect(authService.getPassword()).toBe('pass:word:with:colons');
  });

  it('should execute renameDevice and receive mock response', async () => {
    runMqttMock(service, db);
    const result = await service.renameDevice('0x00158d0001aaaa04', 'Capteur Porte Renomme');
    expect(result).toBe(true);
  });
});
