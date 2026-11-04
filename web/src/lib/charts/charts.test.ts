import { describe, it, expect } from 'vitest';
import {
  formatCurrencyCents,
  formatCurrencyValue,
  formatCompactCurrency,
  formatPercent,
  formatInteger,
  formatShortDate,
} from './formatters';
import { CHART_TOKENS } from './tokens';

describe('Chart Design Tokens & Formatters', () => {
  it('has colorblind safe palette and standard semantic tokens', () => {
    expect(CHART_TOKENS.palette.length).toBe(8);
    expect(CHART_TOKENS.semantic.positive).toBe('#10B981');
    expect(CHART_TOKENS.semantic.negative).toBe('#F43F5E');
    expect(CHART_TOKENS.semantic.warning).toBe('#F59E0B');
  });

  it('formats integer cents into BRL currency string', () => {
    expect(formatCurrencyCents(10000)).toMatch(/R\$\s*100,00/);
    expect(formatCurrencyCents(0)).toMatch(/R\$\s*0,00/);
  });

  it('formats percentages with one decimal', () => {
    expect(formatPercent(75)).toBe('75,0%');
    expect(formatPercent(99.45)).toBe('99,5%');
  });

  it('formats compact currency numbers', () => {
    expect(formatCompactCurrency(1500)).toMatch(/R\$\s*2k/);
    expect(formatCompactCurrency(1200000)).toMatch(/R\$\s*1,2\s*mi/);
  });

  it('formats short dates safely', () => {
    expect(formatShortDate('2026-10-24')).toBe('24/10');
    expect(formatShortDate('')).toBe('—');
  });
});
