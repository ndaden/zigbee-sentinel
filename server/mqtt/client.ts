import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import { DatabaseService } from '../db/index.js';
import { MqttHandler, type MqttListener } from './handlers.js';

export interface MqttServiceOptions {
  brokerUrl?: string;
  baseTopic?: string;
  username?: string;
  password?: string;
  auth?: string;
  db: DatabaseService;
  mock?: boolean;
  onNotification?: MqttListener;
}

export class MqttService extends EventEmitter {
  public readonly handler: MqttHandler;
  public readonly baseTopic: string;
  private readonly brokerUrl: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly isMock: boolean;
  private client: MqttClient | null = null;
  private connected: boolean = false;

  constructor(
    optionsOrDb: MqttServiceOptions | DatabaseService,
    maybeOptions?: Partial<MqttServiceOptions>
  ) {
    super();

    let options: MqttServiceOptions;
    if ('upsertDevice' in (optionsOrDb as any)) {
      options = {
        db: optionsOrDb as DatabaseService,
        ...maybeOptions,
      };
    } else {
      options = optionsOrDb as MqttServiceOptions;
    }

    this.baseTopic = (options.baseTopic || process.env.Z2M_BASE_TOPIC || 'zigbee2mqtt').replace(
      /\/+$/,
      ''
    );
    this.brokerUrl = options.brokerUrl || process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';

    let username = options.username || process.env.MQTT_USERNAME;
    let password = options.password || process.env.MQTT_PASSWORD;
    const auth = options.auth || process.env.MQTT_AUTH;

    if (auth && (!username || !password)) {
      const [authUser, ...authPassParts] = auth.split(':');
      username = username || authUser;
      password = password || authPassParts.join(':');
    }

    this.username = username;
    this.password = password;
    this.isMock = options.mock ?? process.env.MOCK_MQTT === 'true';

    this.handler = new MqttHandler(options.db, this.baseTopic, options.onNotification);

    if (this.isMock) {
      this.connected = true;
    } else {
      this.initClient();
    }
  }

  getHandler(): MqttHandler {
    return this.handler;
  }

  getUsername(): string | undefined {
    return this.username;
  }

