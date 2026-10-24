import { decryptText } from './crypto';
import { AppError } from './http';
import { requireScope } from './rbac';
import type { AttendanceStatus, AuthUser, Env, FeeStatus, PaymentMethod } from './types';

export interface StatusCounts {
  present: number;
  absent: number;
  justified: number;
  delayed: number;
  replacements: number;
  records: number;
}

export async function getAnalyticsData(env: Env, user: AuthUser, url: URL): Promise<unknown> {
  requireScope(user, 'analytics:read');
  const type = url.searchParams.get('type');
  if (user.role === 'financeiro' && type !== 'financial') {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }
  const from = url.searchParams.get('from') || '2026-01-01';
  const to = url.searchParams.get('to') || '2026-12-31';
  const courseId = url.searchParams.get('courseId') || undefined;
  const classId = url.searchParams.get('classId') || undefined;
  const studentId = url.searchParams.get('studentId') || undefined;
  const teacherId = url.searchParams.get('teacherId') || (user.role === 'professor' ? user.id : undefined);

  // 1. Determine allowed classes based on role and filters
  let classFilterSql = 'c.deleted_at IS NULL';
  const classParams: unknown[] = [];

  if (courseId) {
    classFilterSql += ' AND c.course_id = ?';
    classParams.push(courseId);
  }
  if (classId) {
    classFilterSql += ' AND c.id = ?';
    classParams.push(classId);
  }
  if (teacherId) {
    classFilterSql += ' AND c.id IN (SELECT class_id FROM class_teachers WHERE user_id = ? AND deleted_at IS NULL)';
    classParams.push(teacherId);
  }

  const classesQuery = await env.DB.prepare(`
    SELECT c.id, c.name, c.course_id, c.shift, co.name AS course_name
      FROM classes c
      JOIN courses co ON co.id = c.course_id AND co.deleted_at IS NULL
     WHERE ${classFilterSql}
  `).bind(...classParams).all<{ id: string; name: string; course_id: string; shift: string; course_name: string }>();

  const allowedClasses = classesQuery.results;
  const allowedClassIds = allowedClasses.map((c) => c.id);

  if (allowedClassIds.length === 0) {
    return {
      attendanceRate: 100,
      distinctCalls: 0,
      activeStudents: 0,
      riskStudents: 0,
      records: 0,
      present: 0,
      absent: 0,
      justified: 0,
      delayed: 0,
      replacements: 0,
      evolution: [],
      byClass: [],
      topAbsentees: [],
      academic: {
        overallGpa: 0,
        passingRate: 100,
        evaluatedStudentsCount: 0,
        passingStudentsCount: 0,
        failingStudentsCount: 0,
        gradeDistribution: { A_9_10: 0, B_7_9: 0, C_5_7: 0, D_below_5: 0 },
        byCategory: [],
      },
      financial: null,
    };
  }

  const inPlaceholders = allowedClassIds.map(() => '?').join(',');

  // 2. Query Attendance records within date range and allowed classes
  const attParams: unknown[] = [...allowedClassIds, from, to];
  let studentFilterSql = '';
  if (studentId) {
    studentFilterSql = ' AND a.student_id = ?';
    attParams.push(studentId);
  }

  const attRecords = await env.DB.prepare(`
    SELECT a.id, a.class_id, a.student_id, a.date, a.status,
           s.encrypted_name, s.registration_number, c.name AS class_name
      FROM attendance_records a
      JOIN students s ON s.id = a.student_id AND s.deleted_at IS NULL
      JOIN classes c ON c.id = a.class_id
     WHERE a.class_id IN (${inPlaceholders})
       AND a.date >= ? AND a.date <= ?
       AND a.deleted_at IS NULL
       ${studentFilterSql}
     ORDER BY a.date ASC
  `).bind(...attParams).all<{
    id: string; class_id: string; student_id: string; date: string; status: AttendanceStatus;
    encrypted_name: string; registration_number: string; class_name: string;
  }>();

  // 3. Count distinct sessions (lessons)
  const sessionCountRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT session_date) AS total FROM (
      SELECT date AS session_date FROM class_sessions WHERE class_id IN (${inPlaceholders}) AND date >= ? AND date <= ? AND deleted_at IS NULL
      UNION
      SELECT date AS session_date FROM attendance_records WHERE class_id IN (${inPlaceholders}) AND date >= ? AND date <= ? AND deleted_at IS NULL
    )
  `).bind(...allowedClassIds, from, to, ...allowedClassIds, from, to).first<{ total: number }>();
  const distinctCalls = sessionCountRow?.total ?? 0;

  // 4. Count active enrollments
  const enrollCountRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT student_id) AS total
      FROM enrollments
     WHERE class_id IN (${inPlaceholders}) AND status = 'ativa' AND deleted_at IS NULL
  `).bind(...allowedClassIds).first<{ total: number }>();
  const activeStudents = enrollCountRow?.total ?? 0;

  // 5. Aggregate attendance totals
  let present = 0;
  let absent = 0;
  let justified = 0;
  let delayed = 0;
  let replacements = 0;
  const records = attRecords.results.length;

  const dailyMap = new Map<string, { present: number; records: number }>();
  const classMap = new Map<string, StatusCounts & { id: string; name: string; courseId: string }>();
  const studentMap = new Map<string, {
    studentId: string; encryptedName: string; registrationNumber: string;
    classId: string; className: string; absences: number; present: number; total: number;
    consecutiveAbsences: number; maxConsecutiveAbsences: number;
  }>();

  for (const c of allowedClasses) {
    classMap.set(c.id, {
      id: c.id,
      name: c.name,
      courseId: c.course_id,
      present: 0,
      absent: 0,
      justified: 0,
      delayed: 0,
      replacements: 0,
      records: 0,
    });
  }

  for (const r of attRecords.results) {
    if (r.status === 'P') present += 1;
    else if (r.status === 'F') absent += 1;
    else if (r.status === 'J') justified += 1;
    else if (r.status === 'A') delayed += 1;
    else if (r.status === 'R' || r.status === 'RC') replacements += 1;

    // Daily
    const dayEntry = dailyMap.get(r.date) ?? { present: 0, records: 0 };
    dayEntry.records += 1;
    if (r.status === 'P' || r.status === 'RC') dayEntry.present += 1;
    dailyMap.set(r.date, dayEntry);

    // Class
    const classEntry = classMap.get(r.class_id);
    if (classEntry) {
      classEntry.records += 1;
      if (r.status === 'P') classEntry.present += 1;
      else if (r.status === 'F') classEntry.absent += 1;
      else if (r.status === 'J') classEntry.justified += 1;
      else if (r.status === 'A') classEntry.delayed += 1;
      else if (r.status === 'R' || r.status === 'RC') classEntry.replacements += 1;
    }

    // Student
    const sEntry = studentMap.get(r.student_id) ?? {
      studentId: r.student_id,
      encryptedName: r.encrypted_name,
      registrationNumber: r.registration_number,
      classId: r.class_id,
      className: r.class_name,
      absences: 0,
      present: 0,
      total: 0,
      consecutiveAbsences: 0,
      maxConsecutiveAbsences: 0,
    };
    sEntry.total += 1;
    if (r.status === 'F') {
      sEntry.absences += 1;
      sEntry.consecutiveAbsences += 1;
      if (sEntry.consecutiveAbsences > sEntry.maxConsecutiveAbsences) {
        sEntry.maxConsecutiveAbsences = sEntry.consecutiveAbsences;
      }
    } else {
      if (r.status === 'P' || r.status === 'RC') sEntry.present += 1;
      sEntry.consecutiveAbsences = 0;
    }
    studentMap.set(r.student_id, sEntry);
  }

  const attendanceRate = records > 0 ? Math.round((present / records) * 1000) / 10 : 100;

  const evolution = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      records: d.records,
      rate: d.records > 0 ? Math.round((d.present / d.records) * 1000) / 10 : 100,
    }));

  const byClass = Array.from(classMap.values()).map((c) => ({
    ...c,
    rate: c.records > 0 ? Math.round((c.present / c.records) * 1000) / 10 : 100,
  }));

  // Identify risk students and top absentees
  let riskStudents = 0;
  const topAbsenteesList = Array.from(studentMap.values())
    .filter((s) => s.absences > 0)
    .sort((a, b) => b.absences - a.absences)
    .slice(0, 10);

  for (const s of studentMap.values()) {
    const sRate = s.total > 0 ? (s.present / s.total) * 100 : 100;
    if (sRate < 75 || s.maxConsecutiveAbsences >= 3) {
      riskStudents += 1;
    }
  }

  const topAbsentees = await Promise.all(
    topAbsenteesList.map(async (s) => {
      let name = `Aluno ${s.registrationNumber || ''}`;
      try {
        name = await decryptText(env, s.encryptedName);
      } catch {}
      return {
        studentId: s.studentId,
        name,
        registrationNumber: s.registrationNumber,
        classId: s.classId,
        className: s.className,
        absences: s.absences,
        rate: s.total > 0 ? Math.round((s.present / s.total) * 1000) / 10 : 100,
      };
    }),
  );

  // 6. Academic Performance Metrics (only for non-financeiro roles)
  let academic: unknown = null;
  if (user.role !== 'financeiro') {
    const tablesQuery = await env.DB.prepare(`
      SELECT id, class_id, name, calculation_mode, passing_grade
        FROM grade_tables
       WHERE class_id IN (${inPlaceholders}) AND deleted_at IS NULL
    `).bind(...allowedClassIds).all<{
      id: string; class_id: string; name: string; calculation_mode: 'simple' | 'weighted' | 'sum'; passing_grade: number;
    }>();

    const itemsQuery = await env.DB.prepare(`
      SELECT id, grade_table_id, category, max_score, weight
        FROM grade_items
       WHERE class_id IN (${inPlaceholders}) AND deleted_at IS NULL
    `).bind(...allowedClassIds).all<{
      id: string; grade_table_id: string; category: string; max_score: number; weight: number;
    }>();

    const gradesParams: unknown[] = [...allowedClassIds];
    let gradeStudentSql = '';
    if (studentId) {
      gradeStudentSql = ' AND student_id = ?';
      gradesParams.push(studentId);
    }
    const gradesQuery = await env.DB.prepare(`
      SELECT grade_table_id, grade_item_id, student_id, score
        FROM student_grades
       WHERE class_id IN (${inPlaceholders}) AND deleted_at IS NULL AND score IS NOT NULL${gradeStudentSql}
    `).bind(...gradesParams).all<{
      grade_table_id: string; grade_item_id: string; student_id: string; score: number;
    }>();

    const tableMap = new Map(tablesQuery.results.map((t) => [t.id, t]));
    const itemMap = new Map(itemsQuery.results.map((i) => [i.id, i]));
    const studentTableGrades = new Map<string, Array<{ score: number; maxScore: number; weight: number }>>();
    const categoryStats = new Map<string, { sum: number; count: number }>();

    for (const g of gradesQuery.results) {
      const item = itemMap.get(g.grade_item_id);
      if (!item) continue;
      const normalizedScore = item.max_score > 0 ? (g.score / item.max_score) * 10 : g.score;
      const cat = categoryStats.get(item.category) ?? { sum: 0, count: 0 };
      cat.sum += normalizedScore;
      cat.count += 1;
      categoryStats.set(item.category, cat);

      const key = `${g.student_id}::${g.grade_table_id}`;
      const list = studentTableGrades.get(key) ?? [];
      list.push({ score: g.score, maxScore: item.max_score, weight: item.weight || 1 });
      studentTableGrades.set(key, list);
    }

    let sumFinalGrades = 0;
    let evaluatedCount = 0;
    let passingCount = 0;
    let failingCount = 0;
    const dist = { A_9_10: 0, B_7_9: 0, C_5_7: 0, D_below_5: 0 };

    for (const [key, list] of studentTableGrades.entries()) {
      const [, tableId] = key.split('::');
      const table = tableMap.get(tableId!);
      if (!table || list.length === 0) continue;

      let finalGrade = 0;
      if (table.calculation_mode === 'sum') {
        finalGrade = list.reduce((acc, cur) => acc + cur.score, 0);
      } else if (table.calculation_mode === 'weighted') {
        const totalWeight = list.reduce((acc, cur) => acc + cur.weight, 0);
        const weightedSum = list.reduce((acc, cur) => {
          const norm = cur.maxScore > 0 ? (cur.score / cur.maxScore) * 10 : cur.score;
          return acc + norm * cur.weight;
        }, 0);
        finalGrade = totalWeight > 0 ? weightedSum / totalWeight : 0;
      } else {
        const sumNorm = list.reduce((acc, cur) => {
          const norm = cur.maxScore > 0 ? (cur.score / cur.maxScore) * 10 : cur.score;
          return acc + norm;
        }, 0);
        finalGrade = sumNorm / list.length;
      }

      finalGrade = Math.round(finalGrade * 10) / 10;
      sumFinalGrades += finalGrade;
      evaluatedCount += 1;

      if (finalGrade >= (table.passing_grade ?? 6.0)) {
        passingCount += 1;
      } else {
        failingCount += 1;
      }

      if (finalGrade >= 9) dist.A_9_10 += 1;
      else if (finalGrade >= 7) dist.B_7_9 += 1;
      else if (finalGrade >= 5) dist.C_5_7 += 1;
      else dist.D_below_5 += 1;
    }

    const overallGpa = evaluatedCount > 0 ? Math.round((sumFinalGrades / evaluatedCount) * 10) / 10 : 0;
    const passingRate = evaluatedCount > 0 ? Math.round((passingCount / evaluatedCount) * 1000) / 10 : 100;
    const byCategory = Array.from(categoryStats.entries()).map(([category, st]) => ({
      category,
      average: st.count > 0 ? Math.round((st.sum / st.count) * 10) / 10 : 0,
      evaluationsCount: st.count,
    }));

    academic = {
      overallGpa,
      passingRate,
      evaluatedStudentsCount: evaluatedCount,
      passingStudentsCount: passingCount,
      failingStudentsCount: failingCount,
      gradeDistribution: dist,
      byCategory,
    };
  }

  // 7. Financial Metrics (only accessible if user is admin or financeiro)
  let financial: unknown = null;
  if (user.role === 'admin' || user.role === 'financeiro') {
    const feeSummaryRow = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total_fees,
        COALESCE(SUM(amount_cents), 0) AS total_expected,
        COALESCE(SUM(paid_amount_cents), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status = 'atrasada' OR (status IN ('aberto', 'parcial') AND due_date < ?) THEN (amount_cents - paid_amount_cents) ELSE 0 END), 0) AS total_overdue,
        COALESCE(SUM(CASE WHEN status = 'aberto' AND due_date >= ? THEN amount_cents WHEN status = 'parcial' AND due_date >= ? THEN (amount_cents - paid_amount_cents) ELSE 0 END), 0) AS total_pending,
        COUNT(DISTINCT CASE WHEN status = 'atrasada' OR (status IN ('aberto', 'parcial') AND due_date < ?) THEN student_id ELSE NULL END) AS delinquent_students
        FROM financial_fees
       WHERE deleted_at IS NULL AND due_date >= ? AND due_date <= ?
    `).bind(to, to, to, to, from, to).first<{
      total_fees: number; total_expected: number; total_paid: number;
      total_overdue: number; total_pending: number; delinquent_students: number;
    }>();

    const cashSummaryRow = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount_cents ELSE 0 END), 0) AS inflows,
        COALESCE(SUM(CASE WHEN type = 'saida' THEN amount_cents ELSE 0 END), 0) AS outflows
        FROM cash_transactions
       WHERE date >= ? AND date <= ?
    `).bind(from, to).first<{ inflows: number; outflows: number }>();

    const cashPriorRow = await env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount_cents ELSE -amount_cents END), 0) AS balance
        FROM cash_transactions
       WHERE date < ?
    `).bind(from).first<{ balance: number }>();

    const expected = feeSummaryRow?.total_expected ?? 0;
    const paid = feeSummaryRow?.total_paid ?? 0;
    const overdue = feeSummaryRow?.total_overdue ?? 0;
    const pending = feeSummaryRow?.total_pending ?? 0;
    const opening = cashPriorRow?.balance ?? 0;
    const inflows = cashSummaryRow?.inflows ?? 0;
    const outflows = cashSummaryRow?.outflows ?? 0;

    financial = {
      expectedRevenueCents: expected,
      receivedRevenueCents: paid,
      pendingRevenueCents: pending,
      overdueRevenueCents: overdue,
      delinquencyRate: expected > 0 ? Math.round((overdue / expected) * 1000) / 10 : 0,
      delinquentStudentsCount: feeSummaryRow?.delinquent_students ?? 0,
      cashOpeningBalanceCents: opening,
      cashInflowCents: inflows,
      cashOutflowCents: outflows,
      cashClosingBalanceCents: opening + inflows - outflows,
    };
  }

  if (user.role === 'financeiro') {
    return {
      financial,
    };
  }

  return {
    attendanceRate,
    distinctCalls,
    activeStudents,
    riskStudents,
    records,
    present,
    absent,
    justified,
    delayed,
    replacements,
    evolution,
    byClass,
    topAbsentees,
    academic,
    financial,
  };
}
