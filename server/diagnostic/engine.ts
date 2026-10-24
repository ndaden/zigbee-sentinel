import type {
  ZigbeeDevice,
  BatteryHistoryRecord,
  DiagnosticReport,
  DiagnosticAction,
  DiagnosticSeverity,
  DiagnosticLikelyCause,
  DiagnosticDetails
} from '../types.js';

export function detectSteepBatteryDrop(
  device: ZigbeeDevice,
  batteryHistory: BatteryHistoryRecord[]
): boolean {
  if (!batteryHistory || batteryHistory.length === 0) {
    return false;
  }

  // Sort chronologically ascending
  const sorted = [...batteryHistory].sort((a, b) => a.recorded_at - b.recorded_at);

  const readings: Array<{ battery: number; time: number }> = sorted.map((r) => ({
    battery: r.battery,
    time: r.recorded_at
  }));

  if (device.battery !== null && device.battery !== undefined) {
    const lastHistoryTime = readings[readings.length - 1].time;
    const deviceTime = device.last_seen ?? Date.now();
    if (deviceTime >= lastHistoryTime) {
      readings.push({ battery: device.battery, time: deviceTime });
    }
  }

  if (readings.length < 2) {
    return false;
  }

  // 1. Any consecutive drop >= 20%
  for (let i = 0; i < readings.length - 1; i++) {
    const drop = readings[i].battery - readings[i + 1].battery;
    if (drop >= 20) {
      return true;
    }
  }

  // 2. Total drop >= 25% within a 7-day sliding window
  const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
  const newest = readings[readings.length - 1];
  const window = readings.filter((r) => r.time >= newest.time - SEVEN_DAYS_MS);
  if (window.length >= 2 && Math.max(...window.map((r) => r.battery)) - newest.battery >= 25) {
    return true;
  }

  return false;
}

