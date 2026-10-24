import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchJeedomDevices,
  matchJeedomDeviceToZigbee,
  JeedomEqLogic,
} from '../../server/jeedom/client.js';

describe('Jeedom JSON-RPC Client', () => {
  describe('matchJeedomDeviceToZigbee', () => {
    const zigbeeDevices = [
      { ieee_address: '0x00158d0001aaaa04', friendly_name: 'Capteur Temp Salon' },
      { ieee_address: '0x00124b0021601a11', friendly_name: 'Prise Cuisine' },
    ];

    it('matches device by exact logicalId', () => {
      const eqLogic: JeedomEqLogic = {
        id: 10,
        name: 'Température Salon',
        logicalId: '0x00158d0001aaaa04',
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).not.toBeNull();
      expect(match?.ieee_address).toBe('0x00158d0001aaaa04');
    });

    it('matches device by logicalId with MAC format (colons / uppercase)', () => {
      const eqLogic: JeedomEqLogic = {
        id: 11,
        name: 'Prise',
        logicalId: '00:12:4B:00:21:60:1A:11',
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).not.toBeNull();
      expect(match?.ieee_address).toBe('0x00124b0021601a11');
    });

    it('matches device by configuration.ieee', () => {
      const eqLogic: JeedomEqLogic = {
        id: 12,
        name: 'Capteur',
        configuration: {
          ieee: '0x00158d0001aaaa04',
        },
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).not.toBeNull();
      expect(match?.ieee_address).toBe('0x00158d0001aaaa04');
    });

    it('matches device by configuration.mac', () => {
      const eqLogic: JeedomEqLogic = {
        id: 13,
        name: 'Prise',
        configuration: {
          mac: '0x00124b0021601a11',
        },
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).not.toBeNull();
      expect(match?.ieee_address).toBe('0x00124b0021601a11');
    });

    it('matches device by name matching friendly_name', () => {
      const eqLogic: JeedomEqLogic = {
        id: 14,
        name: 'Capteur Temp Salon',
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).not.toBeNull();
      expect(match?.ieee_address).toBe('0x00158d0001aaaa04');
    });

    it('returns null when no matching Zigbee device exists', () => {
      const eqLogic: JeedomEqLogic = {
        id: 99,
        name: 'Inconnu',
        logicalId: '0x9999999999999999',
      };
      const match = matchJeedomDeviceToZigbee(eqLogic, zigbeeDevices);
      expect(match).toBeNull();
    });
  });

  describe('fetchJeedomDevices', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('throws error when apiKey is empty', async () => {
      await expect(fetchJeedomDevices('http://127.0.0.1', '')).rejects.toThrow(
        /Clé API Jeedom manquante/
      );
    });

    it('successfully calls JSON-RPC eqLogic::all and returns equipment list', async () => {
      const mockResult: JeedomEqLogic[] = [
        {
          id: 42,
          name: 'Capteur Température',
          humanName: '[Salon][Capteur Température]',
          logicalId: '0x00158d0001aaaa04',
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: mockResult,
        }),
      } as any);

      const devices = await fetchJeedomDevices('http://127.0.0.1:80', 'secret_key');
      expect(devices).toHaveLength(1);
      expect(devices[0].humanName).toBe('[Salon][Capteur Température]');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:80/core/api/jeeApi.php',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws error if HTTP response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as any);

      await expect(
        fetchJeedomDevices('http://127.0.0.1', 'invalid_key')
      ).rejects.toThrow(/Erreur HTTP 403/);
    });

    it('throws error if Jeedom returns JSON-RPC error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'Invalid API Key' },
        }),
      } as any);

      await expect(
        fetchJeedomDevices('http://127.0.0.1', 'wrong_key')
      ).rejects.toThrow(/Erreur API Jeedom : Invalid API Key/);
    });
  });
});
