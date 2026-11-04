import { buildAnalytics, type AnalyticsInput } from '../../lib/analytics';
import { latestAttendance } from '../../lib/attendance';
import { buildClassGradeSummary, normalizeScoreToTen, roundGrade } from '../../lib/grades';
import type { LocalRecord } from '../../types';

export interface BiFilters {
  from: string;
  to: string;
  courseId?: string;
  classId?: string;
  teacherId?: string;
  shift?: string;
  weekDay?: string;
  laboratoryId?: string;
  studentId?: string;
}

export interface BiInput {
  attendance: LocalRecord[];
  classes: LocalRecord[];
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classTeachers: LocalRecord[];
  courses: LocalRecord[];
  laboratories: LocalRecord[];
  replacements: LocalRecord[];
  directory?: LocalRecord[];
  gradeTables?: LocalRecord[];
  gradeItems?: LocalRecord[];
  studentGrades?: LocalRecord[];
}

export interface BiCourseRow {
  id: string;
  name: string;
  classes: number;
  activeStudents: number;
  calls: number;
  records: number;
  present: number;
  absent: number;
  justified: number;
  delayed: number;
  replacements: number;
  rate: number;
}

export interface BiClassRow {
  id: string;
  name: string;
  courseId?: string;
  courseName: string;
  shift: string;
  activeStudents: number;
  calls: number;
  records: number;
  present: number;
  absent: number;
  justified: number;
  delayed: number;
  replacements: number;
  rate: number;
}

export interface BiRiskRow {
  studentId: string;
  name: string;
  registrationNumber: string;
  className: string;
  absences: number;
  consecutiveAbsences: number;
  records: number;
  rate: number;
  reasons: string[];
}

export interface BiReplacementRow {
  id: string;
  student: string;
  registrationNumber: string;
  className: string;
  attendanceDate: string;
  scheduledDate: string;
  scheduledTime: string;
  state: 'Não agendada' | 'Pendente' | 'Vencida' | 'Concluída';
  completedAt?: string;
}

export interface BiTeacherRow {
  id: string;
  name: string;
  classes: number;
  activeStudents: number;
  callsInAssignedClasses: number;
  callsRecorded: number;
  rate: number;
}

export interface BiLaboratoryRow {
  id: string;
  name: string;
  classes: number;
  shifts: number;
  potentialCollisions: number;
}

export interface BiQualityIssue {
  code: string;
  label: string;
  count: number;
  explanation: string;
}

export interface BiGradeCategoryRow {
  category: string;
  classes: number;
  assessments: number;
  gradedEntries: number;
  averageScore: number;
}

export interface BiClassGradeRow {
  id: string;
  className: string;
  courseName: string;
  tables: number;
  assessments: number;
  averageScore: number | null;
  approved: number;
  recovery: number;
  failed: number;
  inProgress: number;
}

export interface BiGradesSummary {
  totalTables: number;
  totalAssessments: number;
  gradedEntries: number;
  overallAverage: number | null;
  approvedStudents: number;
  recoveryStudents: number;
  failedStudents: number;
  byCategory: BiGradeCategoryRow[];
  byClass: BiClassGradeRow[];
}

export interface BiDataset {
  filters: BiFilters;
  analytics: ReturnType<typeof buildAnalytics>;
  classes: LocalRecord[];
  calls: number;
  courseRows: BiCourseRow[];
  classRows: BiClassRow[];
  riskRows: BiRiskRow[];
  replacementRows: BiReplacementRow[];
  teacherRows: BiTeacherRow[];
  laboratoryRows: BiLaboratoryRow[];
  qualityIssues: BiQualityIssue[];
  replacementSummary: {
    notScheduled: number;
    pending: number;
    overdue: number;
    completed: number;
    completionRate: number;
  };
  gradesSummary?: BiGradesSummary;
  limitations: string[];
}

