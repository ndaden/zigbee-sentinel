import type {
  ZigbeeDevice,
  DiagnosticReport,
  DeviceHistoryResponse,
  BridgeStatus,
  ActionResult,
} from '../types/device';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errorData = await res.json();
      if (errorData && typeof errorData.error === 'string') {
        errorMessage = errorData.error;
      }
    } catch {
      // Body not JSON or empty
    }
    throw new Error(errorMessage);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  async fetchDevices(): Promise<ZigbeeDevice[]> {
    const res = await fetch('/api/devices', {
      method: 'GET',
      credentials: 'omit',
    });
    return handleResponse<ZigbeeDevice[]>(res);
  },

  async fetchHistory(ieee: string, limit?: number): Promise<DeviceHistoryResponse> {
    const query = typeof limit === 'number' ? `?limit=${encodeURIComponent(limit)}` : '';
    const res = await fetch(`/api/devices/${encodeURIComponent(ieee)}/history${query}`, {
      method: 'GET',
    });
    return handleResponse<DeviceHistoryResponse>(res);
  },

  async runDiagnostic(ieee: string): Promise<DiagnosticReport> {
    const res = await fetch(`/api/devices/${encodeURIComponent(ieee)}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<DiagnosticReport>(res);
  },

  async pingDevice(
    ieee: string
  ): Promise<{ success: boolean; ieee: string; friendly_name: string }> {
    const res = await fetch(`/api/devices/${encodeURIComponent(ieee)}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<{ success: boolean; ieee: string; friendly_name: string }>(res);
  },

  async interviewDevice(
    ieee: string
  ): Promise<{ success: boolean; ieee: string; friendly_name: string }> {
    const res = await fetch(`/api/devices/${encodeURIComponent(ieee)}/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<{ success: boolean; ieee: string; friendly_name: string }>(res);
  },

  async permitJoin(seconds: number = 120): Promise<ActionResult & { success: boolean; time: number }> {
    const res = await fetch('/api/bridge/permit-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: seconds }),
    });
    return handleResponse<ActionResult & { success: boolean; time: number }>(res);
  },

  async fetchStatus(): Promise<BridgeStatus> {
    const res = await fetch('/api/status', {
      method: 'GET',
    });
    return handleResponse<BridgeStatus>(res);
  },
};
