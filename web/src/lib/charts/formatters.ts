/**
 * Centralized pt-BR Chart Formatters
 * Enforces integer cents for money and exact precision rules.
 */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

/** Formats integer cents into pt-BR currency (e.g. 150000 -> R$ 1.500,00) */
export function formatCurrencyCents(cents: number): string {
  if (cents === null || cents === undefined || isNaN(cents)) return 'R$ 0,00';
  return currencyFormatter.format(cents / 100);
}

/** Formats decimal currency in BRL (for chart axes / summaries) */
export function formatCurrencyValue(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
  return currencyFormatter.format(val);
}

/** Formats compact currency (e.g. R$ 1,5k, R$ 12k) */
export function formatCompactCurrency(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return 'R$ 0';
  if (Math.abs(val) >= 1_000_000) {
    return `R$ ${(val / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (Math.abs(val) >= 1_000) {
    return `R$ ${(val / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  }
  return currencyFormatter.format(val);
}

/** Formats percentage with standard 1 decimal place (e.g. 85.4%) */
export function formatPercent(rate: number): string {
  if (rate === null || rate === undefined || isNaN(rate)) return '0,0%';
  return `${rate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Formats integer count with thousands separators */
export function formatInteger(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return numberFormatter.format(Math.round(val));
}

/** Formats compact numbers (e.g. 1,2k) */
export function formatCompactNumber(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return compactFormatter.format(val);
}

/** Formats ISO YYYY-MM-DD to DD/MM */
export function formatShortDate(val: string): string {
  if (!val) return '—';
  const parts = val.split('-');
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return val;
}

/** Formats ISO YYYY-MM-DD to DD/MM/YYYY */
export function formatFullDate(val: string): string {
  if (!val) return '—';
  const parts = val.split('-');
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return val;
}