export function formatLastSeen(lastSeen: number | string | null | undefined): string {
  if (lastSeen === null || lastSeen === undefined) {
    return 'Jamais vu';
  }

  let numericTime: number;
  if (typeof lastSeen === 'string') {
    const parsed = Date.parse(lastSeen);
    if (isNaN(parsed) || parsed <= 0) return 'Jamais vu';
    numericTime = parsed;
  } else {
    numericTime = lastSeen;
  }

  if (numericTime <= 0) {
    return 'Jamais vu';
  }

  const diffMs = Math.max(0, Date.now() - numericTime);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "À l'instant";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Il y a ${diffMin} min`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

export function formatBatteryStatus(
  battery: number | null | undefined,
  isRouter: boolean,
  hasSteepDrop: boolean
): string {
  if (battery !== null && battery !== undefined) {
    let qual = 'Bon';
    if (battery <= 15) {
      qual = 'Critique';
    } else if (battery <= 30) {
      qual = 'Faible';
    }

    const dropNote = hasSteepDrop ? ' - Chute brutale' : '';
    return `${battery}% (${qual}${dropNote})`;
  }

  if (isRouter) {
    return 'Alimentation secteur (Pas de batterie)';
  }

  return 'Non disponible';
}

export function formatSignalStatus(linkquality: number | null | undefined): string {
  if (linkquality !== null && linkquality !== undefined) {
    let qual = 'Excellent';
    if (linkquality < 35) {
      qual = 'Faible';
    } else if (linkquality < 70) {
      qual = 'Moyen';
    }
    return `${linkquality} / 255 (${qual})`;
  }

  return 'Non disponible';
}

export class DiagnosticEngine {
  static analyze(
    device: ZigbeeDevice,
    batteryHistory: BatteryHistoryRecord[] = []
  ): DiagnosticReport {
    const isRouter =
      device.type?.toLowerCase() === 'router' ||
      device.power_source?.toLowerCase() === 'mains';

    const isEndDevice =
      device.type?.toLowerCase() === 'enddevice' ||
      device.power_source?.toLowerCase() === 'battery' ||
      (!isRouter && device.battery !== null && device.battery !== undefined);

    const hasBattery = device.battery !== null && device.battery !== undefined;
    const batteryLevel = hasBattery ? device.battery! : null;
    const isDeadBattery = hasBattery && batteryLevel! <= 15;
    const hasSteepDrop = isEndDevice && detectSteepBatteryDrop(device, batteryHistory);

    const hasSignal = device.linkquality !== null && device.linkquality !== undefined;
    const signalLevel = hasSignal ? device.linkquality! : null;
    const isWeakSignal = hasSignal && signalLevel! < 35;

    let verdict = '';
    let severity: DiagnosticSeverity = 'info';
    let likelyCause: DiagnosticLikelyCause = 'healthy';
    const recommendedActions: DiagnosticAction[] = [];

    const isOffline = device.status === 'offline';

    if (isOffline) {
      if (isRouter) {
        likelyCause = 'mains_power_loss';
        severity = 'critical';
        verdict =
          "Routeur hors-ligne. Coupure d'alimentation secteur ou problème matériel suspecté.";
        recommendedActions.push(
          {
            id: 'ping',
            label: 'Tester la connexion (Ping)',
            type: 'ping',
            instruction: 'Envoyer une requête Ping au routeur pour forcer une réponse.'
          },
          {
            id: 'interview',
            label: 'Relancer l’interview',
            type: 'interview',
            instruction:
              'Ré-interviewer l’équipement pour reconstruire sa table de routage.'
          }
        );
      } else if (isEndDevice || hasBattery) {
        if (isDeadBattery) {
          likelyCause = 'dead_battery';
          severity = 'critical';
          verdict =
            'Niveau de pile critique ou épuisé (<= 15%). Le capteur ne peut plus émettre.';
          recommendedActions.push(
            {
              id: 'replace_battery',
              label: 'Remplacer la pile',
              type: 'manual',
              instruction: 'Insérer une pile neuve dans l’appareil.'
            },
            {
              id: 'permit_join',
              label: 'Ouvrir l’appairage (2 min)',
              type: 'permit_join',
              instruction:
                'Ouvrir le réseau Zigbee puis appuyer brièvement sur le bouton d’association pour reconnecter l’appareil.'
            }
          );
        } else if (hasSteepDrop) {
          likelyCause = 'dead_battery';
          severity = 'critical';
          verdict =
            'Chute brutale de batterie détectée. La pile est probablement épuisée ou défaillante.';
          recommendedActions.push(
            {
              id: 'replace_battery',
              label: 'Remplacer la pile',
              type: 'manual',
              instruction: 'Insérer une pile neuve dans l’appareil.'
            },
            {
              id: 'permit_join',
              label: 'Ouvrir l’appairage (2 min)',
              type: 'permit_join',
              instruction:
                'Ouvrir le réseau Zigbee puis appuyer brièvement sur le bouton d’association pour reconnecter l’appareil.'
            }
          );
        } else if (isWeakSignal) {
          likelyCause = 'weak_signal';
          severity = 'warning';
          verdict = 'Signal radio trop faible (LQI < 35) ou routeur parent éteint.';
          recommendedActions.push(
            {
              id: 'permit_join',
              label: 'Ouvrir l’appairage (2 min)',
              type: 'permit_join',
              instruction:
                'Rapprocher l’appareil ou ouvrir l’appairage pour lui permettre de choisir un meilleur routeur parent.'
            },
            {
              id: 'wake_device',
              label: 'Réveiller l’appareil',
              type: 'manual',
              instruction:
                'Appuyez brièvement sur le bouton d’association du capteur pour forcer l’envoi d’une trame.'
            }
          );
        } else {
          likelyCause = 'desynchronized';
          severity = 'warning';
          verdict = 'Capteur endormi ou désynchronisé du coordinateur Zigbee.';
          recommendedActions.push(
            {
              id: 'permit_join',
              label: 'Ouvrir l’appairage (2 min)',
              type: 'permit_join',
              instruction:
                'Ouvrir le réseau Zigbee pendant 120 secondes pour permettre au capteur de se reconnecter.'
            },
            {
              id: 'wake_device',
              label: 'Réveiller l’appareil',
              type: 'manual',
              instruction:
                'Appuyez brièvement sur le bouton d’association du capteur pour forcer l’émission d’une trame.'
            }
          );
        }
      } else {
        // Unknown device without battery info
        likelyCause = 'mains_power_loss';
        severity = 'critical';
        verdict =
          "Équipement hors-ligne. Coupure d'alimentation ou problème de communication.";
        recommendedActions.push({
          id: 'ping',
          label: 'Tester la connexion (Ping)',
          type: 'ping',
          instruction: 'Envoyer une requête Ping pour vérifier la réponse.'
        });
      }
    } else {
      // Device is ONLINE
      if (isDeadBattery) {
        likelyCause = 'dead_battery';
        severity = 'warning';
        verdict =
          'Pile critique (<= 15%). Le périphérique est en ligne mais risque de s’éteindre prochainement.';
        recommendedActions.push({
          id: 'replace_battery',
          label: 'Remplacer la pile',
          type: 'manual',
          instruction: 'Remplacer la pile prochainement pour éviter une coupure.'
        });
      } else if (hasSteepDrop) {
        likelyCause = 'dead_battery';
        severity = 'warning';
        verdict =
          'Chute brutale de batterie détectée. Surveiller ou remplacer la pile rapidement.';
        recommendedActions.push({
          id: 'replace_battery',
          label: 'Vérifier la pile',
          type: 'manual',
          instruction: 'La batterie a chuté anormalement vite. Vérifier la pile.'
        });
      } else if (isWeakSignal) {
        likelyCause = 'weak_signal';
        severity = 'warning';
        verdict =
          'Signal radio faible (LQI < 35). Risque de déconnexions intempestives.';
        if (isRouter) {
          recommendedActions.push(
            {
              id: 'ping',
              label: 'Tester la connexion (Ping)',
              type: 'ping',
              instruction: 'Tester la réactivité du routeur avec un Ping.'
            },
            {
              id: 'interview',
              label: 'Relancer l’interview',
              type: 'interview',
              instruction: 'Optimiser le maillage avec une nouvelle interview.'
            }
          );
        } else {
          recommendedActions.push({
            id: 'check_position',
            label: 'Améliorer la couverture',
            type: 'manual',
            instruction:
              'Rapprocher le capteur ou ajouter un routeur Zigbee intermédiaire.'
          });
        }
      } else {
        likelyCause = 'healthy';
        severity = 'info';
        verdict = 'Périphérique en ligne et opérationnel. Aucune anomalie détectée.';
      }
    }

    const details: DiagnosticDetails = {
      batteryStatus: formatBatteryStatus(device.battery, isRouter, hasSteepDrop),
      signalStatus: formatSignalStatus(device.linkquality),
      lastSeenHuman: formatLastSeen(device.last_seen)
    };

    return {
      verdict,
      severity,
      likelyCause,
      recommendedActions,
      details
    };
  }
}

export type {
  DiagnosticReport,
  DiagnosticAction,
  DiagnosticSeverity,
  DiagnosticLikelyCause,
  DiagnosticDetails
};