const current = (record: LocalRecord) => !record.deleted_at;
const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');

function counts() {
  return { present: 0, absent: 0, justified: 0, delayed: 0, replacements: 0, records: 0 };
}

function add(target: ReturnType<typeof counts>, status: string) {
  target.records += 1;
  if (status === 'P') target.present += 1;
  else if (status === 'F') target.absent += 1;
  else if (status === 'J') target.justified += 1;
  else if (status === 'A') target.delayed += 1;
  else if (status === 'R' || status === 'RC') target.replacements += 1;
}

const rate = (data: { present: number; records: number }) =>
  data.records ? Math.round((data.present / data.records) * 1000) / 10 : 0;

const uniqueCalls = (records: LocalRecord[]) =>
  new Set(records.map((item) => `${text(item, 'class_id')}|${text(item, 'date')}`)).size;

function statusCounts(records: LocalRecord[]) {
  const result = counts();
  records.forEach((record) => add(result, text(record, 'status')));
  return result;
}

function scopedClasses(input: BiInput, filters: BiFilters) {
  const teacherClassIds = filters.teacherId
    ? new Set(
        (input.classTeachers ?? [])
          .filter((item) => !item.deleted_at && item.user_id === filters.teacherId)
          .map((item) => text(item, 'class_id')),
      )
    : undefined;
  return (input.classes ?? []).filter(
    (item) =>
      current(item) &&
      (!filters.courseId || item.course_id === filters.courseId) &&
      (!filters.classId || item.id === filters.classId) &&
      (!filters.shift || item.shift === filters.shift) &&
      (!teacherClassIds || teacherClassIds.has(item.id)),
  );
}

