import { jsPDF } from 'jspdf';
import type { ClassBoletimData, UnifiedBoletimData } from './boletim';
import { formatGrade } from './grades';

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

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Builds a vector-based jsPDF A4 portrait document representing the student's unified report card
 * matching the exact consolidated table layout.
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
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(marginX, currentY, contentWidth, 24, 'F');

  // Sky blue accent line at top
  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(marginX, currentY, contentWidth, 1.5, 'F');

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

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Aluno:', marginX + 5, currentY + 6.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const studentNameLines = doc.splitTextToSize(data.student.name, 90);
  doc.text(studentNameLines[0] ?? data.student.name, marginX + 20, currentY + 6.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Curso:', marginX + 5, currentY + 15.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  const courseLines = doc.splitTextToSize(data.student.courseName || '—', 90);
  doc.text(courseLines[0] ?? (data.student.courseName || '—'), marginX + 20, currentY + 15.5);

  // Right column: Matrícula and Turma
  const rightColX = marginX + 115;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Matrícula:', rightColX, currentY + 6.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(data.student.registrationNumber || '—', rightColX + 20, currentY + 6.5);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Turma(s):', rightColX, currentY + 15.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  const classStr = data.student.classNames.length ? data.student.classNames.join(', ') : '—';
  const classLines = doc.splitTextToSize(classStr, 48);
  doc.text(classLines[0] ?? classStr, rightColX + 20, currentY + 15.5);

  currentY += infoBoxHeight + 6;

  // ==========================================
  // 3. CONSOLIDATED BOLETIM TABLE (MATCHING SCREENSHOT)
  // ==========================================
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Boletim Consolidado — ${classStr}`, marginX, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Médias por tabela/etapa, média geral acumulada, frequência e situação acadêmica.', marginX, currentY + 4);

  currentY += 7;

  // Compute column widths
  // Aluno: 45mm, Média Geral: 22mm, Freq: 20mm, Situação: 26mm
  // Remaining space divided among modules
  const fixedColsWidth = 45 + 22 + 20 + 26; // 113mm
  const remainingWidth = contentWidth - fixedColsWidth; // 73mm
  const modCount = Math.max(1, data.modules.length);
  const modColWidth = remainingWidth / modCount;

  // Table header background (light slate-50)
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
  curX += 45;

  for (const mod of data.modules) {
    doc.line(curX, currentY, curX, currentY + headerHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    const modTitle = doc.splitTextToSize(mod.moduleName, modColWidth - 2);
    doc.text(modTitle[0] ?? mod.moduleName, curX + modColWidth / 2, currentY + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(mod.calculationModeLabel || 'Média Simples', curX + modColWidth / 2, currentY + 8.5, { align: 'center' });
    curX += modColWidth;
  }

  doc.line(curX, currentY, curX, currentY + headerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Média Geral', curX + 11, currentY + 7, { align: 'center' });
  curX += 22;

  doc.text('Frequência', curX + 10, currentY + 7, { align: 'center' });
  curX += 20;

  doc.text('Situação', curX + 13, currentY + 7, { align: 'center' });

  currentY += headerHeight;

  // Student row
  const rowHeight = 12;
  doc.setFillColor(255, 255, 255);
  doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
  doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

  curX = marginX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(data.student.name, 42);
  doc.text(nameLines[0] ?? data.student.name, curX + 3, currentY + 7);
  curX += 45;

  for (const mod of data.modules) {
    doc.setDrawColor(241, 245, 249);
    doc.line(curX, currentY, curX, currentY + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    const gradeStr = formatGrade(mod.finalGrade);
    doc.text(gradeStr, curX + modColWidth / 2, currentY + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    const evalCount = mod.grades.filter((g) => g.score !== null).length;
    doc.text(`${evalCount}/${mod.grades.length} aval.`, curX + modColWidth / 2, currentY + 9, { align: 'center' });

    curX += modColWidth;
  }

  doc.setDrawColor(241, 245, 249);
  doc.line(curX, currentY, curX, currentY + rowHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(formatGrade(data.overallGpa), curX + 11, currentY + 7, { align: 'center' });
  curX += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`${data.overallAttendanceRate.toFixed(1).replace('.', ',')}%`, curX + 10, currentY + 7, { align: 'center' });
  curX += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  if (data.overallAcademicStatus === 'Aprovado') {
    doc.setTextColor(5, 150, 105);
  } else if (data.overallAcademicStatus === 'Em Andamento') {
    doc.setTextColor(2, 132, 199);
  } else if (data.overallAcademicStatus === 'Sem Notas') {
    doc.setTextColor(100, 116, 139);
  } else {
    doc.setTextColor(225, 29, 72);
  }
  doc.text(data.overallAcademicStatus, curX + 13, currentY + 7, { align: 'center' });

  currentY += rowHeight + 8;

  // ==========================================
  // 4. DETAILED EVALUATIONS BREAKDOWN
  // ==========================================
  const modulesWithGrades = data.modules.filter((m) => m.grades.length > 0);
  if (modulesWithGrades.length > 0 && currentY < pageHeight - 80) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('DETALHAMENTO DAS AVALIAÇÕES POR ETAPA', marginX, currentY);
    currentY += 4.5;

    for (const mod of modulesWithGrades) {
      if (currentY > pageHeight - 65) break;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      const subHeaderHeight = 6;
      doc.rect(marginX, currentY, contentWidth, subHeaderHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      doc.text(`${mod.moduleName} (${mod.calculationModeLabel || 'Média Simples'})`, marginX + 3, currentY + 4.2);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Média: ${formatGrade(mod.finalGrade)}`, marginX + contentWidth - 4, currentY + 4.2, { align: 'right' });
      currentY += subHeaderHeight;

      for (const g of mod.grades) {
        if (currentY > pageHeight - 55) break;
        doc.setFillColor(255, 255, 255);
        doc.rect(marginX, currentY, contentWidth, 5, 'F');
        doc.setDrawColor(241, 245, 249);
        doc.line(marginX, currentY + 5, marginX + contentWidth, currentY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(51, 65, 85);
        doc.text(g.name, marginX + 6, currentY + 3.5);

        const scoreStr = g.score !== null ? `${g.score.toFixed(1).replace('.', ',')} / ${g.maxScore}` : `— / ${g.maxScore}`;
        doc.setFont('helvetica', 'bold');
        doc.text(scoreStr, marginX + contentWidth - 6, currentY + 3.5, { align: 'right' });
        currentY += 5;
      }
      currentY += 2;
    }
  }

  // ==========================================
  // 5. SUMMARY FOOTER & CRITERIA
  // ==========================================
  const footerBoxHeight = 16;
  const footerY = Math.min(Math.max(currentY + 2, pageHeight - 52), pageHeight - 48);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, footerY, contentWidth, footerBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('CRITÉRIOS DE AVALIAÇÃO E LEGENDA:', marginX + 4, footerY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `• Frequência Mínima: ${data.criteria.minAttendanceRate.toFixed(1)}% das aulas ministradas para aprovação.`,
    marginX + 4,
    footerY + 9.5
  );
  doc.text(
    `• Média de Aprovação: Nota igual ou superior a ${data.criteria.minPassingGrade.toFixed(1)} na escala de 0,0 a 10,0.`,
    marginX + 4,
    footerY + 13.5
  );

  // Totals on right
  const totalClasses = data.modules.reduce((s, m) => s + m.classesHeld, 0);
  const totalPres = data.modules.reduce((s, m) => s + m.presences, 0);
  const totalAbs = data.modules.reduce((s, m) => s + m.absences, 0);
  const totalsStr = `Aulas: ${totalClasses}  |  Presenças: ${totalPres}  |  Faltas: ${totalAbs}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(totalsStr, marginX + contentWidth - 4, footerY + 9.5, { align: 'right' });

  // ==========================================
  // 6. FORMAL SIGNATURES
  // ==========================================
  const sigY = footerY + footerBoxHeight + 11;
  const sigLineWidth = 60;
  const sig1X = marginX + 16;
  const sig2X = marginX + contentWidth - sigLineWidth - 16;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);

  doc.line(sig1X, sigY, sig1X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('Coordenação Pedagógica / Direção', sig1X + sigLineWidth / 2, sigY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Instituto Transforma Brasil', sig1X + sigLineWidth / 2, sigY + 6.5, { align: 'center' });

  doc.line(sig2X, sigY, sig2X + sigLineWidth, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.text('Aluno(a) ou Responsável Legal', sig2X + sigLineWidth / 2, sigY + 3.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Aluno / Responsável', sig2X + sigLineWidth / 2, sigY + 6.5, { align: 'center' });

  return doc;
}

/**
 * Builds a vector-based jsPDF A4 document representing the Consolidated Class Boletim
 * matching the exact table in the screenshot.
 */
export function buildClassBoletimPdf(data: ClassBoletimData): jsPDF {
  const isLandscape = data.tables.length > 3;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  const marginX = 10;
  const contentWidth = pageWidth - marginX * 2;

  let currentY = 10;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(marginX, currentY, contentWidth, 20, 'F');

  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(marginX, currentY, contentWidth, 1.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('INSTITUTO TRANSFORMA BRASIL', marginX + 5, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  doc.text('SISTEMA DE CONTROLE DE FREQUÊNCIA E DESEMPENHO ACADÊMICO', marginX + 5, currentY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`BOLETIM CONSOLIDADO — ${data.className}`, marginX + 5, currentY + 16.5);

  const emissionStr = `Emissão: ${formatEmissionDate(data.issueDate || new Date().toISOString())}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  doc.text(emissionStr, marginX + contentWidth - 5, currentY + 16.5, { align: 'right' });

  currentY += 23;

  // Metadata Strip
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  const metaHeight = 9;
  doc.rect(marginX, currentY, contentWidth, metaHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Curso: ${data.courseName || '—'}`, marginX + 4, currentY + 6);
  doc.text(`Turma: ${data.className}`, marginX + 90, currentY + 6);
  doc.text(`Total de Alunos: ${data.totalStudents}`, marginX + 160, currentY + 6);
  if (data.classAverage !== null) {
    doc.text(`Média da Turma: ${formatGrade(data.classAverage)}`, marginX + contentWidth - 4, currentY + 6, { align: 'right' });
  }

  currentY += metaHeight + 4;

  // Calculate table column widths
  const studentColWidth = isLandscape ? 60 : 45;
  const gpaColWidth = 20;
  const freqColWidth = 20;
  const statusColWidth = 26;
  const fixedWidth = studentColWidth + gpaColWidth + freqColWidth + statusColWidth;
  const tableColWidth = (contentWidth - fixedWidth) / Math.max(1, data.tables.length);

  // Table Header
  const headerHeight = 11;
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, currentY, contentWidth, headerHeight, 'F');
  doc.setDrawColor(226, 232, 240);
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
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(t.calculationModeLabel, curX + tableColWidth / 2, currentY + 8.5, { align: 'center' });
    curX += tableColWidth;
  }

  doc.line(curX, currentY, curX, currentY + headerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Média Geral', curX + gpaColWidth / 2, currentY + 7, { align: 'center' });
  curX += gpaColWidth;

  doc.text('Frequência', curX + freqColWidth / 2, currentY + 7, { align: 'center' });
  curX += freqColWidth;

  doc.text('Situação', curX + statusColWidth / 2, currentY + 7, { align: 'center' });

  currentY += headerHeight;

  // Student Rows
  const rowHeight = 9.5;
  for (const student of data.students) {
    if (currentY + rowHeight > pageHeight - 25) {
      doc.addPage();
      currentY = 12;
    }

    doc.setFillColor(255, 255, 255);
    doc.rect(marginX, currentY, contentWidth, rowHeight, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, currentY + rowHeight, marginX + contentWidth, currentY + rowHeight);

    curX = marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    const studentLines = doc.splitTextToSize(student.studentName, studentColWidth - 4);
    doc.text(studentLines[0] ?? student.studentName, curX + 3, currentY + 6);
    curX += studentColWidth;

    for (const tr of student.tableResults) {
      doc.setDrawColor(241, 245, 249);
      doc.line(curX, currentY, curX, currentY + rowHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(formatGrade(tr.average), curX + tableColWidth / 2, currentY + 4.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${tr.evaluatedCount}/${tr.totalItems} aval.`, curX + tableColWidth / 2, currentY + 8, { align: 'center' });

      curX += tableColWidth;
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(curX, currentY, curX, currentY + rowHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(formatGrade(student.overallAverage), curX + gpaColWidth / 2, currentY + 6, { align: 'center' });
    curX += gpaColWidth;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(student.attendanceRateLabel, curX + freqColWidth / 2, currentY + 6, { align: 'center' });
    curX += freqColWidth;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    if (student.overallStatus === 'aprovado') {
      doc.setTextColor(5, 150, 105);
    } else if (student.overallStatus === 'em_andamento') {
      doc.setTextColor(2, 132, 199);
    } else {
      doc.setTextColor(225, 29, 72);
    }
    doc.text(student.overallStatusLabel, curX + statusColWidth / 2, currentY + 6, { align: 'center' });

    currentY += rowHeight;
  }

  // Footer notes & signatures
  const sigY = Math.min(currentY + 12, pageHeight - 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Critérios: Frequência mínima de 75,0% e média mínima 6,0. Documento gerado eletronicamente pelo Sistema Frequência ITB.',
    marginX,
    sigY
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
  const safeName = safeFilename(data.student.name || 'Aluno');
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

/**
 * Generates and downloads the Consolidated Class Boletim PDF.
 */
export async function exportClassBoletimPdf(
  data: ClassBoletimData,
  customFilename?: string,
  docInstance?: jsPDF
): Promise<void> {
  const doc = docInstance || buildClassBoletimPdf(data);
  const filename = customFilename || `Boletim_Consolidado_${safeFilename(data.className)}.pdf`;
  doc.save(filename);
}
