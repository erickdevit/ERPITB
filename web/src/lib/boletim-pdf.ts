import { jsPDF, GState } from 'jspdf';
import QRCode from 'qrcode';
import type { ClassBoletimData, UnifiedBoletimData } from './boletim';
import { formatGrade } from './grades';
import { printPdfBlob } from './print-helper';

export interface BoletimPdfOptions {
  institutionName?: string;
  qrDataUrl?: string;
  qrDataUrlsByStudentId?: Record<string, string>;
  portalUrl?: string;
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkLogoDataUrl?: string;
  watermarkGrayscale?: boolean;
  logoUrl?: string;
  logoDataUrl?: string;
  customFilename?: string;
}

/**
 * Converts an image URL into a base64 PNG data URL, applying grayscale if requested.
 */
export async function urlToDataUrl(url?: string, grayscale = true): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (typeof window === 'undefined' || typeof Image === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        if (grayscale) {
          ctx.filter = 'grayscale(100%)';
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Draws the watermark logo (or text fallback) at the center of the PDF page with subtle opacity.
 */
function drawWatermark(doc: jsPDF, watermarkImgDataUrl?: string, watermarkText?: string) {
  if (watermarkImgDataUrl) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.08 }));
      const imgWidth = 90; // mm
      const imgHeight = 90; // mm
      const imgX = (297 - imgWidth) / 2;
      const imgY = (210 - imgHeight) / 2;
      doc.addImage(watermarkImgDataUrl, 'PNG', imgX, imgY, imgWidth, imgHeight);
      doc.restoreGraphicsState();
      return;
    } catch {
      // Fall back to text watermark if image rendering fails
    }
  }

  const text = watermarkText || 'opschool - Documento Oficial';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(241, 245, 249);
  doc.text(text, 297 / 2, 210 / 2, {
    align: 'center',
    angle: 25,
  });
}

function drawWatermarkOnEveryPage(doc: jsPDF, watermarkImgDataUrl?: string, watermarkText?: string) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawWatermark(doc, watermarkImgDataUrl, watermarkText);
  }
  doc.setPage(pageCount);
}

/**
 * Formats a Date/ISO string to Brazilian format: DD/MM/AAAA HH:mm
 */
