import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle, Info } from 'lucide-react';
import { ApiClient, ApiError, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import { applyBrandDesignTokens } from './lib/design-tokens';
import type { BrandingSettings, UserSession } from './types';

export function Login({
  onLogin,
  notice,
  initialBranding,
}: {
  onLogin: (session: UserSession, store: LocalStore) => void;
  notice?: string;
  initialBranding?: BrandingSettings;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [branding, setBranding] = useState<BrandingSettings | undefined>(initialBranding);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [branding?.loginLogoUrl]);

  useEffect(() => {
    try {
      const api = new ApiClient(() => null, async () => {});
      if (typeof api.getBranding === 'function') {
        void api
          .getBranding()
          .then((b) => {
            if (b) {
              setBranding(b);
              applyBrandDesignTokens(b.accentColor || '#0284c7', b.appName || 'ERPITB');
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore in test environments where ApiClient is mocked without getBranding
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const api = new ApiClient(() => null, async () => {});
      const normalizedEmail = email.trim().toLowerCase();
      const session = await api.login(normalizedEmail, password);
      const store = await LocalStore.open(session);
      await store.saveOfflineVerifier(normalizedEmail, password, session);
      onLogin(session, store);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        setError('Sem conexão com o servidor. A aplicação opera 100% online.');
      } else if (cause instanceof ApiError && (cause.status === 503 || cause.code === 'DATABASE_QUOTA_EXCEEDED')) {
        setError(cause.message || 'Serviço temporariamente indisponível.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 bg-cover bg-center"
      style={branding?.loginBgUrl ? { backgroundImage: `url(${branding.loginBgUrl})` } : undefined}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-200/40 p-6 sm:p-8">
          {/* Logo Institucional (apenas o logo configurado, sem o nome ERPITB) */}
          <div className="flex justify-center mb-6">
            <img
              src={branding?.loginLogoUrl && !logoLoadFailed ? branding.loginLogoUrl : '/itb-logo.svg'}
              alt={branding?.appName || 'Logo Institucional'}
              className="max-h-16 max-w-[220px] w-auto object-contain"
              onError={(e) => {
                if (e.currentTarget.getAttribute('src') !== '/itb-logo.svg') {
                  setLogoLoadFailed(true);
                } else {
                  e.currentTarget.style.display = 'none';
                }
              }}
            />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {notice && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800 text-left">
                <Info className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="email-input" className="text-xs font-semibold text-slate-700">
                E-mail
              </label>
              <input
                id="email-input"
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@itbcursos.com"
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="password-input" className="text-xs font-semibold text-slate-700">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Entrando…</span>
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
