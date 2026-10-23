import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ZigbeeDevice,
  BridgeStatus,
  DiagnosticReport,
  DeviceHistoryResponse,
} from '../types/device';
import { apiClient } from '../api/client';

export function reduceDeviceUpdate(
  devices: ZigbeeDevice[],
  update: Partial<ZigbeeDevice> & { ieee_address: string }
): ZigbeeDevice[] {
  const index = devices.findIndex((d) => d.ieee_address === update.ieee_address);
  if (index >= 0) {
    const updatedList = [...devices];
    updatedList[index] = {
      ...updatedList[index],
      ...update,
    };
    return updatedList;
  }

  const newDevice: ZigbeeDevice = {
    friendly_name: update.ieee_address,
    type: 'EndDevice',
    status: 'online',
    model: null,
    vendor: null,
    power_source: null,
    battery: null,
    linkquality: null,
    last_seen: Date.now(),
    ...update,
  };

  return [...devices, newDevice];
}

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return 'ws://localhost:8090/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:8090';
  return `${protocol}//${host}/ws`;
}

export interface UseZigbeeStateReturn {
  devices: ZigbeeDevice[];
  bridgeStatus: BridgeStatus | null;
  isConnected: boolean;
  permitJoinTimer: number;
  triggerPing: (ieee: string) => Promise<boolean>;
  triggerInterview: (ieee: string) => Promise<boolean>;
  triggerPermitJoin: (seconds?: number) => Promise<boolean>;
  runDiagnostic: (ieee: string) => Promise<DiagnosticReport>;
  fetchHistory: (ieee: string, limit?: number) => Promise<DeviceHistoryResponse>;
  refresh: () => Promise<void>;
}

export function useZigbeeState(): UseZigbeeStateReturn {
  const [devices, setDevices] = useState<ZigbeeDevice[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [permitJoinTimer, setPermitJoinTimer] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const [fetchedDevices, fetchedStatus] = await Promise.all([
        apiClient.fetchDevices().catch(() => null),
        apiClient.fetchStatus().catch(() => null),
      ]);
      if (fetchedDevices) {
        setDevices(fetchedDevices);
      }
      if (fetchedStatus) {
        setBridgeStatus(fetchedStatus);
      }
    } catch (err) {
      console.error('[useZigbeeState] Failed to fetch initial REST data:', err);
    }
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    refresh();

    function connect() {
      if (isUnmountedRef.current) return;

      try {
        const url = getWebSocketUrl();
        const ws = new WebSocket(url);
        socketRef.current = ws;

        ws.onopen = () => {
          if (isUnmountedRef.current) {
            ws.close();
            return;
          }
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (!message || !message.type) return;

            switch (message.type) {
              case 'initial_state': {
                if (message.data?.devices && Array.isArray(message.data.devices)) {
                  setDevices(message.data.devices);
                }
                setBridgeStatus({
                  mqttConnected: Boolean(message.data?.mqttConnected),
                  bridge: message.data?.bridge || message.data?.bridgeState || 'offline',
                  bridgeState: message.data?.bridgeState,
                  bridgeInfo: message.data?.bridgeInfo,
                  coordinator: message.data?.coordinator,
                });
                break;
              }
              case 'device_updated': {
                if (message.data && message.data.ieee_address) {
                  setDevices((prev) => reduceDeviceUpdate(prev, message.data));
                }
                break;
              }
              case 'bridge_status': {
                if (message.data) {
                  setBridgeStatus((prev) => ({
                    mqttConnected: prev?.mqttConnected ?? true,
                    bridge: message.data.state || prev?.bridge || 'offline',
                    bridgeState: message.data.state,
                    bridgeInfo: message.data.info ?? prev?.bridgeInfo,
                    coordinator: prev?.coordinator,
                  }));
                }
                break;
              }
              case 'bridge_devices': {
                if (Array.isArray(message.data)) {
                  setDevices(message.data);
                }
                break;
              }
              default:
                break;
            }
          } catch (err) {
            console.error('[useZigbeeState] Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          socketRef.current = null;
          if (!isUnmountedRef.current) {
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = (err) => {
          console.error('[useZigbeeState] WebSocket error:', err);
          setIsConnected(false);
          try {
            ws.close();
          } catch {
            // Already closed or closing
          }
        };
      } catch (err) {
        console.error('[useZigbeeState] Failed to initiate WebSocket connection:', err);
        if (!isUnmountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [refresh]);

  // Permit join countdown effect
  useEffect(() => {
    if (permitJoinTimer <= 0) return;

    const interval = setInterval(() => {
      setPermitJoinTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [permitJoinTimer]);

  const triggerPing = useCallback(async (ieee: string): Promise<boolean> => {
    try {
      const res = await apiClient.pingDevice(ieee);
      return res.success;
    } catch (err) {
      console.error(`[useZigbeeState] Ping failed for ${ieee}:`, err);
      return false;
    }
  }, []);

  const triggerInterview = useCallback(async (ieee: string): Promise<boolean> => {
    try {
      const res = await apiClient.interviewDevice(ieee);
      return res.success;
    } catch (err) {
      console.error(`[useZigbeeState] Interview failed for ${ieee}:`, err);
      return false;
    }
  }, []);

  const triggerPermitJoin = useCallback(async (seconds: number = 120): Promise<boolean> => {
    try {
      const res = await apiClient.permitJoin(seconds);
      if (res.success) {
        setPermitJoinTimer(seconds);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[useZigbeeState] Permit join failed:', err);
      return false;
    }
  }, []);

  const runDiagnostic = useCallback(async (ieee: string): Promise<DiagnosticReport> => {
    return apiClient.runDiagnostic(ieee);
  }, []);

  const fetchHistory = useCallback(
    async (ieee: string, limit?: number): Promise<DeviceHistoryResponse> => {
      return apiClient.fetchHistory(ieee, limit);
    },
    []
  );

  return {
    devices,
    bridgeStatus,
    isConnected,
    permitJoinTimer,
    triggerPing,
    triggerInterview,
    triggerPermitJoin,
    runDiagnostic,
    fetchHistory,
    refresh,
  };
}
