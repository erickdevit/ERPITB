import { describe, expect, it } from 'vitest';
import { buildBiDataset, type BiInput } from './model';

const input: BiInput = {
  courses: [{ id: 'course-1', name: 'Tecnologia', active: 1 }],
  classes: [
    { id: 'class-1', name: 'Turma A', course_id: 'course-1', shift: 'manha', week_day: 'segunda', laboratory_id: 'lab-1', active: 1 },
    { id: 'class-2', name: 'Turma B', course_id: 'course-1', shift: 'manha', week_day: 'segunda', laboratory_id: 'lab-1', active: 1 },
  ],
  students: [
    { id: 'student-1', name: 'Ana', registration_number: '001', active: 1 },
    { id: 'student-2', name: 'Bia', registration_number: '002', active: 1 },
  ],
  enrollments: [
    { id: 'enrollment-1', class_id: 'class-1', student_id: 'student-1', status: 'ativa' },
    { id: 'enrollment-2', class_id: 'class-2', student_id: 'student-2', status: 'ativa' },
  ],
  classTeachers: [
    { id: 'relation-1', class_id: 'class-1', user_id: 'teacher-1' },
    { id: 'relation-2', class_id: 'class-2', user_id: 'teacher-2' },
  ],
  attendance: [
    { id: 'a1', class_id: 'class-1', student_id: 'student-1', date: '2026-08-01', status: 'F', recorded_by_user_id: 'teacher-1' },
    { id: 'a2', class_id: 'class-1', student_id: 'student-1', date: '2026-08-02', status: 'F', recorded_by_user_id: 'teacher-1' },
    { id: 'a3', class_id: 'class-1', student_id: 'student-1', date: '2026-08-03', status: 'F', recorded_by_user_id: 'teacher-1' },
    { id: 'a4', class_id: 'class-2', student_id: 'student-2', date: '2026-08-03', status: 'R', recorded_by_user_id: 'teacher-2' },
  ],
  replacements: [{ id: 'replacement-1', attendance_record_id: 'a4', class_id: 'class-2', student_id: 'student-2', attendance_date: '2026-08-03', scheduled_date: '2026-08-05', scheduled_time: '08:00', completed_at: null }],
  laboratories: [{ id: 'lab-1', name: 'Laboratório 1', active: 1 }],
  directory: [{ id: 'teacher-1', name: 'Professor Um' }, { id: 'teacher-2', name: 'Professor Dois' }],
};

