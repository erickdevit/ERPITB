import type { LocalRecord } from '../types';
import { extractClassNumber } from '../features/classes-model';
import { latestAttendance } from './attendance';

export interface AnalyticsFilters {
  from: string;
  to: string;
  courseId?: string;
  classId?: string;
  studentId?: string;
}

export interface AnalyticsInput {
  attendance: LocalRecord[];
  classes: LocalRecord[];
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classTeachers: LocalRecord[];
}

export interface StatusCounts {
  present: number;
  absent: number;
  justified: number;
  delayed: number;
  replacements: number;
  records: number;
}

export interface AnalyticsResult extends StatusCounts {
  attendanceRate: number;
  distinctCalls: number;
  activeStudents: number;
  riskStudents: number;
  evolution: Array<{ date: string; rate: number; records: number }>;
  byClass: Array<StatusCounts & { id: string; name: string; courseId: string; rate: number }>;
  topAbsentees: Array<{
    studentId: string;
    name: string;
    registrationNumber: string;
    classId?: string;
    className: string;
    absences: number;
    rate: number;
  }>;
  teacherWorkload: Array<{ teacherId: string; classes: number; students: number }>;
}

const text = (record: LocalRecord | undefined, field: string) => String(record?.[field] ?? '');
const current = (record: LocalRecord) => !record.deleted_at && record.active !== 0 && record.active !== false;
const emptyCounts = (): StatusCounts => ({ present: 0, absent: 0, justified: 0, delayed: 0, replacements: 0, records: 0 });

function addStatus(target: StatusCounts, status: string) {
  target.records += 1;
  if (status === 'P') target.present += 1;
  if (status === 'F') target.absent += 1;
  if (status === 'J') target.justified += 1;
  if (status === 'A') target.delayed += 1;
  if (status === 'R' || status === 'RC') target.replacements += 1;
}

const rate = (counts: StatusCounts) => counts.records ? Math.round((counts.present / counts.records) * 1000) / 10 : 0;

export function buildAnalytics(rawInput: AnalyticsInput, filters: AnalyticsFilters): AnalyticsResult {
  const input: AnalyticsInput = {
    attendance: rawInput?.attendance ?? [],
    classes: rawInput?.classes ?? [],
    students: rawInput?.students ?? [],
    enrollments: rawInput?.enrollments ?? [],
    classTeachers: rawInput?.classTeachers ?? [],
  };
  const visibleClasses = input.classes.filter((item) => current(item)
    && (!filters.courseId || item.course_id === filters.courseId)
    && (!filters.classId || item.id === filters.classId));
  const classIds = new Set(visibleClasses.map((item) => item.id));
  const activeEnrollments = input.enrollments.filter((item) => !item.deleted_at && item.status === 'ativa' && classIds.has(text(item, 'class_id')));
  const enrolledStudents = new Set(activeEnrollments.map((item) => text(item, 'student_id')));
  const attendance = latestAttendance(input.attendance).filter((item) => !item.deleted_at
    && classIds.has(text(item, 'class_id'))
    && text(item, 'date') >= filters.from
    && text(item, 'date') <= filters.to
    && (!filters.studentId || item.student_id === filters.studentId));

  const totals = emptyCounts();
  const classTotals = new Map<string, StatusCounts>();
  const daily = new Map<string, StatusCounts>();
  const studentClassRows = new Map<string, LocalRecord[]>();
  for (const record of attendance) {
    addStatus(totals, text(record, 'status'));
    const classId = text(record, 'class_id');
    const ownClass = classTotals.get(classId) ?? emptyCounts();
    addStatus(ownClass, text(record, 'status')); classTotals.set(classId, ownClass);
    const ownDay = daily.get(text(record, 'date')) ?? emptyCounts();
    addStatus(ownDay, text(record, 'status')); daily.set(text(record, 'date'), ownDay);
    const key = `${text(record, 'student_id')}|${classId}`;
    const ownStudent = studentClassRows.get(key) ?? [];
    ownStudent.push(record); studentClassRows.set(key, ownStudent);
  }

  const classById = new Map(input.classes.map((item) => [item.id, item]));
  const risk = new Set<string>();
  const absentees: AnalyticsResult['topAbsentees'] = [];
  for (const [key, records] of studentClassRows) {
    const [studentId, classId] = key.split('|');
    const counts = emptyCounts(); let streak = 0; let maximum = 0;
    for (const record of [...records].sort((left, right) => text(left, 'date').localeCompare(text(right, 'date')))) {
      const status = text(record, 'status'); addStatus(counts, status);
      streak = status === 'F' ? streak + 1 : 0;
      maximum = Math.max(maximum, streak);
    }
    const studentRate = rate(counts);
    if (studentRate < 75 || maximum >= 3) risk.add(key);
    if (counts.absent > 0) {
      const student = input.students.find((item) => item.id === studentId);
      const classRecord = classById.get(classId);
      absentees.push({
        studentId,
        name: text(student ?? { id: studentId }, 'name') || 'Aluno não informado',
        registrationNumber: text(student ?? { id: studentId }, 'registration_number'),
        classId,
        className: text(classRecord, 'name') || 'Turma não informada',
        absences: counts.absent,
        rate: studentRate,
      });
    }
  }

  const classesWithRecords = new Set(attendance.map((record) => text(record, 'class_id')));
  const teacherWorkload = new Map<string, { classes: Set<string>; students: Set<string> }>();
  for (const relation of input.classTeachers.filter((item) => !item.deleted_at && classIds.has(text(item, 'class_id')) && classesWithRecords.has(text(item, 'class_id')))) {
    const teacherId = text(relation, 'user_id'); const classId = text(relation, 'class_id');
    const workload = teacherWorkload.get(teacherId) ?? { classes: new Set<string>(), students: new Set<string>() };
    workload.classes.add(classId);
    for (const enrollment of activeEnrollments.filter((item) => item.class_id === classId)) workload.students.add(text(enrollment, 'student_id'));
    teacherWorkload.set(teacherId, workload);
  }

  return {
    ...totals,
    attendanceRate: rate(totals),
    distinctCalls: new Set(attendance.map((record) => `${text(record, 'class_id')}:${text(record, 'date')}`)).size,
    activeStudents: filters.studentId ? (enrolledStudents.has(filters.studentId) ? 1 : 0) : enrolledStudents.size,
    riskStudents: risk.size,
    evolution: [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, counts]) => ({ date, rate: rate(counts), records: counts.records })),
    byClass: visibleClasses
      .map((item) => {
        const counts = classTotals.get(item.id) ?? emptyCounts();
        const rawName = text(item, 'name');
        const num = item.class_number !== undefined && item.class_number !== null
          ? Number(item.class_number)
          : extractClassNumber(rawName);
        return {
          ...counts,
          id: item.id,
          name: rawName,
          classNumber: num,
          courseId: text(item, 'course_id'),
          rate: rate(counts),
        };
      })
      .sort((left, right) => {
        const numA = left.classNumber ?? 999999;
        const numB = right.classNumber ?? 999999;
        if (numA !== numB) return numA - numB;
        return left.name.localeCompare(right.name, 'pt-BR');
      }),
    topAbsentees: absentees.sort((left, right) => right.absences - left.absences || left.rate - right.rate).slice(0, 10),
    teacherWorkload: [...teacherWorkload.entries()].map(([teacherId, value]) => ({ teacherId, classes: value.classes.size, students: value.students.size })).sort((left, right) => right.classes - left.classes || right.students - left.students),
  };
}