function buildRiskRows(
  attendance: LocalRecord[],
  input: BiInput,
  classById: Map<string, LocalRecord>,
): BiRiskRow[] {
  const grouped = new Map<string, LocalRecord[]>();
  for (const record of attendance) {
    const key = `${text(record, 'student_id')}|${text(record, 'class_id')}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  const rows: BiRiskRow[] = [];
  for (const records of grouped.values()) {
    const sorted = [...records].sort((left, right) =>
      text(left, 'date').localeCompare(text(right, 'date')),
    );
    const own = statusCounts(sorted);
    let streak = 0;
    let maximum = 0;
    for (const record of sorted) {
      streak = record.status === 'F' ? streak + 1 : 0;
      maximum = Math.max(maximum, streak);
    }
    const attendanceRate = rate(own);
    const reasons: string[] = [];
    if (attendanceRate < 75) reasons.push('Frequência abaixo de 75%');
    if (maximum >= 3) reasons.push('Três ou mais faltas consecutivas');
    if (!reasons.length) continue;
    const studentId = text(sorted[0], 'student_id');
    const student = (input.students ?? []).find((item) => item.id === studentId);
    rows.push({
      studentId,
      name: text(student, 'name') || 'Aluno não informado',
      registrationNumber: text(student, 'registration_number'),
      className: text(classById.get(text(sorted[0], 'class_id')), 'name') || 'Turma não informada',
      absences: own.absent,
      consecutiveAbsences: maximum,
      records: own.records,
      rate: attendanceRate,
      reasons,
    });
  }
  return rows.sort(
    (left, right) =>
      left.rate - right.rate ||
      right.consecutiveAbsences - left.consecutiveAbsences ||
      left.name.localeCompare(right.name),
  );
}

function buildReplacementRows(
  attendance: LocalRecord[],
  input: BiInput,
  classById: Map<string, LocalRecord>,
  today: string,
) {
  const replacements = (input.replacements ?? []).filter((item) => !item.deleted_at);
  const students = new Map((input.students ?? []).map((item) => [item.id, item]));
  return attendance
    .filter((item) => item.status === 'R' || item.status === 'RC')
    .map<BiReplacementRow>((record) => {
      const schedule = replacements.find((item) => item.attendance_record_id === record.id);
      const scheduledDate = text(schedule, 'scheduled_date');
      const completedAt = text(schedule, 'completed_at') || text(record, 'completed_at');
      const state: BiReplacementRow['state'] =
        record.status === 'RC' || completedAt
          ? 'Concluída'
          : !schedule
          ? 'Não agendada'
          : scheduledDate && scheduledDate < today
          ? 'Vencida'
          : 'Pendente';
      const student = students.get(text(record, 'student_id'));
      return {
        id: text(schedule, 'id') || record.id,
        student: text(student, 'name') || 'Aluno não informado',
        registrationNumber: text(student, 'registration_number'),
        className: text(classById.get(text(record, 'class_id')), 'name') || 'Turma não informada',
        attendanceDate: text(record, 'date'),
        scheduledDate,
        scheduledTime: text(schedule, 'scheduled_time'),
        state,
        completedAt,
      };
    })
    .sort(
      (left, right) =>
        left.state.localeCompare(right.state) ||
        left.attendanceDate.localeCompare(right.attendanceDate),
    );
}

function buildQualityIssues(
  input: BiInput,
  classes: LocalRecord[],
  attendance: LocalRecord[],
): BiQualityIssue[] {
  const all = [
    input.attendance ?? [],
    input.classes ?? [],
    input.students ?? [],
    input.enrollments ?? [],
    input.classTeachers ?? [],
    input.courses ?? [],
    input.laboratories ?? [],
    input.replacements ?? [],
  ].flat();
  const classIds = new Set((input.classes ?? []).filter(current).map((item) => item.id));
  const studentIds = new Set((input.students ?? []).filter(current).map((item) => item.id));
  const activeEnrollments = (input.enrollments ?? []).filter(
    (item) => !item.deleted_at && item.status === 'ativa',
  );
  const enrollmentCounts = new Map<string, number>();
  activeEnrollments.forEach((item) =>
    enrollmentCounts.set(
      text(item, 'student_id'),
      (enrollmentCounts.get(text(item, 'student_id')) ?? 0) + 1,
    ),
  );
  const issues: BiQualityIssue[] = [
    {
      code: 'pending',
      label: 'Alterações aguardando sincronização',
      count: all.filter((item) => item.sync_status === 'PENDING').length,
      explanation: 'Registros locais ainda não confirmados pelo servidor.',
    },
    {
      code: 'conflicts',
      label: 'Conflitos de sincronização',
      count: all.filter((item) => item.sync_status === 'CONFLICT').length,
      explanation: 'Registros que precisam de conciliação entre dispositivo e servidor.',
    },
    {
      code: 'rejected',
      label: 'Alterações rejeitadas',
      count: all.filter((item) => item.sync_status === 'REJECTED').length,
      explanation: 'Alterações preservadas localmente que não passaram pelas regras do servidor.',
    },
    {
      code: 'multiple-enrollments',
      label: 'Alunos com múltiplas matrículas ativas',
      count: [...enrollmentCounts.values()].filter((value) => value > 1).length,
      explanation:
        'Indicador de revisão; pode ser válido se a instituição permitir mais de uma turma ativa.',
    },
    {
      code: 'orphan-enrollments',
      label: 'Matrículas com referência ausente',
      count: activeEnrollments.filter(
        (item) =>
          !classIds.has(text(item, 'class_id')) || !studentIds.has(text(item, 'student_id')),
      ).length,
      explanation: 'Matrículas cujo aluno ou turma ativa não está disponível localmente.',
    },
    {
      code: 'orphan-attendance',
      label: 'Frequências com referência ausente',
      count: attendance.filter(
        (item) =>
          !classIds.has(text(item, 'class_id')) || !studentIds.has(text(item, 'student_id')),
      ).length,
      explanation: 'Marcações cujo aluno ou turma ativa não está disponível localmente.',
    },
    {
      code: 'empty-scope',
      label: 'Turmas sem matrícula ativa no escopo',
      count: classes.filter(
        (item) => !activeEnrollments.some((enrollment) => enrollment.class_id === item.id),
      ).length,
      explanation: 'Turmas ativas sem alunos com matrícula ativa.',
    },
  ];
  return issues;
}

export function buildBiDataset(rawInput: BiInput, filters: BiFilters, today: string): BiDataset {
  const input: BiInput = {
    attendance: rawInput.attendance ?? [],
    classes: rawInput.classes ?? [],
    students: rawInput.students ?? [],
    enrollments: rawInput.enrollments ?? [],
    classTeachers: rawInput.classTeachers ?? [],
    courses: rawInput.courses ?? [],
    laboratories: rawInput.laboratories ?? [],
    replacements: rawInput.replacements ?? [],
    directory: rawInput.directory ?? [],
    gradeTables: rawInput.gradeTables ?? [],
    gradeItems: rawInput.gradeItems ?? [],
    studentGrades: rawInput.studentGrades ?? [],
  };

  const classes = scopedClasses(input, filters);
  const classIds = new Set(classes.map((item) => item.id));
  const courseIds = new Set(classes.map((item) => text(item, 'course_id')));
  const courses = input.courses.filter((item) => current(item) && courseIds.has(item.id));
  const analyticsInput: AnalyticsInput = {
    attendance: input.attendance,
    classes,
    students: input.students,
    enrollments: input.enrollments,
    classTeachers: input.classTeachers,
  };
  const analytics = buildAnalytics(analyticsInput, {
    from: filters.from,
    to: filters.to,
    studentId: filters.studentId,
  });
  const attendance = latestAttendance(input.attendance).filter(
    (item) =>
      !item.deleted_at &&
      classIds.has(text(item, 'class_id')) &&
      text(item, 'date') >= filters.from &&
      text(item, 'date') <= filters.to &&
      (!filters.studentId || item.student_id === filters.studentId),
  );
  const classById = new Map(classes.map((item) => [item.id, item]));
  const courseById = new Map(input.courses.map((item) => [item.id, item]));
  const activeEnrollments = input.enrollments.filter(
    (item) => !item.deleted_at && item.status === 'ativa' && classIds.has(text(item, 'class_id')),
  );
  const classRows: BiClassRow[] = (analytics.byClass ?? []).map((row) => {
    const ownAttendance = attendance.filter((item) => item.class_id === row.id);
    return {
      ...row,
      courseName: text(courseById.get(row.courseId), 'name') || 'Curso não informado',
      shift: text(classById.get(row.id), 'shift'),
      activeStudents: new Set(
        activeEnrollments
          .filter((item) => item.class_id === row.id)
          .map((item) => text(item, 'student_id')),
      ).size,
      calls: uniqueCalls(ownAttendance),
    };
  });
  const courseRows: BiCourseRow[] = courses
    .map((course) => {
      const ownClasses = classes.filter((item) => item.course_id === course.id);
      const ownIds = new Set(ownClasses.map((item) => item.id));
      const ownAttendance = attendance.filter((item) => ownIds.has(text(item, 'class_id')));
      const ownCounts = statusCounts(ownAttendance);
      return {
        ...ownCounts,
        id: course.id,
        name: text(course, 'name'),
        classes: ownClasses.length,
        activeStudents: new Set(
          activeEnrollments
            .filter((item) => ownIds.has(text(item, 'class_id')))
            .map((item) => text(item, 'student_id')),
        ).size,
        calls: uniqueCalls(ownAttendance),
        rate: rate(ownCounts),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const riskRows = buildRiskRows(attendance, input, classById);
  const replacementRows = buildReplacementRows(attendance, input, classById, today);
  const directory = new Map((input.directory ?? []).map((item) => [item.id, text(item, 'name')]));
  const teacherIds = new Set(
    input.classTeachers
      .filter((item) => !item.deleted_at && classIds.has(text(item, 'class_id')))
      .map((item) => text(item, 'user_id')),
  );
  const teacherRows: BiTeacherRow[] = [...teacherIds]
    .map((teacherId) => {
      const ownClassIds = new Set(
        input.classTeachers
          .filter(
            (item) =>
              !item.deleted_at &&
              item.user_id === teacherId &&
              classIds.has(text(item, 'class_id')),
          )
          .map((item) => text(item, 'class_id')),
      );
      const ownAttendance = attendance.filter((item) => ownClassIds.has(text(item, 'class_id')));
      const ownCounts = statusCounts(ownAttendance);
      const recorded = attendance.filter((item) => item.recorded_by_user_id === teacherId);
      return {
        id: teacherId,
        name: directory.get(teacherId) || `Professor ${teacherId.slice(0, 8)}`,
        classes: ownClassIds.size,
        activeStudents: new Set(
          activeEnrollments
            .filter((item) => ownClassIds.has(text(item, 'class_id')))
            .map((item) => text(item, 'student_id')),
        ).size,
        callsInAssignedClasses: uniqueCalls(ownAttendance),
        callsRecorded: uniqueCalls(recorded),
        rate: rate(ownCounts),
      };
    })
    .sort((left, right) => right.classes - left.classes || left.name.localeCompare(right.name));
  const laboratoryRows: BiLaboratoryRow[] = input.laboratories
    .filter(current)
    .map((laboratory) => {
      const ownClasses = classes.filter((item) => item.laboratory_id === laboratory.id);
      const groups = new Map<string, number>();
      ownClasses.forEach((item) => {
        const weekDay = text(item, 'week_day');
        const shift = text(item, 'shift');
        if (!weekDay || !shift) return;
        const key = `${weekDay}|${shift}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
      });
      return {
        id: laboratory.id,
        name: text(laboratory, 'name'),
        classes: ownClasses.length,
        shifts: new Set(ownClasses.map((item) => text(item, 'shift')).filter(Boolean)).size,
        potentialCollisions: [...groups.values()].reduce(
          (sum, value) => sum + Math.max(0, value - 1),
          0,
        ),
      };
    })
    .filter((item) => item.classes > 0)
    .sort((left, right) => right.classes - left.classes || left.name.localeCompare(right.name));
  const replacementSummary = {
    notScheduled: replacementRows.filter((item) => item.state === 'Não agendada').length,
    pending: replacementRows.filter((item) => item.state === 'Pendente').length,
    overdue: replacementRows.filter((item) => item.state === 'Vencida').length,
    completed: replacementRows.filter((item) => item.state === 'Concluída').length,
    completionRate: replacementRows.length
      ? Math.round(
          (replacementRows.filter((item) => item.state === 'Concluída').length * 1000) /
            replacementRows.length,
        ) / 10
      : 0,
  };
  const qualityIssues = buildQualityIssues(input, classes, attendance);

  // Build Grades B.I. Summary
  const gradeTables = (input.gradeTables ?? []).filter(
    (t) => current(t) && classIds.has(text(t, 'class_id')),
  );
  const tableIds = new Set(gradeTables.map((t) => t.id));
  const gradeItems = (input.gradeItems ?? []).filter(
    (i) => current(i) && tableIds.has(text(i, 'grade_table_id')),
  );
  const itemById = new Map(gradeItems.map((i) => [i.id, i]));
  const studentGrades = (input.studentGrades ?? []).filter(
    (g) =>
      current(g) &&
      itemById.has(text(g, 'grade_item_id')) &&
      (!filters.studentId || g.student_id === filters.studentId),
  );

  const studentMap = new Map(
    (input.students ?? []).filter(current).map((s) => [s.id, s]),
  );

  const byClassGrades: BiClassGradeRow[] = classes.map((cls) => {
    const clsEnrollments = activeEnrollments.filter((e) => e.class_id === cls.id);
    const clsStudents = clsEnrollments
      .map((e) => studentMap.get(text(e, 'student_id')))
      .filter((s): s is LocalRecord => Boolean(s))
      .map((s) => ({
        id: s.id,
        name: text(s, 'name'),
        registrationNumber: text(s, 'registration_number'),
      }));
    const summary = buildClassGradeSummary({
      classId: cls.id,
      tables: gradeTables,
      items: gradeItems,
      studentGrades,
      students: clsStudents,
    });
    const clsAssessments = gradeItems.filter((i) => i.class_id === cls.id).length;
    return {
      id: cls.id,
      className: text(cls, 'name'),
      courseName: text(courseById.get(text(cls, 'course_id')), 'name') || 'Curso não informado',
      tables: summary.tables.length,
      assessments: clsAssessments,
      averageScore: summary.classAverage,
      approved: summary.approvedCount,
      recovery: summary.recoveryCount,
      failed: summary.failedCount,
      inProgress: summary.inProgressCount,
    };
  });

  const catMap = new Map<
    string,
    { classIds: Set<string>; itemIds: Set<string>; scores: number[] }
  >();
  for (const item of gradeItems) {
    const cat = text(item, 'category').trim() || 'Avaliação';
    const entry = catMap.get(cat) ?? {
      classIds: new Set<string>(),
      itemIds: new Set<string>(),
      scores: [],
    };
    entry.classIds.add(text(item, 'class_id'));
    entry.itemIds.add(item.id);
    catMap.set(cat, entry);
  }
  const allNormalizedScores: number[] = [];
  for (const g of studentGrades) {
    if (g.score === null || g.score === undefined || g.score === '') continue;
    const item = itemById.get(text(g, 'grade_item_id'));
    if (!item) continue;
    const norm = normalizeScoreToTen(Number(g.score), Number(item.max_score ?? 10));
    if (norm !== null) {
      allNormalizedScores.push(norm);
      const cat = text(item, 'category').trim() || 'Avaliação';
      catMap.get(cat)?.scores.push(norm);
    }
  }

  const byCategoryGrades: BiGradeCategoryRow[] = [...catMap.entries()]
    .map(([category, data]) => ({
      category,
      classes: data.classIds.size,
      assessments: data.itemIds.size,
      gradedEntries: data.scores.length,
      averageScore: data.scores.length
        ? roundGrade(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
        : 0,
    }))
    .sort((a, b) => b.averageScore - a.averageScore || a.category.localeCompare(b.category));

  const gradesSummary: BiGradesSummary = {
    totalTables: gradeTables.length,
    totalAssessments: gradeItems.length,
    gradedEntries: allNormalizedScores.length,
    overallAverage: allNormalizedScores.length
      ? roundGrade(allNormalizedScores.reduce((a, b) => a + b, 0) / allNormalizedScores.length)
      : null,
    approvedStudents: byClassGrades.reduce((acc, c) => acc + c.approved, 0),
    recoveryStudents: byClassGrades.reduce((acc, c) => acc + c.recovery, 0),
    failedStudents: byClassGrades.reduce((acc, c) => acc + c.failed, 0),
    byCategory: byCategoryGrades,
    byClass: byClassGrades,
  };

  const limitations = [
    'Presença diária calculada com a mesma regra do relatório oficial.',
    'Alunos com frequência abaixo de 75% ou três faltas consecutivas.',
    'Alocação cadastral nos laboratórios; identifica sobreposição cadastral de turnos sem afirmar sobreposição de horário.',
  ];
  return {
    filters,
    analytics,
    classes,
    calls: uniqueCalls(attendance),
    courseRows,
    classRows,
    riskRows,
    replacementRows,
    teacherRows,
    laboratoryRows,
    qualityIssues,
    replacementSummary,
    gradesSummary,
    limitations,
  };
}
