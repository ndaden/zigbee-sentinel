import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Activity,
  RefreshCw,
  Radio,
  Battery,
  Clock,
  Sparkles,
  PartyPopper,
  Wrench,
  HelpCircle,
  RotateCcw,
  Sliders,
  Power,
  RotateCw,
} from 'lucide-react';
import type { ZigbeeDevice, DiagnosticReport } from '../types/device';
import { apiClient } from '../api/client';
import { getLikelyCauseLabel } from '../utils/deviceUtils';

export interface DiagnosticModalProps {
  device: ZigbeeDevice;
  onClose: () => void;
  onPing?: (device: ZigbeeDevice) => Promise<boolean | void> | void;
  onInterview?: (device: ZigbeeDevice) => Promise<boolean | void> | void;
  onConfigure?: (device: ZigbeeDevice) => Promise<boolean | void> | void;
  onReset?: (device: ZigbeeDevice) => Promise<boolean | void> | void;
  onRestartBridge?: () => Promise<{ success: boolean; message: string }>;
  onPermitJoin?: (seconds?: number) => Promise<boolean | void> | void;
  permitJoinTimer?: number;
  runDiagnostic?: (ieee: string) => Promise<DiagnosticReport>;
  initialReport?: DiagnosticReport;
  initialRecovered?: boolean;
}

