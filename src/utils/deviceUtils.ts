import type { ZigbeeDevice } from '../types/device';

export type FilterType = 'all' | 'offline' | 'low_battery' | 'mains' | 'battery';

export type DeviceCategory = 'light' | 'plug' | 'climate' | 'sensor' | 'switch' | 'generic';

export function getDeviceCategory(device: ZigbeeDevice): DeviceCategory {
  const text = `${device.friendly_name || ''} ${device.model || ''} ${device.vendor || ''}`.toLowerCase();

  if (/\b(bulb|ampoule|light|spot|luminaire|e27|gu10|e14)\b/i.test(text)) {
    return 'light';
  }
  if (/\b(plug|prise|socket|outlet)\b/i.test(text)) {
    return 'plug';
  }
  if (/\b(temp|humidity|humid|climat|thermostat|weather|meteo|wsdcg)\b/i.test(text)) {
    return 'climate';
  }
  if (
    /\b(motion|mouvement|contact|door|porte|window|fenetre|pir|presence|leak|water|inond|smoke|fumee|vibration|rtcgq|mccgq|sensor|capteur)\b/i.test(
      text
    )
  ) {
    return 'sensor';
  }
  if (/\b(switch|interrupteur|remote|telecommande|button|bouton)\b/i.test(text)) {
    return 'switch';
  }

  return 'generic';
}

export function formatRelativeTime(
  timestamp?: number | null,
  status: 'online' | 'offline' | string = 'online'
): string {
  if (!timestamp || timestamp <= 0) {
    return 'Jamais vu';
  }

  const diff = Math.max(0, Date.now() - timestamp);
  const isOffline = status === 'offline';

  if (diff < 60_000) {
    return isOffline ? 'Hors-ligne depuis quelques secondes' : "Vu à l'instant";
  }

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return isOffline ? `Hors-ligne depuis ${minutes} min` : `Vu il y a ${minutes} min`;
  }

  const hours = Math.floor(diff / 3600_000);
  if (hours < 24) {
    return isOffline ? `Hors-ligne depuis ${hours} h` : `Vu il y a ${hours} h`;
  }

  const days = Math.floor(diff / 86400_000);
  return isOffline ? `Hors-ligne depuis ${days} j` : `Vu il y a ${days} j`;
}

export interface LqiInfo {
  bars: number;
  maxBars: number;
  label: string;
  color: string;
}

export function getLqiBars(lqi?: number | null): LqiInfo {
  const maxBars = 4;
  if (lqi === null || lqi === undefined || lqi < 0) {
    return { bars: 0, maxBars, label: 'Inconnu', color: 'text-slate-500' };
  }
  if (lqi <= 40) {
    return { bars: 1, maxBars, label: 'Faible', color: 'text-rose-400' };
  }
  if (lqi <= 90) {
    return { bars: 2, maxBars, label: 'Moyen', color: 'text-amber-400' };
  }
  if (lqi <= 160) {
    return { bars: 3, maxBars, label: 'Bon', color: 'text-emerald-400' };
  }
  return { bars: 4, maxBars, label: 'Excellent', color: 'text-emerald-500' };
}

export interface BatteryColorInfo {
  text: string;
  bg: string;
  border: string;
  level: 'critical' | 'warning' | 'good';
}

export function getBatteryColor(battery?: number | null): BatteryColorInfo {
  if (battery === null || battery === undefined) {
    return {
      text: 'text-slate-400',
      bg: 'bg-slate-700',
      border: 'border-slate-600',
      level: 'good',
    };
  }
  if (battery <= 20) {
    return {
      text: 'text-rose-400',
      bg: 'bg-rose-500',
      border: 'border-rose-500/30',
      level: 'critical',
    };
  }
  if (battery <= 50) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500',
      border: 'border-amber-500/30',
      level: 'warning',
    };
  }
  return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500',
    border: 'border-emerald-500/30',
    level: 'good',
  };
}

export function filterDevices(
  devices: ZigbeeDevice[],
  query: string,
  filter: FilterType
): ZigbeeDevice[] {
  const normalizedQuery = query.toLowerCase().trim();

  return devices.filter((device) => {
    // Check filter tab
    switch (filter) {
      case 'offline':
        if (device.status !== 'offline') return false;
        break;
      case 'low_battery':
        if (
          device.battery === null ||
          device.battery === undefined ||
          device.battery > 20
        ) {
          return false;
        }
        break;
      case 'mains': {
        const isMains =
          device.power_source?.toLowerCase() === 'mains' || device.type === 'Router';
        if (!isMains) return false;
        break;
      }
      case 'battery': {
        const isBattery =
          device.power_source?.toLowerCase() === 'battery' ||
          (device.power_source !== 'Mains' && device.type === 'EndDevice');
        if (!isBattery) return false;
        break;
      }
      case 'all':
      default:
        break;
    }

    // Check search query
    if (normalizedQuery) {
      const matchName = device.friendly_name?.toLowerCase().includes(normalizedQuery);
      const matchModel = device.model?.toLowerCase().includes(normalizedQuery);
      const matchVendor = device.vendor?.toLowerCase().includes(normalizedQuery);
      const matchIeee = device.ieee_address?.toLowerCase().includes(normalizedQuery);

      if (!matchName && !matchModel && !matchVendor && !matchIeee) {
        return false;
      }
    }

    return true;
  });
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  lowBattery: number;
}

export function calculateDeviceStats(devices: ZigbeeDevice[]): DeviceStats {
  let online = 0;
  let offline = 0;
  let lowBattery = 0;

  for (const device of devices) {
    if (device.status === 'offline') {
      offline++;
    } else {
      online++;
    }

    if (
      device.battery !== null &&
      device.battery !== undefined &&
      device.battery <= 20
    ) {
      lowBattery++;
    }
  }

  return {
    total: devices.length,
    online,
    offline,
    lowBattery,
  };
}
