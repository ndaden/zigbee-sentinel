import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  History,
  Battery,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Zap,
  TrendingDown,
} from 'lucide-react';
import type {
  ZigbeeDevice,
  DeviceHistoryResponse,
} from '../types/device';
import { apiClient } from '../api/client';
import { formatDateFull, formatDurationMs } from '../utils/deviceUtils';

export interface HistoryModalProps {
  device: ZigbeeDevice;
  onClose: () => void;
  fetchHistory?: (ieee: string, limit?: number) => Promise<DeviceHistoryResponse>;
  initialHistory?: DeviceHistoryResponse;
  initialTab?: HistoryTab;
}

export type HistoryTab = 'events' | 'battery';

export const HistoryModal: React.FC<HistoryModalProps> = ({
  device,
  onClose,
  fetchHistory,
  initialHistory,
  initialTab = 'events',
}) => {
  const [activeTab, setActiveTab] = useState<HistoryTab>(initialTab);
  const [history, setHistory] = useState<DeviceHistoryResponse | null>(initialHistory ?? null);
  const [isLoading, setIsLoading] = useState(!initialHistory);
  const [error, setError] = useState<string | null>(null);

  const isRouter =
    device.type?.toLowerCase() === 'router' ||
    device.power_source?.toLowerCase() === 'mains';

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const historyFetcher = fetchHistory || apiClient.fetchHistory;
      const data = await historyFetcher(device.ieee_address, 100);
      setHistory(data);
    } catch (err) {
      console.error('[HistoryModal] Failed to load history:', err);
      setError('Impossible de récupérer l’historique pour cet équipement.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialHistory) {
      loadData();
    }
  }, [device.ieee_address]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Battery statistics and SVG chart points
  const batteryStats = useMemo(() => {
    if (!history?.battery || history.battery.length === 0) {
      return null;
    }

    // Sort chronologically ascending
    const sorted = [...history.battery].sort((a, b) => a.recorded_at - b.recorded_at);
    const levels = sorted.map((b) => b.battery);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    const latest = sorted[sorted.length - 1];

    // Chart dimensions
    const width = 500;
    const height = 150;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const points = sorted.map((item, idx) => {
      const x =
        sorted.length > 1
          ? paddingLeft + (idx / (sorted.length - 1)) * plotWidth
          : paddingLeft + plotWidth / 2;
      const y = paddingTop + plotHeight - (Math.min(100, Math.max(0, item.battery)) / 100) * plotHeight;
      return { x, y, item };
    });

    const pathD = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`;
    }, '');

    const areaD =
      points.length > 0
        ? `${pathD} L ${points[points.length - 1].x},${paddingTop + plotHeight} L ${points[0].x},${paddingTop + plotHeight} Z`
        : '';

    const criticalY = paddingTop + plotHeight - (20 / 100) * plotHeight;

    return {
      min,
      max,
      latest,
      total: sorted.length,
      points,
      pathD,
      areaD,
      criticalY,
      width,
      height,
      paddingLeft,
      plotWidth,
      plotHeight,
      paddingTop,
    };
  }, [history?.battery]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400">
              <History className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="history-modal-title"
                className="text-base font-bold text-white truncate"
              >
                {`Historique & Télémétrie : ${device.custom_name || device.friendly_name}`}
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {`${device.vendor ? `${device.vendor} ` : ''}${device.model || device.type} • IEEE : `}
                <span className="font-mono">{device.ieee_address}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0 ml-3">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              title="Rafraîchir les données"
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

        {/* Tab Selector */}
        <div className="flex items-center space-x-2 px-5 pt-3 border-b border-slate-800 bg-slate-950/20">
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`inline-flex items-center space-x-2 pb-3 px-2 border-b-2 text-xs font-semibold transition-colors ${
              activeTab === 'events'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Événements de connexion</span>
            {history?.events && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {history.events.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('battery')}
            className={`inline-flex items-center space-x-2 pb-3 px-2 border-b-2 text-xs font-semibold transition-colors ${
              activeTab === 'battery'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Battery className="h-4 w-4" />
            <span>Évolution de la batterie</span>
            {history?.battery && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {history.battery.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isLoading && !history && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
              <p className="text-sm text-slate-300 font-medium">
                Chargement des journaux télémétriques...
              </p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-300 flex items-center justify-between">
              <span className="text-xs font-medium">{error}</span>
              <button
                type="button"
                onClick={loadData}
                className="px-3 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 text-rose-200 text-xs font-semibold border border-rose-500/40"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* TAB 1: Events Log */}
          {activeTab === 'events' && !isLoading && (
            <div className="space-y-3">
              {!history?.events || history.events.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Clock className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-medium">Aucun événement de déconnexion enregistré.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Les transitions en ligne / hors-ligne seront répertoriées ici automatiquement.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-900/60">
                  {history.events.map((evt, idx) => {
                    const isDisconn = evt.event_type === 'disconnected';
                    return (
                      <div
                        key={evt.id || idx}
                        className="p-3.5 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`p-2 rounded-lg border flex-shrink-0 ${
                              isDisconn
                                ? 'bg-rose-950/40 border-rose-500/30 text-rose-400'
                                : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                            }`}
                          >
                            {isDisconn ? (
                              <WifiOff className="h-4 w-4" />
                            ) : (
                              <Wifi className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-xs font-semibold ${
                                  isDisconn ? 'text-rose-300' : 'text-emerald-300'
                                }`}
                              >
                                {isDisconn ? 'Déconnexion' : 'Reconnexion'}
                              </span>
                              {evt.duration_offline_ms ? (
                                <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700">
                                  {`Coupure de ${formatDurationMs(evt.duration_offline_ms)}`}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {formatDateFull(evt.recorded_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Battery Evolution */}
          {activeTab === 'battery' && !isLoading && (
            <div className="space-y-4">
              {isRouter ? (
                <div className="p-6 rounded-xl bg-slate-800/40 border border-slate-800 text-center space-y-2">
                  <Zap className="h-8 w-8 text-cyan-400 mx-auto" />
                  <h4 className="text-sm font-semibold text-slate-200">
                    Alimentation permanente sur secteur
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Cet équipement est un routeur ou un appareil alimenté sur secteur. Il ne dispose pas de batterie interne.
                  </p>
                </div>
              ) : !batteryStats ? (
                <div className="py-12 text-center text-slate-400">
                  <Battery className="h-8 w-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-medium">Aucun historique de batterie disponible.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Les rapports de tension et pourcentage reçus seront tracés ici dans le temps.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Niveau Actuel
                      </span>
                      <div className="mt-1 text-base font-bold text-white flex items-center space-x-1">
                        <span>{device.battery ?? batteryStats.latest.battery}%</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Niveau Min
                      </span>
                      <div className="mt-1 text-base font-bold text-rose-300">
                        {batteryStats.min}%
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Niveau Max
                      </span>
                      <div className="mt-1 text-base font-bold text-emerald-300">
                        {batteryStats.max}%
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Relevés
                      </span>
                      <div className="mt-1 text-base font-bold text-indigo-300">
                        {batteryStats.total}
                      </div>
                    </div>
                  </div>

                  {/* SVG Battery Trend Chart */}
                  <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Courbe de décharge</span>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Seuil critique : 20%
                      </span>
                    </div>

                    <div className="relative w-full overflow-x-auto">
                      <svg
                        viewBox={`0 0 ${batteryStats.width} ${batteryStats.height}`}
                        className="w-full h-44 text-slate-500 select-none"
                      >
                        <defs>
                          <linearGradient id="batteryGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Y-axis grid lines (100%, 50%, 0%) */}
                        {[100, 50, 0].map((val) => {
                          const y =
                            batteryStats.paddingTop +
                            batteryStats.plotHeight -
                            (val / 100) * batteryStats.plotHeight;
                          return (
                            <g key={val}>
                              <line
                                x1={batteryStats.paddingLeft}
                                y1={y}
                                x2={batteryStats.width - 20}
                                y2={y}
                                stroke="currentColor"
                                strokeDasharray="3 3"
                                strokeOpacity="0.2"
                              />
                              <text
                                x={batteryStats.paddingLeft - 8}
                                y={y + 3}
                                textAnchor="end"
                                fontSize="9"
                                fill="#94a3b8"
                              >
                                {val}%
                              </text>
                            </g>
                          );
                        })}

                        {/* Critical 20% threshold line */}
                        <line
                          x1={batteryStats.paddingLeft}
                          y1={batteryStats.criticalY}
                          x2={batteryStats.width - 20}
                          y2={batteryStats.criticalY}
                          stroke="#f43f5e"
                          strokeDasharray="4 4"
                          strokeWidth="1.5"
                          strokeOpacity="0.7"
                        />
                        <text
                          x={batteryStats.width - 22}
                          y={batteryStats.criticalY - 4}
                          textAnchor="end"
                          fontSize="9"
                          fill="#f43f5e"
                          fontWeight="600"
                        >
                          20%
                        </text>

                        {/* Area gradient under path */}
                        {batteryStats.areaD && (
                          <path d={batteryStats.areaD} fill="url(#batteryGrad)" />
                        )}

                        {/* Line path */}
                        {batteryStats.pathD && (
                          <path
                            d={batteryStats.pathD}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        {/* Data point dots */}
                        {batteryStats.points.map((pt, i) => (
                          <g key={i}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r="4"
                              fill="#1e1b4b"
                              stroke="#a5b4fc"
                              strokeWidth="2"
                              className="hover:r-6 transition-all cursor-pointer"
                            >
                              <title>{`${pt.item.battery}% (${formatDateFull(pt.item.recorded_at)})`}</title>
                            </circle>
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <span>{`Premier relevé : ${formatDateFull(batteryStats.points[0]?.item.recorded_at)}`}</span>
                      <span>{`Dernier relevé : ${formatDateFull(batteryStats.latest.recorded_at)}`}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
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