export type DeviceType = 'Router' | 'EndDevice' | 'Coordinator' | string;
export type DevicePowerSource = 'Battery' | 'Mains' | string;
export type DeviceStatus = 'online' | 'offline';

export interface ZigbeeDevice {
  ieee_address: string;
  friendly_name: string;
  type: DeviceType;
  model?: string | null;
  vendor?: string | null;
  power_source?: DevicePowerSource | null;
  status: DeviceStatus;
  battery?: number | null;
  linkquality?: number | null;
  last_seen?: number | null;
  created_at: number;
  updated_at: number;
}

export interface BatteryHistoryRecord {
  id?: number;
  ieee_address: string;
  battery: number;
  recorded_at: number;
}

export interface EventRecord {
  id?: number;
  ieee_address: string;
  event_type: 'connected' | 'disconnected';
  recorded_at: number;
  duration_offline_ms?: number | null;
}

export interface DiagnosticLogRecord {
  id?: number;
  ieee_address: string;
  action_type: string;
  status: string;
  details?: string | null;
  recorded_at: number;
}
