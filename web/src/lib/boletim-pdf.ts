import { jsPDF } from 'jspdf';
import type { UnifiedBoletimData } from './boletim';

/**
 * Formats a Date/ISO string to Brazilian format: DD/MM/AAAA HH:mm
 */
function formatEmissionDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * Builds a vector-based jsPDF A4 portrait document representing the student's unified report card.
 */
export function buildBoletimPdf(data: UnifiedBoletimData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 186mm

  let currentY = 12;

  // ==========================================
  // 1. INSTITUTIONAL HEADER
  // ==========================================
  // Navy header banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(marginX, currentY, contentWidth, 24, 'F');

  // Sky blue accent line at top
  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(marginX, currentY, contentWidth, 1.5, 'F');

  // Institutional titles
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('INSTITUTO TRANSFORMA BRASIL', marginX + 6, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('SISTEMA DE CONTROLE DE FREQUÊNCIA E DESEMPENHO ACADÊMICO', marginX + 6, currentY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('BOLETIM ESCOLAR INDIVIDUAL', marginX + 6, currentY + 19.5);

  // Emission date on the right
  const emissionStr = `Emissão: ${formatEmissionDate(data.issueDate)}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(emissionStr, marginX + contentWidth - 6, currentY + 19.5, { align: 'right' });

  currentY += 28;

  // ==========================================
  // 2. STUDENT METADATA BOX
  // ==========================================
  const infoBoxHeight = 22;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, infoBoxHeight, 2, 2, 'FD');

  // Left column: Aluno and Curso
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Aluno:', marginX + 5, currentY + 6.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const studentNameLines = doc.splitTextToSize(data.student.name, 90);
  doc.text(studentNameLines[0] ?? data.student.name, marginX + 22, currentY + 6.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Curso:', marginX + 5, currentY + 15.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const courseLines = doc.splitTextToSize(data.student.courseName || '—', 90);
  doc.text(courseLines[0] ?? (data.student.courseName || '—'), marginX + 22, currentY + 15.5);

  // Right column: Matrícula and Turma(s)
  const rightColX = marginX + 115;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Matrícula:', rightColX, currentY + 6.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(data.student.registrationNumber || '—', rightColX + 20, currentY + 6.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Turma(s):', rightColX, currentY + 15.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const classNamesStr = data.student.classNames.length ? data.student.classNames.join(', ') : '—';
  const classLines = doc.splitTextToSize(classNamesStr, 50);
  doc.text(classLines[0] ?? classNamesStr, rightColX + 20, currentY + 15.5);

  currentY += infoBoxHeight + 5;

  // ==========================================
  // 3. CONSOLIDATED TABLE
  // ==========================================
  // Columns definition: Total 186mm
  const cols = [
    { title: 'Módulo / Disciplina', width: 44, align: 'left' as const },
    { title: 'Aulas', width: 13, align: 'center' as const },
    { title: 'Pres.', width: 13, align: 'center' as const },
    { title: 'Faltas', width: 13, align: 'center' as const },
    { title: 'Just.', width: 13, align: 'center' as const },
    { title: 'Freq %', width: 16, align: 'center' as const },
    { title: 'Avaliações Parciais', width: 40, align: 'left' as const },
    { title: 'Média', width: 14, align: 'center' as const },
    { title: 'Situação', width: 20, align: 'center' as const },
  ];

  // Table header
  const headerHeight = 8;
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(marginX, currentY, contentWidth, headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  let headerX = marginX;
  for (const col of cols) {
    const textX = col.align === 'center' ? headerX + col.width / 2 : headerX + 2;
    doc.text(col.title, textX, currentY + 5.2, { align: col.align });
    headerX += col.width;
  }

  currentY += headerHeight;

  // Table rows
  const rowHeight = 8.5;
  let isZebra = false;

  for (const mod of data.modules) {
    // Check page overflow
    if (currentY + rowHeight > pageHeight - 50) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFillColor(isZebra ? 248 : 255, isZebra ? 250 : 255, isZebra ? 252 : 255);
    doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');

    // Horizontal bottom line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    // Format grades text
    const gradesText = mod.grades.length > 0
      ? mod.grades.map((g) => `${g.name}: ${g.score !== null ? g.score.toFixed(1) : '—'}`).join(' | ')
      : '—';

    let colX = marginX;
    doc.setFontSize(7);

    // 1. Module Name
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    const modLines = doc.splitTextToSize(mod.moduleName, cols[0].width - 4);
    doc.text(modLines[0] ?? mod.moduleName, colX + 2, currentY + 5.5);
    colX += cols[0].width;

    // 2. Classes Held
    doc.setFont('helvetica', 'normal');
    doc.text(String(mod.classesHeld), colX + cols[1].width / 2, currentY + 5.5, { align: 'center' });
    colX += cols[1].width;

    // 3. Presences
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(String(mod.presences), colX + cols[2].width / 2, currentY + 5.5, { align: 'center' });
    colX += cols[2].width;

    // 4. Absences
    doc.setTextColor(mod.absences > 0 ? 225 : 100, mod.absences > 0 ? 29 : 116, mod.absences > 0 ? 72 : 139); // rose-600 or slate-500
    doc.text(String(mod.absences), colX + cols[3].width / 2, currentY + 5.5, { align: 'center' });
    colX += cols[3].width;

    // 5. Justified
    doc.setTextColor(71, 85, 105);
    doc.text(String(mod.justified), colX + cols[4].width / 2, currentY + 5.5, { align: 'center' });
    colX += cols[4].width;

    // 6. Attendance Rate
    doc.setFont('helvetica', 'bold');
    const isFreqGood = mod.attendanceRate >= data.criteria.minAttendanceRate;
    doc.setTextColor(isFreqGood ? 16 : 225, isFreqGood ? 185 : 29, isFreqGood ? 129 : 72);
    doc.text(`${mod.attendanceRate.toFixed(1)}%`, colX + cols[5].width / 2, currentY + 5.5, { align: 'center' });
    colX += cols[5].width;

    // 7. Grades
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const gradeLines = doc.splitTextToSize(gradesText, cols[6].width - 4);
    doc.text(gradeLines[0] ?? gradesText, colX + 2, currentY + 5.5);
    colX += cols[6].width;

    // 8. Final Grade
    doc.setFont('helvetica', 'bold');
    if (mod.finalGrade !== null) {
      const isGradeGood = mod.finalGrade >= data.criteria.minPassingGrade;
      doc.setTextColor(isGradeGood ? 15 : 225, isGradeGood ? 23 : 29, isGradeGood ? 42 : 72);
      doc.text(mod.finalGrade.toFixed(1), colX + cols[7].width / 2, currentY + 5.5, { align: 'center' });
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text('—', colX + cols[7].width / 2, currentY + 5.5, { align: 'center' });
    }
    colX += cols[7].width;

    // 9. Academic Status
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    if (mod.academicStatus === 'Aprovado') {
      doc.setTextColor(5, 150, 105); // emerald-600
    } else if (mod.academicStatus === 'Em Andamento') {
      doc.setTextColor(2, 132, 199); // sky-600
    } else if (mod.academicStatus === 'Sem Notas') {
      doc.setTextColor(100, 116, 139); // slate-500
    } else {
      doc.setTextColor(225, 29, 72); // rose-600
    }
    doc.text(mod.academicStatus, colX + cols[8].width / 2, currentY + 5.5, { align: 'center' });

    currentY += rowHeight;
    isZebra = !isZebra;
  }

  // Summary / Totals Row
  const totalClassesHeld = data.modules.reduce((sum, m) => sum + m.classesHeld, 0);
  const totalPresences = data.modules.reduce((sum, m) => sum + m.presences, 0);
  const totalAbsences = data.modules.reduce((sum, m) => sum + m.absences, 0);
  const totalJustified = data.modules.reduce((sum, m) => sum + m.justified, 0);

  const totalRowHeight = 9;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(marginX, currentY, contentWidth, totalRowHeight, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, marginX + contentWidth, currentY);
  doc.line(marginX, currentY + totalRowHeight, marginX + contentWidth, currentY + totalRowHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  let colX = marginX;
  doc.text('TOTAIS / MÉDIA GERAL', colX + 2, currentY + 6);
  colX += cols[0].width;

  doc.text(String(totalClassesHeld), colX + cols[1].width / 2, currentY + 6, { align: 'center' });
  colX += cols[1].width;

  doc.setTextColor(16, 185, 129);
  doc.text(String(totalPresences), colX + cols[2].width / 2, currentY + 6, { align: 'center' });
  colX += cols[2].width;

  doc.setTextColor(totalAbsences > 0 ? 225 : 15, totalAbsences > 0 ? 29 : 23, totalAbsences > 0 ? 72 : 42);
  doc.text(String(totalAbsences), colX + cols[3].width / 2, currentY + 6, { align: 'center' });
  colX += cols[3].width;

  doc.setTextColor(15, 23, 42);
  doc.text(String(totalJustified), colX + cols[4].width / 2, currentY + 6, { align: 'center' });
  colX += cols[4].width;

  const isOverallFreqGood = data.overallAttendanceRate >= data.criteria.minAttendanceRate;
  doc.setTextColor(isOverallFreqGood ? 16 : 225, isOverallFreqGood ? 185 : 29, isOverallFreqGood ? 129 : 72);
  doc.text(`${data.overallAttendanceRate.toFixed(1)}%`, colX + cols[5].width / 2, currentY + 6, { align: 'center' });
  colX += cols[5].width;

  doc.setTextColor(100, 116, 139);
  doc.text('—', colX + cols[6].width / 2, currentY + 6, { align: 'center' });
  colX += cols[6].width;

  if (data.overallGpa !== null) {
    const isOverallGradeGood = data.overallGpa >= data.criteria.minPassingGrade;
    doc.setTextColor(isOverallGradeGood ? 15 : 225, isOverallGradeGood ? 23 : 29, isOverallGradeGood ? 42 : 72);
    doc.text(data.overallGpa.toFixed(1), colX + cols[7].width / 2, currentY + 6, { align: 'center' });
  } else {
    doc.setTextColor(148, 163, 184);
    doc.text('—', colX + cols[7].width / 2, currentY + 6, { align: 'center' });
  }
  colX += cols[7].width;

  doc.setFontSize(7);
  if (data.overallAcademicStatus === 'Aprovado') {
    doc.setTextColor(5, 150, 105);
  } else if (data.overallAcademicStatus === 'Em Andamento') {
    doc.setTextColor(2, 132, 199);
  } else if (data.overallAcademicStatus === 'Sem Notas') {
    doc.setTextColor(100, 116, 139);
  } else {
    doc.setTextColor(225, 29, 72);
  }
  doc.text(data.overallAcademicStatus, colX + cols[8].width / 2, currentY + 6, { align: 'center' });

  currentY += totalRowHeight + 8;

  // ==========================================
  // 4. CRITERIA LEGEND & ACADEMIC STANDING
  // ==========================================
  const legendBoxHeight = 22;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, legendBoxHeight, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Critérios de Avaliação e Legenda:', marginX + 4, currentY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);

  doc.text(
    `• Frequência Mínima Exigida: ${data.criteria.minAttendanceRate.toFixed(1)}% das aulas ministradas.`,
    marginX + 4,
    currentY + 10.5
  );
  doc.text(
    `• Média Mínima para Aprovação: ${data.criteria.minPassingGrade.toFixed(1)} (escala de 0,0 a 10,0).`,
    marginX + 4,
    currentY + 15
  );
  doc.text(
    '• Situações: Aprovado | Reprovado por Nota | Reprovado por Frequência | Reprovado por Nota e Frequência | Em Andamento | Sem Notas.',
    marginX + 4,
    currentY + 19.5
  );

  currentY += legendBoxHeight + 14;

  // ==========================================
  // 5. SIGNATURES AREA
  // ==========================================
  // Ensure signatures fit on page, or push to bottom
  const sigY = Math.max(currentY + 10, pageHeight - 38);

  const sigLineWidth = 75;
  const sig1X = marginX + 10;
  const sig2X = marginX + contentWidth - sigLineWidth - 10;

  doc.setDrawColor(71, 85, 105); // slate-600
  doc.setLineWidth(0.3);

  // Line 1: Coordenação Pedagógica
  doc.line(sig1X, sigY, sig1X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Coordenação Pedagógica / Direção', sig1X + sigLineWidth / 2, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Instituto Transforma Brasil', sig1X + sigLineWidth / 2, sigY + 7.5, { align: 'center' });

  // Line 2: Aluno / Responsável
  doc.line(sig2X, sigY, sig2X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Aluno(a) ou Responsável Legal', sig2X + sigLineWidth / 2, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Aluno / Responsável', sig2X + sigLineWidth / 2, sigY + 7.5, { align: 'center' });

  // Footer note
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Documento gerado eletronicamente pelo Sistema de Frequência ITB. Autenticidade verificável nos registros internos.',
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

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
  const safeName = (data.student.name || 'Aluno')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `Boletim_${safeName || 'Aluno'}.pdf`;
}

/**
 * Generates and downloads the Boletim PDF for the given student report card data.
 */
export async function exportBoletimPdf(
  data: UnifiedBoletimData,
  customFilename?: string,
  docInstance?: jsPDF
): Promise<void> {
  const doc = docInstance || buildBoletimPdf(data);
  const filename = getBoletimPdfFilename(data, customFilename);
  doc.save(filename);
}

