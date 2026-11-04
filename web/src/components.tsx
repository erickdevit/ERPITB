import React, { Component, useEffect, useState, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, ArrowLeft, Calendar, FileQuestion, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { parseBrazilDate, formatDate } from './lib/date';

export class ErrorBoundary extends Component<
  PropsWithChildren<{ fallbackTitle?: string }>,
  { hasError: boolean; error?: Error }
> {
  constructor(props: PropsWithChildren<{ fallbackTitle?: string }>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full p-6 sm:p-8 my-4 rounded-2xl bg-white border border-rose-200 shadow-sm text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {this.props.fallbackTitle ?? 'Ocorreu um problema ao carregar esta tela'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Os dados locais salvos foram preservados e continuam seguros.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 my-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 overflow-x-auto">
              {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar novamente</span>
            </button>
            <a
              href="/"
              className="inline-flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Voltar ao Início
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function Section({
  subtitle,
  action,
  children,
}: PropsWithChildren<{ title?: string; subtitle?: string; action?: React.ReactNode }>) {
  if (!subtitle && !action && !children) return null;

  return (
    <div className="flex flex-col gap-4">
      {(subtitle || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-500 text-left font-medium">
              {subtitle}
            </p>
          )}
          {action && <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageDialog({
  open,
  title,
  onClose,
  children,
  onSave,
  saveText = 'Salvar',
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveText?: string;
}>) {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) {
      setRendered(true);
    } else if (rendered) {
      const timer = setTimeout(() => setRendered(false), 50);
      return () => clearTimeout(timer);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl p-5 sm:p-6 z-10 transition-all text-left"
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar (Esc)"
            className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">{children}</div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            {saveText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  allowFuture = false,
  required = false,
  helperText,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowFuture?: boolean;
  required?: boolean;
  helperText?: string;
  min?: string;
  max?: string;
}) {
  const toDisplay = (val: string) => {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, d] = val.split('-');
      return `${d}/${m}/${y}`;
    }
    return val;
  };

  const toIso = (val: string) => {
    try {
      return parseBrazilDate(val, { allowFuture }) ?? '';
    } catch {
      return '';
    }
  };

  const [displayText, setDisplayText] = useState(() => toDisplay(value));
  const [internalDate, setInternalDate] = useState(() => toIso(value));
  const hiddenDateInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayText(toDisplay(value));
    setInternalDate(toIso(value));
  }, [value, allowFuture]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) {
      setDisplayText('');
      setInternalDate('');
      onChange('');
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      const [y, m, d] = raw.trim().split('-');
      const br = `${d}/${m}/${y}`;
      setDisplayText(br);
      setInternalDate(raw.trim());
      onChange(br);
      return;
    }
    setDisplayText(raw);
    try {
      const parsedIso = parseBrazilDate(raw, { allowFuture });
      if (parsedIso) {
        setInternalDate(parsedIso);
      }
    } catch {
      // Keep internal date as is
    }
    onChange(raw);
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalDate(val);
    if (!val) {
      setDisplayText('');
      onChange('');
      return;
    }
    const [year, month, day] = val.split('-');
    if (year && month && day) {
      const br = `${day}/${month}/${year}`;
      setDisplayText(br);
      onChange(br);
    }
  };

  const openCalendar = () => {
    if (hiddenDateInputRef.current) {
      if (typeof hiddenDateInputRef.current.showPicker === 'function') {
        hiddenDateInputRef.current.showPicker();
      } else {
        hiddenDateInputRef.current.focus();
        hiddenDateInputRef.current.click();
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={`date-${label}`} className="text-xs font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative flex items-center">
        <input
          id={`date-${label}`}
          type="text"
          inputMode="numeric"
          required={required}
          value={displayText}
          placeholder="dd/mm/aaaa"
          onChange={handleTextChange}
          className="w-full pl-3 pr-9 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all placeholder:text-slate-400 font-medium"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={openCalendar}
          aria-label="Selecionar no calendário"
          title="Selecionar data no calendário"
          className="absolute right-2 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={hiddenDateInputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={min}
          max={max}
          value={internalDate}
          onChange={handlePickerChange}
          className="sr-only pointer-events-none opacity-0 absolute"
        />
      </div>
      {helperText && <span className="text-[11px] text-slate-400">{helperText}</span>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={`select-${label}`} className="text-xs font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          id={`select-${label}`}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pl-3 pr-8 py-2 text-sm text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800" role="alert">
      <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function PrintWatermark({
  text,
  logoUrl,
  grayscale = true,
}: {
  text?: string;
  logoUrl?: string;
  grayscale?: boolean;
}) {
  if (!text && !logoUrl) return null;
  return (
    <div
      data-watermark="true"
      className="print-watermark hidden print:flex fixed inset-0 pointer-events-none select-none items-center justify-center"
      aria-hidden="true"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={`watermark-image ${grayscale ? 'grayscale' : ''}`}
        />
      ) : (
        <span className="watermark-text">
          {text}
        </span>
      )}
    </div>
  );
}

export function QrCodeImage({
  value,
  size = 64,
  className = '',
  alt = 'QR Code de Validação',
}: {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const [svgHtml, setSvgHtml] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setSvgHtml('');
      return;
    }
    QRCode.toString(value, {
      type: 'svg',
      margin: 0,
      width: size,
      color: { dark: '#020617', light: '#00000000' },
    })
      .then((svg) => {
        if (active) setSvgHtml(svg);
      })
      .catch((err) => {
        console.error('Failed to generate QR code SVG:', err);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!svgHtml) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-transparent flex items-center justify-center text-[9px] text-slate-400 font-mono ${className}`}
        aria-label={alt}
      >
        QR
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 bg-transparent ${className}`}
      data-testid="qrcode-container"
      title={value}
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}): React.ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando dados..."
      data-testid="table-skeleton"
      className="w-full divide-y divide-slate-100 animate-pulse"
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 py-3.5 px-4 items-center"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((__, colIndex) => (
            <div
              key={colIndex}
              className={`h-3.5 rounded-md bg-slate-200/80 ${
                colIndex === 0 ? 'w-3/4' : colIndex === cols - 1 ? 'w-1/2 ml-auto' : 'w-2/3'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({
  count = 3,
}: {
  count?: number;
}): React.ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando cartões..."
      data-testid="card-skeleton"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3"
        >
          <div className="h-4 w-1/3 rounded-md bg-slate-200/90" />
          <div className="h-7 w-2/3 rounded-md bg-slate-200/80" />
          <div className="h-3 w-1/2 rounded-md bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      data-testid="empty-state"
      className="w-full py-10 px-4 flex flex-col items-center justify-center text-center"
    >
      {Icon && (
        <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200/80 text-slate-500 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 font-medium mt-1 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NotFoundPage(): React.ReactElement {
  return (
    <div
      data-testid="not-found-page"
      className="w-full py-16 px-4 flex flex-col items-center justify-center text-center"
    >
      <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-2xl p-8 shadow-2xs flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center mb-4">
          <FileQuestion className="w-7 h-7" />
        </div>
        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
          Erro 404
        </span>
        <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
          Página não encontrada
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
          O endereço solicitado não existe ou foi movido. Verifique a URL ou retorne ao painel principal do sistema.
        </p>
        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back();
              } else if (typeof window !== 'undefined') {
                window.location.assign('/');
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <span>Ir para o Painel Principal</span>
          </a>
        </div>
      </div>
    </div>
  );
}


