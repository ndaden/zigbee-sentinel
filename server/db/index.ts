import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initSchema } from './schema.js';
import type {
  ZigbeeDevice,
  EventRecord,
  DiagnosticLogRecord,
} from '../types.js';

export class DatabaseService {
  private db: Database.Database;

  private getDeviceStmt: Database.Statement;
  private getDeviceByFriendlyNameStmt: Database.Statement;
  private getDevicesStmt: Database.Statement;
  private insertDeviceStmt: Database.Statement;
  private updateDeviceStmt: Database.Statement;

  private insertBatteryStmt: Database.Statement;
  private getBatteryHistoryStmt: Database.Statement;

  private insertEventStmt: Database.Statement;
  private getEventHistoryStmt: Database.Statement;
  private getEventHistoryByDeviceStmt: Database.Statement;

  private insertDiagnosticLogStmt: Database.Statement;
  private getDiagnosticLogsStmt: Database.Statement;
  private getDiagnosticLogsByDeviceStmt: Database.Statement;

  private purgeBatteryStmt: Database.Statement;
  private purgeEventsStmt: Database.Statement;
  private purgeDiagStmt: Database.Statement;

  constructor(dbPath: string = process.env.DATABASE_PATH || './data/zigbee_sentinel.db') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (dir && dir !== '.') {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');

    if (dbPath !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }

    initSchema(this.db);

    // Prepare statements
    this.getDeviceStmt = this.db.prepare('SELECT * FROM devices WHERE ieee_address = ?');
    this.getDeviceByFriendlyNameStmt = this.db.prepare('SELECT * FROM devices WHERE friendly_name = ?');
    this.getDevicesStmt = this.db.prepare('SELECT * FROM devices ORDER BY friendly_name ASC');

    this.insertDeviceStmt = this.db.prepare(`
      INSERT INTO devices (
        ieee_address, friendly_name, type, model, vendor, power_source,
        status, battery, linkquality, last_seen, created_at, updated_at
      ) VALUES (
        @ieee_address, @friendly_name, @type, @model, @vendor, @power_source,
        @status, @battery, @linkquality, @last_seen, @created_at, @updated_at
      )
    `);

    this.updateDeviceStmt = this.db.prepare(`
      UPDATE devices SET
        friendly_name = @friendly_name,
        type = @type,
        model = @model,
        vendor = @vendor,
        power_source = @power_source,
        status = @status,
        battery = @battery,
        linkquality = @linkquality,
        last_seen = @last_seen,
        updated_at = @updated_at
      WHERE ieee_address = @ieee_address
    `);

    this.insertBatteryStmt = this.db.prepare(`
      INSERT INTO history_battery (ieee_address, battery, recorded_at)
      VALUES (?, ?, ?)
    `);

    this.getBatteryHistoryStmt = this.db.prepare(`
      SELECT id, ieee_address, battery, recorded_at
      FROM history_battery
      WHERE ieee_address = ?
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?
    `);

    this.insertEventStmt = this.db.prepare(`
      INSERT INTO history_events (ieee_address, event_type, recorded_at, duration_offline_ms)
      VALUES (?, ?, ?, ?)
    `);

    this.getEventHistoryStmt = this.db.prepare(`
      SELECT id, ieee_address, event_type, recorded_at, duration_offline_ms
      FROM history_events
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?
    `);

    this.getEventHistoryByDeviceStmt = this.db.prepare(`
      SELECT id, ieee_address, event_type, recorded_at, duration_offline_ms
      FROM history_events
      WHERE ieee_address = ?
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?
    `);

    this.insertDiagnosticLogStmt = this.db.prepare(`
      INSERT INTO diagnostic_logs (ieee_address, action_type, status, details, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getDiagnosticLogsStmt = this.db.prepare(`
      SELECT id, ieee_address, action_type, status, details, recorded_at
      FROM diagnostic_logs
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?
    `);

    this.getDiagnosticLogsByDeviceStmt = this.db.prepare(`
      SELECT id, ieee_address, action_type, status, details, recorded_at
      FROM diagnostic_logs
      WHERE ieee_address = ?
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?
    `);

    this.purgeBatteryStmt = this.db.prepare('DELETE FROM history_battery WHERE recorded_at < ?');
    this.purgeEventsStmt = this.db.prepare('DELETE FROM history_events WHERE recorded_at < ?');
    this.purgeDiagStmt = this.db.prepare('DELETE FROM diagnostic_logs WHERE recorded_at < ?');
  }

  upsertDevice(device: Partial<ZigbeeDevice> & { ieee_address: string }): void {
    const existing = this.getDevice(device.ieee_address);
    const now = Date.now();

    if (!existing) {
      this.insertDeviceStmt.run({
        ieee_address: device.ieee_address,
        friendly_name: device.friendly_name ?? device.ieee_address,
        type: device.type ?? 'EndDevice',
        model: device.model ?? null,
        vendor: device.vendor ?? null,
        power_source: device.power_source ?? null,
        status: device.status ?? 'offline',
        battery: device.battery ?? null,
        linkquality: device.linkquality ?? null,
        last_seen: device.last_seen ?? null,
        created_at: device.created_at ?? now,
        updated_at: device.updated_at ?? now,
      });
    } else {
      const updated: ZigbeeDevice = {
        ieee_address: existing.ieee_address,
        friendly_name: device.friendly_name !== undefined ? device.friendly_name : existing.friendly_name,
        type: device.type !== undefined ? device.type : existing.type,
        model: device.model !== undefined ? device.model : existing.model,
        vendor: device.vendor !== undefined ? device.vendor : existing.vendor,
        power_source: device.power_source !== undefined ? device.power_source : existing.power_source,
        status: device.status !== undefined ? device.status : existing.status,
        battery: device.battery !== undefined ? device.battery : existing.battery,
        linkquality: device.linkquality !== undefined ? device.linkquality : existing.linkquality,
        last_seen: device.last_seen !== undefined ? device.last_seen : existing.last_seen,
        created_at: existing.created_at,
        updated_at: device.updated_at !== undefined ? device.updated_at : now,
      };

      this.updateDeviceStmt.run(updated);
    }
  }

  getDevice(ieee_address: string): ZigbeeDevice | null {
    const row = this.getDeviceStmt.get(ieee_address) as ZigbeeDevice | undefined;
    return row ?? null;
  }

  getDeviceByFriendlyName(friendlyName: string): ZigbeeDevice | null {
    const row = this.getDeviceByFriendlyNameStmt.get(friendlyName) as ZigbeeDevice | undefined;
    return row ?? null;
  }

  getDevices(): ZigbeeDevice[] {
    return this.getDevicesStmt.all() as ZigbeeDevice[];
  }

  recordBattery(ieee_address: string, battery: number, recorded_at?: number): void {
    this.insertBatteryStmt.run(ieee_address, battery, recorded_at ?? Date.now());
  }

  getBatteryHistory(
    ieee_address: string,
    limit: number = 100
  ): { battery: number; recorded_at: number }[] {
    return this.getBatteryHistoryStmt.all(ieee_address, limit) as {
      battery: number;
      recorded_at: number;
    }[];
  }

  recordEvent(
    ieee_address: string,
    event_type: 'connected' | 'disconnected',
    duration_offline_ms?: number,
    recorded_at?: number
  ): void {
    this.insertEventStmt.run(
      ieee_address,
      event_type,
      recorded_at ?? Date.now(),
      duration_offline_ms ?? null
    );
  }

  getEventHistory(limit: number = 100, ieee_address?: string): EventRecord[] {
    if (ieee_address) {
      return this.getEventHistoryByDeviceStmt.all(ieee_address, limit) as EventRecord[];
    }
    return this.getEventHistoryStmt.all(limit) as EventRecord[];
  }

  recordDiagnosticLog(
    ieee_address: string,
    action_type: string,
    status: string,
    details?: string,
    recorded_at?: number
  ): void {
    this.insertDiagnosticLogStmt.run(
      ieee_address,
      action_type,
      status,
      details ?? null,
      recorded_at ?? Date.now()
    );
  }

  getDiagnosticLogs(ieee_address?: string, limit: number = 100): DiagnosticLogRecord[] {
    if (ieee_address) {
      return this.getDiagnosticLogsByDeviceStmt.all(ieee_address, limit) as DiagnosticLogRecord[];
    }
    return this.getDiagnosticLogsStmt.all(limit) as DiagnosticLogRecord[];
  }

  purgeOldRecords(retentionDays: number = 60): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const purgeTx = this.db.transaction((cutoffTime: number) => {
      this.purgeBatteryStmt.run(cutoffTime);
      this.purgeEventsStmt.run(cutoffTime);
      this.purgeDiagStmt.run(cutoffTime);
    });
    purgeTx(cutoff);
  }

  close(): void {
    this.db.close();
  }
}
