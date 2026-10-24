import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DiagnosticModal } from '../../src/components/DiagnosticModal';
import { HistoryModal } from '../../src/components/HistoryModal';
import { JeedomSyncModal } from '../../src/components/JeedomSyncModal';
import type {
  ZigbeeDevice,
  DiagnosticReport,
  DeviceHistoryResponse,
} from '../../src/types/device';

describe('DiagnosticModal component', () => {
  const routerDevice: ZigbeeDevice = {
    ieee_address: '0x00124b0021601a11',
    friendly_name: 'Prise Cuisine Routeur',
    type: 'Router',
    model: 'Smart Plug SP120',
    vendor: 'Innr',
    power_source: 'Mains',
    status: 'offline',
    linkquality: 85,
    last_seen: Date.now() - 3600 * 1000,
  };

  const batteryDevice: ZigbeeDevice = {
    ieee_address: '0x00158d00032b1234',
    friendly_name: 'Capteur Température Salon',
    type: 'EndDevice',
    model: 'WSDCGQ11LM',
    vendor: 'Aqara',
    power_source: 'Battery',
    status: 'offline',
    battery: 12,
    linkquality: 25,
    last_seen: Date.now() - 7200 * 1000,
  };

  const onlineDevice: ZigbeeDevice = {
    ...batteryDevice,
    status: 'online',
  };

  const mockCriticalReport: DiagnosticReport = {
    verdict: 'Niveau de pile critique ou épuisé (<= 15%). Le capteur ne peut plus émettre.',
    severity: 'critical',
    likelyCause: 'dead_battery',
    details: {
      batteryStatus: '12% (Critique)',
      signalStatus: '25 / 255 (Faible)',
      lastSeenHuman: 'Il y a 2 h',
    },
    recommendedActions: [
      {
        id: 'replace_battery',
        label: 'Remplacer la pile',
        type: 'manual',
        instruction: 'Insérer une pile neuve dans l’appareil (CR2032).',
      },
      {
        id: 'permit_join',
        label: 'Ouvrir l’appairage (2 min)',
        type: 'permit_join',
      },
    ],
  };

  const mockRouterReport: DiagnosticReport = {
    verdict: 'Routeur hors-ligne. Coupure d’alimentation secteur ou problème matériel suspecté.',
    severity: 'critical',
    likelyCause: 'mains_power_loss',
    details: {
      batteryStatus: 'Alimentation secteur (Pas de batterie)',
      signalStatus: '85 / 255 (Bon)',
      lastSeenHuman: 'Il y a 1 h',
    },
    recommendedActions: [
      {
        id: 'ping',
        label: 'Tester la connexion (Ping)',
        type: 'ping',
      },
      {
        id: 'interview',
        label: 'Relancer l’interview',
        type: 'interview',
      },
    ],
  };

  const mockHealthyReport: DiagnosticReport = {
    verdict: 'Périphérique en ligne et opérationnel. Aucune anomalie détectée.',
    severity: 'info',
    likelyCause: 'healthy',
    details: {
      batteryStatus: '85% (Bon)',
      signalStatus: '150 / 255 (Excellent)',
      lastSeenHuman: 'À l\'instant',
    },
    recommendedActions: [],
  };

  it('renders modal shell with device info, friendly name and IEEE address', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: routerDevice,
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('Assistant Diagnostic : Prise Cuisine Routeur');
    expect(html).toContain('0x00124b0021601a11');
    expect(html).toContain('Innr');
    expect(html).toContain('Smart Plug SP120');
    expect(html).toContain('Hors-ligne');
  });

  it('renders custom_name in DiagnosticModal title when defined', () => {
    const customDevice: ZigbeeDevice = {
      ...routerDevice,
      custom_name: '[Cuisine] Prise Cafetière',
    };
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: customDevice,
        onClose: vi.fn(),
      })
    );
    expect(html).toContain('Assistant Diagnostic : [Cuisine] Prise Cafetière');
  });

  it('renders loading state initially when no initialReport is provided', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: batteryDevice,
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('Analyse télémétrique et diagnostic en cours...');
  });

  it('renders critical automated findings with verdict, likelyCause badge, and details grid', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialReport: mockCriticalReport,
      })
    );

    expect(html).toContain('1. Constats Automatisés');
    expect(html).toContain('Anomalie Critique');
    expect(html).toContain('Cause suspectée : Pile épuisée ou critique');
    expect(html).toContain('Niveau de pile critique ou épuisé');
    expect(html).toContain('12% (Critique)');
    expect(html).toContain('25 / 255 (Faible)');
    expect(html).toContain('Il y a 2 h');
  });

  it('renders nominal status findings when device is healthy', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: onlineDevice,
        onClose: vi.fn(),
        initialReport: mockHealthyReport,
      })
    );

    expect(html).toContain('Fonctionnement Nominal');
    expect(html).toContain('Cause suspectée : Fonctionnement normal');
    expect(html).toContain('Périphérique en ligne et opérationnel.');
  });

  it('renders router-specific action (Ping forcé) for Router type devices', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: routerDevice,
        onClose: vi.fn(),
        initialReport: mockRouterReport,
      })
    );

    expect(html).toContain('Envoyer un Ping forcé');
    expect(html).toContain('Tester le Ping');
    expect(html).toContain('Relancer l&#x27;interview Zigbee');
  });

  it('renders battery sensor repair steps with permit join and physical button instruction', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialReport: mockCriticalReport,
      })
    );

    expect(html).toContain('Ouvrir l&#x27;appairage Zigbee (2 min)');
    expect(html).toContain('Ouvrir l&#x27;appairage');
    expect(html).toContain('Appuyez brièvement sur le bouton physique du capteur pour réveiller la liaison radio ConBee II');
    expect(html).toContain('Remplacer la pile');
    expect(html).toContain('Insérer une pile neuve dans l’appareil (CR2032).');
  });

  it('displays active permit-join countdown when permitJoinTimer > 0', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialReport: mockCriticalReport,
        permitJoinTimer: 84,
      })
    );

    expect(html).toContain('Appairage actif : 84s');
  });

  it('renders online badge when device status is online', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: onlineDevice,
        onClose: vi.fn(),
        initialReport: mockHealthyReport,
      })
    );

    expect(html).toContain('En ligne');
  });

  it('renders celebratory recovery card when device recovers online', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: onlineDevice,
        onClose: vi.fn(),
        initialReport: mockHealthyReport,
        initialRecovered: true,
      })
    );

    expect(html).toContain('Périphérique rétabli avec succès en ligne !');
    expect(html).toContain('Le périphérique communique de nouveau sur le maillage Zigbee');
    expect(html).toContain('Terminer le diagnostic');
  });

  it('renders all repair actions (reset, reconfigure, restart bridge) even without initialReport', () => {
    const html = renderToString(
      React.createElement(DiagnosticModal, {
        device: batteryDevice,
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('2. Actions de Réparation &amp; Dépannage');
    expect(html).toContain('Réinitialiser &amp; Réappairer (Garder identifiants Jeedom)');
    expect(html).toContain('Préservation totale d&#x27;identité : zéro scénario ou commande Jeedom rompus.');
    expect(html).toContain('Reconfigurer les liaisons radio (Configure)');
    expect(html).toContain('Redémarrer le pont Zigbee2MQTT');
  });
});

describe('HistoryModal component', () => {
  const routerDevice: ZigbeeDevice = {
    ieee_address: '0x00124b0021601a11',
    friendly_name: 'Prise Cuisine Routeur',
    type: 'Router',
    model: 'Smart Plug SP120',
    vendor: 'Innr',
    power_source: 'Mains',
    status: 'online',
  };

  const batteryDevice: ZigbeeDevice = {
    ieee_address: '0x00158d00032b1234',
    friendly_name: 'Capteur Température Salon',
    type: 'EndDevice',
    model: 'WSDCGQ11LM',
    vendor: 'Aqara',
    power_source: 'Battery',
    status: 'online',
    battery: 75,
  };

  const mockHistoryData: DeviceHistoryResponse = {
    battery: [
      { ieee_address: batteryDevice.ieee_address, battery: 90, recorded_at: 1774300000000 },
      { ieee_address: batteryDevice.ieee_address, battery: 85, recorded_at: 1774310000000 },
      { ieee_address: batteryDevice.ieee_address, battery: 75, recorded_at: 1774320000000 },
    ],
    events: [
      {
        ieee_address: batteryDevice.ieee_address,
        event_type: 'disconnected',
        recorded_at: 1774310000000,
        duration_offline_ms: null,
      },
      {
        ieee_address: batteryDevice.ieee_address,
        event_type: 'connected',
        recorded_at: 1774320000000,
        duration_offline_ms: 1800000, // 30 min
      },
    ],
  };

  it('renders modal header with device name and navigation tabs', () => {
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: batteryDevice,
        onClose: vi.fn(),
      })
    );

    expect(html).toContain('Historique &amp; Télémétrie : Capteur Température Salon');
    expect(html).toContain('Événements de connexion');
    expect(html).toContain('Évolution de la batterie');
  });

  it('renders custom_name in HistoryModal title when defined', () => {
    const customDevice: ZigbeeDevice = {
      ...batteryDevice,
      custom_name: '[Salon] Sonde Température',
    };
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: customDevice,
        onClose: vi.fn(),
      })
    );
    expect(html).toContain('Historique &amp; Télémétrie : [Salon] Sonde Température');
  });

  it('renders connection events list with duration offline badge', () => {
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialHistory: mockHistoryData,
        initialTab: 'events',
      })
    );

    expect(html).toContain('Déconnexion');
    expect(html).toContain('Reconnexion');
    expect(html).toContain('Coupure de 30 min');
  });

  it('renders battery evolution SVG chart and summary metrics', () => {
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialHistory: mockHistoryData,
        initialTab: 'battery',
      })
    );

    expect(html).toContain('Niveau Actuel');
    expect(html).toContain('75%');
    expect(html).toContain('Niveau Min');
    expect(html).toContain('Niveau Max');
    expect(html).toContain('Courbe de décharge');
    expect(html).toContain('Seuil critique : 20%');
    // SVG elements
    expect(html).toContain('<svg');
    expect(html).toContain('linearGradient');
    expect(html).toContain('stroke="#f43f5e"'); // 20% red line
  });

  it('renders permanent mains power message for Router devices on battery tab', () => {
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: routerDevice,
        onClose: vi.fn(),
        initialHistory: { battery: [], events: [] },
        initialTab: 'battery',
      })
    );

    expect(html).toContain('Alimentation permanente sur secteur');
    expect(html).toContain('Cet équipement est un routeur ou un appareil alimenté sur secteur.');
  });

  it('renders empty message when no events exist', () => {
    const html = renderToString(
      React.createElement(HistoryModal, {
        device: batteryDevice,
        onClose: vi.fn(),
        initialHistory: { battery: [], events: [] },
        initialTab: 'events',
      })
    );

    expect(html).toContain('Aucun événement de déconnexion enregistré.');
  });
});

describe('JeedomSyncModal component', () => {
  it('renders Jeedom sync modal with inputs, descriptions, and action buttons', () => {
    const html = renderToString(
      React.createElement(JeedomSyncModal, {
        isOpen: true,
        onClose: vi.fn(),
        onSync: vi.fn(),
      })
    );
    expect(html).toContain('Synchroniser les Noms Jeedom');
    expect(html).toContain('URL de Jeedom');
    expect(html).toContain('Clé API Jeedom');
    expect(html).toContain('Synchroniser');
  });

  it('renders null when isOpen is false', () => {
    const html = renderToString(
      React.createElement(JeedomSyncModal, {
        isOpen: false,
        onClose: vi.fn(),
        onSync: vi.fn(),
      })
    );
    expect(html).toBe('');
  });
});