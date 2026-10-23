import { EventEmitter } from 'node:events';
import { DatabaseService } from '../db/index.js';
import type { ZigbeeDevice, DeviceStatus } from '../types.js';

export type MqttNotificationType =
  | 'device_updated'
  | 'bridge_status'
  | 'bridge_devices'
  | 'diagnostic_response';

export interface MqttNotification {
  type: MqttNotificationType | string;
  data: any;
}

export type MqttListener = (notification: MqttNotification) => void;

export class MqttHandler extends EventEmitter {
  private db: DatabaseService;
  private baseTopic: string;
  private notificationListeners: Set<MqttListener> = new Set();
  private bridgeState: string = 'offline';
  private bridgeInfo: any = null;

  constructor(
    db: DatabaseService,
    baseTopic: string = 'zigbee2mqtt',
    onUpdate?: MqttListener
  ) {
    super();
    this.db = db;
    this.baseTopic = baseTopic.replace(/\/+$/, '');
    if (onUpdate) {
      this.setListener(onUpdate);
    }
  }

  setListener(listener: MqttListener): void {
    this.notificationListeners.add(listener);
  }

  removeListenerCallback(listener: MqttListener): void {
    this.notificationListeners.delete(listener);
  }

  private notify(notification: MqttNotification): void {
    for (const listener of this.notificationListeners) {
      try {
        listener(notification);
      } catch (err) {
        console.error('Error in MQTT update listener:', err);
      }
    }
    this.emit('notification', notification);
  }

  getBridgeState(): { state: string; info: any } {
    return {
      state: this.bridgeState,
      info: this.bridgeInfo,
    };
  }

  findDevice(identifier: string): ZigbeeDevice | null {
    const byIeee = this.db.getDevice(identifier);
    if (byIeee) return byIeee;

    const byName = this.db.getDeviceByFriendlyName(identifier);
    if (byName) return byName;

    const all = this.db.getDevices();
    return all.find((d) => d.friendly_name === identifier || d.ieee_address === identifier) ?? null;
  }

  handleMessage(topic: string, message: Buffer): void {
    if (!topic.startsWith(this.baseTopic)) {
      return;
    }

    const relativeTopic =
      topic === this.baseTopic ? '' : topic.slice(this.baseTopic.length + 1);

    if (relativeTopic === 'bridge/devices') {
      this.handleBridgeDevices(message);
    } else if (relativeTopic === 'bridge/state') {
      this.handleBridgeState(message);
    } else if (relativeTopic === 'bridge/info') {
      this.handleBridgeInfo(message);
    } else if (relativeTopic.startsWith('bridge/response/')) {
      this.handleBridgeResponse(relativeTopic, message);
    } else if (relativeTopic.endsWith('/availability')) {
      this.handleAvailability(relativeTopic, message);
    } else if (!relativeTopic.startsWith('bridge/') && !relativeTopic.includes('/')) {
      this.handleDeviceState(relativeTopic, message);
    }
  }

  private handleBridgeDevices(message: Buffer): void {
    try {
      const rawDevices = JSON.parse(message.toString('utf-8'));
      if (!Array.isArray(rawDevices)) return;

      for (const dev of rawDevices) {
        if (!dev || dev.type === 'Coordinator') continue;

        const ieee = dev.ieee_address;
        if (!ieee) continue;

        const vendor = dev.definition?.vendor || dev.vendor || null;
        const model = dev.definition?.model || dev.model_id || dev.model || null;

        let powerSource = dev.power_source;
        if (!powerSource) {
          if (dev.type === 'Router') powerSource = 'Mains';
          else if (dev.type === 'EndDevice') powerSource = 'Battery';
        }

        const existing = this.db.getDevice(ieee);

        this.db.upsertDevice({
          ieee_address: ieee,
          friendly_name: dev.friendly_name || ieee,
          type: dev.type || 'EndDevice',
          model,
          vendor,
          power_source: powerSource,
          status: existing?.status ?? 'offline',
        });

        const updated = this.db.getDevice(ieee);
        if (updated) {
          this.notify({ type: 'device_updated', data: updated });
        }
      }

      this.notify({ type: 'bridge_devices', data: this.db.getDevices() });
    } catch (err) {
      console.error('Failed to parse bridge/devices message:', err);
    }
  }

