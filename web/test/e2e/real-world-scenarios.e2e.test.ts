import { describe, expect, it } from 'vitest';
import { buildUnifiedBoletimData } from '../../src/lib/boletim';
import { buildAnalytics } from '../../src/lib/analytics';
import type { LocalRecord } from '../../src/types';

describe('E2E Real-World Scenarios Suite (Tier 4 / F12)', () => {
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
    code: 'TI-DEV',
    active: 1,
  });

  const createClass = (id: string, name: string, courseId = 'course-ti', shift = 'manha'): LocalRecord => ({
    id,
    name,
    course_id: courseId,
    shift,
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
  ): LocalRecord => ({
    id,
    class_id: classId,
    student_id: studentId,
    date,
    status,
  });

  // Common metadata
  const course = createCourse('course-ti', 'Desenvolvimento Web Full Stack');

  // =========================================================================
  // SCENARIO 1: Approved High-Achieving Student
  // =========================================================================
  it('Scenario 1: Approved high-achieving student across a complete 3-module semester', () => {
    const student = createStudent('s-high', 'Lucas Silveira', 'ITB-2026-001');
    const class1 = createClass('c1', 'Turma Alpha');
    const enrollment = createEnrollment('e1', 'c1', 's-high');

    // 3 Modules with date boundaries
    const t1 = createGradeTable('t1', 'c1', '1º Módulo: Lógica e Algoritmos', 'simple', 6.0, '2026-02-01', '2026-02-28');
    const t2 = createGradeTable('t2', 'c1', '2º Módulo: Frontend com React', 'simple', 6.0, '2026-03-01', '2026-03-31');
    const t3 = createGradeTable('t3', 'c1', '3º Módulo: Backend e Banco de Dados', 'simple', 6.0, '2026-04-01', '2026-04-30');

    const i1 = createGradeItem('i1', 't1', 'c1', 'Prova 1', 10);
    const i2 = createGradeItem('i2', 't2', 'c1', 'Projeto 1', 10);
    const i3 = createGradeItem('i3', 't3', 'c1', 'Avaliação Final', 10);

    // Excellent grades: 9.0, 8.5, 9.5 -> GPA = (9.0 + 8.5 + 9.5) / 3 = 9.0
    const grades = [
      createStudentGrade('g1', 'i1', 't1', 'c1', 's-high', 9.0),
      createStudentGrade('g2', 'i2', 't2', 'c1', 's-high', 8.5),
      createStudentGrade('g3', 'i3', 't3', 'c1', 's-high', 9.5),
    ];

    // 40 distinct class sessions: 12 in Feb, 14 in Mar, 14 in Apr (2 absences, 38 presences -> 95.0% attendance)
    const attendance: LocalRecord[] = [];
    for (let i = 1; i <= 12; i++) {
      const dateStr = `2026-02-${String(i).padStart(2, '0')}`;
      attendance.push(createAttendance(`att-feb-${i}`, 'c1', 's-high', dateStr, i === 5 ? 'F' : 'P'));
    }
    for (let i = 1; i <= 14; i++) {
      const dateStr = `2026-03-${String(i).padStart(2, '0')}`;
      attendance.push(createAttendance(`att-mar-${i}`, 'c1', 's-high', dateStr, i === 5 ? 'F' : 'P'));
    }
    for (let i = 1; i <= 14; i++) {
      const dateStr = `2026-04-${String(i).padStart(2, '0')}`;
      attendance.push(createAttendance(`att-apr-${i}`, 'c1', 's-high', dateStr, 'P'));
    }

    const boletim = buildUnifiedBoletimData({
      studentId: 's-high',
      students: [student],
      courses: [course],
      classes: [class1],
      enrollments: [enrollment],
      attendanceRecords: attendance,
      gradeTables: [t1, t2, t3],
      gradeItems: [i1, i2, i3],
      studentGrades: grades,
    });

    expect(boletim).not.toBeNull();
    expect(boletim!.student.name).toBe('Lucas Silveira');
    expect(boletim!.modules).toHaveLength(3);
    expect(boletim!.overallGpa).toBe(9.0);
    expect(boletim!.overallAttendanceRate).toBe(95.0);
    expect(boletim!.overallAcademicStatus).toBe('Aprovado');

    // Cross-check with Analytics engine
    const analytics = buildAnalytics(
      { classes: [class1], students: [student], enrollments: [enrollment], classTeachers: [], attendance },
      { from: '2026-02-01', to: '2026-04-30' },
    );
    expect(analytics.riskStudents).toBe(0);
    expect(analytics.attendanceRate).toBe(95.0);
  });

  // =========================================================================
  // SCENARIO 2: Attendance Failure with High Grades
  // =========================================================================
  it('Scenario 2: Attendance failure (<75%) despite outstanding grades (9.0+)', () => {
    const student = createStudent('s-absent', 'Beatriz Lima', 'ITB-2026-002');
    const class1 = createClass('c1', 'Turma Alpha');
    const enrollment = createEnrollment('e1', 'c1', 's-absent');

    const table = createGradeTable('t1', 'c1', 'Módulo Único');
    const item = createGradeItem('i1', 't1', 'c1', 'Prova Teórica', 10);
    const grade = createStudentGrade('g1', 'i1', 't1', 'c1', 's-absent', 9.5); // Outstanding grade!

    // 20 classes total: 14 presences, 6 absences -> 14/20 = 70.0% (< 75.0% threshold)
    const attendance: LocalRecord[] = [];
    for (let day = 1; day <= 20; day++) {
      const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
      const status = day <= 14 ? 'P' : 'F';
      attendance.push(createAttendance(`att-${day}`, 'c1', 's-absent', dateStr, status));
    }

    const boletim = buildUnifiedBoletimData({
      studentId: 's-absent',
      students: [student],
      courses: [course],
      classes: [class1],
      enrollments: [enrollment],
      attendanceRecords: attendance,
      gradeTables: [table],
      gradeItems: [item],
      studentGrades: [grade],
    });

    expect(boletim).not.toBeNull();
    expect(boletim!.modules[0].finalGrade).toBe(9.5);
    expect(boletim!.modules[0].attendanceRate).toBe(70.0);
    // Attendance is non-negotiable in institutional regulations
    expect(boletim!.modules[0].academicStatus).toBe('Reprovado por Frequência');
    expect(boletim!.overallAcademicStatus).toBe('Reprovado por Frequência');

    // Cross-check Analytics: must flag student as at risk (rate < 75% and streak >= 3)
    const analytics = buildAnalytics(
      { classes: [class1], students: [student], enrollments: [enrollment], classTeachers: [], attendance },
      { from: '2026-03-01', to: '2026-03-31' },
    );
    expect(analytics.riskStudents).toBe(1);
    expect(analytics.topAbsentees[0].studentId).toBe('s-absent');
    expect(analytics.topAbsentees[0].absences).toBe(6);
  });

  // =========================================================================
  // SCENARIO 3: Grade Failure with Perfect Attendance
  // =========================================================================
  it('Scenario 3: Grade failure (<6.0) with 100% attendance', () => {
    const student = createStudent('s-low-grade', 'Carlos Alberto', 'ITB-2026-003');
    const class1 = createClass('c1', 'Turma Alpha');
    const enrollment = createEnrollment('e1', 'c1', 's-low-grade');

    const table = createGradeTable('t1', 'c1', 'Módulo Algoritmos');
    const item1 = createGradeItem('i1', 't1', 'c1', 'Prova 1', 10);
    const item2 = createGradeItem('i2', 't1', 'c1', 'Prova 2', 10);

    // Grades: 4.5 and 5.5 -> Mean = 5.0 (< 6.0 passing grade)
    const grades = [
      createStudentGrade('g1', 'i1', 't1', 'c1', 's-low-grade', 4.5),
      createStudentGrade('g2', 'i2', 't1', 'c1', 's-low-grade', 5.5),
    ];

    // Perfect attendance: 10 classes, all P
    const attendance: LocalRecord[] = [];
    for (let day = 1; day <= 10; day++) {
      attendance.push(createAttendance(`att-${day}`, 'c1', 's-low-grade', `2026-04-${String(day).padStart(2, '0')}`, 'P'));
    }

    const boletim = buildUnifiedBoletimData({
      studentId: 's-low-grade',
      students: [student],
      courses: [course],
      classes: [class1],
      enrollments: [enrollment],
      attendanceRecords: attendance,
      gradeTables: [table],
      gradeItems: [item1, item2],
      studentGrades: grades,
    });

    expect(boletim).not.toBeNull();
    expect(boletim!.modules[0].attendanceRate).toBe(100.0);
    expect(boletim!.modules[0].finalGrade).toBe(5.0);
    expect(boletim!.modules[0].academicStatus).toBe('Reprovado por Nota');
    expect(boletim!.overallAcademicStatus).toBe('Reprovado por Nota');
  });

  // =========================================================================
  // SCENARIO 4: Mid-Semester In-Progress Trajectory (Mixed Modules)
  // =========================================================================
  it('Scenario 4: Mid-semester in-progress trajectory with concluded and pending evaluations', () => {
    const student = createStudent('s-ongoing', 'Débora Vasconcelos', 'ITB-2026-004');
    const class1 = createClass('c1', 'Turma Beta');
    const enrollment = createEnrollment('e1', 'c1', 's-ongoing');

    // Module 1 is finished (Grade: 8.0, 100% attendance)
    const t1 = createGradeTable('t1', 'c1', 'Módulo 1: Fundamentos');
    const i1 = createGradeItem('i1', 't1', 'c1', 'Prova 1', 10);
    const g1 = createStudentGrade('g1', 'i1', 't1', 'c1', 's-ongoing', 8.0);

    // Module 2 is in progress: 1 grade posted (7.0), 1 grade pending (null)
    const t2 = createGradeTable('t2', 'c1', 'Módulo 2: Frontend');
    const i2a = createGradeItem('i2a', 't2', 'c1', 'Trabalho Parcial', 10);
    const i2b = createGradeItem('i2b', 't2', 'c1', 'Prova Final', 10);
    const g2a = createStudentGrade('g2a', 'i2a', 't2', 'c1', 's-ongoing', 7.0);
    const g2b = createStudentGrade('g2b', 'i2b', 't2', 'c1', 's-ongoing', null); // pending!

    // Module 3 not yet started (no grade items)
    const t3 = createGradeTable('t3', 'c1', 'Módulo 3: Backend');

    const attendance = [
      createAttendance('a1', 'c1', 's-ongoing', '2026-02-10', 'P'),
      createAttendance('a2', 'c1', 's-ongoing', '2026-03-10', 'P'),
      createAttendance('a3', 'c1', 's-ongoing', '2026-04-10', 'P'),
    ];

    const boletim = buildUnifiedBoletimData({
      studentId: 's-ongoing',
      students: [student],
      courses: [course],
      classes: [class1],
      enrollments: [enrollment],
      attendanceRecords: attendance,
      gradeTables: [t1, t2, t3],
      gradeItems: [i1, i2a, i2b],
      studentGrades: [g1, g2a, g2b],
    });

    expect(boletim).not.toBeNull();
    expect(boletim!.modules).toHaveLength(3);

    // M1 is completed and Aprovado
    expect(boletim!.modules[0].academicStatus).toBe('Aprovado');
    expect(boletim!.modules[0].finalGrade).toBe(8.0);

    // M2 is Em Andamento because of pending evaluation
    expect(boletim!.modules[1].academicStatus).toBe('Em Andamento');

    // M3 is Sem Notas because no items are created
    expect(boletim!.modules[2].academicStatus).toBe('Sem Notas');

    // Overall status must be Em Andamento
    expect(boletim!.overallAcademicStatus).toBe('Em Andamento');
  });

  // =========================================================================
  // SCENARIO 5: Class Transfer & Historical Course Continuity
  // =========================================================================
  it('Scenario 5: Class transfer preserves historical class modules and active class modules', () => {
    const student = createStudent('s-transfer', 'Eduardo Ramos', 'ITB-2026-005');

    // Turma 1 (Morning): Student took Module 1, then class was concluded / transferred
    const classMorning = createClass('cls-morning', 'Turma Manhã 2026.1', 'course-ti', 'manha');
    const enrConcluded = createEnrollment('e-old', 'cls-morning', 's-transfer', 'concluida');

    const tableM1 = createGradeTable('t-m1', 'cls-morning', 'Módulo 1: Web Básico');
    const itemM1 = createGradeItem('i-m1', 't-m1', 'cls-morning', 'P1', 10);
    const gradeM1 = createStudentGrade('g-m1', 'i-m1', 't-m1', 'cls-morning', 's-transfer', 8.0);

    const attMorning = [
      createAttendance('att-m1', 'cls-morning', 's-transfer', '2026-02-15', 'P'),
      createAttendance('att-m2', 'cls-morning', 's-transfer', '2026-02-22', 'P'),
    ];

    // Turma 2 (Evening): Student moved to evening class and completed Module 2
    const classEvening = createClass('cls-evening', 'Turma Noite 2026.1', 'course-ti', 'noite');
    const enrActive = createEnrollment('e-new', 'cls-evening', 's-transfer', 'ativa');

    const tableM2 = createGradeTable('t-m2', 'cls-evening', 'Módulo 2: Web Avançado');
    const itemM2 = createGradeItem('i-m2', 't-m2', 'cls-evening', 'P2', 10);
    const gradeM2 = createStudentGrade('g-m2', 'i-m2', 't-m2', 'cls-evening', 's-transfer', 9.0);

    const attEvening = [
      createAttendance('att-e1', 'cls-evening', 's-transfer', '2026-04-10', 'P'),
      createAttendance('att-e2', 'cls-evening', 's-transfer', '2026-04-17', 'P'),
    ];

    // Request unified boletim for student across all classes (no classId filter)
    const boletim = buildUnifiedBoletimData({
      studentId: 's-transfer',
      students: [student],
      courses: [course],
      classes: [classMorning, classEvening],
      enrollments: [enrConcluded, enrActive],
      attendanceRecords: [...attMorning, ...attEvening],
      gradeTables: [tableM1, tableM2],
      gradeItems: [itemM1, itemM2],
      studentGrades: [gradeM1, gradeM2],
    });

    expect(boletim).not.toBeNull();
    // Student info lists both classes
    expect(boletim!.student.classNames).toHaveLength(2);

    // Matrix unifies both modules from both classes
    expect(boletim!.modules).toHaveLength(2);
    expect(boletim!.modules.map((m) => m.moduleName)).toEqual([
      'Módulo 1: Web Básico',
      'Módulo 2: Web Avançado',
    ]);

    // Overall GPA = (8.0 + 9.0) / 2 = 8.5
    expect(boletim!.overallGpa).toBe(8.5);
    expect(boletim!.overallAttendanceRate).toBe(100.0);
    expect(boletim!.overallAcademicStatus).toBe('Aprovado');
  });

  // =========================================================================
  // SCENARIO 6: Attendance Recovery via Completed Replacement (RC)
  // =========================================================================
  it('Scenario 6: Student recovers from failing attendance via completed replacement (RC)', () => {
    const student = createStudent('s-recovery', 'Fernanda Souza', 'ITB-2026-006');
    const class1 = createClass('c1', 'Turma Alpha');
    const enrollment = createEnrollment('e1', 'c1', 's-recovery');

    const table = createGradeTable('t1', 'c1', 'Módulo Intensivo');
    const item = createGradeItem('i1', 't1', 'c1', 'Exame Final', 10);
    const grade = createStudentGrade('g1', 'i1', 't1', 'c1', 's-recovery', 7.5);

    // Initial state: 16 classes total, 11 P, 5 F -> 11/16 = 68.8% (< 75% -> Fails!)
    // 2 absences are replaced and completed: status becomes 'RC'
    // Resulting state: 11 P, 2 RC, 3 F -> (11 + 2) / 16 = 13/16 = 81.3% (>= 75% -> Passes!)
    const attendance = [
      createAttendance('a1', 'c1', 's-recovery', '2026-05-01', 'P'),
      createAttendance('a2', 'c1', 's-recovery', '2026-05-02', 'P'),
      createAttendance('a3', 'c1', 's-recovery', '2026-05-03', 'P'),
      createAttendance('a4', 'c1', 's-recovery', '2026-05-04', 'P'),
      createAttendance('a5', 'c1', 's-recovery', '2026-05-05', 'P'),
      createAttendance('a6', 'c1', 's-recovery', '2026-05-06', 'P'),
      createAttendance('a7', 'c1', 's-recovery', '2026-05-07', 'P'),
      createAttendance('a8', 'c1', 's-recovery', '2026-05-08', 'P'),
      createAttendance('a9', 'c1', 's-recovery', '2026-05-09', 'P'),
      createAttendance('a10', 'c1', 's-recovery', '2026-05-10', 'P'),
      createAttendance('a11', 'c1', 's-recovery', '2026-05-11', 'P'),
      createAttendance('a12', 'c1', 's-recovery', '2026-05-12', 'F'),
      createAttendance('a13', 'c1', 's-recovery', '2026-05-13', 'F'),
      createAttendance('a14', 'c1', 's-recovery', '2026-05-14', 'F'),
      createAttendance('a15', 'c1', 's-recovery', '2026-05-15', 'RC'), // Completed replacement!
      createAttendance('a16', 'c1', 's-recovery', '2026-05-16', 'RC'), // Completed replacement!
    ];

    const boletim = buildUnifiedBoletimData({
      studentId: 's-recovery',
      students: [student],
      courses: [course],
      classes: [class1],
      enrollments: [enrollment],
      attendanceRecords: attendance,
      gradeTables: [table],
      gradeItems: [item],
      studentGrades: [grade],
    });

    expect(boletim).not.toBeNull();
    const mod = boletim!.modules[0];
    expect(mod.classesHeld).toBe(16);
    expect(mod.presences).toBe(13); // 11 P + 2 RC
    expect(mod.absences).toBe(3);
    expect(mod.attendanceRate).toBe(81.3); // 13/16 = 81.25% -> 81.3%
    expect(mod.academicStatus).toBe('Aprovado');
    expect(boletim!.overallAcademicStatus).toBe('Aprovado');
  });
});
