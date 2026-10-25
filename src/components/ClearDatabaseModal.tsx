import React, { useState } from 'react';
import {
  X,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export interface ClearDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    resyncFromZ2m: boolean
  ) => Promise<{ success: boolean; message: string; deviceCount: number }>;
}

export const ClearDatabaseModal: React.FC<ClearDatabaseModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [resyncFromZ2m, setResyncFromZ2m] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await onConfirm(resyncFromZ2m);
      onClose();
    } catch (err: any) {
      setError(
        err?.message || 'Une erreur est survenue lors du vidage de la base de données.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-db-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="clear-db-title"
                className="text-lg font-bold text-white tracking-tight"
              >
                Vider la base de données
              </h2>
              <p className="text-xs text-slate-400">
                Remise à zéro des périphériques & historiques
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800/80 transition-colors disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Warning Banner */}
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-200 leading-relaxed space-y-1">
              <p className="font-semibold text-rose-100">
                Action irréversible sur la base locale SQLite
              </p>
              <p>
                Cette action supprimera tous les équipements enregistrés,
                l&apos;historique de charge des batteries, les journaux d&apos;événements
                et les rapports de diagnostic.
              </p>
              <p className="text-[11px] text-rose-300/80">
                La base de données sera immédiatement compactée (VACUUM).
              </p>
            </div>
          </div>

          {/* Options */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resyncFromZ2m}
                onChange={(e) => setResyncFromZ2m(e.target.checked)}
                disabled={isLoading}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
              />
              <div className="text-xs space-y-1">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                  Resynchroniser immédiatement depuis Zigbee2MQTT
                </span>
                <p className="text-slate-400">
                  {resyncFromZ2m ? (
                    <span className="text-indigo-300">
                      Zigbee Sentinel rechargera la liste Zigbee2MQTT et récupérera
                      l&apos;état réel des équipements (disponibilité MQTT, sondage radio et Jeedom).
                    </span>
                  ) : (
                    <span>
                      La liste sera vidée à 0 équipement. Les appareils réapparaîtront
                      au fur et à mesure de leurs prochaines communications MQTT.
                    </span>
                  )}
                </p>
              </div>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-800 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 border border-rose-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Nettoyage en cours...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>Vider la base de données</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
