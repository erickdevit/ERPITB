import { buildAnalytics, type AnalyticsInput, type AnalyticsResult, type StatusCounts } from '../../lib/analytics';
import { latestAttendance } from '../../lib/attendance';
import type { LocalRecord } from '../../types';

export interface BiFilters {
  from: string;
  to: string;
  courseId?: string;
  classId?: string;
  studentId?: string;
  teacherId?: string;
  shift?: string;
}

export interface BiInput extends AnalyticsInput {
  courses: LocalRecord[];
  laboratories: LocalRecord[];
  replacements: LocalRecord[];
  directory?: LocalRecord[];
}

export interface BiClassRow extends StatusCounts {
  id: string;
  name: string;
  courseName: string;
  shift: string;
  activeStudents: number;
  calls: number;
  rate: number;
}

export interface BiCourseRow extends StatusCounts {
  id: string;
  name: string;
  classes: number;
  activeStudents: number;
  calls: number;
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
  completedAt: string;
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

export interface BiDataset {
  filters: BiFilters;
  analytics: AnalyticsResult;
  attendance: LocalRecord[];
  classes: LocalRecord[];
  courses: LocalRecord[];
  calls: number;
  classRows: BiClassRow[];
  courseRows: BiCourseRow[];
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
  limitations: string[];
}

const text = (record: Record<string, unknown> | undefined, field: string) => String(record?.[field] ?? '');
const current = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const counts = (): StatusCounts => ({ present: 0, absent: 0, justified: 0, delayed: 0, replacements: 0, records: 0 });
const rate = (value: StatusCounts) => value.records ? Math.round(value.present * 1000 / value.records) / 10 : 0;

function add(target: StatusCounts, status: string) {
  target.records += 1;
  if (status === 'P') target.present += 1;
  if (status === 'F') target.absent += 1;
  if (status === 'J') target.justified += 1;
  if (status === 'A') target.delayed += 1;
  if (status === 'R' || status === 'RC') target.replacements += 1;
}

const uniqueCalls = (records: LocalRecord[]) => new Set(records.map((item) => `${text(item, 'class_id')}|${text(item, 'date')}`)).size;

function statusCounts(records: LocalRecord[]) {
  const result = counts();
  records.forEach((record) => add(result, text(record, 'status')));
  return result;
}

function scopedClasses(input: BiInput, filters: BiFilters) {
  const teacherClassIds = filters.teacherId
    ? new Set(input.classTeachers.filter((item) => !item.deleted_at && item.user_id === filters.teacherId).map((item) => text(item, 'class_id')))
    : undefined;
  return input.classes.filter((item) => current(item)
    && (!filters.courseId || item.course_id === filters.courseId)
    && (!filters.classId || item.id === filters.classId)
    && (!filters.shift || item.shift === filters.shift)
    && (!teacherClassIds || teacherClassIds.has(item.id)));
}

function buildRiskRows(attendance: LocalRecord[], input: BiInput, classById: Map<string, LocalRecord>): BiRiskRow[] {
  const grouped = new Map<string, LocalRecord[]>();
  for (const record of attendance) {
    const key = `${text(record, 'student_id')}|${text(record, 'class_id')}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  const rows: BiRiskRow[] = [];
  for (const records of grouped.values()) {
    const sorted = [...records].sort((left, right) => text(left, 'date').localeCompare(text(right, 'date')));
    const own = statusCounts(sorted); let streak = 0; let maximum = 0;
    for (const record of sorted) {
      streak = record.status === 'F' ? streak + 1 : 0;
      maximum = Math.max(maximum, streak);
    }
    const attendanceRate = rate(own); const reasons: string[] = [];
    if (attendanceRate < 75) reasons.push('Frequência abaixo de 75%');
    if (maximum >= 3) reasons.push('Três ou mais faltas consecutivas');
    if (!reasons.length) continue;
    const studentId = text(sorted[0], 'student_id'); const student = input.students.find((item) => item.id === studentId);
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
  return rows.sort((left, right) => left.rate - right.rate || right.consecutiveAbsences - left.consecutiveAbsences || left.name.localeCompare(right.name));
}

function buildReplacementRows(attendance: LocalRecord[], input: BiInput, classById: Map<string, LocalRecord>, today: string) {
  const replacements = input.replacements.filter((item) => !item.deleted_at);
  const students = new Map(input.students.map((item) => [item.id, item]));
  return attendance.filter((item) => item.status === 'R' || item.status === 'RC').map<BiReplacementRow>((record) => {
    const schedule = replacements.find((item) => item.attendance_record_id === record.id);
    const scheduledDate = text(schedule, 'scheduled_date'); const completedAt = text(schedule, 'completed_at') || text(record, 'completed_at');
    const state: BiReplacementRow['state'] = record.status === 'RC' || completedAt ? 'Concluída' : !schedule ? 'Não agendada' : scheduledDate && scheduledDate < today ? 'Vencida' : 'Pendente';
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
  }).sort((left, right) => left.state.localeCompare(right.state) || left.attendanceDate.localeCompare(right.attendanceDate));
}

function buildQualityIssues(input: BiInput, classes: LocalRecord[], attendance: LocalRecord[]): BiQualityIssue[] {
  const all = [input.attendance, input.classes, input.students, input.enrollments, input.classTeachers, input.courses, input.laboratories, input.replacements].flat();
  const classIds = new Set(input.classes.filter(current).map((item) => item.id));
  const studentIds = new Set(input.students.filter(current).map((item) => item.id));
  const activeEnrollments = input.enrollments.filter((item) => !item.deleted_at && item.status === 'ativa');
  const enrollmentCounts = new Map<string, number>();
  activeEnrollments.forEach((item) => enrollmentCounts.set(text(item, 'student_id'), (enrollmentCounts.get(text(item, 'student_id')) ?? 0) + 1));
  const issues: BiQualityIssue[] = [
    { code: 'pending', label: 'Alterações aguardando sincronização', count: all.filter((item) => item.sync_status === 'PENDING').length, explanation: 'Registros locais ainda não confirmados pelo servidor.' },
    { code: 'conflicts', label: 'Conflitos de sincronização', count: all.filter((item) => item.sync_status === 'CONFLICT').length, explanation: 'Registros que precisam de conciliação entre dispositivo e servidor.' },
    { code: 'rejected', label: 'Alterações rejeitadas', count: all.filter((item) => item.sync_status === 'REJECTED').length, explanation: 'Alterações preservadas localmente que não passaram pelas regras do servidor.' },
    { code: 'multiple-enrollments', label: 'Alunos com múltiplas matrículas ativas', count: [...enrollmentCounts.values()].filter((value) => value > 1).length, explanation: 'Indicador de revisão; pode ser válido se a instituição permitir mais de uma turma ativa.' },
    { code: 'orphan-enrollments', label: 'Matrículas com referência ausente', count: activeEnrollments.filter((item) => !classIds.has(text(item, 'class_id')) || !studentIds.has(text(item, 'student_id'))).length, explanation: 'Matrículas cujo aluno ou turma ativa não está disponível localmente.' },
    { code: 'orphan-attendance', label: 'Frequências com referência ausente', count: attendance.filter((item) => !classIds.has(text(item, 'class_id')) || !studentIds.has(text(item, 'student_id'))).length, explanation: 'Marcações cujo aluno ou turma ativa não está disponível localmente.' },
    { code: 'empty-scope', label: 'Turmas sem matrícula ativa no escopo', count: classes.filter((item) => !activeEnrollments.some((enrollment) => enrollment.class_id === item.id)).length, explanation: 'Turmas ativas sem alunos com matrícula ativa.' },
  ];
  return issues;
}

export function buildBiDataset(input: BiInput, filters: BiFilters, today: string): BiDataset {
  const classes = scopedClasses(input, filters); const classIds = new Set(classes.map((item) => item.id));
  const courseIds = new Set(classes.map((item) => text(item, 'course_id')));
  const courses = input.courses.filter((item) => current(item) && courseIds.has(item.id));
  const analyticsInput: AnalyticsInput = { attendance: input.attendance, classes, students: input.students, enrollments: input.enrollments, classTeachers: input.classTeachers };
  const analytics = buildAnalytics(analyticsInput, { from: filters.from, to: filters.to, studentId: filters.studentId });
  const attendance = latestAttendance(input.attendance).filter((item) => !item.deleted_at
    && classIds.has(text(item, 'class_id'))
    && text(item, 'date') >= filters.from && text(item, 'date') <= filters.to
    && (!filters.studentId || item.student_id === filters.studentId));
  const classById = new Map(classes.map((item) => [item.id, item]));
  const courseById = new Map(input.courses.map((item) => [item.id, item]));
  const activeEnrollments = input.enrollments.filter((item) => !item.deleted_at && item.status === 'ativa' && classIds.has(text(item, 'class_id')));
  const classRows: BiClassRow[] = analytics.byClass.map((row) => {
    const ownAttendance = attendance.filter((item) => item.class_id === row.id);
    return { ...row, courseName: text(courseById.get(row.courseId), 'name') || 'Curso não informado', shift: text(classById.get(row.id), 'shift'), activeStudents: new Set(activeEnrollments.filter((item) => item.class_id === row.id).map((item) => text(item, 'student_id'))).size, calls: uniqueCalls(ownAttendance) };
  });
  const courseRows: BiCourseRow[] = courses.map((course) => {
    const ownClasses = classes.filter((item) => item.course_id === course.id); const ownIds = new Set(ownClasses.map((item) => item.id));
    const ownAttendance = attendance.filter((item) => ownIds.has(text(item, 'class_id'))); const ownCounts = statusCounts(ownAttendance);
    return { ...ownCounts, id: course.id, name: text(course, 'name'), classes: ownClasses.length, activeStudents: new Set(activeEnrollments.filter((item) => ownIds.has(text(item, 'class_id'))).map((item) => text(item, 'student_id'))).size, calls: uniqueCalls(ownAttendance), rate: rate(ownCounts) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const riskRows = buildRiskRows(attendance, input, classById);
  const replacementRows = buildReplacementRows(attendance, input, classById, today);
  const directory = new Map((input.directory ?? []).map((item) => [item.id, text(item, 'name')]));
  const teacherIds = new Set(input.classTeachers.filter((item) => !item.deleted_at && classIds.has(text(item, 'class_id'))).map((item) => text(item, 'user_id')));
  const teacherRows: BiTeacherRow[] = [...teacherIds].map((teacherId) => {
    const ownClassIds = new Set(input.classTeachers.filter((item) => !item.deleted_at && item.user_id === teacherId && classIds.has(text(item, 'class_id'))).map((item) => text(item, 'class_id')));
    const ownAttendance = attendance.filter((item) => ownClassIds.has(text(item, 'class_id'))); const ownCounts = statusCounts(ownAttendance);
    const recorded = attendance.filter((item) => item.recorded_by_user_id === teacherId);
    return { id: teacherId, name: directory.get(teacherId) || `Professor ${teacherId.slice(0, 8)}`, classes: ownClassIds.size, activeStudents: new Set(activeEnrollments.filter((item) => ownClassIds.has(text(item, 'class_id'))).map((item) => text(item, 'student_id'))).size, callsInAssignedClasses: uniqueCalls(ownAttendance), callsRecorded: uniqueCalls(recorded), rate: rate(ownCounts) };
  }).sort((left, right) => right.classes - left.classes || left.name.localeCompare(right.name));
  const laboratoryRows: BiLaboratoryRow[] = input.laboratories.filter(current).map((laboratory) => {
    const ownClasses = classes.filter((item) => item.laboratory_id === laboratory.id);
    const groups = new Map<string, number>();
    ownClasses.forEach((item) => {
      const weekDay = text(item, 'week_day'); const shift = text(item, 'shift');
      if (!weekDay || !shift) return;
      const key = `${weekDay}|${shift}`; groups.set(key, (groups.get(key) ?? 0) + 1);
    });
    return { id: laboratory.id, name: text(laboratory, 'name'), classes: ownClasses.length, shifts: new Set(ownClasses.map((item) => text(item, 'shift')).filter(Boolean)).size, potentialCollisions: [...groups.values()].reduce((sum, value) => sum + Math.max(0, value - 1), 0) };
  }).filter((item) => item.classes > 0).sort((left, right) => right.classes - left.classes || left.name.localeCompare(right.name));
  const replacementSummary = {
    notScheduled: replacementRows.filter((item) => item.state === 'Não agendada').length,
    pending: replacementRows.filter((item) => item.state === 'Pendente').length,
    overdue: replacementRows.filter((item) => item.state === 'Vencida').length,
    completed: replacementRows.filter((item) => item.state === 'Concluída').length,
    completionRate: replacementRows.length ? Math.round(replacementRows.filter((item) => item.state === 'Concluída').length * 1000 / replacementRows.length) / 10 : 0,
  };
  return {
    filters,
    analytics,
    attendance,
    classes,
    courses,
    calls: analytics.distinctCalls,
    classRows,
    courseRows,
    riskRows,
    replacementRows,
    teacherRows,
    laboratoryRows,
    qualityIssues: buildQualityIssues(input, classes, attendance),
    replacementSummary,
    limitations: [
      'Frequência segue a regra histórica: presença (P) dividida por todas as marcações P/F/J/A/R/RC do período.',
      'O modelo atual não possui calendário acadêmico, carga horária nem horários completos; por isso não calcula aulas esperadas, horas cumpridas ou ocupação real de laboratório.',
      'Colisões de laboratório são apenas potenciais: usam dia da semana e turno, sem afirmar sobreposição de horário.',
    ],
  };
}
