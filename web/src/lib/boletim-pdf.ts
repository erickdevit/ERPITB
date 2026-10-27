import { jsPDF, GState } from 'jspdf';
import QRCode from 'qrcode';
import type { ClassBoletimData, UnifiedBoletimData } from './boletim';
import { formatGrade } from './grades';

export interface BoletimPdfOptions {
  qrDataUrl?: string;
  portalUrl?: string;
  watermarkText?: string;
  watermarkLogoUrl?: string;
  watermarkLogoDataUrl?: string;
  watermarkGrayscale?: boolean;
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

  const text = watermarkText || 'INSTITUTO TRANSFORMA BRASIL';
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
 * Builds a vector-based jsPDF A4 landscape document representing the student's unified individual report card
 * matching the exact structure and visual hierarchy of the on-screen student modal.
 */
export function buildBoletimPdf(data: UnifiedBoletimData, options?: BoletimPdfOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2; // 277mm

  let currentY = 10;

  // ==========================================
  // 1. INSTITUTIONAL HEADER (Clean White, No Dark Block)
  // ==========================================
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INSTITUTO TRANSFORMA BRASIL', marginX, currentY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('BOLETIM ESCOLAR INDIVIDUAL', marginX, currentY + 9.5);

  const emissionStr = `Data e Hora de Emissão: ${formatEmissionDate(data.issueDate)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(emissionStr, marginX + contentWidth, currentY + 9.5, { align: 'right' });

  currentY += 12;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);

  currentY += 4;

  // ==========================================
  // 2. UNIFIED STUDENT METADATA & ACADEMIC SUMMARY ROW (SINGLE ROW MATCHING MODAL)
  // ==========================================
  const infoBoxHeight = 15;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, infoBoxHeight, 2, 2, 'FD');

  const student = data.student ?? { name: 'Aluno', id: '', classNames: [] };
  const classStr = student.classNames?.length ? student.classNames.join(', ') : '—';

  // 1. Aluno
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('ALUNO', marginX + 4, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42); // slate-900
  const nameLines = doc.splitTextToSize(student.name || 'Aluno', 60);
  doc.text(nameLines[0] ?? (student.name || 'Aluno'), marginX + 4, currentY + 11);

  // 2. Matrícula
  const colMatriculaX = marginX + 68;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('MATRÍCULA', colMatriculaX, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(student.registrationNumber || '—', colMatriculaX, currentY + 11);

  // 3. Curso
  const colCursoX = marginX + 102;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('CURSO', colCursoX, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59); // slate-800
  const courseLines = doc.splitTextToSize(student.courseName || '—', 52);
  doc.text(courseLines[0] ?? (student.courseName || '—'), colCursoX, currentY + 11);

  // 4. Turma
  const colTurmaX = marginX + 158;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('TURMA', colTurmaX, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  const classLines = doc.splitTextToSize(classStr, 48);
  doc.text(classLines[0] ?? classStr, colTurmaX, currentY + 11);

  // Vertical Divider 1
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX + 210, currentY + 2, marginX + 210, currentY + infoBoxHeight - 2);

  // 5. Média Geral
  const colGpaX = marginX + 214;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('MÉDIA GERAL', colGpaX, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatGrade(data.overallGpa), colGpaX, currentY + 11.5);

  // Vertical Divider 2
  doc.line(marginX + 242, currentY + 2, marginX + 242, currentY + infoBoxHeight - 2);

  // 6. Frequência
  const colFreqX = marginX + 246;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('FREQUÊNCIA', colFreqX, currentY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  const freqStr = `${(Number(data.overallAttendanceRate) || 0).toFixed(1).replace('.', ',')}%`;
  doc.text(freqStr, colFreqX, currentY + 11.5);

  currentY += infoBoxHeight + 5;

  // ==========================================
  // 3. DETALHAMENTO DAS AVALIAÇÕES POR ETAPA (2 COLUNAS DE CARDS MATCHING MODAL)
  // ==========================================
  const modules = data.modules ?? [];
  if (modules.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('DETALHAMENTO DAS AVALIAÇÕES POR ETAPA', marginX, currentY);
    currentY += 3.5;

    const cardWidth = (contentWidth - 6) / 2; // 135.5mm
    const cardGap = 6;
    let leftY = currentY;
    let rightY = currentY;

    modules.forEach((mod, idx) => {
      const isLeft = idx % 2 === 0;
      const cardX = isLeft ? marginX : marginX + cardWidth + cardGap;
      const cardTopY = isLeft ? leftY : rightY;

      const gradesCount = Math.max(1, (mod.grades ?? []).length);
      const cardHeight = 8 + gradesCount * 5.2 + 2;

      // Card Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.roundedRect(cardX, cardTopY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      // Card Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const modNameTruncated = doc.splitTextToSize(mod.moduleName || 'Etapa', cardWidth - 45);
      doc.text(modNameTruncated[0] ?? mod.moduleName, cardX + 3, cardTopY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(100, 116, 139);
      doc.text(mod.calculationModeLabel || 'Média Simples', cardX + 3, cardTopY + 7);

      // Card Final Grade on right
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const finalGradeStr = formatGrade(mod.finalGrade);
      doc.text(finalGradeStr, cardX + cardWidth - 3, cardTopY + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text('média da etapa', cardX + cardWidth - 3, cardTopY + 7.5, { align: 'right' });

      // Divider inside card
      doc.setDrawColor(226, 232, 240);
      doc.line(cardX + 2, cardTopY + 8.5, cardX + cardWidth - 2, cardTopY + 8.5);

      // Grades rows
      let gradeRowY = cardTopY + 9.5;
      if (mod.grades && mod.grades.length > 0) {
        mod.grades.forEach((g) => {
          doc.setFillColor(255, 255, 255);
          doc.rect(cardX + 2, gradeRowY, cardWidth - 4, 4.5, 'F');
          doc.setDrawColor(241, 245, 249);
          doc.rect(cardX + 2, gradeRowY, cardWidth - 4, 4.5, 'S');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(51, 65, 85);
          const gName = doc.splitTextToSize(g.name || 'Avaliação', cardWidth - 32);
          doc.text(gName[0] ?? g.name, cardX + 4, gradeRowY + 3.2);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(15, 23, 42);
          const scoreText = typeof g.score === 'number' && !Number.isNaN(g.score)
            ? `${g.score.toFixed(1).replace('.', ',')} / ${g.maxScore ?? 10}`
            : `— / ${g.maxScore ?? 10}`;
          doc.text(scoreText, cardX + cardWidth - 4, gradeRowY + 3.2, { align: 'right' });

          gradeRowY += 5.2;
        });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184);
        doc.text('Nenhuma avaliação lançada nesta etapa.', cardX + cardWidth / 2, gradeRowY + 3.5, { align: 'center' });
        gradeRowY += 5.2;
      }

      if (isLeft) {
        leftY = cardTopY + cardHeight + 3;
      } else {
        rightY = cardTopY + cardHeight + 3;
      }
    });

    currentY = Math.max(leftY, rightY) + 2;
  }

  // ==========================================
  // 4. SUMMARY FOOTER & CRITERIA
  // ==========================================
  const footerBoxHeight = 14;
  const footerY = Math.max(currentY, pageHeight - 56);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, footerY, contentWidth, footerBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85); // slate-700
  doc.text('CRITÉRIOS DE AVALIAÇÃO E LEGENDA:', marginX + 4, footerY + 4.5);

  const minAtt = (data.criteria?.minAttendanceRate != null ? data.criteria.minAttendanceRate : 75).toFixed(1).replace('.', ',');
  const minPass = (data.criteria?.minPassingGrade != null ? data.criteria.minPassingGrade : 6).toFixed(1).replace('.', ',');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(`• Frequência Mínima: ${minAtt}% das aulas ministradas para aprovação.`, marginX + 4, footerY + 8.5);
  doc.text(`• Média de Aprovação: Nota igual ou superior a ${minPass} na escala de 0,0 a 10,0.`, marginX + 4, footerY + 12);

  // Totals on right
  const totalClasses = modules.reduce((s, m) => s + (Number(m.classesHeld) || 0), 0);
  const totalPres = modules.reduce((s, m) => s + (Number(m.presences) || 0), 0);
  const totalAbs = modules.reduce((s, m) => s + (Number(m.absences) || 0), 0);
  const totalJust = modules.reduce((s, m) => s + (Number(m.justified) || 0), 0);

  const totalsStr = `Aulas: ${totalClasses}   |   Presenças: ${totalPres}   |   Faltas: ${totalAbs}${totalJust > 0 ? `   |   Justificadas: ${totalJust}` : ''}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(totalsStr, marginX + contentWidth - 4, footerY + 8.5, { align: 'right' });

  // ==========================================
  // 5. FORMAL SIGNATURES AREA
  // ==========================================
  const sigY = footerY + footerBoxHeight + 9;
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
  doc.text('Instituto Transforma Brasil', sig1X + sigLineWidth / 2, sigY + 6.5, { align: 'center' });

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
  // 6. INSTITUTIONAL FOOTER WITH QR CODE (BOTTOM-RIGHT)
  // ==========================================
  const bottomFooterY = pageHeight - 16;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, bottomFooterY, marginX + contentWidth, bottomFooterY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('ERPITB — Relatório Acadêmico', marginX, bottomFooterY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento oficial emitido pelo Sistema de Gestão ERPITB — Instituto Transforma Brasil.', marginX, bottomFooterY + 9);

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
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INSTITUTO TRANSFORMA BRASIL', marginX, currentY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('BOLETIM CONSOLIDADO DA TURMA', marginX, currentY + 9.5);

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

  // Footer notes & signatures
  const sigY = Math.min(currentY + 12, pageHeight - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Critérios: Frequência mínima de 75,0% e média mínima 6,0. Documento gerado eletronicamente pelo Sistema ERPITB.',
    marginX,
    sigY
  );

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
 * Generates and downloads the Boletim PDF for the given student report card data.
 */
export async function exportBoletimPdf(
  data: UnifiedBoletimData,
  customFilename?: string,
  docInstance?: jsPDF,
  options?: BoletimPdfOptions
): Promise<void> {
  let doc = docInstance;
  if (!doc) {
    let qrDataUrl = options?.qrDataUrl;
    if (!qrDataUrl) {
      try {
        const portalCode = data.student?.registrationNumber || data.student?.id || '';
        const publicPortalUrl =
          options?.portalUrl ||
          (typeof window !== 'undefined' && window.location?.origin
            ? `${window.location.origin}/aluno/${encodeURIComponent(portalCode)}`
            : `https://erp.itbcursos.com/aluno/${encodeURIComponent(portalCode)}`);
        qrDataUrl = await QRCode.toDataURL(publicPortalUrl, { margin: 0, width: 120 });
      } catch {
        qrDataUrl = undefined;
      }
    }

    let watermarkLogoDataUrl = options?.watermarkLogoDataUrl;
    if (!watermarkLogoDataUrl && options?.watermarkLogoUrl) {
      watermarkLogoDataUrl = (await urlToDataUrl(options.watermarkLogoUrl, options.watermarkGrayscale ?? true)) ?? undefined;
    }

    doc = buildBoletimPdf(data, { ...options, qrDataUrl, watermarkLogoDataUrl });
  }

  const filename = getBoletimPdfFilename(data, customFilename);
  doc.save(filename);
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
  let doc = docInstance;
  if (!doc) {
    let watermarkLogoDataUrl = options?.watermarkLogoDataUrl;
    if (!watermarkLogoDataUrl && options?.watermarkLogoUrl) {
      watermarkLogoDataUrl = (await urlToDataUrl(options.watermarkLogoUrl, options.watermarkGrayscale ?? true)) ?? undefined;
    }
    doc = buildClassBoletimPdf(data, { ...options, watermarkLogoDataUrl });
  }
  const filename = customFilename || `Boletim_Consolidado_${safeFilename(data.className)}.pdf`;
  doc.save(filename);
}
