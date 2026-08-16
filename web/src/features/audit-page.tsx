import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Search,
  RefreshCw,
  Clock,
  WifiOff,
  AlertCircle,
  Database,
  Layers,
} from 'lucide-react';
import { useApp } from '../app-context';
import { Section } from '../components';
import { formatDate } from '../lib/date';
import {
  auditEntityLabel,
  filterAuditEntries,
  normalizeRemoteAuditEntries,
  pendingOperationsToAuditEntries,
  type AuditEntry,
} from './audit-model';

function formatTimestamp(value: string) {
  try {
    const d = new Date(value);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch {
    return value;
  }
}

export function AuditPage() {
  const { api, store } = useApp();
  const [remoteEntries, setRemoteEntries] = useState<AuditEntry[]>([]);
  const [localEntries, setLocalEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [loadError, setLoadError] = useState<string>();

  const loadLocalPending = useCallback(async () => {
    try {
      const pending = await store.pending();
      setLocalEntries(pendingOperationsToAuditEntries(pending));
    } catch {
      setLocalEntries([]);
    }
  }, [store]);

  const loadRemote = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
      await loadLocalPending();
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ items: unknown }>('/audit-logs?limit=200');
      setRemoteEntries(normalizeRemoteAuditEntries(res.items));
      setOffline(false);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Erro ao consultar auditoria.');
      await loadLocalPending();
    } finally {
      setLoading(false);
    }
  }, [api, loadLocalPending]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      void loadRemote();
    };
    const handleOffline = () => {
      setOffline(true);
      void loadLocalPending();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadLocalPending, loadRemote]);

  const isLocalView = offline || Boolean(loadError);
  const rawEntries = isLocalView ? localEntries : remoteEntries;
  const filteredEntries = useMemo(() => filterAuditEntries(rawEntries, search), [rawEntries, search]);

  return (
    <div className="flex flex-col gap-3.5 text-left">
      {offline && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Exibindo apenas alterações deste dispositivo (modo offline).</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>Motivo: {loadError}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-audit" className="text-xs font-medium text-slate-700">
                Buscar evento, entidade ou usuário
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="search-audit"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Digite para filtrar..."
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              disabled={loading}
              aria-label="Atualizar"
              onClick={() => void loadRemote()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 h-[38px] w-full sm:w-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {loading && (
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden" aria-label="Carregando auditoria">
            <div className="bg-slate-950 h-full w-1/3 animate-pulse" />
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="p-4 sm:p-5 hover:bg-slate-50/75 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">{entry.action}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {auditEntityLabel(entry.entity)}
                      </span>
                      {entry.source === 'local' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          Fila local
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      Por <strong className="text-slate-700">{entry.userName}</strong>
                      {entry.entityId ? ` · ID: ${entry.entityId.slice(0, 12)}…` : ''}
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-medium text-slate-400 self-start sm:self-auto">
                  {formatTimestamp(entry.createdAt)}
                </span>
              </div>

              {entry.details && (
                <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono overflow-x-auto">
                  {entry.details}
                </p>
              )}
            </div>
          ))}

          {!filteredEntries.length && !loading && (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              {search
                ? 'Nenhum evento corresponde à busca.'
                : isLocalView
                ? 'Não há alterações pendentes neste dispositivo.'
                : 'Nenhum registro de auditoria encontrado.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
