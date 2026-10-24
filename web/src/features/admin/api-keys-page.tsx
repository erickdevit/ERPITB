import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../app-context';
import { PageDialog } from '../../components';
import type { ApiKeyRecord } from '../../types';

const AVAILABLE_SCOPES = [
  { id: 'students:read', label: 'Leitura de Alunos (sem CPF/Contato)' },
  { id: 'students:pii', label: 'Acesso a Dados Pessoais (CPF/Contato - LGPD)' },
  { id: 'classes:read', label: 'Leitura de Turmas e Cursos' },
  { id: 'attendance:read', label: 'Leitura de Frequência e Sessões' },
  { id: 'attendance:write', label: 'Registro de Frequência' },
  { id: 'grades:read', label: 'Leitura de Notas e Avaliações' },
  { id: 'finance:read', label: 'Leitura Financeira (Mensalidades e Caixa)' },
  { id: 'finance:write', label: 'Escrita Financeira (Pagamentos e Lançamentos)' },
  { id: 'analytics:read', label: 'Leitura de Indicadores B.I.' },
  { id: 'reports:read', label: 'Emissão de Relatórios Acadêmicos' },
];

export function ApiKeysPage() {
  const { api, session } = useApp();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['students:read', 'classes:read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await api.getApiKeys();
      setKeys(res.items || []);
    } catch {
      setErrorMsg('Não foi possível carregar as chaves de integração.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  if (!session || session.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito ao Administrador do Sistema.
      </div>
    );
  }

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId],
    );
  };

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || selectedScopes.length === 0) {
      setErrorMsg('Informe um nome identificador e selecione ao menos um escopo.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await api.createApiKey({
        name: name.trim(),
        scopes: selectedScopes,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.000Z` : undefined,
      });
      setCreateOpen(false);
      setName('');
      setExpiresAt('');
      setRevealedSecret({ name: res.key.name, secret: res.secret });
      await loadKeys();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao gerar chave de API.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    try {
      await api.revokeApiKey(id);
      await loadKeys();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao revogar chave.');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async (id: string, keyName: string) => {
    setBusy(true);
    try {
      const res = await api.rotateApiKey(id);
      setRevealedSecret({ name: keyName, secret: res.secret });
      await loadKeys();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao rotacionar chave.');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-sky-600" />
            <span>Chaves de API para Integrações (M2M)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Credenciais granulares com hash SHA-256 para integração segura com sistemas externos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Chave de API</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
          {errorMsg}
        </div>
      )}

      {revealedSecret && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-md">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-amber-950">
                Copie o segredo da chave &ldquo;{revealedSecret.name}&rdquo; agora
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                Por segurança, armazenamos apenas o hash SHA-256. Este segredo não poderá ser visualizado novamente.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 p-3 rounded-xl bg-white border border-amber-300 font-mono text-xs text-slate-900 break-all">
                  {revealedSecret.secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-900 text-white text-xs font-bold hover:bg-amber-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="mt-3 text-xs font-semibold text-amber-900 underline cursor-pointer"
              >
                Já salvei o segredo em local seguro
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Carregando chaves...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhuma chave de API cadastrada.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => {
              const isRevoked = Boolean(k.revokedAt);
              return (
                <div key={k.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900">{k.name}</span>
                      <code className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px]">
                        {k.keyPrefix}...
                      </code>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isRevoked
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isRevoked ? 'REVOGADA' : 'ATIVA'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {k.scopes.map((sc) => (
                        <span
                          key={sc}
                          className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-semibold"
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Criada em: {new Date(k.createdAt).toLocaleDateString('pt-BR')}
                      {k.expiresAt ? ` • Expira em: ${new Date(k.expiresAt).toLocaleDateString('pt-BR')}` : ''}
                      {k.lastUsedAt ? ` • Último uso: ${new Date(k.lastUsedAt).toLocaleString('pt-BR')}` : ''}
                    </p>
                  </div>
                  {!isRevoked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRotate(k.id, k.name)}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Rotacionar</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRevoke(k.id)}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revogar</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <PageDialog
          open={createOpen}
          title="Gerar Nova Chave de API (M2M)"
          onClose={() => setCreateOpen(false)}
          onSave={handleCreate}
          saveText={busy ? 'Gerando...' : 'Gerar Chave'}
        >
          <form onSubmit={handleCreate} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Nome da Integração *</label>
              <input
                required
                type="text"
                placeholder="Ex: Portal Contábil Externo, BI Corporativo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-700">Expiração Opcional</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-semibold text-slate-700">Escopos Autorizados (Menor Privilégio) *</label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                {AVAILABLE_SCOPES.map((sc) => (
                  <label key={sc.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(sc.id)}
                      onChange={() => toggleScope(sc.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="font-medium text-slate-800">{sc.label}</span>
                    <code className="ml-auto text-[10px] text-slate-500">{sc.id}</code>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </PageDialog>
      )}
    </div>
  );
}