describe('buildBiDataset', () => {
  it('uses distinct class/day calls and preserves the documented risk rules', () => {
    const result = buildBiDataset(input, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.analytics.records).toBe(4);
    expect(result.calls).toBe(4);
    expect(result.riskRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Ana', rate: 0, consecutiveAbsences: 3 }),
      expect.objectContaining({ name: 'Bia', rate: 0, consecutiveAbsences: 0 }),
    ]));
    expect(result.replacementSummary).toMatchObject({ overdue: 1, completed: 0, notScheduled: 0 });
  });

  it('applies the shared teacher and shift scope to every derived dataset', () => {
    const result = buildBiDataset(input, { from: '2026-08-01', to: '2026-08-31', teacherId: 'teacher-1', shift: 'manha' }, '2026-08-10');

    expect(result.classes.map((item) => item.id)).toEqual(['class-1']);
    expect(result.classRows.map((item) => item.name)).toEqual(['Turma A']);
    expect(result.analytics.records).toBe(3);
    expect(result.replacementRows).toHaveLength(0);
    expect(result.teacherRows).toEqual([expect.objectContaining({ name: 'Professor Um', classes: 1, callsRecorded: 3 })]);
  });

  it('labels laboratory overlap as potential and reports data quality without mutating records', () => {
    const result = buildBiDataset(input, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.laboratoryRows[0]).toMatchObject({ name: 'Laboratório 1', classes: 2, potentialCollisions: 1 });
    expect(result.limitations.join(' ')).toContain('sem afirmar sobreposição');
    expect(result.qualityIssues.map((item) => item.code)).toContain('multiple-enrollments');
  });

  it('shows a legacy RC attendance as a completed replacement without inventing a schedule', () => {
    const legacy = { ...input, attendance: [...input.attendance, { id: 'a5', class_id: 'class-2', student_id: 'student-2', date: '2026-08-04', status: 'RC', completed_at: '2026-08-06T12:00:00Z', recorded_by_user_id: 'teacher-2' }] };
    const result = buildBiDataset(legacy, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.replacementRows).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'a5', state: 'Concluída', scheduledDate: '', completedAt: '2026-08-06T12:00:00Z' })]));
  });

  it('accurately reflects gradeTables, gradeItems, and studentGrades in gradesSummary', () => {
    const inputWithGrades: BiInput = {
      ...input,
      gradeTables: [
        { id: 'gt-1', class_id: 'class-1', name: 'Módulo 1', calculation_mode: 'simple', passing_grade: 6.0, active: 1 },
        { id: 'gt-2', class_id: 'class-2', name: 'Módulo 2', calculation_mode: 'simple', passing_grade: 6.0, active: 1 },
      ],
      gradeItems: [
        { id: 'gi-1', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Prova 1', max_score: 10, category: 'Prova', weight: 1, active: 1 },
        { id: 'gi-2', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Projeto 1', max_score: 10, category: 'Projeto', weight: 1, active: 1 },
        { id: 'gi-3', grade_table_id: 'gt-2', class_id: 'class-2', name: 'Prova 2', max_score: 10, category: 'Prova', weight: 1, active: 1 },
      ],
      studentGrades: [
        { id: 'sg-1', grade_item_id: 'gi-1', student_id: 'student-1', class_id: 'class-1', score: 8.0 },
        { id: 'sg-2', grade_item_id: 'gi-2', student_id: 'student-1', class_id: 'class-1', score: 6.0 },
        { id: 'sg-3', grade_item_id: 'gi-3', student_id: 'student-2', class_id: 'class-2', score: 4.0 },
      ],
    };

    const result = buildBiDataset(inputWithGrades, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.gradesSummary).toBeDefined();
    expect(result.gradesSummary?.totalTables).toBe(2);
    expect(result.gradesSummary?.totalAssessments).toBe(3);
    expect(result.gradesSummary?.gradedEntries).toBe(3);
    expect(result.gradesSummary?.overallAverage).toBe(6.0);
    expect(result.gradesSummary?.approvedStudents).toBe(1);
    expect(result.gradesSummary?.recoveryStudents).toBe(1);
    expect(result.gradesSummary?.failedStudents).toBe(0);

    // Class breakdown
    expect(result.gradesSummary?.byClass).toEqual([
      {
        id: 'class-1',
        className: 'Turma A',
        courseName: 'Tecnologia',
        tables: 1,
        assessments: 2,
        averageScore: 7.0,
        approved: 1,
        recovery: 0,
        failed: 0,
        inProgress: 0,
      },
      {
        id: 'class-2',
        className: 'Turma B',
        courseName: 'Tecnologia',
        tables: 1,
        assessments: 1,
        averageScore: 4.0,
        approved: 0,
        recovery: 1,
        failed: 0,
        inProgress: 0,
      },
    ]);

    // Category breakdown
    expect(result.gradesSummary?.byCategory).toEqual([
      {
        category: 'Projeto',
        classes: 1,
        assessments: 1,
        gradedEntries: 1,
        averageScore: 6.0,
      },
      {
        category: 'Prova',
        classes: 2,
        assessments: 2,
        gradedEntries: 2,
        averageScore: 6.0,
      },
    ]);
  });

  it('scopes gradesSummary when filtering by teacherId or classId', () => {
    const inputWithGrades: BiInput = {
      ...input,
      gradeTables: [
        { id: 'gt-1', class_id: 'class-1', name: 'Módulo 1', calculation_mode: 'simple', passing_grade: 6.0, active: 1 },
        { id: 'gt-2', class_id: 'class-2', name: 'Módulo 2', calculation_mode: 'simple', passing_grade: 6.0, active: 1 },
      ],
      gradeItems: [
        { id: 'gi-1', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Prova 1', max_score: 10, category: 'Prova', weight: 1, active: 1 },
        { id: 'gi-2', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Projeto 1', max_score: 10, category: 'Projeto', weight: 1, active: 1 },
        { id: 'gi-3', grade_table_id: 'gt-2', class_id: 'class-2', name: 'Prova 2', max_score: 10, category: 'Prova', weight: 1, active: 1 },
      ],
      studentGrades: [
        { id: 'sg-1', grade_item_id: 'gi-1', student_id: 'student-1', class_id: 'class-1', score: 8.0 },
        { id: 'sg-2', grade_item_id: 'gi-2', student_id: 'student-1', class_id: 'class-1', score: 6.0 },
        { id: 'sg-3', grade_item_id: 'gi-3', student_id: 'student-2', class_id: 'class-2', score: 4.0 },
      ],
    };

    const result = buildBiDataset(
      inputWithGrades,
      { from: '2026-08-01', to: '2026-08-31', teacherId: 'teacher-1' },
      '2026-08-10',
    );

    expect(result.gradesSummary?.totalTables).toBe(1);
    expect(result.gradesSummary?.totalAssessments).toBe(2);
    expect(result.gradesSummary?.gradedEntries).toBe(2);
    expect(result.gradesSummary?.overallAverage).toBe(7.0);
    expect(result.gradesSummary?.byClass).toHaveLength(1);
    expect(result.gradesSummary?.byClass[0].id).toBe('class-1');
  });

  it('filters studentGrades by studentId filter', () => {
    const inputWithGrades: BiInput = {
      ...input,
      gradeTables: [
        { id: 'gt-1', class_id: 'class-1', name: 'Módulo 1', calculation_mode: 'simple', passing_grade: 6.0, active: 1 },
      ],
      gradeItems: [
        { id: 'gi-1', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Prova 1', max_score: 10, category: 'Prova', weight: 1, active: 1 },
      ],
      studentGrades: [
        { id: 'sg-1', grade_item_id: 'gi-1', student_id: 'student-1', class_id: 'class-1', score: 9.0 },
        { id: 'sg-2', grade_item_id: 'gi-1', student_id: 'student-2', class_id: 'class-1', score: 5.0 },
      ],
    };

    const result = buildBiDataset(
      inputWithGrades,
      { from: '2026-08-01', to: '2026-08-31', studentId: 'student-1' },
      '2026-08-10',
    );

    expect(result.gradesSummary?.gradedEntries).toBe(1);
    expect(result.gradesSummary?.overallAverage).toBe(9.0);
  });

  it('ignores soft-deleted grade records', () => {
    const inputWithDeleted: BiInput = {
      ...input,
      gradeTables: [
        { id: 'gt-1', class_id: 'class-1', name: 'Módulo 1' },
        { id: 'gt-del', class_id: 'class-1', name: 'Módulo Deletado', deleted_at: '2026-08-05T00:00:00Z' },
      ],
      gradeItems: [
        { id: 'gi-1', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Prova 1', max_score: 10 },
        { id: 'gi-del', grade_table_id: 'gt-1', class_id: 'class-1', name: 'Item Deletado', deleted_at: '2026-08-05T00:00:00Z' },
      ],
      studentGrades: [
        { id: 'sg-1', grade_item_id: 'gi-1', student_id: 'student-1', class_id: 'class-1', score: 10.0 },
        { id: 'sg-del', grade_item_id: 'gi-1', student_id: 'student-1', class_id: 'class-1', score: 2.0, deleted_at: '2026-08-05T00:00:00Z' },
      ],
    };

    const result = buildBiDataset(inputWithDeleted, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.gradesSummary?.totalTables).toBe(1);
    expect(result.gradesSummary?.totalAssessments).toBe(1);
    expect(result.gradesSummary?.gradedEntries).toBe(1);
    expect(result.gradesSummary?.overallAverage).toBe(10.0);
  });

  it('returns empty grade summary defaults when grade inputs are absent or empty', () => {
    const result = buildBiDataset(input, { from: '2026-08-01', to: '2026-08-31' }, '2026-08-10');

    expect(result.gradesSummary).toEqual({
      totalTables: 0,
      totalAssessments: 0,
      gradedEntries: 0,
      overallAverage: null,
      approvedStudents: 0,
      recoveryStudents: 0,
      failedStudents: 0,
      byCategory: [],
      byClass: [
        {
          id: 'class-1',
          className: 'Turma A',
          courseName: 'Tecnologia',
          tables: 0,
          assessments: 0,
          averageScore: null,
          approved: 0,
          recovery: 0,
          failed: 0,
          inProgress: 0,
        },
        {
          id: 'class-2',
          className: 'Turma B',
          courseName: 'Tecnologia',
          tables: 0,
          assessments: 0,
          averageScore: null,
          approved: 0,
          recovery: 0,
          failed: 0,
          inProgress: 0,
        },
      ],
    });
  });
});