  private handleBridgeState(message: Buffer): void {
    let stateStr = message.toString('utf-8').trim();
    try {
      const parsed = JSON.parse(stateStr);
      if (typeof parsed === 'string') stateStr = parsed;
      else if (parsed && typeof parsed.state === 'string') stateStr = parsed.state;
    } catch {
      // String format
    }

    this.bridgeState = stateStr;
    this.notify({
      type: 'bridge_status',
      data: { state: this.bridgeState, info: this.bridgeInfo },
    });
  }

  private handleBridgeInfo(message: Buffer): void {
    try {
      const info = JSON.parse(message.toString('utf-8'));
      this.bridgeInfo = info;
      this.notify({
        type: 'bridge_status',
        data: { state: this.bridgeState, info: this.bridgeInfo },
      });
    } catch {
      // Malformed info ignored
    }
  }

  private handleBridgeResponse(relativeTopic: string, message: Buffer): void {
    try {
      const payload = JSON.parse(message.toString('utf-8'));
      const action = relativeTopic.replace(/^bridge\/response\/(device\/)?/, '');

      const id = payload.data?.id || payload.data?.friendly_name || payload.data?.ieee_address;
      if (id) {
        const dev = this.findDevice(id);
        if (dev) {
          const status = payload.status === 'ok' ? 'success' : 'failure';
          this.db.recordDiagnosticLog(
            dev.ieee_address,
            action,
            status,
            JSON.stringify(payload)
          );
        }
      }

      this.emit('response', { topic: relativeTopic, payload });
      this.notify({
        type: 'diagnostic_response',
        data: { action, payload },
      });
    } catch (err) {
      console.error('Failed to parse bridge response message:', err);
    }
  }

  private handleAvailability(relativeTopic: string, message: Buffer): void {
    const identifier = relativeTopic.slice(0, -'/availability'.length);
    if (identifier.startsWith('bridge/')) return;

    let statusText = message.toString('utf-8').trim();
    try {
      const parsed = JSON.parse(statusText);
      if (typeof parsed === 'string') statusText = parsed;
      else if (parsed?.state) statusText = parsed.state;
    } catch {
      // Plain text
    }

    const newStatus: DeviceStatus =
      statusText.toLowerCase() === 'online' ? 'online' : 'offline';

    const dev = this.findDevice(identifier);
    if (!dev) return;

    const previousStatus = dev.status;
    const now = Date.now();

    if (previousStatus !== newStatus) {
      if (newStatus === 'offline') {
        this.db.recordEvent(dev.ieee_address, 'disconnected', undefined, now);
      } else if (newStatus === 'online') {
        const lastEvents = this.db.getEventHistory(1, dev.ieee_address);
        let durationOfflineMs: number | undefined;
        if (lastEvents.length > 0 && lastEvents[0].event_type === 'disconnected') {
          durationOfflineMs = Math.max(0, now - lastEvents[0].recorded_at);
        }
        this.db.recordEvent(dev.ieee_address, 'connected', durationOfflineMs, now);
      }
    }

    this.db.upsertDevice({
      ieee_address: dev.ieee_address,
      status: newStatus,
      last_seen: newStatus === 'online' ? now : dev.last_seen,
      updated_at: now,
    });

    const updated = this.db.getDevice(dev.ieee_address);
    if (updated) {
      this.notify({ type: 'device_updated', data: updated });
    }
  }

  private handleDeviceState(relativeTopic: string, message: Buffer): void {
    try {
      const state = JSON.parse(message.toString('utf-8'));
      if (typeof state !== 'object' || state === null || Array.isArray(state)) {
        return;
      }

      const dev = this.findDevice(relativeTopic);
      if (!dev) return;

      const now = Date.now();
      const updates: Partial<ZigbeeDevice> & { ieee_address: string } = {
        ieee_address: dev.ieee_address,
        last_seen: now,
        updated_at: now,
      };

      if (typeof state.battery === 'number') {
        updates.battery = state.battery;
        this.db.recordBattery(dev.ieee_address, state.battery, now);
      }

      if (typeof state.linkquality === 'number') {
        updates.linkquality = state.linkquality;
      }

      this.db.upsertDevice(updates);

      const updated = this.db.getDevice(dev.ieee_address);
      if (updated) {
        this.notify({ type: 'device_updated', data: updated });
      }
    } catch {
      // Not JSON, ignore
    }
  }
}