export const DiagnosticModal: React.FC<DiagnosticModalProps> = ({
  device,
  onClose,
  onPing,
  onInterview,
  onConfigure,
  onReset,
  onRestartBridge,
  onPermitJoin,
  permitJoinTimer = 0,
  runDiagnostic,
  initialReport,
  initialRecovered,
}) => {
  const [report, setReport] = useState<DiagnosticReport | null>(initialReport ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialReport);
  const [error, setError] = useState<string | null>(null);

  // Per-action loading & feedback states
  const [isPinging, setIsPinging] = useState(false);
  const [isInterviewing, setIsInterviewing] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRestartingBridge, setIsRestartingBridge] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [resetActive, setResetActive] = useState(false);
  const [feedback, setFeedback] = useState<{
    action: string;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Live recovery detection
  const wasInitiallyOffline = useRef(device.status === 'offline');
  const [hasRecovered, setHasRecovered] = useState(initialRecovered ?? false);

  useEffect(() => {
    if (wasInitiallyOffline.current && device.status === 'online') {
      setHasRecovered(true);
    }
  }, [device.status]);

  // Fetch diagnostic report on mount and when device IEEE changes
  const fetchReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const diagnosticFetcher = runDiagnostic || apiClient.runDiagnostic;
      const data = await diagnosticFetcher(device.ieee_address);
      setReport(data);
    } catch (err: any) {
      console.error('[DiagnosticModal] Failed to fetch report:', err);
      setError(
        err?.message || 'Impossible de générer le rapport diagnostic pour cet équipement.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialReport) {
      fetchReport();
    }
  }, [device.ieee_address]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePingAction = async () => {
    if (isPinging) return;
    setIsPinging(true);
    setFeedback(null);
    try {
      let res: boolean | void = false;
      if (onPing) {
        res = await onPing(device);
      } else {
        const pingRes = await apiClient.pingDevice(device.ieee_address);
        res = pingRes.success;
      }

      if (res === false) {
        setFeedback({
          action: 'ping',
          type: 'error',
          message: 'Le périphérique n’a pas répondu au ping (délai dépassé).',
        });
      } else {
        setFeedback({
          action: 'ping',
          type: 'success',
          message: 'Ping réussi ! Le périphérique a confirmé sa liaison radio.',
        });
      }
    } catch {
      setFeedback({
        action: 'ping',
        type: 'error',
        message: 'Erreur lors de l’envoi de la commande de ping.',
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleInterviewAction = async () => {
    if (isInterviewing) return;
    setIsInterviewing(true);
    setFeedback(null);
    try {
      let res: boolean | void = false;
      if (onInterview) {
        res = await onInterview(device);
      } else {
        const interviewRes = await apiClient.interviewDevice(device.ieee_address);
        res = interviewRes.success;
      }

      if (res === false) {
        setFeedback({
          action: 'interview',
          type: 'error',
          message: 'Échec du lancement de l’interview.',
        });
      } else {
        setFeedback({
          action: 'interview',
          type: 'success',
          message: 'Interview Zigbee lancée. Le coordinateur interroge les clusters de l’appareil.',
        });
      }
    } catch {
      setFeedback({
        action: 'interview',
        type: 'error',
        message: 'Erreur de communication lors de l’interview.',
      });
    } finally {
      setIsInterviewing(false);
    }
  };

  const handleConfigureAction = async () => {
    if (isConfiguring) return;
    setIsConfiguring(true);
    setFeedback(null);
    try {
      let res: boolean | void = false;
      if (onConfigure) {
        res = await onConfigure(device);
      } else {
        const confRes = await apiClient.configureDevice(device.ieee_address);
        res = confRes.success;
      }

      if (res === false) {
        setFeedback({
          action: 'configure',
          type: 'error',
          message: 'Échec de la reconfiguration des liaisons radio.',
        });
      } else {
        setFeedback({
          action: 'configure',
          type: 'success',
          message: 'Liaisons et rapports d’état reconfigurés avec succès.',
        });
      }
    } catch {
      setFeedback({
        action: 'configure',
        type: 'error',
        message: 'Erreur lors de la reconfiguration de l’équipement.',
      });
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleResetAction = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setFeedback(null);
    try {
      let res: boolean | void = false;
      if (onReset) {
        res = await onReset(device);
      } else {
        const resetRes = await apiClient.resetDevice(device.ieee_address, 120);
        res = resetRes.success;
      }

      if (res === false) {
        setFeedback({
          action: 'reset',
          type: 'error',
          message: 'Échec de la réinitialisation de la connexion.',
        });
      } else {
        setResetActive(true);
        setFeedback({
          action: 'reset',
          type: 'success',
          message:
            'Cache purgé et réseau ouvert pour 120s. Appuyez sur le bouton physique du capteur.',
        });
      }
    } catch {
      setFeedback({
        action: 'reset',
        type: 'error',
        message: 'Erreur lors de la réinitialisation de la connexion.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleRestartBridgeAction = async () => {
    if (isRestartingBridge) return;
    const confirm = window.confirm(
      'Voulez-vous redémarrer le service Zigbee2MQTT et réinitialiser le coordinateur radio ?'
    );
    if (!confirm) return;

    setIsRestartingBridge(true);
    setFeedback(null);
    try {
      const res = onRestartBridge
        ? await onRestartBridge()
        : await apiClient.restartBridge();

      if (res.success) {
        setFeedback({
          action: 'restart_bridge',
          type: 'success',
          message: res.message || 'Service Zigbee2MQTT redémarré avec succès.',
        });
      } else {
        setFeedback({
          action: 'restart_bridge',
          type: 'error',
          message: res.message || 'Échec du redémarrage du service Zigbee2MQTT.',
        });
      }
    } catch (err: any) {
      setFeedback({
        action: 'restart_bridge',
        type: 'error',
        message: err.message || 'Erreur lors de la commande de redémarrage.',
      });
    } finally {
      setIsRestartingBridge(false);
    }
  };

  const handlePermitJoinAction = async () => {
    if (!onPermitJoin || isJoining) return;
    setIsJoining(true);
    setFeedback(null);
    try {
      const res = await onPermitJoin(120);
      if (res === false) {
        setFeedback({
          action: 'permit_join',
          type: 'error',
          message: 'Échec de l’ouverture du réseau Zigbee à l’appairage.',
        });
      } else {
        setFeedback({
          action: 'permit_join',
          type: 'success',
          message: 'Réseau Zigbee ouvert pour 120 secondes. Vous pouvez réveiller le capteur.',
        });
      }
    } catch {
      setFeedback({
        action: 'permit_join',
        type: 'error',
        message: 'Erreur lors de l’ouverture de l’appairage.',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const isRouter =
    device.type?.toLowerCase() === 'router' ||
    device.power_source?.toLowerCase() === 'mains';

  const isOnline = device.status === 'online';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostic-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-start justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400">
              <Wrench className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2
                  id="diagnostic-modal-title"
                  className="text-base font-bold text-white truncate"
                >
                  {`Assistant Diagnostic : ${device.custom_name || device.friendly_name}`}
                </h2>
                {isOnline ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                    En ligne
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-500/40">
                    Hors-ligne
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {device.vendor ? `${device.vendor} ` : ''}
                {device.model || device.type} &bull; IEEE :{' '}
                <span className="font-mono">{device.ieee_address}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 ml-3">
            <button
              type="button"
              onClick={fetchReport}
              disabled={isLoading}
              title="Réactualiser le diagnostic"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* SECTION 3: Live Recovery Celebration Card */}
          {hasRecovered && (
            <div
              data-testid="recovery-celebration"
              className="p-4 rounded-xl border border-emerald-500/60 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 text-emerald-100 shadow-xl shadow-emerald-950/40 animate-fade-in"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0">
                  <PartyPopper className="h-6 w-6 animate-bounce" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-white">
                      Périphérique rétabli avec succès en ligne !
                    </h3>
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                  </div>
                  <p className="mt-1 text-xs text-emerald-200/90 leading-relaxed">
                    Le périphérique communique de nouveau sur le maillage Zigbee et a émis une trame au coordinateur ConBee II. La liaison radio est opérationnelle.
                  </p>
                  <div className="mt-3 flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/50 transition-colors"
                    >
                      Terminer le diagnostic
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inline Action Feedback */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="ml-2 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && !report && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <RefreshCw className="h-7 w-7 animate-spin text-indigo-400" />
              <p className="text-xs text-slate-300 font-medium">
                Analyse télémétrique et diagnostic en cours...
              </p>
            </div>
          )}

          {/* Error State for Automated Report */}
          {error && !isLoading && (
            <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0">
                <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span className="text-xs font-medium truncate">{error}</span>
              </div>
              <button
                type="button"
                onClick={fetchReport}
                className="ml-2 px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 text-rose-200 text-xs font-semibold border border-rose-500/40 flex-shrink-0"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* SECTION 1: Automated Findings (if report is loaded) */}
          {report && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  1. Constats Automatisés
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">
                  Moteur heuristique Zigbee Sentinel
                </span>
              </div>

              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  report.severity === 'critical'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    : report.severity === 'warning'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  {report.severity === 'critical' ? (
                    <AlertTriangle className="h-5 w-5 text-rose-400 mt-0.5 flex-shrink-0" />
                  ) : report.severity === 'warning' ? (
                    <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {report.severity === 'critical'
                          ? 'Anomalie Critique'
                          : report.severity === 'warning'
                          ? 'Avertissement'
                          : 'Fonctionnement Nominal'}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900/60 border border-white/10 font-medium">
                        {`Cause suspectée : ${getLikelyCauseLabel(report.likelyCause)}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed font-medium">
                      {report.verdict}
                    </p>
                  </div>
                </div>
              </div>

              {/* Details Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Battery card */}
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs">
                    <Battery className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Alimentation
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-200 truncate">
                    {report.details.batteryStatus}
                  </div>
                </div>

                {/* Signal LQI card */}
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs">
                    <Radio className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Signal Radio (LQI)
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-200 truncate">
                    {report.details.signalStatus}
                  </div>
                </div>

                {/* Last Seen card */}
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Dernière Réception
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-200 truncate">
                    {report.details.lastSeenHuman}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: Actionable Repair Steps (ALWAYS VISIBLE & ACCESSIBLE) */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Actions de Réparation & Dépannage
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">Interventions directes</span>
            </div>

            <div className="space-y-3">
              {/* ACTION: Reset & Re-join Connection */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <RotateCcw className="h-4 w-4 text-rose-400" />
                      <h4 className="text-xs font-semibold text-slate-200">
                        Réinitialiser la connexion (Ré-inclusion)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Purge le cache d’association du coordinateur ConBee II et ouvre immédiatement le réseau Zigbee à l'appairage.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetAction}
                    disabled={isResetting}
                    className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                    <span>{isResetting ? 'Réinitialisation...' : 'Réinitialiser & Ré-appairer'}</span>
                  </button>
                </div>

                {/* Reset instruction guide shown when clicked or active */}
                {(resetActive || permitJoinTimer > 0) && (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start space-x-2.5">
                    <HelpCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-200">
                      <span className="font-semibold">
                        Appairage en cours ({permitJoinTimer}s restantes) :
                      </span>
                      <p className="mt-0.5 text-amber-300/90 leading-relaxed">
                        Appuyez brièvement sur le bouton physique du capteur (1 impulsion) pour le reconnecter immédiatement au réseau.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION: Reconfigure Device */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Sliders className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Reconfigurer les liaisons radio (Configure)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Force l’équipement à recalculer ses liaisons (bindings) et à réémettre ses rapports d’état réguliers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleConfigureAction}
                  disabled={isConfiguring}
                  className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Sliders className={`h-3.5 w-3.5 ${isConfiguring ? 'animate-spin text-amber-400' : ''}`} />
                  <span>{isConfiguring ? 'Configuration...' : 'Reconfigurer'}</span>
                </button>
              </div>

              {/* ACTION: Ping Device */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4 text-cyan-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Envoyer un Ping forcé
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {isRouter
                      ? 'Envoie une trame directe pour vérifier la présence radio du routeur.'
                      : 'Envoie un ping radio (recommandé si l’appareil est réveillé).'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePingAction}
                  disabled={isPinging}
                  className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Activity className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'Ping en cours...' : 'Tester le Ping'}</span>
                </button>
              </div>

              {/* ACTION: Zigbee Interview */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <RotateCw className="h-4 w-4 text-emerald-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Relancer l'interview Zigbee
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Réinterroge tous les clusters et endpoints pour reconstruire la fiche technique de l’équipement.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleInterviewAction}
                  disabled={isInterviewing}
                  className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${isInterviewing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>{isInterviewing ? 'Interview...' : 'Relancer l’interview'}</span>
                </button>
              </div>

              {/* ACTION: Permit Join standalone button */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Radio className="h-4 w-4 text-indigo-400" />
                      <h4 className="text-xs font-semibold text-slate-200">
                        Ouvrir l'appairage Zigbee (2 min)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Autorise le rattachement de nouveaux capteurs ou la ré-association d'un capteur endormi.
                    </p>
                  </div>
                  <div>
                    {permitJoinTimer > 0 ? (
                      <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-semibold animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        <span>{`Appairage actif : ${permitJoinTimer}s`}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePermitJoinAction}
                        disabled={isJoining}
                        className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Radio className={`h-3.5 w-3.5 ${isJoining ? 'animate-spin' : ''}`} />
                        <span>Ouvrir l'appairage</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Wake-up instruction */}
                {!isRouter && (
                  <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-start space-x-2.5">
                    <HelpCircle className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-indigo-200">
                      <span className="font-semibold">Instruction de réveil physique :</span>
                      <p className="mt-0.5 text-indigo-300/90 leading-relaxed">
                        Appuyez brièvement sur le bouton physique du capteur pour réveiller la liaison radio ConBee II et forcer l’envoi d’un rapport.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION: Restart Zigbee2MQTT Service */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Power className="h-4 w-4 text-indigo-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Redémarrer le pont Zigbee2MQTT
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Réinitialise le port USB ConBee II et relance le service Zigbee2MQTT en cas de blocage radio persistant.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRestartBridgeAction}
                  disabled={isRestartingBridge}
                  className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <Power className={`h-3.5 w-3.5 ${isRestartingBridge ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>{isRestartingBridge ? 'Redémarrage...' : 'Redémarrer Zigbee'}</span>
                </button>
              </div>

              {/* Contextual Manual Actions from Report (if present) */}
              {report?.recommendedActions
                ?.filter((a) => a.type === 'manual')
                ?.map((action) => (
                  <div
                    key={action.id}
                    className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800 flex items-start space-x-3 text-xs"
                  >
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                      <Battery className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">{action.label}</div>
                      {action.instruction && (
                        <p className="mt-0.5 text-slate-400 leading-relaxed">
                          {action.instruction}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {isOnline ? 'Périphérique actuellement en ligne' : 'En attente d’un retour en ligne...'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
