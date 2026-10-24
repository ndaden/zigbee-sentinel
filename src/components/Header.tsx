import React, { useState } from 'react';
import {
  ShieldCheck,
  Radio,
  Wifi,
  WifiOff,
  BatteryWarning,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Loader2,
  Power,
} from 'lucide-react';
import type { BridgeStatus, ZigbeeDevice } from '../types/device';
import { calculateDeviceStats } from '../utils/deviceUtils';

export interface HeaderProps {
  bridgeStatus: BridgeStatus | null;
  devices: ZigbeeDevice[];
  permitJoinTimer: number;
  onTriggerPermitJoin: (seconds?: number) => Promise<boolean>;
  onTriggerRestartBridge?: () => Promise<{ success: boolean; message: string }>;
  isPermitJoinLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  bridgeStatus,
  devices,
  permitJoinTimer,
  onTriggerPermitJoin,
  onTriggerRestartBridge,
  isPermitJoinLoading = false,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [isRestartingBridge, setIsRestartingBridge] = useState(false);
  const stats = calculateDeviceStats(devices);

  const isMqttConnected = Boolean(bridgeStatus?.mqttConnected);
  const isZ2mOnline =
    bridgeStatus?.bridge === 'online' ||
    bridgeStatus?.bridgeState === 'online';

  const handlePermitJoinClick = async () => {
    if (permitJoinTimer > 0 || internalLoading || isPermitJoinLoading) return;
    setInternalLoading(true);
    try {
      await onTriggerPermitJoin(120);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleRestartBridgeClick = async () => {
    if (isRestartingBridge || !onTriggerRestartBridge) return;
    const confirm = window.confirm(
      'Voulez-vous redémarrer le pont Zigbee2MQTT et réinitialiser le coordinateur radio ConBee II ?'
    );
    if (!confirm) return;

    setIsRestartingBridge(true);
    try {
      await onTriggerRestartBridge();
    } finally {
      setIsRestartingBridge(false);
    }
  };

  const isLoading = isPermitJoinLoading || internalLoading;

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Zigbee Sentinel
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Surveillance du réseau Zigbee & Diagnostic intelligent
              </p>
            </div>
          </div>

          {/* Status indicators & Permit Join Button */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Mosquitto MQTT status pill */}
            <div
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                isMqttConnected
                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-950/50 text-rose-300 border-rose-500/30'
              }`}
              title={isMqttConnected ? 'Broker MQTT connecté' : 'Broker MQTT hors ligne'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isMqttConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>MQTT: {isMqttConnected ? 'En ligne' : 'Hors-ligne'}</span>
            </div>

            {/* Zigbee2MQTT Bridge status pill */}
            <div
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                isZ2mOnline
                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-950/50 text-rose-300 border-rose-500/30'
              }`}
              title={isZ2mOnline ? 'Pont Zigbee2MQTT actif' : 'Pont Zigbee2MQTT injoignable'}
            >
              {isZ2mOnline ? (
                <Wifi className="h-3 w-3 text-emerald-400" />
              ) : (
                <WifiOff className="h-3 w-3 text-rose-400" />
              )}
              <span>Bridge Z2M: {isZ2mOnline ? 'En ligne' : 'Hors-ligne'}</span>
            </div>

            {/* Permit Join Button */}
            {permitJoinTimer > 0 ? (
              <div
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse"
                title="Les nouveaux appareils peuvent s'associer"
              >
                <Radio className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                <span>Appairage actif : {permitJoinTimer}s</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePermitJoinClick}
                disabled={isLoading}
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 border border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Radio className="h-3.5 w-3.5" />
                )}
                <span>Permit Join (120s)</span>
              </button>
            )}

            {/* Restart Zigbee2MQTT Button */}
            {onTriggerRestartBridge && (
              <button
                type="button"
                onClick={handleRestartBridgeClick}
                disabled={isRestartingBridge}
                title="Redémarrer le service Zigbee2MQTT et réinitialiser le contrôleur ConBee II"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
              >
                <Power className={`h-3.5 w-3.5 ${isRestartingBridge ? 'animate-spin text-indigo-400' : ''}`} />
                <span>{isRestartingBridge ? 'Redémarrage...' : 'Redémarrer Zigbee'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Statistics Counters */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-slate-400">Total périphériques</div>
            </div>
          </div>

          {/* En ligne */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-400">{stats.online}</div>
              <div className="text-xs text-slate-400">En ligne</div>
            </div>
          </div>

          {/* Hors-ligne */}
          <div
            className={`border rounded-xl p-3 flex items-center space-x-3 transition-colors ${
              stats.offline > 0
                ? 'bg-rose-950/30 border-rose-500/30 shadow-sm shadow-rose-950/20'
                : 'bg-slate-800/60 border-slate-700/60'
            }`}
          >
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                stats.offline > 0
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-slate-700/60 text-slate-400'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div
                className={`text-xl font-bold ${
                  stats.offline > 0 ? 'text-rose-400' : 'text-slate-300'
                }`}
              >
                {stats.offline}
              </div>
              <div className="text-xs text-slate-400">Hors-ligne</div>
            </div>
          </div>

          {/* Batterie faible */}
          <div
            className={`border rounded-xl p-3 flex items-center space-x-3 transition-colors ${
              stats.lowBattery > 0
                ? 'bg-amber-950/30 border-amber-500/30 shadow-sm shadow-amber-950/20'
                : 'bg-slate-800/60 border-slate-700/60'
            }`}
          >
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                stats.lowBattery > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-700/60 text-slate-400'
              }`}
            >
              <BatteryWarning className="h-5 w-5" />
            </div>
            <div>
              <div
                className={`text-xl font-bold ${
                  stats.lowBattery > 0 ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {stats.lowBattery}
              </div>
              <div className="text-xs text-slate-400">Batterie &le; 20%</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
