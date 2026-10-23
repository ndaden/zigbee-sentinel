import type { WebSocket } from 'ws';
import { DatabaseService } from '../db/index.js';
import { MqttService } from '../mqtt/client.js';
import type { MqttNotification } from '../mqtt/handlers.js';

export interface WebSocketMessage {
  type: string;
  data: any;
}

export class WebSocketManager {
  private clients: Set<WebSocket> = new Set();
  private db: DatabaseService;
  private mqttService?: MqttService;
  private mqttListener?: (notification: MqttNotification) => void;

  constructor(db: DatabaseService, mqttService?: MqttService) {
    this.db = db;
    this.mqttService = mqttService;
    this.setupMqttListeners();
  }

  private setupMqttListeners(): void {
    if (!this.mqttService) return;

    this.mqttListener = (notification: MqttNotification) => {
      this.broadcast({
        type: notification.type,
        data: notification.data,
      });
    };

    this.mqttService.getHandler().setListener(this.mqttListener);
  }

  handleConnection(socket: WebSocket): void {
    this.clients.add(socket);

    socket.on('close', () => {
      this.clients.delete(socket);
    });

    socket.on('error', (err) => {
      console.error('[WS] Client error:', err);
      this.clients.delete(socket);
    });

    // Send initial state upon connection
    const initialState = this.getInitialState();
    if (socket.readyState === 1 /* OPEN */) {
      try {
        socket.send(
          JSON.stringify({
            type: 'initial_state',
            data: initialState,
          })
        );
      } catch (err) {
        console.error('[WS] Failed to send initial state:', err);
      }
    }
  }

  getInitialState(): {
    devices: ReturnType<DatabaseService['getDevices']>;
    bridge: string;
    bridgeState: string;
    bridgeInfo: any;
    coordinator: any;
    mqttConnected: boolean;
  } {
    const devices = this.db.getDevices();
    const bridgeState = this.mqttService
      ? this.mqttService.getHandler().getBridgeState()
      : { state: 'offline', info: null };
    const isConnected = this.mqttService ? this.mqttService.isConnected() : false;

    return {
      devices,
      bridge: bridgeState.state,
      bridgeState: bridgeState.state,
      bridgeInfo: bridgeState.info,
      coordinator: bridgeState.info?.coordinator ?? null,
      mqttConnected: isConnected,
    };
  }

  broadcast(message: WebSocketMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1 /* OPEN */) {
        try {
          client.send(payload);
        } catch (err) {
          console.error('[WS] Broadcast send error:', err);
          this.clients.delete(client);
        }
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.mqttService && this.mqttListener) {
      this.mqttService.getHandler().removeListenerCallback(this.mqttListener);
    }

    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.clients.clear();
  }
}