  getPassword(): string | undefined {
    return this.password;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private initClient(): void {
    try {
      this.client = mqtt.connect(this.brokerUrl, {
        username: this.username || undefined,
        password: this.password || undefined,
        reconnectPeriod: 3000,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.subscribeToTopics();
        this.emit('connect');
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        this.handleMessage(topic, payload);
      });

      this.client.on('error', (err: Error) => {
        console.error('[MQTT] Broker connection error:', err.message);
        if (this.listenerCount('error') > 0) {
          this.emit('error', err);
        }
      });

      this.client.on('close', () => {
        this.connected = false;
        this.emit('close');
      });

      this.client.on('reconnect', () => {
        this.emit('reconnect');
      });
    } catch (err) {
      console.error('[MQTT] Initialization error:', err);
      this.connected = false;
    }
  }

  private subscribeToTopics(): void {
    if (!this.client) return;

    const topics = [
      `${this.baseTopic}/bridge/#`,
      `${this.baseTopic}/+`,
      `${this.baseTopic}/+/availability`,
    ];

    this.client.subscribe(topics, (err) => {
      if (err) {
        console.error('[MQTT] Subscription error:', err);
      }
    });
  }

  handleMessage(topic: string, message: Buffer): void {
    this.handler.handleMessage(topic, message);
  }

  async publish(topic: string, message: string | Buffer): Promise<void> {
    const payload = typeof message === 'string' ? Buffer.from(message) : message;

    this.emit('publish', topic, payload);

    if (this.isMock) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.client || !this.connected) {
        return reject(new Error('MQTT client not connected'));
      }

      this.client.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private matchesDeviceId(expected: string, payloadId?: string): boolean {
    if (!payloadId || !expected) return false;
    if (payloadId === expected) return true;
    const dev = this.handler.findDevice(expected);
    if (dev && (dev.ieee_address === payloadId || dev.friendly_name === payloadId)) {
      return true;
    }
    return false;
  }

  async pingDevice(friendlyName: string, timeoutMs: number = 5000): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/device/ping`;
    const resSubTopic = 'bridge/response/device/ping';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          const id =
            event.payload?.data?.id ||
            event.payload?.data?.friendly_name ||
            event.payload?.data?.ieee_address;
          if (this.matchesDeviceId(friendlyName, id)) {
            resolved = true;
            cleanup();
            resolve(event.payload?.status === 'ok');
          }
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(reqTopic, JSON.stringify({ id: friendlyName })).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async reinterviewDevice(friendlyName: string, timeoutMs: number = 5000): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/device/interview`;
    const resSubTopic = 'bridge/response/device/interview';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          const id =
            event.payload?.data?.id ||
            event.payload?.data?.friendly_name ||
            event.payload?.data?.ieee_address;
          if (this.matchesDeviceId(friendlyName, id)) {
            resolved = true;
            cleanup();
            resolve(event.payload?.status === 'ok');
          }
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(reqTopic, JSON.stringify({ id: friendlyName })).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async configureDevice(friendlyNameOrIeee: string, timeoutMs: number = 8000): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/device/configure`;
    const resSubTopic = 'bridge/response/device/configure';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          const id =
            event.payload?.data?.id ||
            event.payload?.data?.friendly_name ||
            event.payload?.data?.ieee_address;
          if (this.matchesDeviceId(friendlyNameOrIeee, id)) {
            resolved = true;
            cleanup();
            resolve(event.payload?.status === 'ok');
          }
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(reqTopic, JSON.stringify({ id: friendlyNameOrIeee })).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async removeDevice(
    friendlyNameOrIeee: string,
    force: boolean = true,
    timeoutMs: number = 8000
  ): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/device/remove`;
    const resSubTopic = 'bridge/response/device/remove';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          const id =
            event.payload?.data?.id ||
            event.payload?.data?.friendly_name ||
            event.payload?.data?.ieee_address;
          if (this.matchesDeviceId(friendlyNameOrIeee, id)) {
            resolved = true;
            cleanup();
            resolve(event.payload?.status === 'ok');
          }
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(
        reqTopic,
        JSON.stringify({ id: friendlyNameOrIeee, force, block: false })
      ).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async resetDevice(
    friendlyNameOrIeee: string,
    permitJoinTime: number = 120,
    timeoutMs: number = 8000
  ): Promise<boolean> {
    // 1. Remove device with force=true to clear coordinator state
    await this.removeDevice(friendlyNameOrIeee, true, timeoutMs);
    // 2. Open pairing network for permitJoinTime seconds so the sensor can re-join
    const permitJoinSuccess = await this.permitJoin(permitJoinTime);
    return permitJoinSuccess;
  }

  async restartBridge(timeoutMs: number = 15000): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/restart`;
    const resSubTopic = 'bridge/response/restart';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          resolved = true;
          cleanup();
          resolve(event.payload?.status === 'ok');
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(reqTopic, JSON.stringify({})).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async permitJoin(seconds: number = 120, timeoutMs: number = 5000): Promise<boolean> {
    const reqTopic = `${this.baseTopic}/bridge/request/permit_join`;
    const resSubTopic = 'bridge/response/permit_join';

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.handler.off('response', onResponse);
      };

      const onResponse = (event: { topic: string; payload: any }) => {
        if (event.topic === resSubTopic) {
          resolved = true;
          cleanup();
          resolve(event.payload?.status === 'ok');
        }
      };

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      }, timeoutMs);

      this.handler.on('response', onResponse);

      this.publish(reqTopic, JSON.stringify({ value: true, time: seconds })).catch(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          this.connected = false;
          this.client = null;
          resolve();
        });
      } else {
        this.connected = false;
        resolve();
      }
    });
  }
}
