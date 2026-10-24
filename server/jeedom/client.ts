export interface JeedomEqLogic {
  id: string | number;
  name: string;
  logicalId?: string;
  eqType_name?: string;
  isVisible?: string | number | boolean;
  isEnable?: string | number | boolean;
  humanName?: string;
  object_id?: string | number;
  configuration?: Record<string, any>;
}

export interface JeedomSyncResult {
  success: boolean;
  count: number;
  totalJeedomDevices: number;
  synced: Array<{
    ieee: string;
    previousName: string;
    newName: string;
  }>;
  error?: string;
}

export async function fetchJeedomDevices(
  jeedomUrl: string = process.env.JEEDOM_URL || 'http://127.0.0.1',
  apiKey: string = process.env.JEEDOM_API_KEY || ''
): Promise<JeedomEqLogic[]> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Clé API Jeedom manquante ou non configurée');
  }

  const normalizedUrl = jeedomUrl.replace(/\/+$/, '');
  const endpoint = `${normalizedUrl}/core/api/jeeApi.php`;

  const payload = {
    jsonrpc: '2.0',
    method: 'eqLogic::all',
    params: {
      apikey: apiKey.trim(),
    },
    id: 1,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `Erreur HTTP ${response.status} lors de l'appel à Jeedom (${response.statusText})`
    );
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(
      `Erreur API Jeedom : ${data.error.message || JSON.stringify(data.error)}`
    );
  }

  if (!data.result || !Array.isArray(data.result)) {
    return [];
  }

  return data.result as JeedomEqLogic[];
}

export function matchJeedomDeviceToZigbee(
  eqLogic: JeedomEqLogic,
  zigbeeDevices: Array<{ ieee_address: string; friendly_name: string }>
): { ieee_address: string; friendly_name: string } | null {
  const normalizeAddress = (addr: string): string => {
    return addr.toLowerCase().replace(/^0x/, '').replace(/[:-]/g, '');
  };

  const candidates = [
    eqLogic.logicalId,
    eqLogic.configuration?.ieee,
    eqLogic.configuration?.mac,
    eqLogic.configuration?.device,
  ].filter(Boolean) as string[];

  for (const cand of candidates) {
    const candNorm = normalizeAddress(cand);
    const found = zigbeeDevices.find((dev) => {
      const ieeeNorm = normalizeAddress(dev.ieee_address);
      const nameNorm = dev.friendly_name.toLowerCase();
      return (
        ieeeNorm === candNorm ||
        dev.ieee_address.toLowerCase() === cand.toLowerCase() ||
        nameNorm === cand.toLowerCase()
      );
    });
    if (found) return found;
  }

  // Also check if eqLogic.name matches friendly_name
  const foundByName = zigbeeDevices.find(
    (dev) => dev.friendly_name.toLowerCase() === eqLogic.name.toLowerCase()
  );
  if (foundByName) return foundByName;

  return null;
}