function formatEmissionDate(isoString?: string): string {
  try {
    const d = isoString ? new Date(isoString) : new Date();
    if (Number.isNaN(d.getTime())) return isoString || '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoString || '';
  }
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Renders a single student's unified individual report card onto the current page of `doc`,
 * strictly fitting within 1 A4 landscape page even when there are up to 10 modules or 60+ char names.
 */
function renderBoletimPageOnDoc(doc: jsPDF, data: UnifiedBoletimData, options?: BoletimPdfOptions): void {
  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2; // 277mm

  let currentY = 10;

  // ==========================================
  // 1. INSTITUTIONAL HEADER (Clean White, No Dark Block)
  // ==========================================
  let headerTextX = marginX;
  if (options?.logoDataUrl) {
    try {
      doc.addImage(options.logoDataUrl, 'PNG', marginX, currentY + 0.5, 9, 9);
      headerTextX = marginX + 11.5;
    } catch {
      headerTextX = marginX;
    }
  }

  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(options?.institutionName || 'opschool', headerTextX, currentY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('BOLETIM ESCOLAR INDIVIDUAL', headerTextX, currentY + 9.5);

  const emissionStr = `Data e Hora de Emissão: ${formatEmissionDate(data.issueDate)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(emissionStr, marginX + contentWidth, currentY + 9.5, { align: 'right' });

  currentY += 12;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);

  currentY += 3.5;

  // ==========================================
  // 2. UNIFIED STUDENT METADATA & ACADEMIC SUMMARY ROW (SINGLE ROW, FULL NAME SPACE)
  // ==========================================
  const infoBoxHeight = 14.5;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, infoBoxHeight, 2, 2, 'FD');

  const student = data.student ?? { name: 'Aluno', id: '', classNames: [] };
  const classStr = student.classNames?.length ? student.classNames.join(', ') : '—';

  // 1. Aluno (Maximized width on left so full student names fit on 1 line without wrapping)
  const studentDisplayName = (student.name || 'Aluno').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('ALUNO', marginX + 4, currentY + 4.8);

  const maxStudentNameWidth = 112;
  let studentFontSize = 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(studentFontSize);
  while (studentFontSize > 6.2 && doc.getTextWidth(studentDisplayName) > maxStudentNameWidth) {
    studentFontSize -= 0.4;
    doc.setFontSize(studentFontSize);
  }
  doc.setTextColor(15, 23, 42); // slate-900
  const singleLineName = doc.splitTextToSize(studentDisplayName, maxStudentNameWidth)[0] ?? studentDisplayName;
  doc.text(singleLineName, marginX + 4, currentY + 11.0);

  // 2. Matrícula (Compact on right)
  const colMatriculaX = marginX + 120;
  doc.setDrawColor(226, 232, 240);
  doc.line(colMatriculaX - 3, currentY + 2.2, colMatriculaX - 3, currentY + infoBoxHeight - 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('MATRÍCULA', colMatriculaX, currentY + 4.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(student.registrationNumber || '—', colMatriculaX, currentY + 11.0);

  // 3. Curso
  const colCursoX = marginX + 146;
  doc.line(colCursoX - 3, currentY + 2.2, colCursoX - 3, currentY + infoBoxHeight - 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('CURSO', colCursoX, currentY + 4.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  const courseLines = doc.splitTextToSize(student.courseName || '—', 38);
  doc.text(courseLines[0] ?? (student.courseName || '—'), colCursoX, currentY + 11.0);

  // 4. Turma
  const colTurmaX = marginX + 188;
  doc.line(colTurmaX - 3, currentY + 2.2, colTurmaX - 3, currentY + infoBoxHeight - 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('TURMA', colTurmaX, currentY + 4.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  const classLines = doc.splitTextToSize(classStr, 44);
  doc.text(classLines[0] ?? classStr, colTurmaX, currentY + 11.0);

  // 5. Média Geral
  const colGpaX = marginX + 236;
  doc.line(colGpaX - 3, currentY + 2.2, colGpaX - 3, currentY + infoBoxHeight - 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('MÉDIA GERAL', colGpaX, currentY + 4.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatGrade(data.overallGpa), colGpaX, currentY + 11.2);

  // 6. Frequência
  const colFreqX = marginX + 258;
  doc.line(colFreqX - 3, currentY + 2.2, colFreqX - 3, currentY + infoBoxHeight - 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('FREQUÊNCIA', colFreqX, currentY + 4.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const freqStr = `${(Number(data.overallAttendanceRate) || 0).toFixed(1).replace('.', ',')}%`;
  doc.text(freqStr, colFreqX, currentY + 11.2);

  currentY += infoBoxHeight + 4.5;

  // ==========================================
  // 3. DETALHAMENTO DAS AVALIAÇÕES POR ETAPA (EXPANDED CARDS FILLING AVAILABLE SHEET HEIGHT)
  // ==========================================
  const bottomFooterY = pageHeight - 16;
  const sigY = bottomFooterY - 12;
  const modules = data.modules ?? [];
  if (modules.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('DETALHAMENTO DAS AVALIAÇÕES POR ETAPA', marginX, currentY);
    currentY += 3.5;

    const colsCount = modules.length > 6 ? 4 : modules.length > 4 ? 3 : 2;
    const rowsCount = Math.max(1, Math.ceil(modules.length / colsCount));
    const cardGapX = colsCount > 2 ? 4 : 6;
    const cardGapY = 4;
    const cardWidth = (contentWidth - cardGapX * (colsCount - 1)) / colsCount;

    // Expand cards to fill vertical space cleanly down to the signatures area
    const availableCardsHeight = Math.max(40, sigY - 10 - currentY);
    const targetRowCardHeight = Math.min(
      52,
      Math.max(24, (availableCardsHeight - cardGapY * (rowsCount - 1)) / rowsCount),
    );

    modules.forEach((mod, idx) => {
      const colIdx = idx % colsCount;
      const rowIdx = Math.floor(idx / colsCount);
      const cardX = marginX + colIdx * (cardWidth + cardGapX);
      const cardTopY = currentY + rowIdx * (targetRowCardHeight + cardGapY);
      const cardHeight = targetRowCardHeight;

      // Card Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, cardTopY, cardWidth, cardHeight, 2, 2, 'FD');

      // Card Header (Module Name on left, larger Final Grade on right — no "Média Simples" or "média da etapa")
      const headerHeight = 9.0;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(colsCount > 2 ? 7.8 : 8.5);
      doc.setTextColor(15, 23, 42);
      const modNameTruncated = doc.splitTextToSize((mod.moduleName || 'Etapa').toUpperCase(), cardWidth - 22);
      doc.text(modNameTruncated[0] ?? mod.moduleName, cardX + 3, cardTopY + 6.0);

      // Card Final Grade on right (Larger font size)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(colsCount > 2 ? 11.0 : 12.0);
      doc.setTextColor(15, 23, 42);
      const finalGradeStr = formatGrade(mod.finalGrade);
      doc.text(finalGradeStr, cardX + cardWidth - 3, cardTopY + 6.3, { align: 'right' });

      // Divider inside card
      doc.setDrawColor(226, 232, 240);
      doc.line(cardX + 2.5, cardTopY + headerHeight, cardX + cardWidth - 2.5, cardTopY + headerHeight);

      // Grades rows distributed evenly across the remaining card body
      const bodyTopY = cardTopY + headerHeight + 2.0;
      const bodyAvailableH = Math.max(10, cardHeight - headerHeight - 4.0);

      if (mod.grades && mod.grades.length > 0) {
        const gradesCount = mod.grades.length;
        const rowGap = 1.8;
        const gradeRowRectH = Math.min(
          8.5,
          Math.max(4.5, (bodyAvailableH - rowGap * (gradesCount - 1)) / gradesCount),
        );
        const totalRowsH = gradesCount * gradeRowRectH + (gradesCount - 1) * rowGap;
        let gradeRowY = bodyTopY + Math.max(0, (bodyAvailableH - totalRowsH) / 2);

        mod.grades.forEach((g) => {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(cardX + 2.5, gradeRowY, cardWidth - 5, gradeRowRectH, 1, 1, 'FD');

          const textBaselineY = gradeRowY + gradeRowRectH / 2 + 1.1;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(colsCount > 2 ? 6.8 : 7.5);
          doc.setTextColor(51, 65, 85);
          const gName = doc.splitTextToSize((g.name || 'Avaliação').toUpperCase(), cardWidth - 28);
          doc.text(gName[0] ?? g.name, cardX + 4.5, textBaselineY);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(colsCount > 2 ? 7.5 : 8.2);
          doc.setTextColor(15, 23, 42);
          const scoreText = typeof g.score === 'number' && !Number.isNaN(g.score)
            ? `${g.score.toFixed(1).replace('.', ',')} / ${g.maxScore ?? 10}`
            : `— / ${g.maxScore ?? 10}`;
          doc.text(scoreText, cardX + cardWidth - 4.5, textBaselineY, { align: 'right' });

          gradeRowY += gradeRowRectH + rowGap;
        });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          'Nenhuma avaliação lançada nesta etapa.',
          cardX + cardWidth / 2,
          bodyTopY + bodyAvailableH / 2 + 1,
          { align: 'center' },
        );
      }
    });
  }

  // ==========================================
  // 4. FORMAL SIGNATURES AREA (No horizontal divider line above signatures)
  // ==========================================
  const sigLineWidth = 65;
  const sig1X = marginX + 24;
  const sig2X = marginX + contentWidth - sigLineWidth - 24;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);

  doc.line(sig1X, sigY, sig1X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('Coordenação Pedagógica / Direção', sig1X + sigLineWidth / 2, sigY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(options?.institutionName || 'opschool', sig1X + sigLineWidth / 2, sigY + 6.5, { align: 'center' });

  doc.line(sig2X, sigY, sig2X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('Aluno(a) ou Responsável Legal', sig2X + sigLineWidth / 2, sigY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Aluno / Responsável', sig2X + sigLineWidth / 2, sigY + 6.5, { align: 'center' });

  // ==========================================
  // 5. INSTITUTIONAL FOOTER WITH QR CODE (PINNED TO BOTTOM OF SHEET)
  // ==========================================
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, bottomFooterY, marginX + contentWidth, bottomFooterY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`${options?.institutionName || 'opschool'} — Relatório Acadêmico`, marginX, bottomFooterY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`Documento oficial emitido pelo Sistema de Gestão ${options?.institutionName || 'opschool'}.`, marginX, bottomFooterY + 9);

  // QR Code on bottom-right
  const qrX = marginX + contentWidth - 14;
  const qrY = bottomFooterY + 1.5;
  const qrSize = 13;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(51, 65, 85);
  doc.text('Boletim Virtual', qrX - 2, bottomFooterY + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(100, 116, 139);
  doc.text('Escaneie para validar', qrX - 2, bottomFooterY + 9.5, { align: 'right' });

  if (options?.qrDataUrl) {
    try {
      doc.addImage(options.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    } catch {
      doc.setDrawColor(203, 213, 225);
      doc.rect(qrX, qrY, qrSize, qrSize);
    }
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(148, 163, 184);
    doc.text('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 1.5, { align: 'center' });
  }
}

/**
 * Builds a vector-based jsPDF A4 landscape document representing the student's unified individual report card
 * matching the exact structure and visual hierarchy of the on-screen student modal.
 */
export function buildBoletimPdf(data: UnifiedBoletimData, options?: BoletimPdfOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  renderBoletimPageOnDoc(doc, data, options);
  drawWatermarkOnEveryPage(doc, options?.watermarkLogoDataUrl, options?.watermarkText);
  return doc;
}

/**
 * Builds a concatenated multi-page vector jsPDF A4 landscape document for an entire class,
 * where each student strictly occupies 1 page (`studentsData.length` pages total, zero blank pages).
 */
export function buildClassBatchBoletimPdf(
  studentsData: UnifiedBoletimData[],
  options?: BoletimPdfOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  studentsData.forEach((studentData, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'landscape');
    }
    const studentId = studentData.student?.id || '';
    const studentQr = options?.qrDataUrlsByStudentId?.[studentId] ?? options?.qrDataUrl;
    renderBoletimPageOnDoc(doc, studentData, { ...options, qrDataUrl: studentQr });
  });

  drawWatermarkOnEveryPage(doc, options?.watermarkLogoDataUrl, options?.watermarkText);
  return doc;
}

/**
 * Builds a vector-based jsPDF A4 document representing the Consolidated Class Boletim
 * matching the exact table in the screenshot.
 */
export function buildClassBoletimPdf(data: ClassBoletimData, options?: BoletimPdfOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  let currentY = 10;

  // Header (Clean White, No Dark Block)
  let headerTextX = marginX;
  if (options?.logoDataUrl) {
    try {
      doc.addImage(options.logoDataUrl, 'PNG', marginX, currentY + 0.5, 9, 9);
      headerTextX = marginX + 11.5;
    } catch {
      headerTextX = marginX;
    }
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(options?.institutionName || 'opschool', headerTextX, currentY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('BOLETIM CONSOLIDADO DA TURMA', headerTextX, currentY + 9.5);

  const emissionStr = `Data e Hora de Emissão: ${formatEmissionDate(data.issueDate)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(emissionStr, marginX + contentWidth, currentY + 9.5, { align: 'right' });

  currentY += 12;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);

  currentY += 4;

  // Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, 12, 2, 2, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Curso:', marginX + 4, currentY + 7.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(data.courseName || '—', marginX + 16, currentY + 7.5);

  const col2X = marginX + 90;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Turma:', col2X, currentY + 7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.className, col2X + 14, currentY + 7.5);

  const col3X = marginX + 180;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Total de Alunos:', col3X, currentY + 7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(String(data.totalStudents), col3X + 24, currentY + 7.5);

  currentY += 16;

  // Table Columns Setup
  const studentColWidth = 65;
  const gpaColWidth = 24;
  const freqColWidth = 24;
  const fixedColsWidth = studentColWidth + gpaColWidth + freqColWidth;
  const remainingWidth = contentWidth - fixedColsWidth;
  const tableCount = Math.max(1, data.tables.length);
  const tableColWidth = remainingWidth / tableCount;

  // Table Header
  const headerHeight = 11;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, currentY, contentWidth, headerHeight, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);
  doc.line(marginX, currentY + headerHeight, marginX + contentWidth, currentY + headerHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  let curX = marginX;
  doc.text('Aluno', curX + 3, currentY + 7);
  curX += studentColWidth;

  for (const t of data.tables) {
    doc.line(curX, currentY, curX, currentY + headerHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    const titleLines = doc.splitTextToSize(t.name, tableColWidth - 2);
    doc.text(titleLines[0] ?? t.name, curX + tableColWidth / 2, currentY + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(148, 163, 184);
    doc.text(t.calculationModeLabel || 'Média Simples', curX + tableColWidth / 2, currentY + 8.5, { align: 'center' });
    curX += tableColWidth;
  }

  doc.line(curX, currentY, curX, currentY + headerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Média Geral', curX + gpaColWidth / 2, currentY + 7, { align: 'center' });
  curX += gpaColWidth;

  doc.text('Frequência', curX + freqColWidth / 2, currentY + 7, { align: 'center' });

  currentY += headerHeight;

  // Student rows
  const rowHeight = 8.5;
  for (const student of data.students) {
    if (currentY > pageHeight - 35) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    curX = marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const sName = doc.splitTextToSize(student.studentName, studentColWidth - 4);
    doc.text(sName[0] ?? student.studentName, curX + 3, currentY + 5.5);
    curX += studentColWidth;

    for (const t of data.tables) {
      doc.setDrawColor(241, 245, 249);
      doc.line(curX, currentY, curX, currentY + rowHeight);

      const result = student.tableResults.find((r) => r.tableId === t.id);
      const avgStr = result && typeof result.average === 'number' && !Number.isNaN(result.average)
        ? formatGrade(result.average)
        : '—';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(avgStr, curX + tableColWidth / 2, currentY + 5.5, { align: 'center' });

      curX += tableColWidth;
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(curX, currentY, curX, currentY + rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(formatGrade(student.overallAverage), curX + gpaColWidth / 2, currentY + 5.5, { align: 'center' });
    curX += gpaColWidth;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(student.attendanceRateLabel, curX + freqColWidth / 2, currentY + 5.5, { align: 'center' });

    currentY += rowHeight;
  }

  drawWatermarkOnEveryPage(doc, options?.watermarkLogoDataUrl, options?.watermarkText);
  return doc;
}

/**
 * Returns the standardized filename for the student's Boletim PDF.
 */
export function getBoletimPdfFilename(
  data: UnifiedBoletimData,
  customFilename?: string
): string {
  if (customFilename) return customFilename;
  const safeName = safeFilename(data.student?.name || 'Aluno');
  return `Boletim_${safeName || 'Aluno'}.pdf`;
}

/**
 * Builds and returns the jsPDF document for an individual student boletim.
 */
export async function generateBoletimPdfDoc(
  data: UnifiedBoletimData,
  options?: BoletimPdfOptions
): Promise<jsPDF> {
  let qrDataUrl = options?.qrDataUrl;
  if (!qrDataUrl) {
    try {
      const portalCode = data.student?.registrationNumber || data.student?.id || '';
      const publicPortalUrl =
        options?.portalUrl ||
        (typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/aluno/${encodeURIComponent(portalCode)}`
          : `/aluno/${encodeURIComponent(portalCode)}`);
      qrDataUrl = await QRCode.toDataURL(publicPortalUrl, { margin: 0, width: 120 });
    } catch {
      qrDataUrl = undefined;
    }
  }

  let watermarkLogoDataUrl = options?.watermarkLogoDataUrl;
  if (!watermarkLogoDataUrl && options?.watermarkLogoUrl) {
    watermarkLogoDataUrl = (await urlToDataUrl(options.watermarkLogoUrl, options.watermarkGrayscale ?? true)) ?? undefined;
  }

  let logoDataUrl = options?.logoDataUrl;
  if (!logoDataUrl && options?.logoUrl) {
    logoDataUrl = (await urlToDataUrl(options.logoUrl, false)) ?? undefined;
  }

  return buildBoletimPdf(data, { ...options, qrDataUrl, watermarkLogoDataUrl, logoDataUrl });
}

/**
 * Generates and downloads the Boletim PDF for the given student report card data.
 */
export async function exportBoletimPdf(
  data: UnifiedBoletimData,
  customFilename?: string,
  docInstance?: jsPDF,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = docInstance || (await generateBoletimPdfDoc(data, options));
  const filename = getBoletimPdfFilename(data, customFilename);
  doc.save(filename);
}

/**
 * Generates the vector PDF for the student boletim and sends it directly to the browser print dialog.
 */
export async function printBoletimPdf(
  data: UnifiedBoletimData,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = await generateBoletimPdfDoc(data, options);
  doc.autoPrint();
  const blob = doc.output('blob');
  const filename = getBoletimPdfFilename(data, options?.customFilename);
  await printPdfBlob(blob, filename.replace(/\.pdf$/i, ''));
}

/**
 * Builds and returns the jsPDF document for the consolidated class boletim.
 */
export async function generateClassBoletimPdfDoc(
  data: ClassBoletimData,
  options?: BoletimPdfOptions
): Promise<jsPDF> {
  let watermarkLogoDataUrl = options?.watermarkLogoDataUrl;
  if (!watermarkLogoDataUrl && options?.watermarkLogoUrl) {
    watermarkLogoDataUrl = (await urlToDataUrl(options.watermarkLogoUrl, options.watermarkGrayscale ?? true)) ?? undefined;
  }

  let logoDataUrl = options?.logoDataUrl;
  if (!logoDataUrl && options?.logoUrl) {
    logoDataUrl = (await urlToDataUrl(options.logoUrl, false)) ?? undefined;
  }

  return buildClassBoletimPdf(data, { ...options, watermarkLogoDataUrl, logoDataUrl });
}

/**
 * Generates and downloads the Consolidated Class Boletim PDF.
 */
export async function exportClassBoletimPdf(
  data: ClassBoletimData,
  customFilename?: string,
  docInstance?: jsPDF,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = docInstance || (await generateClassBoletimPdfDoc(data, options));
  const filename = customFilename || `Boletim_Consolidado_${safeFilename(data.className)}.pdf`;
  doc.save(filename);
}

/**
 * Generates the vector PDF for the class boletim and sends it directly to the browser print dialog.
 */
export async function printClassBoletimPdf(
  data: ClassBoletimData,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = await generateClassBoletimPdfDoc(data, options);
  doc.autoPrint();
  const blob = doc.output('blob');
  const title = `Boletim Consolidado da Turma - ${data.className}`;
  await printPdfBlob(blob, title);
}

/**
 * Builds and returns the jsPDF document for batch individual class boletins.
 */
export async function generateClassBatchBoletimPdfDoc(
  studentsData: UnifiedBoletimData[],
  className?: string,
  options?: BoletimPdfOptions
): Promise<jsPDF> {
  const qrDataUrlsByStudentId: Record<string, string> = { ...(options?.qrDataUrlsByStudentId ?? {}) };
  for (const studentData of studentsData) {
    const studentId = studentData.student?.id || '';
    if (studentId && !qrDataUrlsByStudentId[studentId]) {
      try {
        const portalCode = studentData.student?.registrationNumber || studentId;
        const publicPortalUrl =
          typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}/aluno/${encodeURIComponent(portalCode)}`
            : `/aluno/${encodeURIComponent(portalCode)}`;
        qrDataUrlsByStudentId[studentId] = await QRCode.toDataURL(publicPortalUrl, { margin: 0, width: 120 });
      } catch {
        // Ignore QR generation error for individual student
      }
    }
  }

  let watermarkLogoDataUrl = options?.watermarkLogoDataUrl;
  if (!watermarkLogoDataUrl && options?.watermarkLogoUrl) {
    watermarkLogoDataUrl = (await urlToDataUrl(options.watermarkLogoUrl, options.watermarkGrayscale ?? true)) ?? undefined;
  }

  let logoDataUrl = options?.logoDataUrl;
  if (!logoDataUrl && options?.logoUrl) {
    logoDataUrl = (await urlToDataUrl(options.logoUrl, false)) ?? undefined;
  }

  return buildClassBatchBoletimPdf(studentsData, {
    ...options,
    qrDataUrlsByStudentId,
    watermarkLogoDataUrl,
    logoDataUrl,
  });
}

/**
 * Generates and downloads a single concatenated PDF containing individual 1-page report cards
 * for all students in a class.
 */
export async function exportClassBatchBoletimPdf(
  studentsData: UnifiedBoletimData[],
  className?: string,
  customFilename?: string,
  docInstance?: jsPDF,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = docInstance || (await generateClassBatchBoletimPdfDoc(studentsData, className, options));
  const resolvedClassName = className || studentsData[0]?.student?.classNames?.[0] || 'Turma';
  const filename = customFilename || `Boletins_Turma_${safeFilename(resolvedClassName)}.pdf`;
  doc.save(filename);
}

/**
 * Generates the concatenated PDF for all student boletins in a class and sends it directly to the browser print dialog.
 */
export async function printClassBatchBoletimPdf(
  studentsData: UnifiedBoletimData[],
  className?: string,
  options?: BoletimPdfOptions
): Promise<void> {
  const doc = await generateClassBatchBoletimPdfDoc(studentsData, className, options);
  doc.autoPrint();
  const blob = doc.output('blob');
  const resolvedClassName = className || studentsData[0]?.student?.classNames?.[0] || 'Turma';
  const title = `Boletins Individuais da Turma - ${resolvedClassName}`;
  await printPdfBlob(blob, title);
}
