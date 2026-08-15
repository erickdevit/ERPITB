import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Fingerprint, Loader2, AlertCircle, Info } from 'lucide-react';
import { ApiClient, OfflineError } from './lib/api';
import { LocalStore } from './lib/db';
import type { UserSession } from './types';

export function Login({ onLogin, notice }: { onLogin: (session: UserSession, store: LocalStore) => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const api = new ApiClient(() => null, async () => {});
      const session = await api.login(email, password);
      const store = await LocalStore.open(session);
      await store.saveOfflineVerifier(email, password, session);
      onLogin(session, store);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        const restored = await LocalStore.openOffline(email, password);
        if (restored) {
          onLogin(restored.session, restored.store);
          return;
        }
        setError('Sem conexão. Para entrar offline, esta conta precisa ter feito ao menos um login online neste dispositivo.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-950 text-white flex items-center justify-center shadow-lg shadow-slate-950/10 mb-4 ring-1 ring-white/20">
            <Fingerprint className="w-6 h-6 text-slate-100" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Frequência ITB
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Instituto Transforma Brasil
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <form onSubmit={submit} className="flex flex-col gap-4">
            {notice && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800">
                <Info className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="email-input" className="text-xs font-semibold text-slate-700">
                E-mail institucional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email-input"
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@itbcursos.com"
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 text-left">
              <label htmlFor="password-input" className="text-xs font-semibold text-slate-700">
                Senha de acesso
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Acessando...</span>
                </>
              ) : (
                'Entrar no sistema'
              )}
            </button>
          </form>
        </div>

        {/* Footer Note */}
        <p className="text-center text-[11px] text-slate-400 mt-6 font-medium">
          Sistema escolar offline-first • Instituto Transforma Brasil
        </p>
      </div>
    </div>
  );
}
