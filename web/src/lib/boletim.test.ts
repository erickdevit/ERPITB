import { describe, expect, it } from 'vitest';
import type { LocalRecord } from '../types';
import {
  buildUnifiedBoletimData,
  MIN_ATTENDANCE_RATE,
  MIN_PASSING_GRADE,
} from './boletim';

describe('buildUnifiedBoletimData — Calculation Engine', () => {
  const baseStudent: LocalRecord = {
    id: 'student-1',
    name: 'João da Silva Santos',
    registration_number: 'ITB-2026-0421',
    active: 1,
  };

  const baseCourse: LocalRecord = {
    id: 'course-1',
    name: 'Desenvolvimento Web',
    code: 'DEV-WEB',
    active: 1,
  };

  const baseClass: LocalRecord = {
    id: 'class-1',
    name: 'Turma A (Manhã)',
    course_id: 'course-1',
    active: 1,
  };

  const baseEnrollment: LocalRecord = {
    id: 'enroll-1',
    student_id: 'student-1',
    class_id: 'class-1',
    status: 'ativa',
  };

  // Helper to build a clean dataset
  function buildDataset(overrides: {
    student?: LocalRecord;
    course?: LocalRecord;
    classes?: LocalRecord[];
    enrollments?: LocalRecord[];
    gradeTables?: LocalRecord[];
    gradeItems?: LocalRecord[];
    studentGrades?: LocalRecord[];
    attendanceRecords?: LocalRecord[];
    classId?: string;
    studentId?: string;
  }) {
    return {
      studentId: overrides.studentId ?? 'student-1',
      classId: overrides.classId,
      students: [overrides.student ?? baseStudent],
      courses: [overrides.course ?? baseCourse],
      classes: overrides.classes ?? [baseClass],
      enrollments: overrides.enrollments ?? [baseEnrollment],
      gradeTables: overrides.gradeTables ?? [],
      gradeItems: overrides.gradeItems ?? [],
      studentGrades: overrides.studentGrades ?? [],
      attendanceRecords: overrides.attendanceRecords ?? [],
    };
  }

  describe('Academic Status Branches', () => {
    // 10 attendance records: 8 'P', 2 'F' -> 80% attendance (passes 75%)
    const attendance80Percent: LocalRecord[] = Array.from({ length: 10 }, (_, i) => ({
      id: `att-${i + 1}`,
      class_id: 'class-1',
      student_id: 'student-1',
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      status: i < 8 ? 'P' : 'F',
    }));

    // 10 attendance records: 6 'P', 4 'F' -> 60% attendance (fails 75%)
    const attendance60Percent: LocalRecord[] = Array.from({ length: 10 }, (_, i) => ({
      id: `att-${i + 1}`,
      class_id: 'class-1',
      student_id: 'student-1',
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      status: i < 6 ? 'P' : 'F',
    }));

    const singleTable: LocalRecord = {
      id: 'table-1',
      class_id: 'class-1',
      name: 'Módulo 1: Fundamentos',
      calculation_mode: 'simple',
      passing_grade: 6.0,
      published: 1,
    };

    const singleItem: LocalRecord = {
      id: 'item-1',
      class_id: 'class-1',
      grade_table_id: 'table-1',
      name: 'Avaliação Final',
      max_score: 10,
      weight: 1,
    };

    it('branch 1: evaluates "Aprovado" when attendance >= 75% and grade >= 6.0 with completed evaluations', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance80Percent,
          gradeTables: [singleTable],
          gradeItems: [singleItem],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_table_id: 'table-1', grade_item_id: 'item-1', student_id: 'student-1', score: 8.5 },
          ],
        })
      );

      expect(data).not.toBeNull();
      expect(data!.modules).toHaveLength(1);
      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(10);
      expect(mod.presences).toBe(8);
      expect(mod.absences).toBe(2);
      expect(mod.attendanceRate).toBe(80.0);
      expect(mod.finalGrade).toBe(8.5);
      expect(mod.academicStatus).toBe('Aprovado');
      expect(data!.overallAcademicStatus).toBe('Aprovado');
      expect(data!.overallAttendanceRate).toBe(80.0);
      expect(data!.overallGpa).toBe(8.5);
    });

    it('branch 2: evaluates "Reprovado por Nota" when attendance >= 75% and grade < 6.0', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance80Percent,
          gradeTables: [singleTable],
          gradeItems: [singleItem],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_table_id: 'table-1', grade_item_id: 'item-1', student_id: 'student-1', score: 5.0 },
          ],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.attendanceRate).toBe(80.0);
      expect(mod.finalGrade).toBe(5.0);
      expect(mod.academicStatus).toBe('Reprovado por Nota');
      expect(data!.overallAcademicStatus).toBe('Reprovado por Nota');
      expect(data!.overallGpa).toBe(5.0);
    });

    it('branch 3: evaluates "Reprovado por Frequência" when attendance < 75% and grade >= 6.0', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance60Percent,
          gradeTables: [singleTable],
          gradeItems: [singleItem],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_table_id: 'table-1', grade_item_id: 'item-1', student_id: 'student-1', score: 9.0 },
          ],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.attendanceRate).toBe(60.0);
      expect(mod.finalGrade).toBe(9.0);
      expect(mod.academicStatus).toBe('Reprovado por Frequência');
      expect(data!.overallAcademicStatus).toBe('Reprovado por Frequência');
      expect(data!.overallAttendanceRate).toBe(60.0);
      expect(data!.overallGpa).toBe(9.0);
    });

    it('branch 4: evaluates "Reprovado por Nota e Frequência" when attendance < 75% and grade < 6.0', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance60Percent,
          gradeTables: [singleTable],
          gradeItems: [singleItem],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_table_id: 'table-1', grade_item_id: 'item-1', student_id: 'student-1', score: 4.5 },
          ],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.attendanceRate).toBe(60.0);
      expect(mod.finalGrade).toBe(4.5);
      expect(mod.academicStatus).toBe('Reprovado por Nota e Frequência');
      expect(data!.overallAcademicStatus).toBe('Reprovado por Nota e Frequência');
    });

    it('branch 5: evaluates "Em Andamento" when evaluations are partially pending', () => {
      const item2: LocalRecord = {
        id: 'item-2',
        class_id: 'class-1',
        grade_table_id: 'table-1',
        name: 'Trabalho Prático',
        max_score: 10,
        weight: 1,
      };

      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance80Percent,
          gradeTables: [singleTable],
          gradeItems: [singleItem, item2],
          studentGrades: [
            // Only item-1 has a grade, item-2 is pending
            { id: 'g-1', class_id: 'class-1', grade_table_id: 'table-1', grade_item_id: 'item-1', student_id: 'student-1', score: 8.0 },
          ],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.grades).toHaveLength(2);
      expect(mod.grades[0]?.score).toBe(8.0);
      expect(mod.grades[1]?.score).toBeNull();
      expect(mod.finalGrade).toBe(8.0); // partial average
      expect(mod.academicStatus).toBe('Em Andamento');
      expect(data!.overallAcademicStatus).toBe('Em Andamento');
    });

    it('branch 6: evaluates "Sem Notas" when class has no grade tables or items defined', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance80Percent,
          gradeTables: [],
          gradeItems: [],
          studentGrades: [],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(10);
      expect(mod.presences).toBe(8);
      expect(mod.attendanceRate).toBe(80.0);
      expect(mod.grades).toHaveLength(0);
      expect(mod.finalGrade).toBeNull();
      expect(mod.academicStatus).toBe('Sem Notas');
      expect(data!.overallAcademicStatus).toBe('Sem Notas');
      expect(data!.overallGpa).toBeNull();
    });

    it('evaluates "Sem Notas" when grade table exists but has 0 grade items', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: attendance80Percent,
          gradeTables: [singleTable],
          gradeItems: [],
          studentGrades: [],
        })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.grades).toHaveLength(0);
      expect(mod.finalGrade).toBeNull();
      expect(mod.academicStatus).toBe('Sem Notas');
    });
  });

  describe('Grading Modes Calculation', () => {
    it('calculates simple average normalized to 0-10 correctly', () => {
      const table: LocalRecord = {
        id: 't-simple',
        class_id: 'class-1',
        name: 'Módulo Simples',
        calculation_mode: 'simple',
      };
      const items: LocalRecord[] = [
        { id: 'i1', class_id: 'class-1', grade_table_id: 't-simple', max_score: 10, weight: 1 },
        { id: 'i2', class_id: 'class-1', grade_table_id: 't-simple', max_score: 20, weight: 1 }, // 16/20 = 8.0 on 0-10
      ];
      const grades: LocalRecord[] = [
        { id: 'g1', class_id: 'class-1', grade_item_id: 'i1', student_id: 'student-1', score: 6.0 },
        { id: 'g2', class_id: 'class-1', grade_item_id: 'i2', student_id: 'student-1', score: 16.0 },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ gradeTables: [table], gradeItems: items, studentGrades: grades })
      );

      // (6.0 + 8.0) / 2 = 7.0
      expect(data!.modules[0]!.finalGrade).toBe(7.0);
    });

    it('calculates weighted average normalized to 0-10 correctly', () => {
      const table: LocalRecord = {
        id: 't-weighted',
        class_id: 'class-1',
        name: 'Módulo Ponderado',
        calculation_mode: 'weighted',
      };
      const items: LocalRecord[] = [
        { id: 'i1', class_id: 'class-1', grade_table_id: 't-weighted', max_score: 10, weight: 2 },
        { id: 'i2', class_id: 'class-1', grade_table_id: 't-weighted', max_score: 10, weight: 1 },
      ];
      const grades: LocalRecord[] = [
        { id: 'g1', class_id: 'class-1', grade_item_id: 'i1', student_id: 'student-1', score: 8.0 },
        { id: 'g2', class_id: 'class-1', grade_item_id: 'i2', student_id: 'student-1', score: 5.0 },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ gradeTables: [table], gradeItems: items, studentGrades: grades })
      );

      // (8.0 * 2 + 5.0 * 1) / 3 = 21 / 3 = 7.0
      expect(data!.modules[0]!.finalGrade).toBe(7.0);
    });

    it('calculates sum mode correctly with 10.0 cap', () => {
      const table: LocalRecord = {
        id: 't-sum',
        class_id: 'class-1',
        name: 'Módulo Soma',
        calculation_mode: 'sum',
      };
      const items: LocalRecord[] = [
        { id: 'i1', class_id: 'class-1', grade_table_id: 't-sum', max_score: 4 },
        { id: 'i2', class_id: 'class-1', grade_table_id: 't-sum', max_score: 4 },
        { id: 'i3', class_id: 'class-1', grade_table_id: 't-sum', max_score: 4 },
      ];
      const grades: LocalRecord[] = [
        { id: 'g1', class_id: 'class-1', grade_item_id: 'i1', student_id: 'student-1', score: 4.0 },
        { id: 'g2', class_id: 'class-1', grade_item_id: 'i2', student_id: 'student-1', score: 3.5 },
        { id: 'g3', class_id: 'class-1', grade_item_id: 'i3', student_id: 'student-1', score: 3.5 },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ gradeTables: [table], gradeItems: items, studentGrades: grades })
      );

      // 4.0 + 3.5 + 3.5 = 11.0, capped at 10.0
      expect(data!.modules[0]!.finalGrade).toBe(10.0);
    });
  });

  describe('Attendance Logic & Edge Cases', () => {
    it('deduplicates attendance using latestAttendance', () => {
      // Multiple records for the same student, class, and date
      const duplicateRecords: LocalRecord[] = [
        {
          id: 'att-old',
          class_id: 'class-1',
          student_id: 'student-1',
          date: '2026-03-01',
          status: 'F',
          updated_at: '2026-03-01T10:00:00Z',
        },
        {
          id: 'att-new',
          class_id: 'class-1',
          student_id: 'student-1',
          date: '2026-03-01',
          status: 'P',
          updated_at: '2026-03-01T11:00:00Z',
        },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: duplicateRecords })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(1);
      expect(mod.presences).toBe(1);
      expect(mod.absences).toBe(0);
      expect(mod.attendanceRate).toBe(100.0);
    });

    it('handles 0 classes held gracefully (attendance rate = 100.0%)', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: [] })
      );

      expect(data).not.toBeNull();
      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(0);
      expect(mod.presences).toBe(0);
      expect(mod.absences).toBe(0);
      expect(mod.justified).toBe(0);
      expect(mod.attendanceRate).toBe(100.0);
      expect(data!.overallAttendanceRate).toBe(100.0);
    });

    it('counts RC (completed replacement) as presence', () => {
      const records: LocalRecord[] = [
        { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'RC' },
        { id: 'att-2', class_id: 'class-1', student_id: 'student-1', date: '2026-03-02', status: 'P' },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: records })
      );

      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(2);
      expect(mod.presences).toBe(2);
      expect(mod.absences).toBe(0);
      expect(mod.attendanceRate).toBe(100.0);
    });

    it('counts R (scheduled replacement) and F as absences', () => {
      const records: LocalRecord[] = [
        { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'F' },
        { id: 'att-2', class_id: 'class-1', student_id: 'student-1', date: '2026-03-02', status: 'R' },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: records })
      );

      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(2);
      expect(mod.presences).toBe(0);
      expect(mod.absences).toBe(2);
      expect(mod.attendanceRate).toBe(0.0);
    });

    it('counts J as justification without adding to presences or absences', () => {
      const records: LocalRecord[] = [
        { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'P' },
        { id: 'att-2', class_id: 'class-1', student_id: 'student-1', date: '2026-03-02', status: 'J' },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: records })
      );

      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(2);
      expect(mod.presences).toBe(1);
      expect(mod.absences).toBe(0);
      expect(mod.justified).toBe(1);
      // 1 presence out of 2 classes = 50.0%
      expect(mod.attendanceRate).toBe(50.0);
    });

    it('rounds attendance rate to 1 decimal place matching canonical survey values', () => {
      // 19 presences out of 20 = 95.0%
      // 22 presences out of 24 = 91.7%
      // 11 presences out of 16 = 68.8%
      const records24: LocalRecord[] = Array.from({ length: 24 }, (_, i) => ({
        id: `att-${i + 1}`,
        class_id: 'class-1',
        student_id: 'student-1',
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        status: i < 22 ? 'P' : (i === 22 ? 'F' : 'J'),
      }));

      const data = buildUnifiedBoletimData(
        buildDataset({ attendanceRecords: records24 })
      );

      const mod = data!.modules[0]!;
      expect(mod.classesHeld).toBe(24);
      expect(mod.presences).toBe(22);
      expect(mod.absences).toBe(1);
      expect(mod.justified).toBe(1);
      expect(mod.attendanceRate).toBe(91.7);
    });

    it('filters attendance by module start_date and end_date when provided', () => {
      const table1: LocalRecord = {
        id: 'table-mod1',
        class_id: 'class-1',
        name: 'Módulo 1',
        start_date: '2026-03-01',
        end_date: '2026-03-10',
      };
      const table2: LocalRecord = {
        id: 'table-mod2',
        class_id: 'class-1',
        name: 'Módulo 2',
        start_date: '2026-03-11',
        end_date: '2026-03-20',
      };

      const attendance: LocalRecord[] = [
        { id: 'a1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-05', status: 'P' },
        { id: 'a2', class_id: 'class-1', student_id: 'student-1', date: '2026-03-08', status: 'P' },
        { id: 'a3', class_id: 'class-1', student_id: 'student-1', date: '2026-03-15', status: 'F' },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({
          gradeTables: [table1, table2],
          attendanceRecords: attendance,
        })
      );

      expect(data!.modules).toHaveLength(2);
      expect(data!.modules[0]!.classesHeld).toBe(2);
      expect(data!.modules[0]!.presences).toBe(2);
      expect(data!.modules[0]!.attendanceRate).toBe(100.0);

      expect(data!.modules[1]!.classesHeld).toBe(1);
      expect(data!.modules[1]!.presences).toBe(0);
      expect(data!.modules[1]!.absences).toBe(1);
      expect(data!.modules[1]!.attendanceRate).toBe(0.0);
    });
  });

  describe('Boundary Values: 74.9% vs 75.0% and 5.94 vs 6.0', () => {
    const table: LocalRecord = {
      id: 'table-bound',
      class_id: 'class-1',
      name: 'Módulo Limite',
      passing_grade: 6.0,
    };
    const item: LocalRecord = {
      id: 'item-bound',
      class_id: 'class-1',
      grade_table_id: 'table-bound',
      max_score: 10,
    };

    it('fails attendance at 74.9% (below 75.0% threshold)', () => {
      // 1000 calls: 749 P, 251 F -> 74.9%
      const records: LocalRecord[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `att-${i + 1}`,
        class_id: 'class-1',
        student_id: 'student-1',
        date: `day-${i + 1}`,
        status: i < 749 ? 'P' : 'F',
      }));

      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: records,
          gradeTables: [table],
          gradeItems: [item],
          studentGrades: [
            { id: 'g1', class_id: 'class-1', grade_item_id: 'item-bound', student_id: 'student-1', score: 8.0 },
          ],
        })
      );

      const mod = data!.modules[0]!;
      expect(mod.attendanceRate).toBe(74.9);
      expect(mod.finalGrade).toBe(8.0);
      expect(mod.academicStatus).toBe('Reprovado por Frequência');
    });

    it('passes attendance at exactly 75.0%', () => {
      // 4 calls: 3 P, 1 F -> 75.0%
      const records: LocalRecord[] = [
        { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'P' },
        { id: 'att-2', class_id: 'class-1', student_id: 'student-1', date: '2026-03-02', status: 'P' },
        { id: 'att-3', class_id: 'class-1', student_id: 'student-1', date: '2026-03-03', status: 'P' },
        { id: 'att-4', class_id: 'class-1', student_id: 'student-1', date: '2026-03-04', status: 'F' },
      ];

      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: records,
          gradeTables: [table],
          gradeItems: [item],
          studentGrades: [
            { id: 'g1', class_id: 'class-1', grade_item_id: 'item-bound', student_id: 'student-1', score: 6.0 },
          ],
        })
      );

      const mod = data!.modules[0]!;
      expect(mod.attendanceRate).toBe(75.0);
      expect(mod.finalGrade).toBe(6.0);
      expect(mod.academicStatus).toBe('Aprovado');
    });

    it('fails grade when score rounds to 5.9 (< 6.0), e.g. 5.94', () => {
      // Single item with score 59.4 out of 100: (59.4 / 100) * 10 = 5.94 -> roundGrade = 5.9
      const item100: LocalRecord = { id: 'it100', class_id: 'class-1', grade_table_id: 'table-bound', max_score: 100 };

      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: [
            { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'P' },
          ],
          gradeTables: [table],
          gradeItems: [item100],
          studentGrades: [
            { id: 'g1', class_id: 'class-1', grade_item_id: 'it100', student_id: 'student-1', score: 59.4 },
          ],
        })
      );

      const mod = data!.modules[0]!;
      expect(mod.finalGrade).toBe(5.9);
      expect(mod.academicStatus).toBe('Reprovado por Nota');
    });

    it('passes grade when score is exactly 6.0 or rounds to 6.0 (e.g. 5.95)', () => {
      // (5.9 + 6.0) / 2 = 5.95 -> roundGrade = 6.0
      const item1: LocalRecord = { id: 'it1', class_id: 'class-1', grade_table_id: 'table-bound', max_score: 10 };
      const item2: LocalRecord = { id: 'it2', class_id: 'class-1', grade_table_id: 'table-bound', max_score: 10 };

      const data = buildUnifiedBoletimData(
        buildDataset({
          attendanceRecords: [
            { id: 'att-1', class_id: 'class-1', student_id: 'student-1', date: '2026-03-01', status: 'P' },
          ],
          gradeTables: [table],
          gradeItems: [item1, item2],
          studentGrades: [
            { id: 'g1', class_id: 'class-1', grade_item_id: 'it1', student_id: 'student-1', score: 5.9 },
            { id: 'g2', class_id: 'class-1', grade_item_id: 'it2', student_id: 'student-1', score: 6.0 },
          ],
        })
      );

      const mod = data!.modules[0]!;
      expect(mod.finalGrade).toBe(6.0);
      expect(mod.academicStatus).toBe('Aprovado');
    });
  });

  describe('Multi-Class and Single-Class Scenarios', () => {
    const class2: LocalRecord = {
      id: 'class-2',
      name: 'Turma B (Tarde)',
      course_id: 'course-1',
      active: 1,
    };

    const enrollment2: LocalRecord = {
      id: 'enroll-2',
      student_id: 'student-1',
      class_id: 'class-2',
      status: 'concluida', // historical enrollment
    };

    const tableClass1: LocalRecord = {
      id: 'table-c1',
      class_id: 'class-1',
      name: 'Módulo 1: Frontend',
    };
    const tableClass2: LocalRecord = {
      id: 'table-c2',
      class_id: 'class-2',
      name: 'Módulo 2: Backend',
    };

    const itemC1: LocalRecord = { id: 'i-c1', class_id: 'class-1', grade_table_id: 'table-c1', max_score: 10 };
    const itemC2: LocalRecord = { id: 'i-c2', class_id: 'class-2', grade_table_id: 'table-c2', max_score: 10 };

    it('aggregates across multiple classes when classId is not specified', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          classes: [baseClass, class2],
          enrollments: [baseEnrollment, enrollment2],
          gradeTables: [tableClass1, tableClass2],
          gradeItems: [itemC1, itemC2],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_item_id: 'i-c1', student_id: 'student-1', score: 8.0 },
            { id: 'g-2', class_id: 'class-2', grade_item_id: 'i-c2', student_id: 'student-1', score: 6.0 },
          ],
          attendanceRecords: [
            // Class 1: 10 classes, 10 presences = 100%
            ...Array.from({ length: 10 }, (_, i) => ({
              id: `att-c1-${i}`,
              class_id: 'class-1',
              student_id: 'student-1',
              date: `2026-03-${String(i + 1).padStart(2, '0')}`,
              status: 'P',
            })),
            // Class 2: 10 classes, 6 presences = 60%
            ...Array.from({ length: 10 }, (_, i) => ({
              id: `att-c2-${i}`,
              class_id: 'class-2',
              student_id: 'student-1',
              date: `2026-04-${String(i + 1).padStart(2, '0')}`,
              status: i < 6 ? 'P' : 'F',
            })),
          ],
        })
      );

      expect(data).not.toBeNull();
      expect(data!.student.classNames).toEqual(['Turma A (Manhã)', 'Turma B (Tarde)']);
      expect(data!.modules).toHaveLength(2);

      expect(data!.modules[0]!.className).toBe('Turma A (Manhã)');
      expect(data!.modules[0]!.attendanceRate).toBe(100.0);
      expect(data!.modules[0]!.finalGrade).toBe(8.0);
      expect(data!.modules[0]!.academicStatus).toBe('Aprovado');

      expect(data!.modules[1]!.className).toBe('Turma B (Tarde)');
      expect(data!.modules[1]!.attendanceRate).toBe(60.0);
      expect(data!.modules[1]!.finalGrade).toBe(6.0);
      expect(data!.modules[1]!.academicStatus).toBe('Reprovado por Frequência');

      // Overall calculations
      // Total classes = 20, presences = 16 -> 16/20 = 80.0%
      expect(data!.overallAttendanceRate).toBe(80.0);
      // Overall GPA = (8.0 + 6.0) / 2 = 7.0
      expect(data!.overallGpa).toBe(7.0);
      // Because Module 2 failed by attendance, overall status must reflect that failure
      expect(data!.overallAcademicStatus).toBe('Reprovado por Frequência');
    });

    it('filters strictly to requested class when classId is specified', () => {
      const data = buildUnifiedBoletimData(
        buildDataset({
          classId: 'class-1',
          classes: [baseClass, class2],
          enrollments: [baseEnrollment, enrollment2],
          gradeTables: [tableClass1, tableClass2],
          gradeItems: [itemC1, itemC2],
          studentGrades: [
            { id: 'g-1', class_id: 'class-1', grade_item_id: 'i-c1', student_id: 'student-1', score: 8.0 },
            { id: 'g-2', class_id: 'class-2', grade_item_id: 'i-c2', student_id: 'student-1', score: 6.0 },
          ],
        })
      );

      expect(data).not.toBeNull();
      expect(data!.student.classNames).toEqual(['Turma A (Manhã)']);
      expect(data!.modules).toHaveLength(1);
      expect(data!.modules[0]!.className).toBe('Turma A (Manhã)');
      expect(data!.modules[0]!.finalGrade).toBe(8.0);
    });

    it('returns null when student does not exist or is soft-deleted', () => {
      const result = buildUnifiedBoletimData(
        buildDataset({
          student: { ...baseStudent, deleted_at: '2026-01-01T00:00:00Z' },
        })
      );
      expect(result).toBeNull();
    });

    it('returns null when requested classId does not exist', () => {
      const result = buildUnifiedBoletimData(
        buildDataset({
          classId: 'non-existent-class',
        })
      );
      expect(result).toBeNull();
    });

    it('returns null when student has enrollments in other classes but none in requested classId', () => {
      const result = buildUnifiedBoletimData(
        buildDataset({
          classId: 'class-2',
          classes: [baseClass, class2],
          enrollments: [baseEnrollment], // student only in class-1
        })
      );
      expect(result).toBeNull();
    });
  });

  describe('Comprehensive Multi-Module Canonical Calculation', () => {
    it('matches the survey executive mockup calculations exactly', () => {
      // Mockup:
      // Módulo 1: Fundamentos — 20 aulas, 19 presenças, 1 falta, 0 just. Freq: 95.0%, P1: 8.5, P2: 9.0 -> Média: 8.8 -> Aprovado
      // Módulo 2: Frontend Web — 24 aulas, 22 presenças, 2 faltas, 1 just. Freq: 91.7%, P1: 7.0, AT: 8.0 -> Média: 7.5 -> Aprovado
      // Módulo 3: Backend & BD — 16 aulas, 11 presenças, 5 faltas, 0 just. Freq: 68.8%, P1: 5.0, P2: 4.5 -> Média: 4.8 -> Repr. Freq
      // Consolidado: 60 aulas, 52 presenças, 8 faltas, 1 just. Freq: 86.7%, GPA: 7.0
      const tables: LocalRecord[] = [
        { id: 't1', class_id: 'class-1', name: 'Módulo 1: Fundamentos', start_date: '2026-02-01', end_date: '2026-02-28', calculation_mode: 'simple', sort_order: 1 },
        { id: 't2', class_id: 'class-1', name: 'Módulo 2: Frontend Web', start_date: '2026-03-01', end_date: '2026-03-31', calculation_mode: 'simple', sort_order: 2 },
        { id: 't3', class_id: 'class-1', name: 'Módulo 3: Backend & BD', start_date: '2026-04-01', end_date: '2026-04-30', calculation_mode: 'simple', sort_order: 3 },
      ];

      const items: LocalRecord[] = [
        { id: 't1-i1', class_id: 'class-1', grade_table_id: 't1', name: 'P1', max_score: 10, sort_order: 1 },
        { id: 't1-i2', class_id: 'class-1', grade_table_id: 't1', name: 'P2', max_score: 10, sort_order: 2 },
        { id: 't2-i1', class_id: 'class-1', grade_table_id: 't2', name: 'P1', max_score: 10, sort_order: 1 },
        { id: 't2-i2', class_id: 'class-1', grade_table_id: 't2', name: 'AT', max_score: 10, sort_order: 2 },
        { id: 't3-i1', class_id: 'class-1', grade_table_id: 't3', name: 'P1', max_score: 10, sort_order: 1 },
        { id: 't3-i2', class_id: 'class-1', grade_table_id: 't3', name: 'P2', max_score: 10, sort_order: 2 },
      ];

      const grades: LocalRecord[] = [
        { id: 'g1', class_id: 'class-1', grade_item_id: 't1-i1', student_id: 'student-1', score: 8.5 },
        { id: 'g2', class_id: 'class-1', grade_item_id: 't1-i2', student_id: 'student-1', score: 9.0 },
        { id: 'g3', class_id: 'class-1', grade_item_id: 't2-i1', student_id: 'student-1', score: 7.0 },
        { id: 'g4', class_id: 'class-1', grade_item_id: 't2-i2', student_id: 'student-1', score: 8.0 },
        { id: 'g5', class_id: 'class-1', grade_item_id: 't3-i1', student_id: 'student-1', score: 5.0 },
        { id: 'g6', class_id: 'class-1', grade_item_id: 't3-i2', student_id: 'student-1', score: 4.5 },
      ];

      // M1: 20 calls (19 P, 1 F) in Feb
      const attM1: LocalRecord[] = Array.from({ length: 20 }, (_, i) => ({
        id: `att-m1-${i + 1}`,
        class_id: 'class-1',
        student_id: 'student-1',
        date: `2026-02-${String(i + 1).padStart(2, '0')}`,
        status: i < 19 ? 'P' : 'F',
      }));

      // M2: 24 calls (22 P, 1 F, 1 J) in Mar
      const attM2: LocalRecord[] = Array.from({ length: 24 }, (_, i) => ({
        id: `att-m2-${i + 1}`,
        class_id: 'class-1',
        student_id: 'student-1',
        date: `2026-03-${String(i + 1).padStart(2, '0')}`,
        status: i < 22 ? 'P' : (i === 22 ? 'F' : 'J'),
      }));

      // M3: 16 calls (11 P, 5 F) in Apr
      const attM3: LocalRecord[] = Array.from({ length: 16 }, (_, i) => ({
        id: `att-m3-${i + 1}`,
        class_id: 'class-1',
        student_id: 'student-1',
        date: `2026-04-${String(i + 1).padStart(2, '0')}`,
        status: i < 11 ? 'P' : 'F',
      }));

      const data = buildUnifiedBoletimData(
        buildDataset({
          gradeTables: tables,
          gradeItems: items,
          studentGrades: grades,
          attendanceRecords: [...attM1, ...attM2, ...attM3],
        })
      );

      expect(data).not.toBeNull();
      expect(data!.modules).toHaveLength(3);

      // Módulo 1
      const m1 = data!.modules[0]!;
      expect(m1.classesHeld).toBe(20);
      expect(m1.presences).toBe(19);
      expect(m1.absences).toBe(1);
      expect(m1.justified).toBe(0);
      expect(m1.attendanceRate).toBe(95.0);
      expect(m1.finalGrade).toBe(8.8); // (8.5 + 9.0) / 2 = 8.75 -> 8.8
      expect(m1.academicStatus).toBe('Aprovado');

      // Módulo 2
      const m2 = data!.modules[1]!;
      expect(m2.classesHeld).toBe(24);
      expect(m2.presences).toBe(22);
      expect(m2.absences).toBe(1);
      expect(m2.justified).toBe(1);
      expect(m2.attendanceRate).toBe(91.7);
      expect(m2.finalGrade).toBe(7.5);
      expect(m2.academicStatus).toBe('Aprovado');

      // Módulo 3
      const m3 = data!.modules[2]!;
      expect(m3.classesHeld).toBe(16);
      expect(m3.presences).toBe(11);
      expect(m3.absences).toBe(5);
      expect(m3.justified).toBe(0);
      expect(m3.attendanceRate).toBe(68.8);
      expect(m3.finalGrade).toBe(4.8); // (5.0 + 4.5) / 2 = 4.75 -> 4.8
      // Note: 68.8% < 75% and 4.8 < 6.0
      expect(m3.academicStatus).toBe('Reprovado por Nota e Frequência');

      // Consolidated Totals
      // Total classes = 60, total presences = 52 -> 52/60 = 86.666... -> 86.7%
      expect(data!.overallAttendanceRate).toBe(86.7);
      // Overall GPA = (8.8 + 7.5 + 4.8) / 3 = 21.1 / 3 = 7.0333... -> 7.0
      expect(data!.overallGpa).toBe(7.0);
      // Criteria
      expect(data!.criteria.minAttendanceRate).toBe(MIN_ATTENDANCE_RATE);
      expect(data!.criteria.minPassingGrade).toBe(MIN_PASSING_GRADE);
    });
  });
});
