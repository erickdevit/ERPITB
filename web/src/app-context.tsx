import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { ApiClient, ApiError, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import { Synchronizer } from './lib/sync';
import type { UserSession } from './types';

interface AppState {
  session: UserSession;
  store: LocalStore;
  api: ApiClient;
  sync: () => Promise<void>;
  syncState: 'idle' | 'syncing' | 'offline' | 'error';
  message?: string;
  refresh: number;
  logout: () => Promise<void>;
}
const Context = createContext<AppState | null>(null);
export const useApp = () => {
  const value = useContext(Context); if (!value) throw new Error('O contexto da aplicação não está disponível.'); return value;
};

export function ApplicationProvider({ initialSession, initialStore, children }: PropsWithChildren<{ initialSession: UserSession; initialStore: LocalStore }>) {
  const [session, setSession] = useState(initialSession); const [store] = useState(initialStore);
  const [syncState, setSyncState] = useState<AppState['syncState']>('idle'); const [message, setMessage] = useState<string>(); const [refresh, setRefresh] = useState(0); const syncing = useRef(false);
  const api = useMemo(() => new ApiClient(() => session, async (next) => { setSession(next); await store.saveSession(next); }), [session, store]);
  const sync = useCallback(async () => {
    if (syncing.current) return; syncing.current = true; setSyncState('syncing');
    try { await store.deduplicateAttendance(); const result = await new Synchronizer(store, api).run(); setSyncState(result.offline ? 'offline' : 'idle'); setMessage(result.offline ? 'Sem conexão — alterações protegidas neste dispositivo.' : undefined); setRefresh((value) => value + 1); }
    catch (error) { setSyncState('error'); setMessage(error instanceof Error ? error.message : 'Não foi possível sincronizar.'); }
    finally { syncing.current = false; }
  }, [api, store]);
  useEffect(() => { void sync(); const online = () => void sync(); const focus = () => void sync(); window.addEventListener('online', online); window.addEventListener('focus', focus); return () => { window.removeEventListener('online', online); window.removeEventListener('focus', focus); }; }, [sync]);
  const logout = useCallback(async () => { try { await api.post('/auth/logout', { refreshToken: session.refreshToken }); } catch (error) { if (!(error instanceof OfflineError)) throw error; } await store.clear(); }, [api, session.refreshToken, store]);
  return <Context.Provider value={{ session, store, api, sync, syncState, message, refresh, logout }}>{children}</Context.Provider>;
}

export function useBoot() {
  const [state, setState] = useState<{ loading: boolean; session?: UserSession; store?: LocalStore; error?: string }>({ loading: true });
  useEffect(() => { void (async () => {
    const restored = await LocalStore.restore(); if (!restored) { setState({ loading: false }); return; }
    const api = new ApiClient(() => restored.session, async (next) => { restored.session = next; await restored.store.saveSession(next); });
    try { await api.refresh(); setState({ loading: false, ...restored }); }
    catch (error) { if (error instanceof ApiError && error.status === 401) { await restored.store.clear(); setState({ loading: false }); } else setState({ loading: false, ...restored, error: 'Modo offline — sessão local restaurada.' }); }
  })(); }, []);
  return state;
}
