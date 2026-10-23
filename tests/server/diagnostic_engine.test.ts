import { describe, it, expect } from 'vitest';
import { DiagnosticEngine } from '../../server/diagnostic/engine';
import { ZigbeeDevice, BatteryHistoryRecord } from '../../server/types';

describe('DiagnosticEngine', () => {
  it('should diagnose dead battery on EndDevice with <= 15% battery', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x123',
      friendly_name: 'Capteur Humidite',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 8,
      linkquality: 80,
      last_seen: Date.now() - 3600000 * 24
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('dead_battery');
    expect(report.severity).toBe('critical');
    expect(report.recommendedActions.some(a => a.type === 'permit_join')).toBe(true);
    expect(report.details.batteryStatus).toContain('8%');
  });

  it('should diagnose mains power loss on Router device when offline', () => {
    const router: ZigbeeDevice = {
      ieee_address: '0x456',
      friendly_name: 'Prise Cuisine',
      type: 'Router',
      power_source: 'Mains',
      status: 'offline',
      battery: null,
      linkquality: 100,
      last_seen: Date.now() - 3600000 * 5
    };

    const report = DiagnosticEngine.analyze(router, []);
    expect(report.likelyCause).toBe('mains_power_loss');
    expect(report.severity).toBe('critical');
    expect(report.recommendedActions.some(a => a.type === 'ping')).toBe(true);
  });

  it('should diagnose weak signal when LQI < 35', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x789',
      friendly_name: 'Capteur Jardin',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 75,
      linkquality: 18,
      last_seen: Date.now() - 3600000 * 12
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('weak_signal');
    expect(report.severity).toBe('warning');
    expect(report.details.signalStatus).toContain('18');
  });

  it('should diagnose healthy device when online with good battery and signal', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x111',
      friendly_name: 'Capteur Salon',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'online',
      battery: 90,
      linkquality: 120,
      last_seen: Date.now() - 60000
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('healthy');
    expect(report.severity).toBe('info');
    expect(report.recommendedActions).toHaveLength(0);
    expect(report.verdict).toContain('en ligne');
  });

  it('should diagnose steep battery drop even if current battery > 15%', () => {
    const now = Date.now();
    const device: ZigbeeDevice = {
      ieee_address: '0x222',
      friendly_name: 'Capteur Mouvement Garage',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 35,
      linkquality: 85,
      last_seen: now - 3600000 * 4
    };

    const history: BatteryHistoryRecord[] = [
      { ieee_address: '0x222', battery: 85, recorded_at: now - 3600000 * 48 },
      { ieee_address: '0x222', battery: 80, recorded_at: now - 3600000 * 24 },
      { ieee_address: '0x222', battery: 40, recorded_at: now - 3600000 * 6 },
      { ieee_address: '0x222', battery: 35, recorded_at: now - 3600000 * 4 }
    ];

    const report = DiagnosticEngine.analyze(device, history);
    expect(report.likelyCause).toBe('dead_battery');
    expect(report.severity).toBe('critical');
    expect(report.verdict.toLowerCase()).toMatch(/chute|pile|batterie/);
    expect(report.recommendedActions.some(a => a.type === 'permit_join')).toBe(true);
  });

  it('should diagnose desynchronized EndDevice when offline with good battery and signal', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x333',
      friendly_name: 'Bouton Chevet',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 95,
      linkquality: 90,
      last_seen: Date.now() - 3600000 * 48
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('desynchronized');
    expect(report.severity).toBe('warning');
    expect(report.recommendedActions.some(a => a.type === 'permit_join')).toBe(true);
    expect(report.recommendedActions.some(a => a.type === 'manual')).toBe(true);
  });

  it('should diagnose weak signal on an online device with LQI < 35', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x444',
      friendly_name: 'Prise Garage',
      type: 'Router',
      power_source: 'Mains',
      status: 'online',
      battery: null,
      linkquality: 22,
      last_seen: Date.now() - 30000
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBe('weak_signal');
    expect(report.severity).toBe('warning');
  });

  it('should provide formatted details for battery, signal, and last seen time', () => {
    const now = Date.now();
    const device: ZigbeeDevice = {
      ieee_address: '0x555',
      friendly_name: 'Thermostat',
      type: 'EndDevice',
      power_source: 'Battery',
      status: 'offline',
      battery: 12,
      linkquality: 25,
      last_seen: now - 3600000 * 2 // 2 hours ago
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.details.batteryStatus).toContain('12%');
    expect(report.details.signalStatus).toContain('25');
    expect(report.details.lastSeenHuman).toMatch(/2\s*(h|heure)/);
  });

  it('should handle missing or null fields gracefully', () => {
    const device: ZigbeeDevice = {
      ieee_address: '0x999',
      friendly_name: 'Device Inconnu',
      type: 'Unknown',
      status: 'offline',
      battery: null,
      linkquality: null,
      last_seen: null
    };

    const report = DiagnosticEngine.analyze(device, []);
    expect(report.likelyCause).toBeDefined();
    expect(report.severity).toBeDefined();
    expect(report.details.batteryStatus).toBeDefined();
    expect(report.details.signalStatus).toBeDefined();
    expect(report.details.lastSeenHuman).toBeDefined();
  });
});
