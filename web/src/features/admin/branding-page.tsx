import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../app-context';
import { applyBrandDesignTokens, getContrastWithWhite } from '../../lib/design-tokens';

function getContrastRatio(hex: string): number {
  return getContrastWithWhite(hex);
}

const PRESET_COLORS = [
  { label: 'Azul ITB', hex: '#0284c7' },
  { label: 'Índigo Real', hex: '#4f46e5' },
  { label: 'Esmeralda', hex: '#059669' },
  { label: 'Violeta', hex: '#7c3aed' },
  { label: 'Âmbar Escuro', hex: '#d97706' },
  { label: 'Grafite', hex: '#334155' },
];

export function BrandingPage() {
  const { api, session, setBranding } = useApp();
  const fileInputLogoId = useId();
  const fileInputWatermarkId = useId();
  const fileInputBgId = useId();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Branding Form State
  const [appName, setAppName] = useState('ERPITB');
  const [accentColor, setAccentColor] = useState('#0284c7');
  const [loginLogoUrl, setLoginLogoUrl] = useState('');
  const [printWatermarkLogoUrl, setPrintWatermarkLogoUrl] = useState('');
  const [printWatermarkGrayscale, setPrintWatermarkGrayscale] = useState(true);
  const [loginBgUrl, setLoginBgUrl] = useState('');
  const [printWatermarkText, setPrintWatermarkText] = useState('INSTITUTO TRANSFORMA BRASIL');
  const [showHeaderLogoLeft, setShowHeaderLogoLeft] = useState(true);
  const [showHeaderLogoRight, setShowHeaderLogoRight] = useState(true);
  const [uploadingTarget, setUploadingTarget] = useState<'logo' | 'watermark' | 'bg' | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const b = await api.getBranding();
      if (b) {
        setAppName(b.appName || 'ERPITB');
        setAccentColor(b.accentColor || '#0284c7');
        setLoginLogoUrl(b.loginLogoUrl || '');
        setPrintWatermarkLogoUrl(b.printWatermarkLogoUrl || '');
        setPrintWatermarkGrayscale(b.printWatermarkGrayscale ?? true);
        setLoginBgUrl(b.loginBgUrl || '');
        setPrintWatermarkText(b.printWatermarkText || 'INSTITUTO TRANSFORMA BRASIL');
        setShowHeaderLogoLeft(b.showHeaderLogoLeft ?? true);
        setShowHeaderLogoRight(b.showHeaderLogoRight ?? true);
      }
    } catch {
      setStatusMessage({ text: 'Não foi possível carregar as preferências de marca.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  if (!session || session.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito ao Administrador do Sistema.
      </div>
    );
  }

  const contrastRatio = getContrastRatio(accentColor);
  const isLowContrast = contrastRatio < 3.0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'watermark' | 'bg') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setStatusMessage({
        text: 'A imagem deve ter menos de 5 MB para manter performance ideal.',
        type: 'error',
      });
      return;
    }

    setUploadingTarget(target);
    setStatusMessage(null);
    try {
      const res = await api.uploadBrandingAsset(file);
      if (target === 'logo') setLoginLogoUrl(res.url);
      else if (target === 'watermark') setPrintWatermarkLogoUrl(res.url);
      else if (target === 'bg') setLoginBgUrl(res.url);

      setStatusMessage({
        text: 'Imagem enviada com sucesso!',
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({
        text: err.message || 'Erro ao enviar imagem.',
        type: 'error',
      });
    } finally {
      setUploadingTarget(null);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const updated = await api.updateBranding({
        appName,
        accentColor,
        loginLogoUrl: loginLogoUrl || undefined,
        printWatermarkLogoUrl: printWatermarkLogoUrl || undefined,
        printWatermarkGrayscale: Boolean(printWatermarkGrayscale),
        loginBgUrl: loginBgUrl || undefined,
        printWatermarkText: printWatermarkText || undefined,
        showHeaderLogoLeft,
        showHeaderLogoRight,
      });

      // Apply accent color & tokens to document root dynamically
      applyBrandDesignTokens(updated.accentColor, updated.appName);
      setBranding?.(updated);
      setStatusMessage({ text: 'Identidade visual atualizada com sucesso!', type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Erro ao salvar configurações.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Deseja realmente restaurar as configurações padrão de marca do ERPITB?')) {
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      const def = await api.resetBranding();
      setAppName(def.appName);
      setAccentColor(def.accentColor);
      setLoginLogoUrl('');
      setPrintWatermarkLogoUrl('');
      setPrintWatermarkGrayscale(true);
      setLoginBgUrl('');
      setPrintWatermarkText(def.printWatermarkText || 'INSTITUTO TRANSFORMA BRASIL');
      setShowHeaderLogoLeft(def.showHeaderLogoLeft);
      setShowHeaderLogoRight(def.showHeaderLogoRight);
      applyBrandDesignTokens(def.accentColor, def.appName);
      setBranding?.(def);
      setStatusMessage({ text: 'Configurações de marca restauradas para o padrão.', type: 'success' });
    } catch {
      setStatusMessage({ text: 'Erro ao restaurar configurações padrão.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Carregando configurações de marca...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Palette className="w-6 h-6 text-slate-700" />
            <span>Identidade Visual &amp; Marca</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Personalize o nome da instituição, paleta de cores corporativa, logotipo e marcas d'água.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrão</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Section: Instituição */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Informações Institucionais
            </h2>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="branding-app-name" className="text-xs font-bold text-slate-700">
                Nome do Aplicativo / Instituição
              </label>
              <input
                id="branding-app-name"
                type="text"
                required
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Ex: ERPITB — Instituto Transforma Brasil"
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
              <span className="text-[11px] text-slate-400">
                Exibido na barra superior, página de login e cabeçalhos de relatórios.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="branding-watermark" className="text-xs font-bold text-slate-700">
                Texto de Marca D'água para Impressões &amp; PDFs
              </label>
              <input
                id="branding-watermark"
                type="text"
                value={printWatermarkText}
                onChange={(e) => setPrintWatermarkText(e.target.value)}
                placeholder="Ex: INSTITUTO TRANSFORMA BRASIL"
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          {/* Section: Cores */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Paleta &amp; Cor de Destaque
            </h2>

            <div className="flex flex-col gap-2">
              <label htmlFor="branding-accent-color" className="text-xs font-bold text-slate-700">
                Cor de Destaque Primária (Accent Color)
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="branding-accent-color"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#0284c7"
                  pattern="^#[0-9a-fA-F]{6}$"
                  className="w-32 px-3 py-2 text-sm font-mono rounded-xl border border-slate-200 uppercase"
                />
              </div>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-[11px] text-slate-400 mr-1">Paletas sugeridas:</span>
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setAccentColor(p.hex)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 text-[11px] hover:bg-slate-50 transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.hex }} />
                    <span className="text-slate-700 font-medium">{p.label}</span>
                  </button>
                ))}
              </div>

              {/* Contrast warning */}
              {isLowContrast && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-800">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Atenção de Contraste (Acessibilidade WCAG):</span>
                    <p className="mt-0.5 text-[11px]">
                      A cor escolhida possui razão de contraste de {contrastRatio.toFixed(1)}:1 em fundos brancos (recomendado mínimo 3.0:1 para elementos gráficos e 4.5:1 para texto).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Logotipos & Imagens */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Identidade Visual &amp; Imagens Oficiais
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Personalize os logotipos da instituição para cabeçalhos, documentos impressos e tela de acesso.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 1. Logo Institucional */}
              <div className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 block">Logotipo Institucional</label>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Login e cabeçalho oficial</span>
                </div>

                <div className="h-24 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center p-2 relative overflow-hidden">
                  {loginLogoUrl ? (
                    <img src={loginLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 gap-1 text-[11px]">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                      <span>Sem logo configurado</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor={fileInputLogoId}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer transition-colors"
                  >
                    {uploadingTarget === 'logo' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{loginLogoUrl ? 'Substituir' : 'Enviar Imagem'}</span>
                  </label>
                  <input
                    id={fileInputLogoId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    onChange={(e) => handleFileUpload(e, 'logo')}
                    disabled={uploadingTarget !== null}
                    className="hidden"
                  />
                  {loginLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setLoginLogoUrl('')}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                      title="Remover logotipo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Marca d'Água de Impressão */}
              <div className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 block">Marca d'Água (Impressão)</label>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Fundo de boletins e relatórios</span>
                </div>

                <div className="h-24 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center p-2 relative overflow-hidden">
                  {printWatermarkLogoUrl ? (
                    <img src={printWatermarkLogoUrl} alt="Marca d'Água" className="max-h-full max-w-full object-contain opacity-40 grayscale" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 gap-1 text-[11px]">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                      <span>Sem marca d'água</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor={fileInputWatermarkId}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer transition-colors"
                  >
                    {uploadingTarget === 'watermark' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{printWatermarkLogoUrl ? 'Substituir' : 'Enviar Imagem'}</span>
                  </label>
                  <input
                    id={fileInputWatermarkId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    onChange={(e) => handleFileUpload(e, 'watermark')}
                    disabled={uploadingTarget !== null}
                    className="hidden"
                  />
                  {printWatermarkLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setPrintWatermarkLogoUrl('')}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                      title="Remover marca d'água"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Fundo de Login */}
              <div className="flex flex-col justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-800 block">Fundo de Login</label>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Plano de fundo da tela de login</span>
                </div>

                <div className="h-24 rounded-lg bg-white border border-dashed border-slate-300 flex items-center justify-center p-2 relative overflow-hidden">
                  {loginBgUrl ? (
                    <div
                      className="w-full h-full rounded bg-cover bg-center border border-slate-200"
                      style={{ backgroundImage: `url(${loginBgUrl})` }}
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 gap-1 text-[11px]">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                      <span>Sem fundo personalizado</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor={fileInputBgId}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer transition-colors"
                  >
                    {uploadingTarget === 'bg' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{loginBgUrl ? 'Substituir' : 'Enviar Imagem'}</span>
                  </label>
                  <input
                    id={fileInputBgId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                    onChange={(e) => handleFileUpload(e, 'bg')}
                    disabled={uploadingTarget !== null}
                    className="hidden"
                  />
                  {loginBgUrl && (
                    <button
                      type="button"
                      onClick={() => setLoginBgUrl('')}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                      title="Remover fundo de login"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Visibility Toggles */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeaderLogoLeft}
                  onChange={(e) => setShowHeaderLogoLeft(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-0"
                />
                <span>Exibir logotipo no canto esquerdo da barra superior</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeaderLogoRight}
                  onChange={(e) => setShowHeaderLogoRight(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-0"
                />
                <span>Exibir logotipo secundário no canto direito</span>
              </label>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>

        {/* Live Preview Column (1 col) */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Pré-visualização em Tempo Real
            </h2>

            {/* Simulated Top Bar */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {loginLogoUrl ? (
                    <img src={loginLogoUrl} alt="Logo" className="w-5 h-5 object-contain" />
                  ) : (
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center font-black text-[10px]"
                      style={{ backgroundColor: accentColor, color: '#ffffff' }}
                    >
                      ITB
                    </div>
                  )}
                  <span className="font-bold truncate max-w-[140px]">{appName}</span>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400" title="Online" />
              </div>

              {/* Simulated Card Content */}
              <div className="p-4 space-y-3 bg-slate-50">
                <div className="text-[11px] text-slate-500 font-semibold">Exemplo de Botão &amp; Tag:</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    style={{ backgroundColor: accentColor }}
                    className="px-3 py-1.5 rounded-lg text-white font-bold text-xs shadow-2xs"
                  >
                    Botão Primário
                  </button>
                  <span
                    style={{ color: accentColor, borderColor: accentColor }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-white"
                  >
                    Destaque
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>Marca d'água: {printWatermarkText}</span>
                  {printWatermarkLogoUrl && (
                    <img src={printWatermarkLogoUrl} alt="Marca d'água" className="h-4 object-contain opacity-40 grayscale" />
                  )}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              As alterações de cor de destaque e nome serão aplicadas imediatamente após salvar para todos os usuários do sistema.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
