export type ExportValue = string | number | null | undefined;

const spreadsheetSafe = (value: ExportValue) => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};
const cell = (value: ExportValue) => `"${spreadsheetSafe(value).replaceAll('"', '""')}"`;
export function toCsv(headers: string[], rows: ExportValue[][]): string {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')}`;
}

function download(filename: string, type: string, content: BlobPart) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function exportExcelCsv(filename: string, headers: string[], rows: ExportValue[][]) {
  download(`${filename}.csv`, 'text/csv;charset=utf-8', toCsv(headers, rows));
}

export async function buildExcelXlsx(summary: Array<[string, ExportValue]>, headers: string[], rows: ExportValue[][], metadata: Array<[string, ExportValue]>): Promise<Uint8Array> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Frequência ITB'; workbook.created = new Date();
  const addSheet = (name: string, values: ExportValue[][]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    values.forEach((row) => sheet.addRow(row.map(spreadsheetSafe)));
    if (sheet.rowCount) {
      const header = sheet.getRow(1); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1769AA' } };
      header.alignment = { vertical: 'middle' }; header.height = 22;
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, sheet.columnCount) } };
    }
    sheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell?.({ includeEmpty: true }, (cell) => { width = Math.max(width, String(cell.value ?? '').length + 2); });
      column.width = Math.min(width, 48);
    });
    return sheet;
  };
  addSheet('Resumo', [['Indicador', 'Valor'], ...summary]);
  addSheet('Dados', [headers, ...rows]);
  addSheet('Metadados', [['Campo', 'Valor'], ...metadata]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function exportExcelXlsx(filename: string, summary: Array<[string, ExportValue]>, headers: string[], rows: ExportValue[][], metadata: Array<[string, ExportValue]>) {
  const buffer = await buildExcelXlsx(summary, headers, rows, metadata);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  download(`${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes.buffer);
}

export function exportBiJson(filename: string, payload: unknown) {
  download(`${filename}.json`, 'application/json;charset=utf-8', JSON.stringify({ generatedAt: new Date().toISOString(), payload }, null, 2));
}

export async function exportSimplePdf(filename: string, title: string, context: string[], headers: string[], rows: ExportValue[][]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const left = 12; const width = doc.internal.pageSize.getWidth() - 24; const bottom = doc.internal.pageSize.getHeight() - 12;
  const heading = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text(title, left, 14); doc.setFontSize(8); context.forEach((line, index) => doc.text(line, left, 20 + index * 5)); doc.text(headers.join(' | '), left, 28 + context.length * 5); return 34 + context.length * 5; };
  let y = heading();
  for (const row of rows) {
    const lines = doc.splitTextToSize(row.map((value) => String(value ?? '')).join(' | '), width);
    if (y + lines.length * 4 > bottom) { doc.addPage(); y = heading(); }
    doc.text(lines, left, y); y += Math.max(5, lines.length * 4);
  }
  if (!rows.length) doc.text('Nenhum dado para os filtros selecionados.', left, y);
  doc.save(`${filename}.pdf`);
}
