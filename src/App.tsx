import React, { useState, useMemo } from 'react';
import { useZigbeeState } from './hooks/useZigbeeState';
import { Header } from './components/Header';
import { FilterToolbar } from './components/FilterToolbar';
import { DeviceList } from './components/DeviceList';
import { DiagnosticModal } from './components/DiagnosticModal';
import { HistoryModal } from './components/HistoryModal';
import type { ZigbeeDevice } from './types/device';
import {
  type FilterType,
  filterDevices,
} from './utils/deviceUtils';
import { RefreshCw, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export const App: React.FC = () => {
  const {
    devices,
    bridgeStatus,
    isConnected,
    permitJoinTimer,
    triggerPing,
    triggerInterview,
    triggerConfigure,
    triggerReset,
    triggerRestartBridge,
    triggerPermitJoin,
    runDiagnostic,
    fetchHistory,
    refresh,
  } = useZigbeeState();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [selectedDiagnosticDevice, setSelectedDiagnosticDevice] = useState<ZigbeeDevice | null>(null);
  const [selectedHistoryDevice, setSelectedHistoryDevice] = useState<ZigbeeDevice | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Pre-calculate counts for each filter chip
  const filterCounts = useMemo(() => {
    let offline = 0;
    let lowBattery = 0;
    let mains = 0;
    let battery = 0;

    for (const d of devices) {
      if (d.status === 'offline') offline++;
      if (d.battery !== null && d.battery !== undefined && d.battery <= 20) lowBattery++;
      if (d.power_source?.toLowerCase() === 'mains' || d.type === 'Router') mains++;
      if (
        d.power_source?.toLowerCase() === 'battery' ||
        (d.power_source !== 'Mains' && d.type === 'EndDevice')
      ) {
        battery++;
      }
    }

    return {
      all: devices.length,
      offline,
      low_battery: lowBattery,
      mains,
      battery,
    };
  }, [devices]);

  // Filter and search devices
  const filteredDevices = useMemo(() => {
    return filterDevices(devices, searchQuery, activeFilter);
  }, [devices, searchQuery, activeFilter]);

  const handlePing = async (device: ZigbeeDevice): Promise<boolean> => {
    try {
      const success = await triggerPing(device.ieee_address);
      if (success) {
        showNotification(`Ping réussi pour ${device.friendly_name}`, 'success');
      } else {
        showNotification(`Le périphérique ${device.friendly_name} n'a pas répondu au ping`, 'error');
      }
      return success;
    } catch {
      showNotification(`Échec du ping pour ${device.friendly_name}`, 'error');
      return false;
    }
  };

  const handleInterview = async (device: ZigbeeDevice): Promise<boolean> => {
    try {
      const success = await triggerInterview(device.ieee_address);
      if (success) {
        showNotification(`Interview lancée pour ${device.friendly_name}`, 'success');
      } else {
        showNotification(`Échec du lancement de l'interview pour ${device.friendly_name}`, 'error');
      }
      return success;
    } catch {
      showNotification(`Erreur lors de l'interview pour ${device.friendly_name}`, 'error');
      return false;
    }
  };

  const handleConfigure = async (device: ZigbeeDevice): Promise<boolean> => {
    try {
      const success = await triggerConfigure(device.ieee_address);
      if (success) {
        showNotification(
          `Reconfiguration réussie pour ${device.friendly_name}. Les liaisons radio ont été restaurées.`,
          'success'
        );
      } else {
        showNotification(`Échec de la reconfiguration pour ${device.friendly_name}`, 'error');
      }
      return success;
    } catch {
      showNotification(`Erreur lors de la reconfiguration de ${device.friendly_name}`, 'error');
      return false;
    }
  };

  const handleReset = async (device: ZigbeeDevice): Promise<boolean> => {
    try {
      const success = await triggerReset(device.ieee_address, 120);
      if (success) {
        showNotification(
          `Connexion de ${device.friendly_name} réinitialisée. Réseau Zigbee ouvert (120s) pour appairage.`,
          'success'
        );
      } else {
        showNotification(`Échec de la réinitialisation pour ${device.friendly_name}`, 'error');
      }
      return success;
    } catch {
      showNotification(`Erreur lors de la réinitialisation de ${device.friendly_name}`, 'error');
      return false;
    }
  };

  const handleRestartBridge = async (): Promise<{ success: boolean; message: string }> => {
    try {
      showNotification('Envoi de la commande de redémarrage à Zigbee2MQTT...', 'info');
      const res = await triggerRestartBridge();
      if (res.success) {
        showNotification(res.message, 'success');
      } else {
        showNotification(res.message, 'error');
      }
      return res;
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors du redémarrage de Zigbee2MQTT';
      showNotification(msg, 'error');
      return { success: false, message: msg };
    }
  };

  const handlePermitJoin = async (seconds: number = 120): Promise<boolean> => {
    const success = await triggerPermitJoin(seconds);
    if (success) {
      showNotification(`Appairage ouvert pour ${seconds} secondes`, 'success');
    } else {
      showNotification("Échec de l'ouverture de l'appairage", 'error');
    }
    return success;
  };

  const handleDiagnose = (device: ZigbeeDevice) => {
    setSelectedDiagnosticDevice(device);
  };

  const handleViewHistory = (device: ZigbeeDevice) => {
    setSelectedHistoryDevice(device);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto flex items-center justify-between p-3 rounded-xl border shadow-xl backdrop-blur-md transition-all ${
              n.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-950/40'
                : n.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40 shadow-rose-950/40'
                : 'bg-slate-800/90 text-slate-200 border-slate-700 shadow-slate-950/40'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {n.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
              )}
              <span className="text-xs font-medium">{n.message}</span>
            </div>
            <button
              type="button"
              onClick={() => handleDismissNotification(n.id)}
              className="ml-3 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <Header
        bridgeStatus={bridgeStatus}
        devices={devices}
        permitJoinTimer={permitJoinTimer}
        onTriggerPermitJoin={handlePermitJoin}
        onTriggerRestartBridge={handleRestartBridge}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">
        {/* Filter Toolbar */}
        <FilterToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={filterCounts}
        />

        {/* Device List Grid */}
        <DeviceList
          devices={filteredDevices}
          onPing={handlePing}
          onInterview={handleInterview}
          onDiagnose={handleDiagnose}
          onViewHistory={handleViewHistory}
        />

        {/* Interactive Modals */}
        {selectedDiagnosticDevice && (
          <DiagnosticModal
            device={
              devices.find((d) => d.ieee_address === selectedDiagnosticDevice.ieee_address) ||
              selectedDiagnosticDevice
            }
            onClose={() => setSelectedDiagnosticDevice(null)}
            onPing={handlePing}
            onInterview={handleInterview}
            onConfigure={handleConfigure}
            onReset={handleReset}
            onRestartBridge={handleRestartBridge}
            onPermitJoin={handlePermitJoin}
            permitJoinTimer={permitJoinTimer}
            runDiagnostic={runDiagnostic}
          />
        )}

        {selectedHistoryDevice && (
          <HistoryModal
            device={
              devices.find((d) => d.ieee_address === selectedHistoryDevice.ieee_address) ||
              selectedHistoryDevice
            }
            onClose={() => setSelectedHistoryDevice(null)}
            fetchHistory={fetchHistory}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
              }`}
            />
            <span>
              Flux temps réel WebSocket :{' '}
              <strong className={isConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {isConnected ? 'Connecté' : 'Reconnexion...'}
              </strong>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Rafraîchir</span>
            </button>
            <span className="text-slate-500">Zigbee Sentinel &copy; 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
