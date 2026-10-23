import { describe, it, expect } from 'vitest';
import {
  getDeviceCategory,
  formatRelativeTime,
  getLqiBars,
  getBatteryColor,
  filterDevices,
  calculateDeviceStats,
} from '../../src/utils/deviceUtils';
import type { ZigbeeDevice } from '../../src/types/device';

describe('deviceUtils', () => {
  const mockDevices: ZigbeeDevice[] = [
    {
      ieee_address: '0x001',
      friendly_name: 'Ampoule Salon',
      type: 'Router',
      model: 'Hue white bulb E27',
      vendor: 'Philips',
      power_source: 'Mains',
      status: 'online',
      linkquality: 180,
      last_seen: Date.now() - 2 * 60 * 1000, // 2 mins ago
    },
    {
      ieee_address: '0x002',
      friendly_name: 'Capteur Température Cuisine',
      type: 'EndDevice',
      model: 'WSDCGQ11LM',
      vendor: 'Aqara',
      power_source: 'Battery',
      status: 'offline',
      battery: 15,
      linkquality: 30,
      last_seen: Date.now() - 3 * 3600 * 1000, // 3 hours ago
    },
    {
      ieee_address: '0x003',
      friendly_name: 'Prise Bureau',
      type: 'Router',
      model: 'Smart Plug SP120',
      vendor: 'Innr',
      power_source: 'Mains',
      status: 'online',
      linkquality: 110,
      last_seen: Date.now() - 30 * 1000, // 30 sec ago
    },
    {
      ieee_address: '0x004',
      friendly_name: 'Détecteur Mouvement Couloir',
      type: 'EndDevice',
      model: 'RTCGQ11LM',
      vendor: 'Aqara',
      power_source: 'Battery',
      status: 'online',
      battery: 85,
      linkquality: 90,
      last_seen: Date.now() - 10 * 60 * 1000,
    },
    {
      ieee_address: '0x005',
      friendly_name: 'Capteur Porte Entrée',
      type: 'EndDevice',
      model: 'MCCGQ11LM door contact',
      vendor: 'Xiaomi',
      power_source: 'Battery',
      status: 'online',
      battery: 45,
      linkquality: 140,
      last_seen: Date.now() - 40 * 60 * 1000,
    },
  ];

  describe('getDeviceCategory', () => {
    it('identifies light bulb category', () => {
      expect(getDeviceCategory(mockDevices[0])).toBe('light');
    });

    it('identifies climate/temp category', () => {
      expect(getDeviceCategory(mockDevices[1])).toBe('climate');
    });

    it('identifies plug/socket category', () => {
      expect(getDeviceCategory(mockDevices[2])).toBe('plug');
    });

    it('identifies motion/door sensor category', () => {
      expect(getDeviceCategory(mockDevices[3])).toBe('sensor');
      expect(getDeviceCategory(mockDevices[4])).toBe('sensor');
    });

    it('falls back to general category for unknown device', () => {
      const unknownDevice: ZigbeeDevice = {
        ieee_address: '0x999',
        friendly_name: 'Custom Device',
        type: 'EndDevice',
        status: 'online',
      };
      expect(getDeviceCategory(unknownDevice)).toBe('generic');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "Jamais vu" for null or zero timestamp', () => {
      expect(formatRelativeTime(null, 'online')).toBe('Jamais vu');
      expect(formatRelativeTime(0, 'offline')).toBe('Jamais vu');
    });

    it('returns "Vu à l\'instant" or seconds for very recent online activity', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 10_000, 'online')).toBe("Vu à l'instant");
      expect(formatRelativeTime(now - 10_000, 'offline')).toBe('Hors-ligne depuis quelques secondes');
    });

    it('formats minutes correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 5 * 60 * 1000, 'online')).toBe('Vu il y a 5 min');
      expect(formatRelativeTime(now - 25 * 60 * 1000, 'offline')).toBe('Hors-ligne depuis 25 min');
    });

    it('formats hours correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 4 * 3600 * 1000, 'online')).toBe('Vu il y a 4 h');
      expect(formatRelativeTime(now - 18 * 3600 * 1000, 'offline')).toBe('Hors-ligne depuis 18 h');
    });

    it('formats days correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 2 * 86400 * 1000, 'online')).toBe('Vu il y a 2 j');
      expect(formatRelativeTime(now - 3 * 86400 * 1000, 'offline')).toBe('Hors-ligne depuis 3 j');
    });
  });

  describe('getLqiBars', () => {
    it('returns 0 bars for missing LQI', () => {
      const res = getLqiBars(null);
      expect(res.bars).toBe(0);
      expect(res.label).toBe('Inconnu');
    });

    it('returns 1 bar for weak signal <= 40', () => {
      const res = getLqiBars(25);
      expect(res.bars).toBe(1);
      expect(res.label).toBe('Faible');
    });

    it('returns 2 bars for medium signal 41-90', () => {
      const res = getLqiBars(70);
      expect(res.bars).toBe(2);
      expect(res.label).toBe('Moyen');
    });

    it('returns 3 bars for good signal 91-160', () => {
      const res = getLqiBars(130);
      expect(res.bars).toBe(3);
      expect(res.label).toBe('Bon');
    });

    it('returns 4 bars for excellent signal > 160', () => {
      const res = getLqiBars(200);
      expect(res.bars).toBe(4);
      expect(res.label).toBe('Excellent');
    });
  });

  describe('getBatteryColor', () => {
    it('returns critical level for battery <= 20', () => {
      const res = getBatteryColor(15);
      expect(res.level).toBe('critical');
    });

    it('returns low/warning level for battery between 21 and 50', () => {
      const res = getBatteryColor(35);
      expect(res.level).toBe('warning');
    });

    it('returns good level for battery > 50', () => {
      const res = getBatteryColor(85);
      expect(res.level).toBe('good');
    });
  });

  describe('filterDevices', () => {
    it('filters by search query across friendly_name, model, vendor, and ieee', () => {
      expect(filterDevices(mockDevices, 'ampoule', 'all')).toHaveLength(1);
      expect(filterDevices(mockDevices, 'aqara', 'all')).toHaveLength(2);
      expect(filterDevices(mockDevices, 'sp120', 'all')).toHaveLength(1);
      expect(filterDevices(mockDevices, '0x005', 'all')).toHaveLength(1);
    });

    it('filters by status: offline', () => {
      const offline = filterDevices(mockDevices, '', 'offline');
      expect(offline).toHaveLength(1);
      expect(offline[0].ieee_address).toBe('0x002');
    });

    it('filters by low_battery (< 20%)', () => {
      const lowBatt = filterDevices(mockDevices, '', 'low_battery');
      expect(lowBatt).toHaveLength(1);
      expect(lowBatt[0].friendly_name).toBe('Capteur Température Cuisine');
    });

    it('filters by mains power', () => {
      const mains = filterDevices(mockDevices, '', 'mains');
      expect(mains).toHaveLength(2);
      expect(mains.map((d) => d.ieee_address)).toEqual(['0x001', '0x003']);
    });

    it('filters by battery power', () => {
      const batt = filterDevices(mockDevices, '', 'battery');
      expect(batt).toHaveLength(3);
      expect(batt.map((d) => d.ieee_address)).toEqual(['0x002', '0x004', '0x005']);
    });
  });

  describe('calculateDeviceStats', () => {
    it('computes total, online, offline, and low battery counts', () => {
      const stats = calculateDeviceStats(mockDevices);
      expect(stats.total).toBe(5);
      expect(stats.online).toBe(4);
      expect(stats.offline).toBe(1);
      expect(stats.lowBattery).toBe(1);
    });
  });
});
