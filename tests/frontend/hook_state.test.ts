import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reduceDeviceUpdate, getWebSocketUrl } from '../../src/hooks/useZigbeeState';
import { apiClient } from '../../src/api/client';
import type { ZigbeeDevice } from '../../src/types/device';

describe('reduceDeviceUpdate', () => {
  it('should update existing device or add new device in state list', () => {
    const existing: ZigbeeDevice[] = [
      {
        ieee_address: '0x123',
        friendly_name: 'Capteur 1',
        type: 'EndDevice',
        status: 'online',
        battery: 90,
        linkquality: 100,
        last_seen: 1000,
      },
    ];

    const updated = reduceDeviceUpdate(existing, {
      ieee_address: '0x123',
      battery: 88,
      last_seen: 2000,
    });

    expect(updated.length).toBe(1);
    expect(updated[0].battery).toBe(88);
    expect(updated[0].friendly_name).toBe('Capteur 1');
    expect(updated[0].last_seen).toBe(2000);
    expect(updated[0].linkquality).toBe(100);
  });

  it('should add new device if not already present in list', () => {
    const existing: ZigbeeDevice[] = [
      {
        ieee_address: '0x123',
        friendly_name: 'Capteur 1',
        type: 'EndDevice',
        status: 'online',
      },
    ];

    const updated = reduceDeviceUpdate(existing, {
      ieee_address: '0x456',
      friendly_name: 'Prise Salon',
      type: 'Router',
      status: 'online',
      linkquality: 150,
    });

    expect(updated.length).toBe(2);
    const added = updated.find((d) => d.ieee_address === '0x456');
    expect(added).toBeDefined();
    expect(added?.friendly_name).toBe('Prise Salon');
    expect(added?.type).toBe('Router');
  });

  it('should not mutate original array', () => {
    const existing: ZigbeeDevice[] = [
      {
        ieee_address: '0x123',
        friendly_name: 'Capteur 1',
        type: 'EndDevice',
        status: 'online',
      },
    ];

    const updated = reduceDeviceUpdate(existing, {
      ieee_address: '0x123',
      status: 'offline',
    });

    expect(existing[0].status).toBe('online');
    expect(updated[0].status).toBe('offline');
  });
});

describe('getWebSocketUrl', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  it('should fallback to localhost if window is undefined', () => {
    // @ts-ignore
    delete global.window;
    expect(getWebSocketUrl()).toBe('ws://localhost:8090/ws');
  });

  it('should construct ws url based on window.location', () => {
    // @ts-ignore
    global.window = {
      location: {
        protocol: 'http:',
        host: '192.168.1.50:8090',
      },
    } as any;

    expect(getWebSocketUrl()).toBe('ws://192.168.1.50:8090/ws');
  });

  it('should use wss for https host', () => {
    // @ts-ignore
    global.window = {
      location: {
        protocol: 'https:',
        host: 'sentinel.home.lan',
      },
    } as any;

    expect(getWebSocketUrl()).toBe('wss://sentinel.home.lan/ws');
  });
});

describe('apiClient', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  it('fetchDevices should call /api/devices and return JSON', async () => {
    const mockDevices = [{ ieee_address: '0x001', friendly_name: 'Device 1' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDevices,
    });

    const result = await apiClient.fetchDevices();
    expect(mockFetch).toHaveBeenCalledWith('/api/devices', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual(mockDevices);
  });

  it('fetchHistory should call /api/devices/:ieee/history with limit parameter', async () => {
    const mockHistory = { battery: [], events: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHistory,
    });

    const result = await apiClient.fetchHistory('0x123', 50);
    expect(mockFetch).toHaveBeenCalledWith('/api/devices/0x123/history?limit=50', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual(mockHistory);
  });

  it('runDiagnostic should POST to /api/devices/:ieee/diagnose', async () => {
    const mockReport = { verdict: 'OK', severity: 'info' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    });

    const result = await apiClient.runDiagnostic('0x123');
    expect(mockFetch).toHaveBeenCalledWith('/api/devices/0x123/diagnose', expect.objectContaining({ method: 'POST' }));
    expect(result).toEqual(mockReport);
  });

  it('pingDevice should POST to /api/devices/:ieee/ping', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, ieee: '0x123', friendly_name: 'Capteur' }),
    });

    const result = await apiClient.pingDevice('0x123');
    expect(mockFetch).toHaveBeenCalledWith('/api/devices/0x123/ping', expect.objectContaining({ method: 'POST' }));
    expect(result.success).toBe(true);
  });

  it('interviewDevice should POST to /api/devices/:ieee/interview', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, ieee: '0x123', friendly_name: 'Capteur' }),
    });

    const result = await apiClient.interviewDevice('0x123');
    expect(mockFetch).toHaveBeenCalledWith('/api/devices/0x123/interview', expect.objectContaining({ method: 'POST' }));
    expect(result.success).toBe(true);
  });

  it('configureDevice should POST to /api/devices/:ieee/configure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, ieee: '0x123', friendly_name: 'Capteur' }),
    });

    const result = await apiClient.configureDevice('0x123');
    expect(mockFetch).toHaveBeenCalledWith('/api/devices/0x123/configure', expect.objectContaining({ method: 'POST' }));
    expect(result.success).toBe(true);
  });

  it('resetDevice should POST to /api/devices/:ieee/reset with permitJoinTime body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, ieee: '0x123', friendly_name: 'Capteur', permitJoinTime: 120 }),
    });

    const result = await apiClient.resetDevice('0x123', 120);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/devices/0x123/reset',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permitJoinTime: 120 }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('restartBridge should POST to /api/bridge/restart', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Restarted' }),
    });

    const result = await apiClient.restartBridge();
    expect(mockFetch).toHaveBeenCalledWith('/api/bridge/restart', expect.objectContaining({ method: 'POST' }));
    expect(result.success).toBe(true);
  });

  it('permitJoin should POST to /api/bridge/permit-join with time body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, time: 120 }),
    });

    const result = await apiClient.permitJoin(120);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/bridge/permit-join',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: 120 }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('fetchStatus should call /api/status', async () => {
    const mockStatus = { mqttConnected: true, bridge: 'online' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStatus,
    });

    const result = await apiClient.fetchStatus();
    expect(mockFetch).toHaveBeenCalledWith('/api/status', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual(mockStatus);
  });

  it('should throw Error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Device not found' }),
    });

    await expect(apiClient.runDiagnostic('0xnotfound')).rejects.toThrow('Device not found');
  });
});
