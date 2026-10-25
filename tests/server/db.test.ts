import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../server/db/index';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    // In-memory database for testing
    db = new DatabaseService(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should upsert and retrieve a device', () => {
    db.upsertDevice({
      ieee_address: '0x00158d0001a2b3c4',
      friendly_name: 'Capteur Salon',
      type: 'EndDevice',
      model: 'WSDCGQ11LM',
      vendor: 'Xiaomi',
      power_source: 'Battery',
      status: 'online',
      battery: 92,
      linkquality: 110,
      last_seen: Date.now()
    });

    const device = db.getDevice('0x00158d0001a2b3c4');
    expect(device).not.toBeNull();
    expect(device?.friendly_name).toBe('Capteur Salon');
    expect(device?.battery).toBe(92);
    expect(device?.type).toBe('EndDevice');
    expect(device?.model).toBe('WSDCGQ11LM');
    expect(device?.vendor).toBe('Xiaomi');
    expect(device?.power_source).toBe('Battery');
    expect(device?.status).toBe('online');
    expect(device?.linkquality).toBe(110);
  });

  it('should update an existing device with partial fields', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({
      ieee_address: ieee,
      friendly_name: 'Capteur Salon',
      type: 'EndDevice',
      status: 'online',
      battery: 92
    });

    // Update only status and battery
    db.upsertDevice({
      ieee_address: ieee,
      status: 'offline',
      battery: 88
    });

    const device = db.getDevice(ieee);
    expect(device).not.toBeNull();
    expect(device?.friendly_name).toBe('Capteur Salon'); // preserved
    expect(device?.type).toBe('EndDevice'); // preserved
    expect(device?.status).toBe('offline'); // updated
    expect(device?.battery).toBe(88); // updated
  });

  it('should list all devices', () => {
    db.upsertDevice({ ieee_address: '0x01', friendly_name: 'Device A', type: 'EndDevice' });
    db.upsertDevice({ ieee_address: '0x02', friendly_name: 'Device B', type: 'Router' });

    const devices = db.getDevices();
    expect(devices.length).toBe(2);
    expect(devices.map((d) => d.ieee_address)).toContain('0x01');
    expect(devices.map((d) => d.ieee_address)).toContain('0x02');
  });

  it('should record battery history and limit results', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
    db.recordBattery(ieee, 95);
    db.recordBattery(ieee, 92);
    db.recordBattery(ieee, 90);

    const history = db.getBatteryHistory(ieee);
    expect(history.length).toBe(3);
    expect(history[0].battery).toBe(90); // newest first

    const limitedHistory = db.getBatteryHistory(ieee, 2);
    expect(limitedHistory.length).toBe(2);
    expect(limitedHistory[0].battery).toBe(90);
    expect(limitedHistory[1].battery).toBe(92);
  });

  it('should record and retrieve connection events', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
    db.recordEvent(ieee, 'disconnected');
    db.recordEvent(ieee, 'connected', 3600000);

    const events = db.getEventHistory();
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('connected');
    expect(events[0].duration_offline_ms).toBe(3600000);
  });

  it('should record and retrieve diagnostic logs', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
    db.recordDiagnosticLog(ieee, 'ping', 'success', JSON.stringify({ rtt: 45 }));
    db.recordDiagnosticLog(ieee, 'interview', 'pending');

    const logs = db.getDiagnosticLogs(ieee);
    expect(logs.length).toBe(2);
    expect(logs[0].action_type).toBe('interview');
    expect(logs[0].status).toBe('pending');
    expect(logs[1].action_type).toBe('ping');
    expect(logs[1].status).toBe('success');
    expect(logs[1].details).toBe(JSON.stringify({ rtt: 45 }));
  });

  it('should purge old records older than retentionDays', () => {
    const ieee = '0x00158d0001a2b3c4';
    db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });

    const oneDayMs = 24 * 60 * 60 * 1000;
    const oldTimestamp = Date.now() - 70 * oneDayMs; // 70 days ago
    const recentTimestamp = Date.now() - 10 * oneDayMs; // 10 days ago

    // Insert historical data with explicit timestamps
    db.recordBattery(ieee, 80, oldTimestamp);
    db.recordBattery(ieee, 90, recentTimestamp);

    db.recordEvent(ieee, 'disconnected', undefined, oldTimestamp);
    db.recordEvent(ieee, 'connected', 1000, recentTimestamp);

    db.recordDiagnosticLog(ieee, 'ping', 'failure', 'old timeout', oldTimestamp);
    db.recordDiagnosticLog(ieee, 'ping', 'success', 'recent ok', recentTimestamp);

    // Default purge with retention of 60 days
    db.purgeOldRecords(60);

    const batteryHistory = db.getBatteryHistory(ieee);
    expect(batteryHistory.length).toBe(1);
    expect(batteryHistory[0].battery).toBe(90);

    const eventHistory = db.getEventHistory();
    expect(eventHistory.length).toBe(1);
    expect(eventHistory[0].event_type).toBe('connected');

    const diagLogs = db.getDiagnosticLogs(ieee);
    expect(diagLogs.length).toBe(1);
    expect(diagLogs[0].status).toBe('success');
  });

  describe('pending restorations', () => {
    it('should save and retrieve pending restorations', () => {
      const ieee = '0x00158d0001a2b3c4';
      db.savePendingRestoration(ieee, 'Capteur Salon', '[Salon] Capteur Temp', 300);

      const res = db.getPendingRestoration(ieee);
      expect(res).not.toBeNull();
      expect(res?.ieee_address).toBe(ieee);
      expect(res?.previous_friendly_name).toBe('Capteur Salon');
      expect(res?.custom_name).toBe('[Salon] Capteur Temp');
      expect(res?.status).toBe('pending');
      expect(res?.expires_at).toBeGreaterThan(Date.now());
    });

    it('should complete pending restoration', () => {
      const ieee = '0x00158d0001a2b3c4';
      db.savePendingRestoration(ieee, 'Capteur Salon', '[Salon] Capteur Temp', 300);
      db.completePendingRestoration(ieee);

      const res = db.getPendingRestoration(ieee);
      expect(res?.status).toBe('restored');
    });

    it('should cancel pending restoration', () => {
      const ieee = '0x00158d0001a2b3c4';
      db.savePendingRestoration(ieee, 'Capteur Salon', '[Salon] Capteur Temp', 300);
      db.cancelPendingRestoration(ieee);

      const res = db.getPendingRestoration(ieee);
      expect(res?.status).toBe('expired');
    });

    it('should clean expired or completed restorations', () => {
      const ieee1 = '0x001';
      const ieee2 = '0x002';
      const ieee3 = '0x003';

      db.savePendingRestoration(ieee1, 'Dev 1', null, 600); // active pending
      db.savePendingRestoration(ieee2, 'Dev 2', null, 600); // completed
      db.completePendingRestoration(ieee2);
      db.savePendingRestoration(ieee3, 'Dev 3', null, -10); // already expired

      db.cleanExpiredRestorations();

      expect(db.getPendingRestoration(ieee1)).not.toBeNull();
      expect(db.getPendingRestoration(ieee2)).toBeNull();
      expect(db.getPendingRestoration(ieee3)).toBeNull();
    });
  });

  describe('clearAllData', () => {
    it('should completely empty all devices, history, logs, and pending restorations', () => {
      const ieee = '0x00158d0001a2b3c4';
      db.upsertDevice({ ieee_address: ieee, friendly_name: 'Capteur Salon', type: 'EndDevice' });
      db.recordBattery(ieee, 90);
      db.recordEvent(ieee, 'connected');
      db.recordDiagnosticLog(ieee, 'ping', 'success');
      db.savePendingRestoration(ieee, 'Capteur Salon', '[Salon] Capteur Temp', 300);

      expect(db.getDevices().length).toBe(1);
      expect(db.getBatteryHistory(ieee).length).toBe(1);
      expect(db.getEventHistory().length).toBe(1);
      expect(db.getDiagnosticLogs(ieee).length).toBe(1);
      expect(db.getPendingRestoration(ieee)).not.toBeNull();

      db.clearAllData();

      expect(db.getDevices().length).toBe(0);
      expect(db.getBatteryHistory(ieee).length).toBe(0);
      expect(db.getEventHistory().length).toBe(0);
      expect(db.getDiagnosticLogs(ieee).length).toBe(0);
      expect(db.getPendingRestoration(ieee)).toBeNull();
    });
  });
});
