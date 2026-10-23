import React, { useState } from 'react';
import {
  Lightbulb,
  Plug,
  Thermometer,
  Shield,
  ToggleLeft,
  Radio,
  Clock,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  RefreshCw,
  Activity,
  Wrench,
  History,
  Zap,
} from 'lucide-react';
import type { ZigbeeDevice } from '../types/device';
import {
  getDeviceCategory,
  formatRelativeTime,
  getLqiBars,
  getBatteryColor,
} from '../utils/deviceUtils';

export interface DeviceCardProps {
  device: ZigbeeDevice;
  onPing?: (device: ZigbeeDevice) => void;
  onInterview?: (device: ZigbeeDevice) => void;
  onDiagnose?: (device: ZigbeeDevice) => void;
  onViewHistory?: (device: ZigbeeDevice) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onPing,
  onInterview,
  onDiagnose,
  onViewHistory,
}) => {
  const [isPinging, setIsPinging] = useState(false);
  const [isInterviewing, setIsInterviewing] = useState(false);

  const category = getDeviceCategory(device);
  const isOnline = device.status === 'online';
  const isRouter = device.type === 'Router';
  const isMains =
    device.power_source?.toLowerCase() === 'mains' ||
    (isRouter && device.power_source?.toLowerCase() !== 'battery');
  const hasBattery =
    device.battery !== null && device.battery !== undefined && !isMains;

  const batteryColor = getBatteryColor(device.battery);
  const lqiInfo = getLqiBars(device.linkquality);
  const relativeTime = formatRelativeTime(device.last_seen, device.status);

  const handlePing = async () => {
    if (!onPing || isPinging || !isRouter) return;
    setIsPinging(true);
    try {
      await onPing(device);
    } finally {
      setTimeout(() => setIsPinging(false), 800);
    }
  };

  const handleInterview = async () => {
    if (!onInterview || isInterviewing) return;
    setIsInterviewing(true);
    try {
      await onInterview(device);
    } finally {
      setTimeout(() => setIsInterviewing(false), 800);
    }
  };

  const renderCategoryIcon = () => {
    const iconClass = 'h-5 w-5';
    switch (category) {
      case 'light':
        return <Lightbulb className={`${iconClass} text-amber-400`} />;
      case 'plug':
        return <Plug className={`${iconClass} text-cyan-400`} />;
      case 'climate':
        return <Thermometer className={`${iconClass} text-emerald-400`} />;
      case 'sensor':
        return <Shield className={`${iconClass} text-indigo-400`} />;
      case 'switch':
        return <ToggleLeft className={`${iconClass} text-violet-400`} />;
      case 'generic':
      default:
        return <Radio className={`${iconClass} text-slate-400`} />;
    }
  };

  const renderBatteryIcon = () => {
    if (!hasBattery) return null;
    const batt = device.battery ?? 0;
    if (batt <= 20) {
      return <BatteryWarning className="h-4 w-4 text-rose-400" />;
    }
    if (batt <= 35) {
      return <BatteryLow className="h-4 w-4 text-amber-400" />;
    }
    if (batt <= 70) {
      return <BatteryMedium className="h-4 w-4 text-emerald-400" />;
    }
    return <Battery className="h-4 w-4 text-emerald-400" />;
  };

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border transition-all duration-200 bg-slate-900/80 backdrop-blur-sm p-4 ${
        isOnline
          ? 'border-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-950/20'
          : 'border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-slate-900 shadow-md shadow-rose-950/30'
      }`}
    >
      {/* Top row: Icon, Name/Model, Status Badge */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start space-x-3 min-w-0">
            <div
              className={`p-2.5 rounded-xl border flex-shrink-0 transition-colors ${
                isOnline
                  ? 'bg-slate-800/80 border-slate-700/80 text-slate-300'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              {renderCategoryIcon()}
            </div>
            <div className="min-w-0">
              <h3
                className="text-sm font-semibold text-slate-100 truncate group-hover:text-white transition-colors"
                title={device.friendly_name}
              >
                {device.friendly_name}
              </h3>
              <p
                className="text-xs text-slate-400 truncate"
                title={`${device.vendor || ''} ${device.model || ''}`.trim() || device.ieee_address}
              >
                {device.vendor ? `${device.vendor} ` : ''}
                {device.model || device.type}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0">
            {isOnline ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                En ligne
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/60 text-rose-300 border border-rose-500/40 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-rose-500 mr-1.5" />
                Hors-ligne
              </span>
            )}
          </div>
        </div>

        {/* Device Metrics: Power & LQI Signal */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          {/* Power Source / Battery */}
          <div className="flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Alimentation
            </span>
            {isMains ? (
              <div className="flex items-center space-x-1.5 mt-1 text-slate-300">
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-medium">Secteur</span>
              </div>
            ) : hasBattery ? (
              <div className="mt-1">
                <div className="flex items-center justify-between text-slate-300 mb-1">
                  <div className="flex items-center space-x-1">
                    {renderBatteryIcon()}
                    <span className="font-semibold">{device.battery}%</span>
                  </div>
                </div>
                {/* Battery Gauge Bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${batteryColor.bg}`}
                    style={{ width: `${Math.min(100, Math.max(0, device.battery ?? 0))}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-1 mt-1 text-slate-400">
                <span className="font-medium">{device.power_source || 'Inconnu'}</span>
              </div>
            )}
          </div>

          {/* LQI Signal 4-bar visual */}
          <div className="flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Signal LQI
            </span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-300 font-medium">
                {device.linkquality ?? '--'}
                <span className="text-slate-500 text-[10px] ml-1">/255</span>
              </span>

              {/* 4-bar signal bars */}
              <div
                className="flex items-end space-x-1 h-4"
                title={`LQI: ${device.linkquality ?? 'Inconnu'} (${lqiInfo.label})`}
              >
                {[1, 2, 3, 4].map((barNumber) => {
                  const isActive = isOnline && barNumber <= lqiInfo.bars;
                  const heights = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];
                  return (
                    <span
                      key={barNumber}
                      className={`w-1 rounded-sm transition-colors ${heights[barNumber - 1]} ${
                        isActive ? lqiInfo.color.replace('text-', 'bg-') : 'bg-slate-700'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Relative Last Seen */}
        <div className="mt-3 flex items-center text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5 mr-1.5 text-slate-500 flex-shrink-0" />
          <span
            className={
              !isOnline
                ? 'text-rose-400/90 font-medium'
                : 'text-slate-400'
            }
          >
            {relativeTime}
          </span>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-1.5">
        <div className="flex items-center space-x-1">
          {/* Ping button (for routers) */}
          <button
            type="button"
            onClick={handlePing}
            disabled={!isRouter || isPinging}
            title={
              isRouter
                ? 'Tester la réactivité du routeur'
                : 'Ping indisponible (périphérique sur pile endormi)'
            }
            className={`p-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isRouter
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 disabled:opacity-50'
                : 'bg-slate-800/40 text-slate-600 border-slate-800/40 cursor-not-allowed'
            }`}
          >
            <Activity className={`h-3.5 w-3.5 ${isPinging ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Interview button */}
          <button
            type="button"
            onClick={handleInterview}
            disabled={isInterviewing}
            title="Relancer l'interview Zigbee des attributs"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isInterviewing ? 'animate-spin text-indigo-400' : ''}`}
            />
          </button>

          {/* View History button */}
          <button
            type="button"
            onClick={() => onViewHistory?.(device)}
            title="Voir l'historique des déconnexions et batterie"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Diagnostiquer button */}
        <button
          type="button"
          onClick={() => onDiagnose?.(device)}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !isOnline
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 border border-rose-500 ring-2 ring-rose-500/20'
              : 'bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-500/50'
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Diagnostiquer</span>
        </button>
      </div>
    </div>
  );
};
