import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

export interface JeedomSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (
    apiKey: string,
    url?: string
  ) => Promise<{
    success: boolean;
    count: number;
    totalJeedomDevices: number;
    synced: Array<{ ieee: string; previousName: string; newName: string }>;
  }>;
}

export const JeedomSyncModal: React.FC<JeedomSyncModalProps> = ({
  isOpen,
  onClose,
  onSync,
}) => {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('jeedom_api_key') || '';
    }
    return '';
  });
  const [url, setUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('jeedom_url') || 'http://127.0.0.1';
    }
    return 'http://127.0.0.1';
  });
  const [rememberKey, setRememberKey] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    count: number;
    total: number;
    synced: Array<{ ieee: string; previousName: string; newName: string }>;
  } | null>(null);

  if (!isOpen) return null;

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Veuillez renseigner votre clé API Jeedom.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (rememberKey) {
          localStorage.setItem('jeedom_api_key', apiKey.trim());
          localStorage.setItem('jeedom_url', url.trim());
        } else {
          localStorage.removeItem('jeedom_api_key');
          localStorage.removeItem('jeedom_url');
        }
      }

      const res = await onSync(apiKey.trim(), url.trim());
      if (res.success) {
        setResult({
          count: res.count,
          total: res.totalJeedomDevices,
          synced: res.synced,
        });
      }
    } catch (err: any) {
      setError(
        err?.message || 'Impossible de se connecter à Jeedom. Vérifiez la clé API et l’URL.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="jeedom-sync-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="jeedom-sync-title" className="text-base font-bold text-white">
                Synchroniser les Noms Jeedom
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Importez automatiquement les noms et pièces configurés dans Jeedom
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200/90 flex items-start space-x-2.5">
            <Sparkles className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            <p className="leading-relaxed">
              Zigbee Sentinel interroge l’API de Jeedom via l’adresse IEEE Zigbee de vos capteurs pour associer leur nom complet (ex: <code className="bg-indigo-950 px-1 py-0.5 rounded text-indigo-300 font-mono">[Salon][Capteur Température]</code>).
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSyncSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="jeedom-url"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
              >
                URL de Jeedom
              </label>
              <input
                id="jeedom-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://127.0.0.1 ou http://jeedom.local"
                className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                disabled={isLoading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="jeedom-api-key"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Clé API Jeedom
                </label>
                <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                  <HelpCircle className="h-3 w-3" />
                  <span>Réglages &gt; Système &gt; Configuration &gt; API</span>
                </span>
              </div>
              <input
                id="jeedom-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Collez votre clé API Jeedom..."
                className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono"
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="remember-key"
                type="checkbox"
                checked={rememberKey}
                onChange={(e) => setRememberKey(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <label htmlFor="remember-key" className="text-xs text-slate-400">
                Conserver la clé dans ce navigateur pour les prochaines synchronisations
              </label>
            </div>

            {/* Error banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success result */}
            {result && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs space-y-2">
                <div className="flex items-center space-x-2 font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span>{`${result.count} nom(s) d'équipement(s) synchronisé(s) avec succès !`}</span>
                </div>
                {result.synced.length > 0 && (
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pl-2 pr-1 border-t border-emerald-500/20 pt-2">
                    {result.synced.map((item) => (
                      <div
                        key={item.ieee}
                        className="text-[11px] text-emerald-100 flex items-center justify-between"
                      >
                        <span className="font-semibold truncate">{item.newName}</span>
                        <span className="text-emerald-400/80 font-mono text-[10px] ml-2">
                          {item.ieee}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
              >
                {result ? 'Fermer' : 'Annuler'}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Synchronisation...' : 'Synchroniser'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
