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
  created_at?: number;
  updated_at?: number;
}

export type DiagnosticSeverity = 'critical' | 'warning' | 'info';

export type DiagnosticLikelyCause =
  | 'dead_battery'
  | 'weak_signal'
  | 'mains_power_loss'
  | 'desynchronized'
  | 'healthy';

export type DiagnosticActionType = 'ping' | 'permit_join' | 'interview' | 'manual';

export interface DiagnosticAction {
  id: string;
  label: string;
  type: DiagnosticActionType;
  instruction?: string;
}

export interface DiagnosticDetails {
  batteryStatus: string;
  signalStatus: string;
  lastSeenHuman: string;
}

export interface DiagnosticReport {
  verdict: string;
  severity: DiagnosticSeverity;
  likelyCause: DiagnosticLikelyCause;
  recommendedActions: DiagnosticAction[];
  details: DiagnosticDetails;
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
