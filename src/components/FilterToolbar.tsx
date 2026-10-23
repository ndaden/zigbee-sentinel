import React from 'react';
import { Search, X, WifiOff, BatteryWarning, Plug, Battery, Layers } from 'lucide-react';
import type { FilterType } from '../utils/deviceUtils';

export interface FilterToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  counts?: {
    all: number;
    offline: number;
    low_battery: number;
    mains: number;
    battery: number;
  };
}

interface FilterOption {
  id: FilterType;
  label: string;
  icon: React.FC<{ className?: string }>;
  countKey: keyof NonNullable<FilterToolbarProps['counts']>;
  alertColor?: string;
  chipBadgeClass?: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'Tous', icon: Layers, countKey: 'all' },
  {
    id: 'offline',
    label: 'Hors-ligne',
    icon: WifiOff,
    countKey: 'offline',
    alertColor: 'text-rose-400',
    chipBadgeClass: 'bg-rose-500/20 text-rose-300',
  },
  {
    id: 'low_battery',
    label: 'Batterie faible',
    icon: BatteryWarning,
    countKey: 'low_battery',
    alertColor: 'text-amber-400',
    chipBadgeClass: 'bg-amber-500/20 text-amber-300',
  },
  { id: 'mains', label: 'Sur secteur', icon: Plug, countKey: 'mains' },
  { id: 'battery', label: 'Sur pile', icon: Battery, countKey: 'battery' },
];

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  counts,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[260px] max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="h-4 w-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher par nom, modèle, fabricant, IEEE..."
          className="w-full pl-9 pr-9 py-2 text-sm bg-slate-800/90 text-slate-100 placeholder-slate-400 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
            title="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = activeFilter === opt.id;
          const count = counts ? counts[opt.countKey] : undefined;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFilterChange(opt.id)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{opt.label}</span>
              {typeof count === 'number' && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                    isActive
                      ? 'bg-indigo-900/60 text-white'
                      : opt.chipBadgeClass && count > 0
                      ? opt.chipBadgeClass
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
