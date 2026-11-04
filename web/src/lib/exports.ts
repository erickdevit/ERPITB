import { printPdfBlob } from './print-helper';

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
  workbook.creator = 'opschool'; workbook.created = new Date();
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

export interface SimplePdfWatermarkOptions {
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkGrayscale?: boolean;
  institutionName?: string;
  logoUrl?: string;
}

export async function buildSimplePdfDoc(
  title: string,
  context: string[],
  headers: string[],
  rows: ExportValue[][],
  options?: SimplePdfWatermarkOptions
) {
  const { jsPDF, GState } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const left = 12;
  const width = doc.internal.pageSize.getWidth() - 24;
  const bottom = doc.internal.pageSize.getHeight() - 12;

  let logoDataUrl: string | null = null;
  if (options?.watermarkLogoUrl && typeof window !== 'undefined' && typeof Image !== 'undefined') {
    try {
      logoDataUrl = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 300;
            canvas.height = img.naturalHeight || 300;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            if (options.watermarkGrayscale !== false) ctx.filter = 'grayscale(100%)';
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = options.watermarkLogoUrl!;
      });
    } catch {}
  }

  let headerLogoDataUrl: string | null = null;
  if (options?.logoUrl && typeof window !== 'undefined' && typeof Image !== 'undefined') {
    try {
      headerLogoDataUrl = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || 300;
            canvas.height = img.naturalHeight || 300;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = options.logoUrl!;
      });
    } catch {}
  }

  const institutionName = options?.institutionName || 'opschool';
  const resolvedWatermarkText = options?.watermarkText || `${institutionName} - Documento Oficial`;

  const drawPageWatermark = () => {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    if (logoDataUrl) {
      try {
        doc.saveGraphicsState();
        doc.setGState(new GState({ opacity: 0.08 }));
        const imgSize = 80;
        doc.addImage(logoDataUrl, 'PNG', (pw - imgSize) / 2, (ph - imgSize) / 2, imgSize, imgSize);
        doc.restoreGraphicsState();
        return;
      } catch {}
    }
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(241, 245, 249);
    doc.text(resolvedWatermarkText, pw / 2, ph / 2, { align: 'center', angle: 25 });
    doc.restoreGraphicsState();
  };

  const heading = () => {
    drawPageWatermark();
    const currentY = 12;
    let headerTextX = left;

    if (headerLogoDataUrl) {
      try {
        doc.addImage(headerLogoDataUrl, 'PNG', left, currentY - 1, 9, 9);
        headerTextX = left + 12;
      } catch {
        headerTextX = left;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(institutionName, headerTextX, currentY + 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(title, left, currentY + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    context.forEach((line, index) => doc.text(line, left, currentY + 15 + index * 4.5));

    const tableHeaderY = currentY + 17 + context.length * 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(headers.join(' | '), left, tableHeaderY);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(left, tableHeaderY + 2, left + width, tableHeaderY + 2);

    return tableHeaderY + 7;
  };

  let y = heading();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  for (const row of rows) {
    const lines = doc.splitTextToSize(row.map((value) => String(value ?? '')).join(' | '), width);
    if (y + lines.length * 4 > bottom) {
      doc.addPage();
      y = heading();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
    }
    doc.text(lines, left, y);
    y += Math.max(5, lines.length * 4);
  }
  if (!rows.length) {
    doc.text('Nenhum dado para os filtros selecionados.', left, y);
  }

  return doc;
}

export async function exportSimplePdf(
  filename: string,
  title: string,
  context: string[],
  headers: string[],
  rows: ExportValue[][],
  options?: SimplePdfWatermarkOptions
) {
  const doc = await buildSimplePdfDoc(title, context, headers, rows, options);
  doc.save(`${filename}.pdf`);
}

export async function printSimplePdf(
  title: string,
  context: string[],
  headers: string[],
  rows: ExportValue[][],
  options?: SimplePdfWatermarkOptions
) {
  const doc = await buildSimplePdfDoc(title, context, headers, rows, options);
  doc.autoPrint();
  const blob = doc.output('blob');
  await printPdfBlob(blob, title);
}
