import { describe, expect, it } from 'vitest';
import {
  buildUnifiedBoletimData,
  MIN_ATTENDANCE_RATE,
  MIN_PASSING_GRADE,
  type AcademicStatus,
} from '../../src/lib/boletim';
import type { LocalRecord } from '../../src/types';

describe('E2E Boletim Engine Suite (R2, F6)', () => {
  // Helper factories
  const createStudent = (id: string, name: string, reg: string): LocalRecord => ({
    id,
    name,
    registration_number: reg,
    active: 1,
  });

  const createCourse = (id: string, name: string): LocalRecord => ({
    id,
    name,
    code: 'DEV-WEB',
    active: 1,
  });

  const createClass = (id: string, name: string, courseId = 'course-1'): LocalRecord => ({
    id,
    name,
    course_id: courseId,
    active: 1,
  });

  const createEnrollment = (id: string, classId: string, studentId: string, status = 'ativa'): LocalRecord => ({
    id,
    class_id: classId,
    student_id: studentId,
    status,
  });

  const createGradeTable = (
    id: string,
    classId: string,
    name: string,
    calculationMode: 'simple' | 'weighted' | 'sum' = 'simple',
    passingGrade = 6.0,
    startDate?: string,
    endDate?: string,
  ): LocalRecord => ({
    id,
    class_id: classId,
    name,
    calculation_mode: calculationMode,
    passing_grade: passingGrade,
    published: true,
    ...(startDate ? { start_date: startDate } : {}),
    ...(endDate ? { end_date: endDate } : {}),
  });

  const createGradeItem = (
    id: string,
    tableId: string,
    classId: string,
    name: string,
    maxScore = 10,
    weight = 1,
  ): LocalRecord => ({
    id,
    grade_table_id: tableId,
    class_id: classId,
    name,
    max_score: maxScore,
    weight,
  });

  const createStudentGrade = (
    id: string,
    itemId: string,
    tableId: string,
    classId: string,
    studentId: string,
    score: number | null,
  ): LocalRecord => ({
    id,
    grade_item_id: itemId,
    grade_table_id: tableId,
    class_id: classId,
    student_id: studentId,
    score,
  });

  const createAttendance = (
    id: string,
    classId: string,
    studentId: string,
    date: string,
    status: 'P' | 'F' | 'J' | 'A' | 'R' | 'RC',
    updatedAt?: string,
  ): LocalRecord => ({
    id,
    class_id: classId,
    student_id: studentId,
    date,
    status,
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  });

  // Base fixtures
  const student = createStudent('s1', 'Mariana Rocha', 'ITB-2026-100');
  const course = createCourse('c-web', 'Desenvolvimento Web Full Stack');
  const classA = createClass('cls-a', 'Turma A', 'c-web');
  const enrollment = createEnrollment('e1', 'cls-a', 's1');

  // =========================================================================
  // TIER 1: Feature Coverage (≥5 tests)
  // =========================================================================
  describe('Tier 1: Feature Coverage', () => {
    it('T1.1: Attendance metrics calculate exact counts and percentage', () => {
      // 10 classes: 7 P, 1 RC (presence), 1 F, 1 J (justified) -> 8 presences, 1 absence, 1 justified
      const attendance = [
        createAttendance('a1', 'cls-a', 's1', '2026-03-01', 'P'),
        createAttendance('a2', 'cls-a', 's1', '2026-03-02', 'P'),
        createAttendance('a3', 'cls-a', 's1', '2026-03-03', 'P'),
        createAttendance('a4', 'cls-a', 's1', '2026-03-04', 'P'),
        createAttendance('a5', 'cls-a', 's1', '2026-03-05', 'P'),
        createAttendance('a6', 'cls-a', 's1', '2026-03-06', 'P'),
        createAttendance('a7', 'cls-a', 's1', '2026-03-07', 'P'),
        createAttendance('a8', 'cls-a', 's1', '2026-03-08', 'RC'), // RC = completed replacement = counts as presence
        createAttendance('a9', 'cls-a', 's1', '2026-03-09', 'F'),
        createAttendance('a10', 'cls-a', 's1', '2026-03-10', 'J'), // J = justified
      ];

      const table = createGradeTable('t1', 'cls-a', 'Módulo 1: Fundamentos');
      const item = createGradeItem('i1', 't1', 'cls-a', 'Prova 1');
      const grade = createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 8.5);

      const data = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: attendance,
        gradeTables: [table],
        gradeItems: [item],
        studentGrades: [grade],
      });

      expect(data).not.toBeNull();
      const mod = data!.modules[0];
      expect(mod.classesHeld).toBe(10);
      expect(mod.presences).toBe(8); // 7 P + 1 RC
      expect(mod.absences).toBe(1); // 1 F
      expect(mod.justified).toBe(1); // 1 J
      expect(mod.attendanceRate).toBe(80.0); // 8/10 = 80.0%
      expect(data!.overallAttendanceRate).toBe(80.0);
    });

    it('T1.2: Simple Average mode computes correct arithmetic mean', () => {
      const table = createGradeTable('t1', 'cls-a', 'Módulo Frontend', 'simple');
      const item1 = createGradeItem('i1', 't1', 'cls-a', 'Atividade 1', 10);
      const item2 = createGradeItem('i2', 't1', 'cls-a', 'Atividade 2', 10);
      const item3 = createGradeItem('i3', 't1', 'cls-a', 'Prova Final', 10);

      // Grades: 8.0, 7.0, 9.0 -> Mean = (8 + 7 + 9) / 3 = 8.0
      const grades = [
        createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 8.0),
        createStudentGrade('g2', 'i2', 't1', 'cls-a', 's1', 7.0),
        createStudentGrade('g3', 'i3', 't1', 'cls-a', 's1', 9.0),
      ];

      const data = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [createAttendance('a1', 'cls-a', 's1', '2026-03-01', 'P')],
        gradeTables: [table],
        gradeItems: [item1, item2, item3],
        studentGrades: grades,
      });

      expect(data).not.toBeNull();
      const mod = data!.modules[0];
      expect(mod.finalGrade).toBe(8.0);
      expect(mod.academicStatus).toBe('Aprovado');
    });

    it('T1.3: Weighted Average mode applies item weights correctly', () => {
      const table = createGradeTable('t1', 'cls-a', 'Módulo Backend', 'weighted');
      const item1 = createGradeItem('i1', 't1', 'cls-a', 'Trabalho', 10, 2); // weight 2
      const item2 = createGradeItem('i2', 't1', 'cls-a', 'Projeto Final', 10, 3); // weight 3

      // Grades: Trabalho = 6.0, Projeto Final = 8.0
      // Weighted average: (6.0 * 2 + 8.0 * 3) / (2 + 3) = (12 + 24) / 5 = 36 / 5 = 7.2
      const grades = [
        createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 6.0),
        createStudentGrade('g2', 'i2', 't1', 'cls-a', 's1', 8.0),
      ];

      const data = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [createAttendance('a1', 'cls-a', 's1', '2026-03-01', 'P')],
        gradeTables: [table],
        gradeItems: [item1, item2],
        studentGrades: grades,
      });

      expect(data).not.toBeNull();
      const mod = data!.modules[0];
      expect(mod.finalGrade).toBe(7.2);
    });

    it('T1.4: Sum mode aggregates scores capped at 10.0', () => {
      const table = createGradeTable('t1', 'cls-a', 'Módulo Prático', 'sum');
      const item1 = createGradeItem('i1', 't1', 'cls-a', 'Exercício 1', 3);
      const item2 = createGradeItem('i2', 't1', 'cls-a', 'Exercício 2', 4);
      const item3 = createGradeItem('i3', 't1', 'cls-a', 'Exercício 3', 5);

      // Scores: 2.5 + 3.5 + 4.0 = 10.0
      const grades = [
        createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 2.5),
        createStudentGrade('g2', 'i2', 't1', 'cls-a', 's1', 3.5),
        createStudentGrade('g3', 'i3', 't1', 'cls-a', 's1', 4.0),
      ];

      const data = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [createAttendance('a1', 'cls-a', 's1', '2026-03-01', 'P')],
        gradeTables: [table],
        gradeItems: [item1, item2, item3],
        studentGrades: grades,
      });

      expect(data).not.toBeNull();
      expect(data!.modules[0].finalGrade).toBe(10.0);
    });

    it('T1.5: Consolidated Matrix builds all modules and calculates overall GPA', () => {
      // 3 Modules in Turma A
      const t1 = createGradeTable('t1', 'cls-a', 'Módulo 1: HTML/CSS', 'simple', 6.0, '2026-02-01', '2026-02-28');
      const t2 = createGradeTable('t2', 'cls-a', 'Módulo 2: JavaScript', 'simple', 6.0, '2026-03-01', '2026-03-31');
      const t3 = createGradeTable('t3', 'cls-a', 'Módulo 3: React', 'simple', 6.0, '2026-04-01', '2026-04-30');

      const i1 = createGradeItem('i1', 't1', 'cls-a', 'P1', 10);
      const i2 = createGradeItem('i2', 't2', 'cls-a', 'P1', 10);
      const i3 = createGradeItem('i3', 't3', 'cls-a', 'P1', 10);

      // Grades: M1 = 8.0, M2 = 7.0, M3 = 9.0 -> GPA = (8 + 7 + 9) / 3 = 8.0
      const grades = [
        createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 8.0),
        createStudentGrade('g2', 'i2', 't2', 'cls-a', 's1', 7.0),
        createStudentGrade('g3', 'i3', 't3', 'cls-a', 's1', 9.0),
      ];

      // 1 class per month, all P
      const attendance = [
        createAttendance('a1', 'cls-a', 's1', '2026-02-15', 'P'),
        createAttendance('a2', 'cls-a', 's1', '2026-03-15', 'P'),
        createAttendance('a3', 'cls-a', 's1', '2026-04-15', 'P'),
      ];

      const data = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: attendance,
        gradeTables: [t1, t2, t3],
        gradeItems: [i1, i2, i3],
        studentGrades: grades,
      });

      expect(data).not.toBeNull();
      expect(data!.modules).toHaveLength(3);
      expect(data!.modules[0].moduleName).toBe('Módulo 1: HTML/CSS');
      expect(data!.modules[1].moduleName).toBe('Módulo 2: JavaScript');
      expect(data!.modules[2].moduleName).toBe('Módulo 3: React');
      expect(data!.overallGpa).toBe(8.0);
      expect(data!.overallAcademicStatus).toBe('Aprovado');
    });

    it('T1.6: Validates all 6 Academic Status branches', () => {
      // Helper runner
      const runStatusTest = (
        attendanceStatus: 'P' | 'F',
        attendanceCount: { p: number; f: number },
        score: number | null,
        hasItem = true,
      ): AcademicStatus => {
        const t = createGradeTable('t', 'cls-a', 'Mod');
        const items = hasItem ? [createGradeItem('i', 't', 'cls-a', 'P')] : [];
        const grades = hasItem && score !== null ? [createStudentGrade('g', 'i', 't', 'cls-a', 's1', score)] : [];

        const att: LocalRecord[] = [];
        for (let i = 0; i < attendanceCount.p; i++) att.push(createAttendance(`p${i}`, 'cls-a', 's1', `2026-01-${10 + i}`, 'P'));
        for (let i = 0; i < attendanceCount.f; i++) att.push(createAttendance(`f${i}`, 'cls-a', 's1', `2026-01-${20 + i}`, 'F'));

        const res = buildUnifiedBoletimData({
          studentId: 's1',
          students: [student],
          courses: [course],
          classes: [classA],
          enrollments: [enrollment],
          attendanceRecords: att,
          gradeTables: [t],
          gradeItems: items,
          studentGrades: grades,
        });

        return res!.modules[0].academicStatus;
      };

      // 1. Aprovado: Freq 100% (4 P), Grade 8.0 >= 6.0
      expect(runStatusTest('P', { p: 4, f: 0 }, 8.0)).toBe('Aprovado');

      // 2. Reprovado por Nota: Freq 100% (4 P), Grade 5.0 < 6.0
      expect(runStatusTest('P', { p: 4, f: 0 }, 5.0)).toBe('Reprovado por Nota');

      // 3. Reprovado por Frequência: Freq 50% (2 P, 2 F < 75%), Grade 9.0 >= 6.0
      expect(runStatusTest('P', { p: 2, f: 2 }, 9.0)).toBe('Reprovado por Frequência');

      // 4. Reprovado por Nota e Frequência: Freq 50% (2 P, 2 F < 75%), Grade 4.0 < 6.0
      expect(runStatusTest('P', { p: 2, f: 2 }, 4.0)).toBe('Reprovado por Nota e Frequência');

      // 5. Em Andamento: Freq 100%, Grade pending (null)
      expect(runStatusTest('P', { p: 4, f: 0 }, null)).toBe('Em Andamento');

      // 6. Sem Notas: No grade items defined
      expect(runStatusTest('P', { p: 4, f: 0 }, null, false)).toBe('Sem Notas');
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (≥5 tests)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    it('T2.1: Attendance rate boundary at exactly 75.0% vs 74.9%', () => {
      const t = createGradeTable('t', 'cls-a', 'Mod');
      const i = createGradeItem('i', 't', 'cls-a', 'P', 10);
      const g = createStudentGrade('g', 'i', 't', 'cls-a', 's1', 8.0);

      // Exactly 75.0%: 3 P, 1 F (3/4 = 75.0%) -> Aprovado
      const res75 = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [
          createAttendance('a1', 'cls-a', 's1', '2026-01-01', 'P'),
          createAttendance('a2', 'cls-a', 's1', '2026-01-02', 'P'),
          createAttendance('a3', 'cls-a', 's1', '2026-01-03', 'P'),
          createAttendance('a4', 'cls-a', 's1', '2026-01-04', 'F'),
        ],
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [g],
      });
      expect(res75!.modules[0].attendanceRate).toBe(75.0);
      expect(res75!.modules[0].academicStatus).toBe('Aprovado');

      // Just below 75%: 29 P, 10 F (29/39 = 74.35...% -> 74.4%) -> Reprovado por Frequência
      const att74: LocalRecord[] = [];
      for (let k = 1; k <= 29; k++) att74.push(createAttendance(`p${k}`, 'cls-a', 's1', `2026-02-${String(k).padStart(2, '0')}`, 'P'));
      for (let k = 1; k <= 10; k++) att74.push(createAttendance(`f${k}`, 'cls-a', 's1', `2026-03-${String(k).padStart(2, '0')}`, 'F'));

      const res74 = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: att74,
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [g],
      });
      expect(res74!.modules[0].attendanceRate).toBe(74.4);
      expect(res74!.modules[0].academicStatus).toBe('Reprovado por Frequência');
    });

    it('T2.2: Grade passing boundary at exactly 6.0 vs 5.9', () => {
      const t = createGradeTable('t', 'cls-a', 'Mod');
      const i = createGradeItem('i', 't', 'cls-a', 'P', 10);
      const att = [createAttendance('a1', 'cls-a', 's1', '2026-01-01', 'P')];

      // Grade 6.0 -> Aprovado
      const res60 = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: att,
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [createStudentGrade('g', 'i', 't', 'cls-a', 's1', 6.0)],
      });
      expect(res60!.modules[0].academicStatus).toBe('Aprovado');

      // Grade 5.9 -> Reprovado por Nota
      const res59 = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: att,
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [createStudentGrade('g', 'i', 't', 'cls-a', 's1', 5.9)],
      });
      expect(res59!.modules[0].academicStatus).toBe('Reprovado por Nota');
    });

    it('T2.3: Zero classes held returns 100.0% attendance default', () => {
      const t = createGradeTable('t', 'cls-a', 'Mod');
      const i = createGradeItem('i', 't', 'cls-a', 'P', 10);
      const g = createStudentGrade('g', 'i', 't', 'cls-a', 's1', 8.0);

      const res = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [], // 0 classes
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [g],
      });

      expect(res).not.toBeNull();
      expect(res!.modules[0].classesHeld).toBe(0);
      expect(res!.modules[0].attendanceRate).toBe(100.0);
      expect(res!.overallAttendanceRate).toBe(100.0);
      expect(res!.modules[0].academicStatus).toBe('Aprovado');
    });

    it('T2.4: Non-10 max score scales cleanly to standard 0-10 base', () => {
      const t = createGradeTable('t1', 'cls-a', 'Mod', 'simple');
      const item20 = createGradeItem('i1', 't1', 'cls-a', 'Prova Max 20', 20); // 16/20 = 8.0
      const item100 = createGradeItem('i2', 't1', 'cls-a', 'Projeto Max 100', 100); // 90/100 = 9.0

      const grades = [
        createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 16),
        createStudentGrade('g2', 'i2', 't1', 'cls-a', 's1', 90),
      ];

      const res = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [createAttendance('a1', 'cls-a', 's1', '2026-01-01', 'P')],
        gradeTables: [t],
        gradeItems: [item20, item100],
        studentGrades: grades,
      });

      expect(res).not.toBeNull();
      // Average of 8.0 and 9.0 = 8.5
      expect(res!.modules[0].finalGrade).toBe(8.5);
    });

    it('T2.5: Missing student ID or deleted records gracefully returns null', () => {
      const resMissing = buildUnifiedBoletimData({
        studentId: 'non-existent',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [],
        gradeTables: [],
        gradeItems: [],
        studentGrades: [],
      });
      expect(resMissing).toBeNull();

      const deletedStudent = { ...student, deleted_at: '2026-01-01T00:00:00Z' };
      const resDeleted = buildUnifiedBoletimData({
        studentId: 's1',
        students: [deletedStudent],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: [],
        gradeTables: [],
        gradeItems: [],
        studentGrades: [],
      });
      expect(resDeleted).toBeNull();
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Interactions
  // =========================================================================
  describe('Tier 3: Cross-Feature Interactions', () => {
    it('T3.1: Module date range constraints scope attendance strictly to module dates', () => {
      const t1 = createGradeTable('t1', 'cls-a', 'Bimestre 1', 'simple', 6.0, '2026-02-01', '2026-02-28');
      const t2 = createGradeTable('t2', 'cls-a', 'Bimestre 2', 'simple', 6.0, '2026-03-01', '2026-03-31');

      const attendance = [
        // In Bimestre 1 (2 classes: 2 P)
        createAttendance('a1', 'cls-a', 's1', '2026-02-10', 'P'),
        createAttendance('a2', 'cls-a', 's1', '2026-02-20', 'P'),
        // In Bimestre 2 (2 classes: 1 P, 1 F)
        createAttendance('a3', 'cls-a', 's1', '2026-03-10', 'P'),
        createAttendance('a4', 'cls-a', 's1', '2026-03-20', 'F'),
      ];

      const res = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: attendance,
        gradeTables: [t1, t2],
        gradeItems: [],
        studentGrades: [],
      });

      expect(res).not.toBeNull();
      const mod1 = res!.modules[0];
      const mod2 = res!.modules[1];

      expect(mod1.classesHeld).toBe(2);
      expect(mod1.presences).toBe(2);
      expect(mod1.attendanceRate).toBe(100.0);

      expect(mod2.classesHeld).toBe(2);
      expect(mod2.presences).toBe(1);
      expect(mod2.attendanceRate).toBe(50.0);
    });

    it('T3.2: Concluded replacement (RC) recovers student attendance above passing line', () => {
      // 4 classes: 2 P, 1 F, 1 RC (was an absence, now concluded replacement)
      // Without RC: 2/4 = 50% (< 75%)
      // With RC: 3/4 = 75% (>= 75% -> passes attendance!)
      const t = createGradeTable('t1', 'cls-a', 'Módulo Recuperado');
      const i = createGradeItem('i1', 't1', 'cls-a', 'Nota', 10);
      const g = createStudentGrade('g1', 'i1', 't1', 'cls-a', 's1', 8.0);

      const attendance = [
        createAttendance('a1', 'cls-a', 's1', '2026-04-01', 'P'),
        createAttendance('a2', 'cls-a', 's1', '2026-04-02', 'P'),
        createAttendance('a3', 'cls-a', 's1', '2026-04-03', 'F'),
        createAttendance('a4', 'cls-a', 's1', '2026-04-04', 'RC'),
      ];

      const res = buildUnifiedBoletimData({
        studentId: 's1',
        students: [student],
        courses: [course],
        classes: [classA],
        enrollments: [enrollment],
        attendanceRecords: attendance,
        gradeTables: [t],
        gradeItems: [i],
        studentGrades: [g],
      });

      expect(res).not.toBeNull();
      expect(res!.modules[0].attendanceRate).toBe(75.0);
      expect(res!.modules[0].academicStatus).toBe('Aprovado');
    });
  });
});
