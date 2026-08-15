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
});
