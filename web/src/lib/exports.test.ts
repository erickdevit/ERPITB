import { describe, expect, it } from 'vitest';
import { buildExcelXlsx, toCsv } from './exports';

describe('toCsv', () => {
  it('creates an Excel-compatible UTF-8 CSV and escapes values', () => {
    const csv = toCsv(['Aluno', 'Observação'], [['Ana', 'Chegou, cedo'], ['Bia', 'Disse "oi"']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Ana";"Chegou, cedo"');
    expect(csv).toContain('"Bia";"Disse ""oi"""');
  });

  it('neutralizes spreadsheet formulas in exported cells', () => {
    const csv = toCsv(['Aluno', 'Valor'], [['Ana', '=HYPERLINK("https://example.invalid")'], ['Bia', '+1+1']]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"\'+1+1"');
  });

  it('creates a native XLSX workbook with summary, data and metadata sheets', async () => {
    const file = await buildExcelXlsx([['Frequência', '75%']], ['Aluno', 'Situação'], [['Ana', 'P']], [['Período', '01/08/2026 a 31/08/2026']]);
    expect([...file.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect(file.byteLength).toBeGreaterThan(1_000);
  });
});
