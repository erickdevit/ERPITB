import { latestAttendance } from '../lib/attendance';
import type { LocalRecord, Role, UserSession } from '../types';

export const enrollmentStatuses = ['ativa', 'trancada', 'concluida'] as const;
export type EnrollmentStatus = typeof enrollmentStatuses[number];
export type PerformanceFilter = '' | 'critical' | 'attention' | 'regular';

export interface StudentDraft {
  classId: string;
  name: string;
  registrationNumber: string;
  cpf: string;
  contact: string;
  birthDate: string;
}

export interface StudentView {
  key: string;
  id: string;
  record: LocalRecord;
  enrollment: LocalRecord;
  name: string;
  registrationNumber: string;
  cpf: string;
  contact: string;
  birthDate: string;
  registrationDate: string;
  classId: string;
  className: string;
  enrollmentStatus: EnrollmentStatus | string;
  attendanceRate: number;
  attendanceRecords: number;
  teacherIds: string[];
}

export interface StudentFilters {
  query: string;
  classId: string;
  teacherId: string;
  performance: PerformanceFilter;
  enrollmentStatus: string;
}

export interface StudentPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canInactivate: boolean;
  readOnly: boolean;
}

const text = (record: Record<string, unknown> | undefined, key: string) => String(record?.[key] ?? '');
const current = (record: LocalRecord) => !record.deleted_at;
const activeStudent = (record: LocalRecord) => current(record) && record.active !== 0 && record.active !== false;

export function permissionsForStudents(role: Role): StudentPermissions {
  return {
    canCreate: role === 'admin' || role === 'pedagogico',
    canEdit: role === 'admin' || role === 'pedagogico',
    canDelete: role === 'admin',
    canInactivate: role === 'pedagogico',
    readOnly: role === 'professor',
  };
}

export function classesVisibleToSession(classes: LocalRecord[], assignments: LocalRecord[], session: Pick<UserSession, 'id' | 'role'>): LocalRecord[] {
  const visibleClassIds = session.role === 'professor'
    ? new Set(assignments.filter(current).filter((item) => item.user_id === session.id).map((item) => text(item, 'class_id')))
    : null;
  return classes.filter(current)
    .filter((item) => item.active !== 0 && item.active !== false)
    .filter((item) => !visibleClassIds || visibleClassIds.has(item.id))
    .sort((left, right) => text(left, 'name').localeCompare(text(right, 'name'), 'pt-BR'));
}

export function buildStudentViews(input: {
  students: LocalRecord[];
  enrollments: LocalRecord[];
  classes: LocalRecord[];
  assignments: LocalRecord[];
  attendance: LocalRecord[];
  session: Pick<UserSession, 'id' | 'role'>;
}): StudentView[] {
  const classes = new Map(classesVisibleToSession(input.classes, input.assignments, input.session).map((item) => [item.id, item]));
  const assignments = input.assignments.filter(current);
  const students = new Map(input.students.filter(activeStudent).map((item) => [item.id, item]));
  const attendance = latestAttendance(input.attendance).filter(current);

  return input.enrollments.filter(current)
    .filter((enrollment) => classes.has(text(enrollment, 'class_id')) && students.has(text(enrollment, 'student_id')))
    .map((enrollment) => {
      const student = students.get(text(enrollment, 'student_id'))!;
      const classId = text(enrollment, 'class_id');
      const ownAttendance = attendance.filter((record) => record.student_id === student.id && record.class_id === classId);
      const present = ownAttendance.filter((record) => record.status === 'P').length;
      return {
        key: `${student.id}:${enrollment.id}`,
        id: student.id,
        record: student,
        enrollment,
        name: text(student, 'name') || 'Aluno sem nome',
        registrationNumber: text(student, 'registration_number'),
        cpf: text(student, 'cpf'),
        contact: text(student, 'contact'),
        birthDate: text(student, 'birth_date'),
        registrationDate: text(student, 'created_at'),
        classId,
        className: text(classes.get(classId), 'name') || 'Turma não informada',
        enrollmentStatus: text(enrollment, 'status') || 'ativa',
        attendanceRate: ownAttendance.length ? Math.round(present * 1000 / ownAttendance.length) / 10 : 100,
        attendanceRecords: ownAttendance.length,
        teacherIds: assignments.filter((item) => item.class_id === classId).map((item) => text(item, 'user_id')),
      } satisfies StudentView;
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.className.localeCompare(right.className, 'pt-BR'));
}

export function filterStudentViews(rows: StudentView[], filters: StudentFilters): StudentView[] {
  const query = filters.query.trim().toLocaleLowerCase('pt-BR');
  return rows.filter((row) => {
    if (query && !`${row.name} ${row.registrationNumber} ${row.cpf}`.toLocaleLowerCase('pt-BR').includes(query)) return false;
    if (filters.classId && row.classId !== filters.classId) return false;
    if (filters.teacherId && !row.teacherIds.includes(filters.teacherId)) return false;
    if (filters.enrollmentStatus && row.enrollmentStatus !== filters.enrollmentStatus) return false;
    if (filters.performance === 'critical' && row.attendanceRate >= 75) return false;
    if (filters.performance === 'attention' && (row.attendanceRate < 75 || row.attendanceRate > 85)) return false;
    if (filters.performance === 'regular' && row.attendanceRate <= 85) return false;
    return true;
  });
}

export function validateStudentDraft(draft: StudentDraft, availableClassIds: ReadonlySet<string>): string | undefined {
  if (!availableClassIds.has(draft.classId)) return 'Selecione uma turma válida.';
  const name = draft.name.trim();
  if (name.length < 2) return 'Informe um nome com pelo menos 2 caracteres.';
  if (name.length > 160) return 'O nome deve ter no máximo 160 caracteres.';
  const registration = draft.registrationNumber.trim();
  if (registration.length < 2) return 'Informe uma matrícula com pelo menos 2 caracteres.';
  if (registration.length > 40) return 'A matrícula deve ter no máximo 40 caracteres.';
  const cpf = draft.cpf.trim();
  if (cpf && (cpf.length < 11 || cpf.length > 20)) return 'O CPF deve ter entre 11 e 20 caracteres.';
  if (draft.contact.trim().length > 200) return 'O contato deve ter no máximo 200 caracteres.';
  return undefined;
}

export function enrollmentStatusLabel(status: string): string {
  return ({ ativa: 'Ativa', trancada: 'Trancada', concluida: 'Concluída' } as Record<string, string>)[status] ?? status;
}

export function performanceTone(rate: number): 'error' | 'warning' | 'success' {
  if (rate < 75) return 'error';
  if (rate <= 85) return 'warning';
  return 'success';
}
