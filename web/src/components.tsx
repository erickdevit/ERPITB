import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { parseBrazilDate, formatDate } from './lib/date';

export function Section({
  title,
  subtitle,
  action,
  children,
}: PropsWithChildren<{ title?: string; subtitle?: string; action?: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-4">
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          {title ? (
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          ) : <div />}
          {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
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
        className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 z-10 transition-all"
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">{children}</div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowFuture?: boolean;
  required?: boolean;
  helperText?: string;
}) {
  const [internalDate, setInternalDate] = useState(() => {
    try {
      return parseBrazilDate(value, { allowFuture }) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      const parsed = parseBrazilDate(value, { allowFuture });
      if (parsed) setInternalDate(parsed);
    } catch {
      // Keep internal date as is
    }
  }, [value, allowFuture]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalDate(val);
    if (!val) {
      onChange('');
      return;
    }
    try {
      const [year, month, day] = val.split('-');
      if (year && month && day) {
        onChange(`${day}/${month}/${year}`);
      }
    } catch {
      onChange(val);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={`date-${label}`} className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        id={`date-${label}`}
        type="date"
        required={required}
        value={internalDate}
        onChange={handleChange}
        className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all"
      />
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
      <label htmlFor={`select-${label}`} className="text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          id={`select-${label}`}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pl-3 pr-8 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-950 focus:border-transparent transition-all cursor-pointer"
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
