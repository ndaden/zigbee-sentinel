import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS devices (
    ieee_address TEXT PRIMARY KEY,
    friendly_name TEXT NOT NULL,
    custom_name TEXT,
    type TEXT NOT NULL,
    model TEXT,
    vendor TEXT,
    power_source TEXT,
    status TEXT NOT NULL DEFAULT 'offline',
    battery INTEGER,
    linkquality INTEGER,
    last_seen INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history_battery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ieee_address TEXT NOT NULL,
    battery INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL,
    FOREIGN KEY(ieee_address) REFERENCES devices(ieee_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS history_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ieee_address TEXT NOT NULL,
    event_type TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    duration_offline_ms INTEGER,
    FOREIGN KEY(ieee_address) REFERENCES devices(ieee_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diagnostic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ieee_address TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    recorded_at INTEGER NOT NULL,
    FOREIGN KEY(ieee_address) REFERENCES devices(ieee_address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_friendly_name ON devices(friendly_name);
CREATE INDEX IF NOT EXISTS idx_history_battery_ieee ON history_battery(ieee_address, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_events_ieee ON history_events(ieee_address, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_logs_ieee ON diagnostic_logs(ieee_address, recorded_at DESC);
`;

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);

  // Migration: ensure custom_name column exists if database was created previously
  const tableInfo = db.prepare('PRAGMA table_info(devices)').all() as Array<{ name: string }>;
  const hasCustomName = tableInfo.some((col) => col.name === 'custom_name');
  if (!hasCustomName) {
    db.exec('ALTER TABLE devices ADD COLUMN custom_name TEXT');
  }
}
