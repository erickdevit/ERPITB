import { describe, expect, it } from 'vitest';
import { buildClassViews, filterClassViews, permissionsForClasses, planTeacherToggle, validateClassDraft } from './classes-model';
import type { LocalRecord } from '../types';

const classes: LocalRecord[] = [
  { id: 'class-2', name: 'Beta', course_id: 'course-2', shift: 'tarde', active: 1 },
  { id: 'class-1', name: 'Alfa', course_id: 'course-1', shift: 'manha', active: 1 },
];
const courses: LocalRecord[] = [
  { id: 'course-1', name: 'Informática' },
  { id: 'course-2', name: 'Administração' },
];
const assignments: LocalRecord[] = [
  { id: 'a-1', class_id: 'class-1', user_id: 'teacher-1' },
  { id: 'a-2', class_id: 'class-2', user_id: 'teacher-2' },
];
const teachers: LocalRecord[] = [
  { id: 'teacher-1', name: 'Ana', email: 'ana@itb.test' },
  { id: 'teacher-2', name: 'Bruno', email: 'bruno@itb.test' },
];

describe('classes model', () => {
  it('limita o professor às próprias turmas e preserva os dados de exibição', () => {
    const rows = buildClassViews({ classes, courses, laboratories: [], assignments, teachers, session: { id: 'teacher-1', name: 'Ana', email: 'ana@itb.test', role: 'professor' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'class-1', courseName: 'Informática', teachers: [{ name: 'Ana' }] });
  });

  it('busca por turma ou curso e filtra pelo professor', () => {
    const rows = buildClassViews({ classes, courses, laboratories: [], assignments, teachers, session: { id: 'admin', name: 'Admin', email: 'admin@itb.test', role: 'admin' } });
    expect(filterClassViews(rows, 'administração', '')).toEqual([expect.objectContaining({ id: 'class-2' })]);
    expect(filterClassViews(rows, '', 'teacher-1')).toEqual([expect.objectContaining({ id: 'class-1' })]);
  });

  it('espelha as permissões de turmas do backend', () => {
    expect(permissionsForClasses('admin')).toMatchObject({ canCreate: true, canEdit: true, canDelete: true, canAssignTeachers: true });
    expect(permissionsForClasses('pedagogico')).toMatchObject({ canCreate: false, canEdit: true, canDelete: false, canAssignTeachers: true });
    expect(permissionsForClasses('professor')).toMatchObject({ readOnly: true, canEdit: false, canAssignTeachers: false });
  });

  it('valida o mesmo domínio aceito pelo contrato de turmas', () => {
    const base = { name: 'Turma A', courseId: 'course-1', shift: 'manha', weekDay: '', laboratoryId: '', teacherId: '', isKids: false };
    expect(validateClassDraft(base, new Set(['course-1']))).toBeUndefined();
    expect(validateClassDraft({ ...base, name: 'A' }, new Set(['course-1']))).toContain('pelo menos 2');
    expect(validateClassDraft({ ...base, shift: 'madrugada' }, new Set(['course-1']))).toContain('turno');
    expect(validateClassDraft({ ...base, courseId: 'inexistente' }, new Set(['course-1']))).toContain('curso');
  });

  it('reaproveita vínculo arquivado e impede remover o último professor', () => {
    const archived = { id: 'old', class_id: 'class-1', user_id: 'teacher-2', deleted_at: '2026-01-01' };
    expect(planTeacherToggle([assignments[0]!, archived], 'class-1', 'teacher-2', true)).toEqual({ kind: 'upsert', record: archived });
    expect(planTeacherToggle([assignments[0]!], 'class-1', 'teacher-1', false)).toEqual({ kind: 'error', message: 'A turma deve manter ao menos um professor ativo.' });
    expect(planTeacherToggle(assignments.concat({ id: 'a-3', class_id: 'class-1', user_id: 'teacher-2' }), 'class-1', 'teacher-1', false)).toEqual({ kind: 'delete', record: assignments[0] });
  });

  it('extrai números das turmas, remove dos nomes e ordena de forma crescente numérica', () => {
    const rawClasses: LocalRecord[] = [
      { id: 'c-10', name: 'Turma 10 - Robótica', course_id: 'course-1', active: 1 },
      { id: 'c-2', name: '02 - Informática', course_id: 'course-1', active: 1 },
      { id: 'c-1', name: 'Turma 01 - Informática', course_id: 'course-1', active: 1 },
      { id: 'c-5', name: 'Turma 05', course_id: 'course-1', active: 1 },
    ];
    const rows = buildClassViews({
      classes: rawClasses,
      courses,
      laboratories: [],
      assignments: [],
      teachers: [],
      session: { id: 'admin', name: 'Admin', email: 'admin@itb.test', role: 'admin' },
    });

    expect(rows).toHaveLength(4);
    // Order must be numeric ascending: 1, 2, 5, 10
    expect(rows[0]!.classNumber).toBe(1);
    expect(rows[0]!.name).toBe('Informática');
    expect(rows[0]!.displayName).toBe('#01 - Informática');

    expect(rows[1]!.classNumber).toBe(2);
    expect(rows[1]!.name).toBe('Informática');
    expect(rows[1]!.displayName).toBe('#02 - Informática');

    expect(rows[2]!.classNumber).toBe(5);
    expect(rows[2]!.displayName).toBe('#05 - Turma');

    expect(rows[3]!.classNumber).toBe(10);
    expect(rows[3]!.name).toBe('Robótica');
    expect(rows[3]!.displayName).toBe('#10 - Robótica');

    // Suffix sections like Turma 01 - A
    const sectionClass: LocalRecord = { id: 'c-3', name: 'Turma 03 - A', course_id: 'course-1', active: 1 };
    const sectionRows = buildClassViews({
      classes: [sectionClass],
      courses,
      laboratories: [],
      assignments: [],
      teachers: [],
      session: { id: 'admin', name: 'Admin', email: 'admin@itb.test', role: 'admin' },
    });
    expect(sectionRows[0]!.classNumber).toBe(3);
    expect(sectionRows[0]!.name).toBe('Turma A');
    expect(sectionRows[0]!.displayName).toBe('#03 - Turma A');
  });
});
