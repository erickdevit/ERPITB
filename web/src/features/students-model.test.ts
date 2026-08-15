import { describe, expect, it } from 'vitest';
import type { LocalRecord } from '../types';
import {
  buildStudentViews,
  classesVisibleToSession,
  filterStudentViews,
  permissionsForStudents,
  validateStudentDraft,
} from './students-model';

const students: LocalRecord[] = [
  { id: 'student-1', name: 'Ana Souza', cpf: '12345678901', registration_number: 'MAT-1', active: 1, created_at: '2026-01-10T12:00:00Z' },
  { id: 'student-2', name: 'Bruno Lima', cpf: '98765432100', registration_number: 'MAT-2', active: 1 },
  { id: 'student-inactive', name: 'Inativo', registration_number: 'MAT-3', active: 0 },
];
const classes: LocalRecord[] = [
  { id: 'class-1', name: 'Turma A', active: 1 },
  { id: 'class-2', name: 'Turma B', active: 1 },
];
const enrollments: LocalRecord[] = [
  { id: 'enrollment-1', student_id: 'student-1', class_id: 'class-1', status: 'ativa' },
  { id: 'enrollment-2', student_id: 'student-2', class_id: 'class-2', status: 'trancada' },
  { id: 'enrollment-3', student_id: 'student-inactive', class_id: 'class-1', status: 'ativa' },
];
const assignments: LocalRecord[] = [
  { id: 'assignment-1', class_id: 'class-1', user_id: 'teacher-1' },
  { id: 'assignment-2', class_id: 'class-2', user_id: 'teacher-2' },
];
const attendance: LocalRecord[] = [
  { id: 'attendance-old', student_id: 'student-1', class_id: 'class-1', date: '2026-08-01', status: 'F', updated_at: '2026-08-01T10:00:00Z' },
  { id: 'attendance-latest', student_id: 'student-1', class_id: 'class-1', date: '2026-08-01', status: 'P', updated_at: '2026-08-01T11:00:00Z' },
  { id: 'attendance-2', student_id: 'student-1', class_id: 'class-1', date: '2026-08-02', status: 'F' },
];

const build = (role: 'admin' | 'pedagogico' | 'professor' = 'admin', id = 'admin') => buildStudentViews({
  students, classes, enrollments, assignments, attendance, session: { id, role },
});

describe('students model', () => {
  it('limita professor às turmas atribuídas e mantém a tela somente leitura', () => {
    expect(classesVisibleToSession(classes, assignments, { id: 'teacher-1', role: 'professor' }).map((item) => item.id)).toEqual(['class-1']);
    expect(build('professor', 'teacher-1')).toEqual([expect.objectContaining({ id: 'student-1', classId: 'class-1' })]);
    expect(permissionsForStudents('professor')).toMatchObject({ readOnly: true, canCreate: false, canEdit: false, canDelete: false });
  });

  it('calcula a última marcação por dia e aplica as faixas históricas de desempenho', () => {
    const rows = build();
    expect(rows.find((row) => row.id === 'student-1')).toMatchObject({ attendanceRecords: 2, attendanceRate: 50 });
    expect(filterStudentViews(rows, { query: '', classId: '', teacherId: '', performance: 'critical', enrollmentStatus: '' }).map((row) => row.id)).toEqual(['student-1']);
    expect(filterStudentViews(rows, { query: '', classId: '', teacherId: '', performance: 'regular', enrollmentStatus: '' }).map((row) => row.id)).toEqual(['student-2']);
  });

  it('filtra por nome, matrícula, CPF, turma, professor e situação da matrícula', () => {
    const rows = build();
    const base = { query: '', classId: '', teacherId: '', performance: '' as const, enrollmentStatus: '' };
    expect(filterStudentViews(rows, { ...base, query: '987654' }).map((row) => row.id)).toEqual(['student-2']);
    expect(filterStudentViews(rows, { ...base, classId: 'class-1' }).map((row) => row.id)).toEqual(['student-1']);
    expect(filterStudentViews(rows, { ...base, teacherId: 'teacher-2', enrollmentStatus: 'trancada' }).map((row) => row.id)).toEqual(['student-2']);
  });

  it('espelha criação/edição, inativação pedagógica e exclusão administrativa do backend', () => {
    expect(permissionsForStudents('admin')).toMatchObject({ canCreate: true, canEdit: true, canDelete: true, canInactivate: false });
    expect(permissionsForStudents('pedagogico')).toMatchObject({ canCreate: true, canEdit: true, canDelete: false, canInactivate: true });
  });

  it('valida os limites do contrato antes de gravar offline', () => {
    const valid = { classId: 'class-1', name: 'Ana Souza', registrationNumber: 'MAT-1', cpf: '12345678901', contact: '', birthDate: '' };
    expect(validateStudentDraft(valid, new Set(['class-1']))).toBeUndefined();
    expect(validateStudentDraft({ ...valid, classId: 'missing' }, new Set(['class-1']))).toContain('turma');
    expect(validateStudentDraft({ ...valid, name: 'A' }, new Set(['class-1']))).toContain('nome');
    expect(validateStudentDraft({ ...valid, cpf: '123' }, new Set(['class-1']))).toContain('CPF');
  });
});
