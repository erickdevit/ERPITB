import { decryptText } from './crypto';
import { AppError } from './http';
import { requireScope } from './rbac';
import type { AttendanceStatus, AuthUser, Env } from './types';

export interface ReportPayload {
  type: string;
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string }>;
  headers: string[];
  rows: Array<Array<string | number>>;
  context: string[];
  notices: string[];
  matrix: boolean;
  boletimData?: unknown;
}

export async function generateReportData(env: Env, user: AuthUser, url: URL): Promise<ReportPayload> {
  requireScope(user, 'reports:read', 'reports:finance');

  const type = url.searchParams.get('type') || 'institutional';
  const from = url.searchParams.get('from') || '2026-01-01';
  const to = url.searchParams.get('to') || '2026-12-31';
  const classId = url.searchParams.get('classId') || undefined;
  const courseId = url.searchParams.get('courseId') || undefined;
  const studentId = url.searchParams.get('studentId') || undefined;

  const isFinancialReport = type === 'financial' || type === 'fees' || type === 'cash';
  if (user.role === 'financeiro' && !isFinancialReport) {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }
  if (isFinancialReport && user.role !== 'admin' && user.role !== 'financeiro') {
    throw new AppError(403, 'Acesso restrito ao setor financeiro.', 'FORBIDDEN');
  }

  // 1. Institutional Report
  if (type === 'institutional') {
    const courses = await env.DB.prepare(`
      SELECT co.id, co.name,
             COUNT(DISTINCT c.id) AS classes_count,
             COUNT(DISTINCT e.student_id) AS students_count
        FROM courses co
        LEFT JOIN classes c ON c.course_id = co.id AND c.deleted_at IS NULL
        LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ativa' AND e.deleted_at IS NULL
       WHERE co.deleted_at IS NULL
       GROUP BY co.id, co.name
       ORDER BY co.name
    `).all<{ id: string; name: string; classes_count: number; students_count: number }>();

    const attRow = await env.DB.prepare(`
      SELECT COUNT(*) AS total_records,
             SUM(CASE WHEN status IN ('P', 'RC') THEN 1 ELSE 0 END) AS present_count
        FROM attendance_records
       WHERE date >= ? AND date <= ? AND deleted_at IS NULL
    `).bind(from, to).first<{ total_records: number; present_count: number }>();

    const totalRecords = attRow?.total_records ?? 0;
    const presentRecords = attRow?.present_count ?? 0;
    const overallRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 1000) / 10 : 100;

    const rows = courses.results.map((c) => [
      c.name,
      c.classes_count,
      c.students_count,
      `${overallRate}%`,
    ]);

    return {
      type,
      title: 'Relatório Institucional',
      description: 'Visão macro consolidada de cursos, turmas, alunos e engajamento geral da instituição.',
      metrics: [
        { label: 'Cursos Ativos', value: String(courses.results.length) },
        { label: 'Total de Turmas', value: String(courses.results.reduce((a, b) => a + b.classes_count, 0)) },
        { label: 'Alunos Ativos', value: String(courses.results.reduce((a, b) => a + b.students_count, 0)) },
        { label: 'Frequência Geral', value: `${overallRate}%` },
      ],
      headers: ['Curso', 'Turmas', 'Alunos Ativos', 'Taxa Média'],
      rows,
      context: [`Período: ${from} a ${to}`],
      notices: [],
      matrix: false,
    };
  }

  // 2. Class Diary (Diário de Classe)
  if (type === 'classDiary') {
    if (!classId) {
      throw new AppError(400, 'Selecione uma turma para gerar o Diário de Classe.', 'VALIDATION_ERROR');
    }

    const classRow = await env.DB.prepare(`
      SELECT c.id, c.name, c.shift, co.name AS course_name
        FROM classes c
        JOIN courses co ON co.id = c.course_id
       WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1
    `).bind(classId).first<{ id: string; name: string; shift: string; course_name: string }>();

    if (!classRow) {
      throw new AppError(404, 'Turma não encontrada.', 'NOT_FOUND');
    }

    // Get active/completed enrollments for this class
    const enrollments = await env.DB.prepare(`
      SELECT e.student_id, e.status, s.encrypted_name, s.registration_number
        FROM enrollments e
        JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
       WHERE e.class_id = ? AND e.deleted_at IS NULL
       ORDER BY s.registration_number ASC
    `).bind(classId).all<{ student_id: string; status: string; encrypted_name: string; registration_number: string }>();

    // Get distinct dates for this class in period
    const datesQuery = await env.DB.prepare(`
      SELECT DISTINCT date
        FROM attendance_records
       WHERE class_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
       ORDER BY date ASC
    `).bind(classId, from, to).all<{ date: string }>();

    const dates = datesQuery.results.map((d) => d.date);

    // Get attendance records
    const records = await env.DB.prepare(`
      SELECT student_id, date, status
        FROM attendance_records
       WHERE class_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
    `).bind(classId, from, to).all<{ student_id: string; date: string; status: AttendanceStatus }>();

    const recordMap = new Map<string, string>();
    for (const r of records.results) {
      recordMap.set(`${r.student_id}_${r.date}`, r.status);
    }

    const headers = ['Matrícula', 'Aluno', ...dates, 'Presenças', 'Faltas', '% Freq.'];
    const rows: Array<Array<string | number>> = [];

    for (const e of enrollments.results) {
      let name = `Aluno ${e.registration_number || ''}`;
      try {
        name = await decryptText(env, e.encrypted_name);
      } catch {}

      let presences = 0;
      let absences = 0;
      const statusCols: string[] = [];

      for (const d of dates) {
        const st = recordMap.get(`${e.student_id}_${d}`) || '-';
        statusCols.push(st);
        if (st === 'P' || st === 'RC') presences += 1;
        else if (st === 'F') absences += 1;
      }

      const totalMarked = presences + absences;
      const freqRate = totalMarked > 0 ? `${Math.round((presences / totalMarked) * 100)}%` : '100%';

      rows.push([e.registration_number, name, ...statusCols, presences, absences, freqRate]);
    }

    return {
      type,
      title: `Diário de Classe - ${classRow.name}`,
      description: `Registro consolidado de presença diária por estudante para a turma ${classRow.name} (${classRow.course_name}).`,
      metrics: [
        { label: 'Turma', value: classRow.name },
        { label: 'Curso', value: classRow.course_name },
        { label: 'Turno', value: classRow.shift },
        { label: 'Aulas Realizadas', value: String(dates.length) },
        { label: 'Alunos Listados', value: String(enrollments.results.length) },
      ],
      headers,
      rows,
      context: [`Turma: ${classRow.name}`, `Curso: ${classRow.course_name}`, `Período: ${from} a ${to}`],
      notices: [],
      matrix: true,
    };
  }

  // 3. Dropout Risk Report (Risco de Evasão)
  if (type === 'dropoutRisk') {
    const attRecords = await env.DB.prepare(`
      SELECT a.student_id, a.date, a.status,
             s.encrypted_name, s.registration_number,
             c.id AS class_id, c.name AS class_name, co.name AS course_name
        FROM attendance_records a
        JOIN students s ON s.id = a.student_id AND s.deleted_at IS NULL
        JOIN classes c ON c.id = a.class_id AND c.deleted_at IS NULL
        JOIN courses co ON co.id = c.course_id
       WHERE a.date >= ? AND a.date <= ? AND a.deleted_at IS NULL
       ORDER BY a.date ASC
    `).bind(from, to).all<{
      student_id: string; date: string; status: AttendanceStatus;
      encrypted_name: string; registration_number: string;
      class_id: string; class_name: string; course_name: string;
    }>();

    const studentMap = new Map<string, {
      studentId: string; encryptedName: string; registrationNumber: string;
      className: string; courseName: string; absences: number; present: number; total: number;
      consecutiveAbsences: number; maxConsecutiveAbsences: number;
    }>();

    for (const r of attRecords.results) {
      const s = studentMap.get(r.student_id) ?? {
        studentId: r.student_id,
        encryptedName: r.encrypted_name,
        registrationNumber: r.registration_number,
        className: r.class_name,
        courseName: r.course_name,
        absences: 0,
        present: 0,
        total: 0,
        consecutiveAbsences: 0,
        maxConsecutiveAbsences: 0,
      };
      s.total += 1;
      if (r.status === 'F') {
        s.absences += 1;
        s.consecutiveAbsences += 1;
        if (s.consecutiveAbsences > s.maxConsecutiveAbsences) s.maxConsecutiveAbsences = s.consecutiveAbsences;
      } else {
        if (r.status === 'P' || r.status === 'RC') s.present += 1;
        s.consecutiveAbsences = 0;
      }
      studentMap.set(r.student_id, s);
    }

    const atRisk = Array.from(studentMap.values()).filter((s) => {
      const rate = s.total > 0 ? (s.present / s.total) * 100 : 100;
      return rate < 75 || s.maxConsecutiveAbsences >= 3;
    });

    const rows: Array<Array<string | number>> = [];
    for (const s of atRisk) {
      let name = `Aluno ${s.registrationNumber || ''}`;
      try {
        name = await decryptText(env, s.encryptedName);
      } catch {}
      const rate = s.total > 0 ? `${Math.round((s.present / s.total) * 100)}%` : '100%';
      const reason = s.maxConsecutiveAbsences >= 3 && (s.present / s.total) * 100 < 75
        ? 'Baixa frequência e faltas consecutivas'
        : s.maxConsecutiveAbsences >= 3
        ? 'Faltas consecutivas (3+)'
        : 'Frequência abaixo de 75%';

      rows.push([s.registrationNumber, name, s.className, s.courseName, s.absences, rate, reason]);
    }

    return {
      type,
      title: 'Relatório de Risco de Evasão',
      description: 'Estudantes com frequência abaixo de 75% ou com 3 ou mais faltas consecutivas no período.',
      metrics: [
        { label: 'Alunos em Risco', value: String(rows.length) },
        { label: 'Período Auditado', value: `${from} a ${to}` },
      ],
      headers: ['Matrícula', 'Aluno', 'Turma', 'Curso', 'Faltas', 'Taxa', 'Motivo do Alerta'],
      rows,
      context: [`Período: ${from} a ${to}`],
      notices: rows.length === 0 ? ['Nenhum aluno identificado em risco no período analisado.'] : [],
      matrix: false,
    };
  }

  // 4. Student Boletim Report (Boletim Escolar no Servidor)
  if (type === 'studentBoletim') {
    if (!studentId) {
      throw new AppError(400, 'Selecione um estudante para gerar o Boletim Escolar.', 'VALIDATION_ERROR');
    }

    const studentRow = await env.DB.prepare(`
      SELECT id, encrypted_name, registration_number, status
        FROM students
       WHERE id = ? AND deleted_at IS NULL LIMIT 1
    `).bind(studentId).first<{ id: string; encrypted_name: string; registration_number: string; status: string }>();

    if (!studentRow) {
      throw new AppError(404, 'Estudante não encontrado.', 'NOT_FOUND');
    }

    let studentName = `Aluno ${studentRow.registration_number || ''}`;
    try {
      studentName = await decryptText(env, studentRow.encrypted_name);
    } catch {}

    const enrollments = await env.DB.prepare(`
      SELECT e.class_id, e.status, c.name AS class_name, co.name AS course_name
        FROM enrollments e
        JOIN classes c ON c.id = e.class_id AND c.deleted_at IS NULL
        JOIN courses co ON co.id = c.course_id
       WHERE e.student_id = ? AND e.deleted_at IS NULL
    `).bind(studentId).all<{ class_id: string; status: string; class_name: string; course_name: string }>();

    const attRow = await env.DB.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status IN ('P', 'RC') THEN 1 ELSE 0 END) AS presences,
             SUM(CASE WHEN status = 'F' THEN 1 ELSE 0 END) AS absences
        FROM attendance_records
       WHERE student_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
    `).bind(studentId, from, to).first<{ total: number; presences: number; absences: number }>();

    const gradesQuery = await env.DB.prepare(`
      SELECT gt.name AS table_name, gt.passing_grade, gt.calculation_mode,
             gi.name AS item_name, gi.category, gi.max_score, gi.weight,
             sg.score
        FROM student_grades sg
        JOIN grade_tables gt ON gt.id = sg.grade_table_id AND gt.deleted_at IS NULL
        JOIN grade_items gi ON gi.id = sg.grade_item_id AND gi.deleted_at IS NULL
       WHERE sg.student_id = ? AND sg.deleted_at IS NULL
       ORDER BY gt.sort_order ASC, gi.sort_order ASC
    `).bind(studentId).all<{
      table_name: string; passing_grade: number; calculation_mode: string;
      item_name: string; category: string; max_score: number; weight: number; score: number | null;
    }>();

    const rows = gradesQuery.results.map((g) => [
      g.table_name,
      g.item_name,
      g.category,
      g.score !== null ? g.score.toFixed(1) : '-',
      g.max_score.toFixed(1),
      g.score !== null && g.score >= g.passing_grade ? 'Aprovado' : g.score !== null ? 'Abaixo da Média' : 'Em Andamento',
    ]);

    const totalAtt = attRow?.total ?? 0;
    const presences = attRow?.presences ?? 0;
    const freqRate = totalAtt > 0 ? Math.round((presences / totalAtt) * 1000) / 10 : 100;

    return {
      type,
      title: `Boletim Escolar - ${studentName}`,
      description: `Histórico de notas e frequência canônica do estudante ${studentName} (${studentRow.registration_number}).`,
      metrics: [
        { label: 'Estudante', value: studentName },
        { label: 'Matrícula', value: studentRow.registration_number },
        { label: 'Frequência', value: `${freqRate}%` },
        { label: 'Avaliações Lançadas', value: String(rows.length) },
      ],
      headers: ['Módulo / Etapa', 'Avaliação', 'Categoria', 'Nota Obtida', 'Nota Máx.', 'Situação'],
      rows,
      context: [`Matrícula: ${studentRow.registration_number}`, `Período: ${from} a ${to}`],
      notices: [],
      matrix: false,
      boletimData: {
        studentId: studentRow.id,
        studentName,
        registrationNumber: studentRow.registration_number,
        attendanceRate: freqRate,
        presences,
        absences: attRow?.absences ?? 0,
        enrollments: enrollments.results,
        evaluations: gradesQuery.results,
      },
    };
  }

  // 5. Financial Fees Report (Relatório de Mensalidades e Inadimplência)
  if (type === 'fees' || type === 'financial') {
    let feeFilterSql = 'f.deleted_at IS NULL AND f.due_date >= ? AND f.due_date <= ?';
    const feeParams: unknown[] = [from, to];
    if (classId) {
      feeFilterSql += ' AND f.class_id = ?';
      feeParams.push(classId);
    }
    if (studentId) {
      feeFilterSql += ' AND f.student_id = ?';
      feeParams.push(studentId);
    }

    const feesQuery = await env.DB.prepare(`
      SELECT f.id, f.competence_month, f.competence_year, f.due_date, f.amount_cents, f.paid_amount_cents,
             f.installment_number, f.status, s.encrypted_name, s.registration_number, c.name AS class_name
        FROM financial_fees f
        JOIN students s ON s.id = f.student_id
        LEFT JOIN classes c ON c.id = f.class_id
       WHERE ${feeFilterSql}
       ORDER BY f.due_date ASC
    `).bind(...feeParams).all<{
      id: string; competence_month: number; competence_year: number; due_date: string;
      amount_cents: number; paid_amount_cents: number; installment_number: number;
      status: string; encrypted_name: string; registration_number: string; class_name: string | null;
    }>();

    let totalExpected = 0;
    let totalPaid = 0;
    let totalOverdue = 0;
    const rows: Array<Array<string | number>> = [];

    for (const f of feesQuery.results) {
      let studentName = `Aluno ${f.registration_number || ''}`;
      try {
        studentName = await decryptText(env, f.encrypted_name);
      } catch {}
      totalExpected += f.amount_cents;
      totalPaid += f.paid_amount_cents;
      if (f.status === 'atrasada') {
        totalOverdue += Math.max(0, f.amount_cents - f.paid_amount_cents);
      }
      rows.push([
        f.registration_number,
        studentName,
        f.class_name || '-',
        `${String(f.competence_month).padStart(2, '0')}/${f.competence_year}`,
        f.due_date,
        (f.amount_cents / 100).toFixed(2),
        (f.paid_amount_cents / 100).toFixed(2),
        f.status.toUpperCase(),
      ]);
    }

    return {
      type,
      title: 'Relatório Financeiro de Mensalidades',
      description: 'Demonstrativo canônico de mensalidades previstas, recebidas e em atraso no período.',
      metrics: [
        { label: 'Total Previsto', value: `R$ ${(totalExpected / 100).toFixed(2)}` },
        { label: 'Total Recebido', value: `R$ ${(totalPaid / 100).toFixed(2)}` },
        { label: 'Total Vencido', value: `R$ ${(totalOverdue / 100).toFixed(2)}` },
        { label: 'Títulos Listados', value: String(rows.length) },
      ],
      headers: ['Matrícula', 'Aluno', 'Turma', 'Competência', 'Vencimento', 'Previsto (R$)', 'Pago (R$)', 'Situação'],
      rows,
      context: [`Período: ${from} a ${to}`],
      notices: [],
      matrix: false,
    };
  }

  // 6. Cash Flow Report (Relatório de Fluxo de Caixa)
  if (type === 'cash') {
    const priorRow = await env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount_cents ELSE -amount_cents END), 0) AS balance
        FROM cash_transactions
       WHERE date < ?
    `).bind(from).first<{ balance: number }>();

    const txQuery = await env.DB.prepare(`
      SELECT date, type, category, description, payment_method, amount_cents, is_reversal
        FROM cash_transactions
       WHERE date >= ? AND date <= ?
       ORDER BY date ASC, created_at ASC
    `).bind(from, to).all<{
      date: string; type: 'entrada' | 'saida'; category: string; description: string;
      payment_method: string; amount_cents: number; is_reversal: number;
    }>();

    const opening = priorRow?.balance ?? 0;
    let inflows = 0;
    let outflows = 0;
    const rows: Array<Array<string | number>> = [];

    for (const tx of txQuery.results) {
      if (tx.type === 'entrada') inflows += tx.amount_cents;
      else outflows += tx.amount_cents;
      rows.push([
        tx.date,
        tx.type === 'entrada' ? 'ENTRADA' : 'SAÍDA',
        tx.category,
        tx.description,
        tx.payment_method,
        (tx.amount_cents / 100).toFixed(2),
        tx.is_reversal ? 'ESTORNO' : 'NORMAL',
      ]);
    }

    const closing = opening + inflows - outflows;

    return {
      type,
      title: 'Demonstrativo de Fluxo de Caixa',
      description: 'Livro caixa diário com saldo anterior, entradas, saídas, estornos e saldo final.',
      metrics: [
        { label: 'Saldo Anterior', value: `R$ ${(opening / 100).toFixed(2)}` },
        { label: 'Entradas (+)', value: `R$ ${(inflows / 100).toFixed(2)}` },
        { label: 'Saídas (-)', value: `R$ ${(outflows / 100).toFixed(2)}` },
        { label: 'Saldo Final', value: `R$ ${(closing / 100).toFixed(2)}` },
      ],
      headers: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Meio Pagto', 'Valor (R$)', 'Natureza'],
      rows,
      context: [`Período: ${from} a ${to}`],
      notices: [],
      matrix: false,
    };
  }

  // Default fallback report
  return {
    type,
    title: 'Relatório Operacional',
    description: 'Relatório gerado pelo servidor.',
    metrics: [],
    headers: ['Item', 'Descrição'],
    rows: [],
    context: [`Período: ${from} a ${to}`],
    notices: [],
    matrix: false,
  };
}
