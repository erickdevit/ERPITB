import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { ApiClient, ApiError, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import { applyBrandDesignTokens } from './lib/design-tokens';
import { drainLegacyClientStorage } from './lib/migration-drain';
import { clearEntityMemoryCache } from './lib/use-entity';
import { useServerEvents } from './lib/use-events';
import type { BrandingSettings, UserSession } from './types';

interface AppState {
  session: UserSession;
  store: LocalStore;
  api: ApiClient;
  branding?: BrandingSettings;
  setBranding?: (branding: BrandingSettings) => void;
  sync: () => Promise<void>;
  syncState: 'idle' | 'syncing' | 'offline' | 'warning' | 'error';
  message?: string;
  refresh: number;
  logout: () => Promise<void>;
}

const Context = createContext<AppState | null>(null);

export const useApp = () => {
  const value = useContext(Context);
  if (!value) throw new Error('O contexto da aplicação não está disponível.');
  return value;
};

export function ApplicationProvider({
  initialSession,
  initialStore,
  onSignedOut,
  children,
}: PropsWithChildren<{
  initialSession: UserSession;
  initialStore: LocalStore;
  onSignedOut: (notice?: string) => void;
}>) {
  const [session, setSession] = useState(initialSession);
  const [store] = useState(initialStore);
  const [branding, setBranding] = useState<BrandingSettings | undefined>(undefined);
  const [syncState, setSyncState] = useState<AppState['syncState']>('idle');
  const [message, setMessage] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const syncing = useRef(false);

  const api = useMemo(
    () =>
      new ApiClient(
        () => session,
        async (next) => {
          setSession({ ...next, offline: false });
          if (store && typeof store.saveSession === 'function') {
            await store.saveSession({ ...next, offline: false });
          }
        },
      ),
    [session, store],
  );

  useEffect(() => {
    if (store && typeof store.setApi === 'function') {
      store.setApi(api);
    }
  }, [store, api]);

  // Apply server-side branding configuration dynamically
  useEffect(() => {
    void api
      .getBranding()
      .then((b) => {
        if (b) {
          setBranding(b);
          applyBrandDesignTokens(b.accentColor || '#0284c7', b.appName || 'ERPITB');
        }
      })
      .catch(() => {});
  }, [api]);

  useServerEvents({
    enabled: typeof EventSource !== 'undefined' && !(import.meta as any).env?.VITEST,
    onEntityChanged: () => {
      setRefresh((value) => value + 1);
    },
    onBrandingUpdated: (next) => {
      setBranding((prev) => {
        const merged = { ...(prev ?? { appName: 'ERPITB', accentColor: '#0284c7', showHeaderLogoLeft: true, showHeaderLogoRight: true }), ...next } as BrandingSettings;
        applyBrandDesignTokens(merged.accentColor || '#0284c7', merged.appName || 'ERPITB');
        return merged;
      });
    },
    onSessionRevoked: () => {
      if (store && typeof store.clearSession === 'function') {
        void store.clearSession();
      }
      onSignedOut('Sua sessão foi encerrada pelo administrador.');
    },
  });

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSyncState('syncing');
    try {
      clearEntityMemoryCache();
      await drainLegacyClientStorage(api);
      setSyncState('idle');
      setMessage(undefined);
      setRefresh((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (store && typeof store.clearSession === 'function') {
          await store.clearSession();
        }
        onSignedOut('Sua sessão expirou. Entre novamente.');
        return;
      }
      setSyncState('idle');
      setRefresh((value) => value + 1);
    } finally {
      syncing.current = false;
    }
  }, [api, onSignedOut, store]);

  useEffect(() => {
    void sync();
    const online = () => void sync();
    const focus = () => void sync();
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focus);
    };
  }, [sync]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: session.refreshToken });
    } catch {
      // Continue logout locally even if network fails
    }
    clearEntityMemoryCache();
    if (store && typeof store.clearSession === 'function') {
      await store.clearSession();
    }
    onSignedOut();
  }, [api, onSignedOut, session.refreshToken, store]);

  useEffect(() => {
    api.setOnUnauthorized(() => {
      void logout();
    });
  }, [api, logout]);

  return (
    <Context.Provider value={{ session, store, api, branding, setBranding, sync, syncState, message, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}

export function useBoot() {
  const [state, setState] = useState<{
    loading: boolean;
    session?: UserSession;
    store?: LocalStore;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const restored = await LocalStore.restore();
        if (!alive) return;
        if (!restored) {
          setState({ loading: false });
          return;
        }

        const api = new ApiClient(
          () => restored.session,
          async (next) => {
            restored.session = next;
            await restored.store.saveSession(next);
          },
        );

        let refreshSucceeded = true;
        if (restored.session.refreshToken) {
          refreshSucceeded = await api.refresh();
        }

        if (!refreshSucceeded) {
          const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
          if (isOnline) {
            await restored.store.clearSession();
            if (alive) {
              setState({
                loading: false,
                error: 'Sua sessão expirou. Entre novamente.',
              });
            }
            return;
          }
        }

        if (alive) setState({ loading: false, ...restored });
      } catch {
        if (alive) setState({ loading: false });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
