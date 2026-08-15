import { describe, expect, it } from 'vitest';
import type { LocalRecord } from '../../types';
import { buildReportView, type ReportFilters, type ReportInput, type ReportType } from './model';

const record = (id: string, values: Omit<LocalRecord, 'id'> = {}): LocalRecord => ({ id, ...values });

const input: ReportInput = {
  courses: [record('course-1', { code: 'WD', name: 'Web Design', active: 1 }), record('course-2', { code: 'MK', name: 'Marketing', active: 1 })],
  classes: [
    record('class-1', { name: 'Turma A', course_id: 'course-1', shift: 'manha', active: 1 }),
    record('class-2', { name: 'Turma B', course_id: 'course-2', shift: 'tarde', active: 1 }),
  ],
  students: [
    record('student-1', { name: 'Ana', registration_number: '001', active: 1 }),
    record('student-2', { name: 'Bia', registration_number: '002', active: 1 }),
  ],
  enrollments: [
    record('enrollment-1', { class_id: 'class-1', student_id: 'student-1', status: 'ativa' }),
    record('enrollment-2', { class_id: 'class-1', student_id: 'student-2', status: 'ativa' }),
  ],
  attendance: [
    record('a1', { class_id: 'class-1', student_id: 'student-1', date: '2026-08-01', status: 'P', notes: 'Participou bem', updated_at: '2026-08-01T10:00:00Z' }),
    record('a2', { class_id: 'class-1', student_id: 'student-1', date: '2026-08-02', status: 'F', updated_at: '2026-08-02T10:00:00Z' }),
    record('a3-old', { class_id: 'class-1', student_id: 'student-1', date: '2026-08-03', status: 'P', updated_at: '2026-08-03T09:00:00Z' }),
    record('a3', { class_id: 'class-1', student_id: 'student-1', date: '2026-08-03', status: 'F', updated_at: '2026-08-03T10:00:00Z' }),
    record('a4', { class_id: 'class-1', student_id: 'student-1', date: '2026-08-04', status: 'F', updated_at: '2026-08-04T10:00:00Z' }),
    record('a5', { class_id: 'class-1', student_id: 'student-2', date: '2026-08-01', status: 'RC', updated_at: '2026-08-01T10:00:00Z' }),
  ],
  classNotes: [record('note-1', { class_id: 'class-1', date: '2026-08-01', notes: 'Revisão do módulo' })],
  classTeachers: [record('teacher-link', { class_id: 'class-1', user_id: 'teacher-1' })],
  directory: [record('teacher-1', { name: 'Professora Lia', role: 'professor' })],
};

const filters = (type: ReportType, values: Partial<ReportFilters> = {}): ReportFilters => ({
  type,
  from: '2026-08-01',
  to: '2026-08-31',
  ...values,
});

describe('buildReportView', () => {
  it('builds the institutional consolidation using only the latest daily status', () => {
    const view = buildReportView(input, filters('institutional'));

    expect(view.ready).toBe(true);
    expect(view.headers).toEqual(['Código', 'Curso', 'Turmas', 'Alunos ativos', 'Chamadas', 'Frequência']);
    expect(view.metrics.find((item) => item.label === 'Chamadas realizadas')?.value).toBe('4');
    expect(view.rows.find((row) => row[0] === 'WD')).toEqual(['WD', 'Web Design', 1, 2, 4, '20,0%']);
  });

  it('builds the course summary and respects the professor scope', () => {
    const view = buildReportView(input, filters('course', { courseId: 'course-1', teacherId: 'teacher-1' }));

    expect(view.ready).toBe(true);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.slice(0, 4)).toEqual(['Turma A', 'Manhã', 2, 4]);
    expect(view.context).toContain('Professor: Professora Lia');
  });

  it('builds a complete class diary matrix without keeping overwritten statuses', () => {
    const view = buildReportView(input, filters('classDiary', { classId: 'class-1' }));

    expect(view.matrix).toBe(true);
    expect(view.headers).toEqual(['Matrícula', 'Aluno', '01/08', '02/08', '03/08', '04/08', 'F', '%']);
    expect(view.rows[0]).toEqual(['001', 'Ana', 'P', 'F', 'F', 'F', 3, '25,0%']);
    expect(view.rows[1]).toEqual(['002', 'Bia', 'RC', '—', '—', '—', 0, '0,0%']);
  });

  it('includes individual and class notes in the student sheet', () => {
    const view = buildReportView(input, filters('student', { classId: 'class-1', studentId: 'student-1' }));

    expect(view.ready).toBe(true);
    expect(view.headers).toEqual(['Data', 'Situação', 'Anotação do aluno', 'Observação da turma']);
    expect(view.rows).toContainEqual(['01/08/2026', 'Presente', 'Participou bem', 'Revisão do módulo']);
  });

  it('detects dropout risk by attendance rate and consecutive absences', () => {
    const view = buildReportView(input, filters('dropoutRisk', { classId: 'class-1' }));

    expect(view.ready).toBe(true);
    expect(view.rows[0]).toEqual(['002', 'Bia', 'Turma A', 0, 0, '0,0%', 'Frequência abaixo de 75%']);
    expect(view.rows[1]?.[6]).toBe('Frequência abaixo de 75%; 3 ou mais faltas consecutivas');
  });

  it('reports missing required filters and invalid periods explicitly', () => {
    expect(buildReportView(input, filters('student', { classId: 'class-1' })).requiredMessage).toBe('Selecione um aluno para visualizar sua ficha.');
    expect(buildReportView(input, filters('institutional', { from: '2026-09-01', to: '2026-08-01' })).requiredMessage).toBe('A data inicial precisa ser anterior ou igual à data final.');
  });
});
