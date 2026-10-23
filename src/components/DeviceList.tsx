import React from 'react';
import { SearchX } from 'lucide-react';
import type { ZigbeeDevice } from '../types/device';
import { DeviceCard } from './DeviceCard';

export interface DeviceListProps {
  devices: ZigbeeDevice[];
  onPing?: (device: ZigbeeDevice) => void;
  onInterview?: (device: ZigbeeDevice) => void;
  onDiagnose?: (device: ZigbeeDevice) => void;
  onViewHistory?: (device: ZigbeeDevice) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  onPing,
  onInterview,
  onDiagnose,
  onViewHistory,
}) => {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
        <div className="h-16 w-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-400 mb-4">
          <SearchX className="h-8 w-8 text-slate-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">
          Aucun périphérique trouvé
        </h3>
        <p className="mt-1 text-sm text-slate-400 max-w-sm">
          Aucun périphérique ne correspond à votre recherche ou aux filtres sélectionnés. Essayez de réinitialiser la recherche.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {devices.map((device) => (
        <DeviceCard
          key={device.ieee_address}
          device={device}
          onPing={onPing}
          onInterview={onInterview}
          onDiagnose={onDiagnose}
          onViewHistory={onViewHistory}
        />
      ))}
    </div>
  );
};
