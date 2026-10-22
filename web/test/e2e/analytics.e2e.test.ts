import { describe, expect, it } from 'vitest';
import { buildAnalytics, type AnalyticsInput, type AnalyticsFilters } from '../../src/lib/analytics';
import { latestAttendance } from '../../src/lib/attendance';
import type { LocalRecord } from '../../src/types';

describe('E2E Analytics & Dashboard Suite (R1, F1-F5)', () => {
  // Helpers to construct realistic test data
  const createClass = (id: string, name: string, courseId = 'course-dev'): LocalRecord => ({
    id,
    name,
    course_id: courseId,
    active: 1,
  });

  const createStudent = (id: string, name: string, reg: string): LocalRecord => ({
    id,
    name,
    registration_number: reg,
    active: 1,
  });

  const createEnrollment = (id: string, classId: string, studentId: string): LocalRecord => ({
    id,
    class_id: classId,
    student_id: studentId,
    status: 'ativa',
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

  // =========================================================================
  // TIER 1: Feature Coverage (≥5 tests)
  // =========================================================================
  describe('Tier 1: Feature Coverage', () => {
    it('T1.1: Preset 7-Day Window calculates exact totals and daily distribution', () => {
      const classes = [createClass('c1', 'Turma Alpha')];
      const students = [
        createStudent('s1', 'Aluno Um', 'REG001'),
        createStudent('s2', 'Aluno Dois', 'REG002'),
      ];
      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c1', 's2'),
      ];

      // 7-day period: 2026-10-01 to 2026-10-07
      const attendance = [
        // Day 1
        createAttendance('a1', 'c1', 's1', '2026-10-01', 'P'),
        createAttendance('a2', 'c1', 's2', '2026-10-01', 'P'),
        // Day 2
        createAttendance('a3', 'c1', 's1', '2026-10-02', 'P'),
        createAttendance('a4', 'c1', 's2', '2026-10-02', 'F'),
        // Day 3
        createAttendance('a5', 'c1', 's1', '2026-10-03', 'P'),
        createAttendance('a6', 'c1', 's2', '2026-10-03', 'P'),
        // Out of window (day 8)
        createAttendance('a7', 'c1', 's1', '2026-10-08', 'F'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-01', to: '2026-10-07' },
      );

      expect(result.records).toBe(6);
      expect(result.present).toBe(5);
      expect(result.absent).toBe(1);
      expect(result.attendanceRate).toBe(83.3); // (5 / 6) * 100 = 83.333% -> 83.3
      expect(result.distinctCalls).toBe(3);
      expect(result.activeStudents).toBe(2);
      expect(result.evolution).toHaveLength(3);
      expect(result.evolution[0]).toEqual({ date: '2026-10-01', rate: 100, records: 2 });
      expect(result.evolution[1]).toEqual({ date: '2026-10-02', rate: 50, records: 2 });
    });

    it('T1.2: Preset 30-Day Window aggregates monthly call records and distinct classes', () => {
      const classes = [
        createClass('c1', 'Turma A', 'curso-web'),
        createClass('c2', 'Turma B', 'curso-web'),
      ];
      const students = [
        createStudent('s1', 'Carlos', '001'),
        createStudent('s2', 'Diana', '002'),
      ];
      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c2', 's2'),
      ];

      const attendance: LocalRecord[] = [];
      // 10 distinct dates across October 2026
      for (let day = 1; day <= 10; day++) {
        const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
        attendance.push(createAttendance(`c1-${day}`, 'c1', 's1', dateStr, 'P'));
        attendance.push(createAttendance(`c2-${day}`, 'c2', 's2', dateStr, day % 2 === 0 ? 'P' : 'F'));
      }

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-01', to: '2026-10-31' },
      );

      expect(result.records).toBe(20);
      expect(result.present).toBe(15); // 10 from s1 + 5 from s2
      expect(result.absent).toBe(5);
      expect(result.distinctCalls).toBe(20); // 10 dates * 2 classes
      expect(result.byClass).toHaveLength(2);

      const classA = result.byClass.find((c) => c.id === 'c1');
      const classB = result.byClass.find((c) => c.id === 'c2');
      expect(classA?.rate).toBe(100);
      expect(classB?.rate).toBe(50);
    });

    it('T1.3: Preset 90-Day Window captures multi-month trend without drift', () => {
      const classes = [createClass('c1', 'Turma Trimestral')];
      const students = [createStudent('s1', 'Eduardo', '003')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const attendance = [
        createAttendance('m1', 'c1', 's1', '2026-08-15', 'P'),
        createAttendance('m2', 'c1', 's1', '2026-09-15', 'P'),
        createAttendance('m3', 'c1', 's1', '2026-10-15', 'F'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-08-01', to: '2026-10-31' },
      );

      expect(result.records).toBe(3);
      expect(result.present).toBe(2);
      expect(result.absent).toBe(1);
      expect(result.attendanceRate).toBe(66.7);
    });

    it('T1.4: Custom Date Window strictly bounds record inclusion', () => {
      const classes = [createClass('c1', 'Turma Custom')];
      const students = [createStudent('s1', 'Fabio', '004')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const attendance = [
        createAttendance('before', 'c1', 's1', '2026-05-09', 'P'),
        createAttendance('in1', 'c1', 's1', '2026-05-10', 'P'),
        createAttendance('in2', 'c1', 's1', '2026-05-15', 'P'),
        createAttendance('in3', 'c1', 's1', '2026-05-20', 'P'),
        createAttendance('after', 'c1', 's1', '2026-05-21', 'P'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-05-10', to: '2026-05-20' },
      );

      expect(result.records).toBe(3);
      expect(result.distinctCalls).toBe(3);
      expect(result.evolution.map((e) => e.date)).toEqual(['2026-05-10', '2026-05-15', '2026-05-20']);
    });

    it('T1.5: Top Absentees ranks students correctly by absence count', () => {
      const classes = [createClass('c1', 'Turma Ranking')];
      const students = [
        createStudent('s1', 'Aluno Poucas Faltas', 'R1'),
        createStudent('s2', 'Aluno Muitas Faltas', 'R2'),
        createStudent('s3', 'Aluno Médio', 'R3'),
      ];
      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c1', 's2'),
        createEnrollment('e3', 'c1', 's3'),
      ];

      const attendance = [
        // s2 has 3 absences
        createAttendance('a1', 'c1', 's2', '2026-09-01', 'F'),
        createAttendance('a2', 'c1', 's2', '2026-09-02', 'F'),
        createAttendance('a3', 'c1', 's2', '2026-09-03', 'F'),
        // s3 has 2 absences
        createAttendance('a4', 'c1', 's3', '2026-09-01', 'F'),
        createAttendance('a5', 'c1', 's3', '2026-09-02', 'F'),
        // s1 has 1 absence
        createAttendance('a6', 'c1', 's1', '2026-09-01', 'F'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-09-01', to: '2026-09-30' },
      );

      expect(result.topAbsentees).toHaveLength(3);
      expect(result.topAbsentees[0].studentId).toBe('s2');
      expect(result.topAbsentees[0].absences).toBe(3);
      expect(result.topAbsentees[1].studentId).toBe('s3');
      expect(result.topAbsentees[1].absences).toBe(2);
      expect(result.topAbsentees[2].studentId).toBe('s1');
      expect(result.topAbsentees[2].absences).toBe(1);
    });

    it('T1.6: Completeness of all 5 status indicators (P, F, J, A, R/RC)', () => {
      const classes = [createClass('c1', 'Turma Completa')];
      const students = [createStudent('s1', 'Aluno MultiStatus', 'R5')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const attendance = [
        createAttendance('a1', 'c1', 's1', '2026-09-01', 'P'),
        createAttendance('a2', 'c1', 's1', '2026-09-02', 'F'),
        createAttendance('a3', 'c1', 's1', '2026-09-03', 'J'),
        createAttendance('a4', 'c1', 's1', '2026-09-04', 'A'),
        createAttendance('a5', 'c1', 's1', '2026-09-05', 'R'),
        createAttendance('a6', 'c1', 's1', '2026-09-06', 'RC'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-09-01', to: '2026-09-30' },
      );

      expect(result.records).toBe(6);
      expect(result.present).toBe(1);
      expect(result.absent).toBe(1);
      expect(result.justified).toBe(1);
      expect(result.delayed).toBe(1);
      expect(result.replacements).toBe(2); // R + RC
      expect(result.attendanceRate).toBe(16.7); // 1/6 * 100 = 16.666%
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (≥5 tests)
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    it('T2.1: Zero attendance records returns clean 0s with no NaN or error', () => {
      const classes = [createClass('c1', 'Turma Vazia')];
      const students = [createStudent('s1', 'Aluno Isolado', '000')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance: [] },
        { from: '2026-10-01', to: '2026-10-31' },
      );

      expect(result.records).toBe(0);
      expect(result.present).toBe(0);
      expect(result.absent).toBe(0);
      expect(result.attendanceRate).toBe(0);
      expect(result.distinctCalls).toBe(0);
      expect(result.riskStudents).toBe(0);
      expect(result.evolution).toEqual([]);
      expect(result.topAbsentees).toEqual([]);
      expect(result.byClass[0].rate).toBe(0);
      expect(result.byClass[0].records).toBe(0);
    });

    it('T2.2: Inverted date range (from > to) yields 0 records gracefully', () => {
      const classes = [createClass('c1', 'Turma Teste')];
      const students = [createStudent('s1', 'Aluno Teste', '001')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];
      const attendance = [createAttendance('a1', 'c1', 's1', '2026-10-15', 'P')];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-31', to: '2026-10-01' }, // from > to
      );

      expect(result.records).toBe(0);
      expect(result.present).toBe(0);
      expect(result.attendanceRate).toBe(0);
      expect(result.distinctCalls).toBe(0);
    });

    it('T2.3: Single isolated attendance record computes exact 100% or 0% rate', () => {
      const classes = [createClass('c1', 'Turma Unica')];
      const students = [createStudent('s1', 'Aluno', '001')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const singlePresent = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance: [createAttendance('a1', 'c1', 's1', '2026-10-10', 'P')] },
        { from: '2026-10-01', to: '2026-10-31' },
      );
      expect(singlePresent.attendanceRate).toBe(100.0);
      expect(singlePresent.records).toBe(1);

      const singleAbsent = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance: [createAttendance('a2', 'c1', 's1', '2026-10-10', 'F')] },
        { from: '2026-10-01', to: '2026-10-31' },
      );
      expect(singleAbsent.attendanceRate).toBe(0.0);
      expect(singleAbsent.riskStudents).toBe(1); // 0% rate is < 75%
    });

    it('T2.4: Year and month transition correctly encapsulates cross-boundary dates', () => {
      const classes = [createClass('c1', 'Turma Virada')];
      const students = [createStudent('s1', 'Aluno Ano Novo', '001')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      const attendance = [
        createAttendance('y1', 'c1', 's1', '2026-12-30', 'P'),
        createAttendance('y2', 'c1', 's1', '2026-12-31', 'P'),
        createAttendance('y3', 'c1', 's1', '2027-01-01', 'P'),
        createAttendance('y4', 'c1', 's1', '2027-01-02', 'F'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-12-30', to: '2027-01-02' },
      );

      expect(result.records).toBe(4);
      expect(result.distinctCalls).toBe(4);
      expect(result.present).toBe(3);
      expect(result.absent).toBe(1);
      expect(result.attendanceRate).toBe(75.0);
    });

    it('T2.5: Consecutive absence streak triggers risk at 3 Fs, and is reset by P or J', () => {
      const classes = [createClass('c1', 'Turma Streak')];
      const students = [
        createStudent('s1', 'Aluno Streak 3', 'S1'),
        createStudent('s2', 'Aluno Streak Reset', 'S2'),
      ];
      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c1', 's2'),
      ];

      const attendance = [
        // s1: 3 consecutive Fs
        createAttendance('s1-1', 'c1', 's1', '2026-10-01', 'F'),
        createAttendance('s1-2', 'c1', 's1', '2026-10-02', 'F'),
        createAttendance('s1-3', 'c1', 's1', '2026-10-03', 'F'),
        // s2: 2 Fs, then 1 J, then 2 Fs (never reaches 3 consecutive Fs, but test overall rate)
        createAttendance('s2-1', 'c1', 's2', '2026-10-01', 'F'),
        createAttendance('s2-2', 'c1', 's2', '2026-10-02', 'F'),
        createAttendance('s2-3', 'c1', 's2', '2026-10-03', 'P'), // resets streak!
        createAttendance('s2-4', 'c1', 's2', '2026-10-04', 'P'),
        createAttendance('s2-5', 'c1', 's2', '2026-10-05', 'P'),
        createAttendance('s2-6', 'c1', 's2', '2026-10-06', 'P'),
        createAttendance('s2-7', 'c1', 's2', '2026-10-07', 'P'),
        createAttendance('s2-8', 'c1', 's2', '2026-10-08', 'P'),
      ]; // s2: 6 P out of 8 records = 75.0% rate, streak reset -> NOT at risk!

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-01', to: '2026-10-10' },
      );

      // s1 is at risk (streak 3 and rate < 75%)
      // s2 is NOT at risk (rate = 75.0%, max streak = 2)
      expect(result.riskStudents).toBe(1);
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Interactions
  // =========================================================================
  describe('Tier 3: Cross-Feature Interactions', () => {
    it('T3.1: Canonical attendance deduplication preserves only latest record for (class:student:date)', () => {
      const classes = [createClass('c1', 'Turma Dedup')];
      const students = [createStudent('s1', 'Aluno Dedup', 'D01')];
      const enrollments = [createEnrollment('e1', 'c1', 's1')];

      // Two records for the same day with different IDs and updated_at
      const attendance = [
        createAttendance('orig-id', 'c1', 's1', '2026-10-15', 'F', '2026-10-15T08:00:00Z'),
        createAttendance('sync-id', 'c1', 's1', '2026-10-15', 'P', '2026-10-15T14:30:00Z'), // later update overrides F with P
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-01', to: '2026-10-31' },
      );

      expect(result.records).toBe(1);
      expect(result.present).toBe(1);
      expect(result.absent).toBe(0);
      expect(result.attendanceRate).toBe(100.0);
    });

    it('T3.2: Multidimensional filtering (courseId + classId + studentId) scopes strictly', () => {
      const classes = [
        createClass('c1', 'Turma Front', 'curso-web'),
        createClass('c2', 'Turma Back', 'curso-web'),
        createClass('c3', 'Turma Mobile', 'curso-app'),
      ];
      const students = [
        createStudent('s1', 'Alice', '01'),
        createStudent('s2', 'Bob', '02'),
      ];
      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c2', 's2'),
        createEnrollment('e3', 'c3', 's1'),
      ];

      const attendance = [
        createAttendance('a1', 'c1', 's1', '2026-10-05', 'P'),
        createAttendance('a2', 'c2', 's2', '2026-10-05', 'F'),
        createAttendance('a3', 'c3', 's1', '2026-10-05', 'P'),
      ];

      // Filter by course-web AND class c1 AND student s1
      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers: [], attendance },
        { from: '2026-10-01', to: '2026-10-31', courseId: 'curso-web', classId: 'c1', studentId: 's1' },
      );

      expect(result.records).toBe(1);
      expect(result.present).toBe(1);
      expect(result.byClass).toHaveLength(1);
      expect(result.byClass[0].id).toBe('c1');
    });
  });

  // =========================================================================
  // TIER 4: Real-World Scenario
  // =========================================================================
  describe('Tier 4: Real-World Scenarios', () => {
    it('T4.1: Departmental monthly audit with 3 classes, 6 students, and mixed statuses', () => {
      const classes = [
        createClass('c1', 'Desenvolvimento Web', 'course-1'),
        createClass('c2', 'Ciência de Dados', 'course-2'),
        createClass('c3', 'Design UI/UX', 'course-3'),
      ];

      const students = [
        createStudent('s1', 'Ana Silva', 'ITB-001'),
        createStudent('s2', 'Bruno Costa', 'ITB-002'),
        createStudent('s3', 'Carla Dias', 'ITB-003'),
        createStudent('s4', 'Daniel Alves', 'ITB-004'),
        createStudent('s5', 'Elena Rocha', 'ITB-005'),
        createStudent('s6', 'Felipe Santos', 'ITB-006'),
      ];

      const enrollments = [
        createEnrollment('e1', 'c1', 's1'),
        createEnrollment('e2', 'c1', 's2'),
        createEnrollment('e3', 'c2', 's3'),
        createEnrollment('e4', 'c2', 's4'),
        createEnrollment('e5', 'c3', 's5'),
        createEnrollment('e6', 'c3', 's6'),
      ];

      const classTeachers = [
        { id: 'ct1', class_id: 'c1', user_id: 'prof-marcos' },
        { id: 'ct2', class_id: 'c2', user_id: 'prof-juliana' },
        { id: 'ct3', class_id: 'c3', user_id: 'prof-marcos' }, // teacher has 2 classes
      ];

      // Simulate 4 weeks of calls
      const attendance: LocalRecord[] = [
        // Turma c1: 4 classes held, mostly present
        createAttendance('a1', 'c1', 's1', '2026-10-05', 'P'),
        createAttendance('a2', 'c1', 's2', '2026-10-05', 'P'),
        createAttendance('a3', 'c1', 's1', '2026-10-12', 'P'),
        createAttendance('a4', 'c1', 's2', '2026-10-12', 'F'),
        createAttendance('a5', 'c1', 's1', '2026-10-19', 'P'),
        createAttendance('a6', 'c1', 's2', '2026-10-19', 'P'),
        createAttendance('a7', 'c1', 's1', '2026-10-26', 'P'),
        createAttendance('a8', 'c1', 's2', '2026-10-26', 'P'),

        // Turma c2: 4 classes held, s4 has consecutive absences
        createAttendance('b1', 'c2', 's3', '2026-10-06', 'P'),
        createAttendance('b2', 'c2', 's4', '2026-10-06', 'F'),
        createAttendance('b3', 'c2', 's3', '2026-10-13', 'P'),
        createAttendance('b4', 'c2', 's4', '2026-10-13', 'F'),
        createAttendance('b5', 'c2', 's3', '2026-10-20', 'P'),
        createAttendance('b6', 'c2', 's4', '2026-10-20', 'F'), // streak >= 3!
        createAttendance('b7', 'c2', 's3', '2026-10-27', 'P'),
        createAttendance('b8', 'c2', 's4', '2026-10-27', 'F'),

        // Turma c3: 2 classes held with justified and replacement
        createAttendance('d1', 'c3', 's5', '2026-10-07', 'P'),
        createAttendance('d2', 'c3', 's6', '2026-10-07', 'J'),
        createAttendance('d3', 'c3', 's5', '2026-10-14', 'RC'),
        createAttendance('d4', 'c3', 's6', '2026-10-14', 'A'),
      ];

      const result = buildAnalytics(
        { classes, students, enrollments, classTeachers, attendance },
        { from: '2026-10-01', to: '2026-10-31' },
      );

      // Total records = 8 + 8 + 4 = 20
      expect(result.records).toBe(20);
      expect(result.distinctCalls).toBe(10); // 4 in c1 + 4 in c2 + 2 in c3
      expect(result.activeStudents).toBe(6);

      // s4 has 4 absences, s2 has 1 absence -> top absentees
      expect(result.topAbsentees[0].studentId).toBe('s4');
      expect(result.topAbsentees[0].absences).toBe(4);
      expect(result.topAbsentees[0].rate).toBe(0);

      // Risk students: s4 is clearly at risk (streak 4, rate 0%)
      expect(result.riskStudents).toBeGreaterThanOrEqual(1);

      // Teacher workload: prof-marcos teaches c1 and c3
      const marcosWorkload = result.teacherWorkload.find((t) => t.teacherId === 'prof-marcos');
      expect(marcosWorkload).toBeDefined();
      expect(marcosWorkload?.classes).toBe(2);
      expect(marcosWorkload?.students).toBe(4); // s1, s2 from c1 + s5, s6 from c3
    });
  });
});
