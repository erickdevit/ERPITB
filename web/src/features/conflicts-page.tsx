import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitCompare,
  CheckCircle2,
  WifiOff,
  RefreshCw,
  Search,
  Gavel,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import { useApp } from '../app-context';
import { Section } from '../components';
import { ApiError, OfflineError } from '../lib/api';
import type { LocalRecord } from '../types';
import { entityLabels } from '../types';
import {
  conflictCounts,
  conflictEntities,
  filterConflicts,
  isConflictEntity,
  safeJson,
  supportsLocalDecision,
  type ConflictFilter,
  type LocalConflict,
  type RemoteConflict,
} from './conflicts-model';

type Decision = 'remote' | 'local';

export function ConflictsPage() {
  const { api, store, sync, refresh } = useApp();
  const [remote, setRemote] = useState<RemoteConflict[]>([]);
  const [local, setLocal] = useState<LocalConflict[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ConflictFilter>('pending');
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [loadError, setLoadError] = useState<string>();
  const [selected, setSelected] = useState<RemoteConflict>();
  const [decision, setDecision] = useState<Decision>('remote');
  const [justification, setJustification] = useState('');
  const [resolving, setResolving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'warning'; message: string }>();

  const loadLocal = useCallback(async () => {
    const rows = await Promise.all(
      conflictEntities.map(async (entity) =>
        (await store.list(entity, true))
          .filter((record) => record.sync_status === 'CONFLICT' || record.sync_status === 'REJECTED')
          .map((record) => ({ entity, record })),
      ),
    );
    setLocal(rows.flat());
  }, [store]);

  const loadRemote = useCallback(async () => {
    setLoadingRemote(true);
    setLoadError(undefined);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
      setLoadingRemote(false);
      return;
    }
    try {
      const result = await api.get<{ items: RemoteConflict[] }>('/conflicts');
      setRemote(Array.isArray(result?.items) ? result.items : []);
      setOffline(false);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        setOffline(true);
      } else {
        setLoadError(cause instanceof Error ? cause.message : 'Não foi possível consultar os conflitos do servidor.');
      }
    } finally {
      setLoadingRemote(false);
    }
  }, [api]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal, refresh]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      void loadRemote();
    };
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadRemote]);

  const effectiveOffline = offline;
  const visible = useMemo(() => filterConflicts(remote, local, query, filter), [filter, local, query, remote]);
  const counts = useMemo(() => conflictCounts(remote, local), [local, remote]);
  const justificationLength = justification.trim().length;

  const openResolution = (conflict: RemoteConflict) => {
    setSelected(conflict);
    setDecision('remote');
    setJustification('');
  };

  const closeResolution = () => {
    if (resolving) return;
    setSelected(undefined);
    setJustification('');
  };

  const resolve = async () => {
    if (!selected || justificationLength < 10 || effectiveOffline) return;
    if (decision === 'local' && !supportsLocalDecision(selected)) {
      setFeedback({
        severity: 'warning',
        message: 'O servidor só permite manter a versão local para conflitos de frequência.',
      });
      return;
    }
    setResolving(true);
    try {
      const result = await api.post<{ entity: string; record: LocalRecord }>(
        `/conflicts/${encodeURIComponent(selected.id)}/resolve`,
        {
          decision,
          justification: justification.trim(),
        },
      );

      if (isConflictEntity(result.entity)) {
        await store.putRemote(result.entity, { ...result.record, sync_status: 'SYNCED' });
      }

      setSelected(undefined);
      setJustification('');
      setFeedback({
        severity: 'success',
        message:
          decision === 'local'
            ? 'Versão deste dispositivo aceita e registrada na auditoria.'
            : 'Versão do servidor mantida e registrada na auditoria.',
      });
      await Promise.all([loadLocal(), loadRemote()]);
      void sync();
    } catch (cause) {
      if (cause instanceof OfflineError) setOffline(true);
      const message =
        cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível resolver o conflito.';
      setFeedback({ severity: 'error', message });
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 text-left">
      {effectiveOffline && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Modo offline: exibindo as pendências preservadas neste dispositivo. A resolução será liberada quando a conexão voltar.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadRemote()}
            className="px-3 py-1 bg-white border border-amber-300 font-semibold rounded-lg hover:bg-amber-100 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadRemote()}
            className="px-3 py-1 bg-white border border-rose-300 font-semibold rounded-lg hover:bg-rose-100 transition-colors"
          >
            Recarregar
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conflito, entidade ou conteúdo..."
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            aria-label="Atualizar conflitos"
            disabled={loadingRemote}
            onClick={() => void Promise.all([loadLocal(), loadRemote()])}
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingRemote ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filter === 'pending'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Pendentes ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filter === 'resolved'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Resolvidos ({counts.resolved})
          </button>
          <button
            type="button"
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filter === 'rejected'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Rejeitadas ({counts.rejected})
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              filter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({counts.all})
          </button>
        </div>
      </div>

      {/* Remote Conflicts List */}
      {visible.remote.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-900">Conflitos registrados no servidor</h2>
          {visible.remote.map((conflict) => (
            <RemoteConflictCard
              key={conflict.id}
              conflict={conflict}
              offline={effectiveOffline}
              onResolve={openResolution}
            />
          ))}
        </div>
      )}

      {/* Local Conflicts List */}
      {visible.local.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-900">Pendências preservadas neste dispositivo</h2>
          {visible.local.map((conflict) => (
            <LocalConflictCard
              key={`${conflict.entity}-${conflict.record.id}`}
              conflict={conflict}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loadingRemote && visible.remote.length === 0 && visible.local.length === 0 && (
        <div className="p-8 text-center bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-900">
            {query ? 'Nenhum resultado para a busca.' : 'Nenhum conflito pendente.'}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Os dados locais e remotos estão sincronizados.
          </p>
        </div>
      )}

      {/* Resolution Dialog Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={closeResolution} />
          <div
            role="dialog"
            aria-label="Resolver conflito"
            className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 z-10 text-left"
          >
            <h2 className="text-base font-bold text-slate-900 mb-2">Resolver conflito</h2>
            <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 mb-4">
              Esta decisão substitui uma das versões e não pode ser desfeita por esta tela.
            </p>

            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-semibold text-slate-700 mb-1">Escolha a versão:</legend>
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="conflict-decision"
                    value="remote"
                    checked={decision === 'remote'}
                    onChange={(e) => setDecision(e.target.value as Decision)}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-950 border-slate-300"
                  />
                  <span className="text-xs font-semibold text-slate-800">Manter a versão do servidor</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 transition-colors ${
                    supportsLocalDecision(selected)
                      ? 'hover:bg-slate-50 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="conflict-decision"
                    value="local"
                    disabled={!supportsLocalDecision(selected)}
                    checked={decision === 'local'}
                    onChange={(e) => setDecision(e.target.value as Decision)}
                    className="w-4 h-4 text-slate-900 focus:ring-slate-950 border-slate-300"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Manter a versão deste dispositivo
                  </span>
                </label>
              </fieldset>

              {!supportsLocalDecision(selected) && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800">
                  Para esta entidade, o backend permite somente manter a versão do servidor. A decisão local está disponível apenas para frequências.
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="justification-input" className="text-xs font-semibold text-slate-700">
                  Justificativa obrigatória <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="justification-input"
                  required
                  rows={3}
                  maxLength={500}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explique o motivo da decisão tomada..."
                  className="w-full p-2.5 text-xs sm:text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
                <span className="text-[11px] text-slate-400 text-right">
                  {justificationLength}/500 caracteres — mínimo de 10
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={closeResolution}
                disabled={resolving}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resolving || effectiveOffline || justificationLength < 10}
                onClick={() => void resolve()}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                {resolving ? 'Confirmando...' : 'Confirmar decisão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-md p-4 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-3 ${
            feedback.severity === 'success'
              ? 'bg-emerald-950 text-emerald-100 border border-emerald-800'
              : 'bg-rose-950 text-rose-100 border border-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

function RemoteConflictCard({
  conflict,
  offline,
  onResolve,
}: {
  conflict: RemoteConflict;
  offline: boolean;
  onResolve: (conflict: RemoteConflict) => void;
}) {
  const [expanded, setExpanded] = useState(conflict.status === 'PENDING');
  const pending = conflict.status === 'PENDING';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <GitCompare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {entityLabels[conflict.entity_name as keyof typeof entityLabels] ?? conflict.entity_name} ·{' '}
              {conflict.entity_id}
            </p>
            <p className="text-[11px] text-slate-400 font-medium truncate">
              Criado em {new Date(conflict.created_at).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
              pending
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {pending ? 'Pendente' : 'Resolvido'}
          </span>

          {pending && (
            <button
              type="button"
              disabled={offline}
              onClick={() => onResolve(conflict)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Gavel className="w-3 h-3" />
              <span>Resolver</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-700 mb-2">Versão deste dispositivo</p>
            <pre className="text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">
              {safeJson(conflict.local_data)}
            </pre>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-700 mb-2">Versão no servidor</p>
            <pre className="text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">
              {safeJson(conflict.remote_data)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function LocalConflictCard({ conflict: { entity, record } }: { conflict: LocalConflict }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {entityLabels[entity as keyof typeof entityLabels] ?? entity} · {record.id}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Status: {record.sync_status}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <pre className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">
            {safeJson(record)}
          </pre>
        </div>
      )}
    </div>
  );
}
