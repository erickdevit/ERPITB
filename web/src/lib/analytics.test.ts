import { describe, expect, it } from 'vitest';
import { buildAnalytics } from './analytics';

describe('buildAnalytics', () => {
  it('matches the desktop indicators and keeps only the latest daily status', () => {
    const result = buildAnalytics({
      classes: [{ id: 'c1', name: 'Turma 1', course_id: 'course-1', active: 1 }],
      students: [{ id: 's1', name: 'Ana', registration_number: '001', active: 1 }],
      enrollments: [{ id: 'e1', class_id: 'c1', student_id: 's1', status: 'ativa' }],
      classTeachers: [{ id: 'ct1', class_id: 'c1', user_id: 't1' }],
      attendance: [
        { id: 'old', class_id: 'c1', student_id: 's1', date: '2026-08-01', status: 'P', updated_at: '2026-08-01T10:00:00Z' },
        { id: 'new', class_id: 'c1', student_id: 's1', date: '2026-08-01', status: 'F', updated_at: '2026-08-01T10:01:00Z' },
        { id: 'a2', class_id: 'c1', student_id: 's1', date: '2026-08-02', status: 'F' },
        { id: 'a3', class_id: 'c1', student_id: 's1', date: '2026-08-03', status: 'F' },
      ],
    }, { from: '2026-08-01', to: '2026-08-31' });

    expect(result.records).toBe(3);
    expect(result.absent).toBe(3);
    expect(result.present).toBe(0);
    expect(result.distinctCalls).toBe(3);
    expect(result.riskStudents).toBe(1);
    expect(result.topAbsentees[0]).toMatchObject({ name: 'Ana', absences: 3, rate: 0 });
    expect(result.teacherWorkload).toEqual([{ teacherId: 't1', classes: 1, students: 1 }]);
  });

  it('combines course, class, student and period filters', () => {
    const result = buildAnalytics({
      classes: [{ id: 'c1', name: 'A', course_id: 'course-1' }, { id: 'c2', name: 'B', course_id: 'course-2' }],
      students: [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Bia' }],
      enrollments: [{ id: 'e1', class_id: 'c1', student_id: 's1', status: 'ativa' }, { id: 'e2', class_id: 'c2', student_id: 's2', status: 'ativa' }],
      classTeachers: [],
      attendance: [{ id: 'a1', class_id: 'c1', student_id: 's1', date: '2026-08-10', status: 'P' }, { id: 'a2', class_id: 'c2', student_id: 's2', date: '2026-08-10', status: 'F' }],
    }, { from: '2026-08-01', to: '2026-08-31', courseId: 'course-1', classId: 'c1', studentId: 's1' });

    expect(result.records).toBe(1);
    expect(result.present).toBe(1);
    expect(result.distinctCalls).toBe(1);
    expect(result.byClass.map((item) => item.id)).toEqual(['c1']);
  });

  it('counts one distinct call per class and date', () => {
    const result = buildAnalytics({
      classes: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
      students: [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Bia' }],
      enrollments: [
        { id: 'e1', class_id: 'c1', student_id: 's1', status: 'ativa' },
        { id: 'e2', class_id: 'c1', student_id: 's2', status: 'ativa' },
        { id: 'e3', class_id: 'c2', student_id: 's1', status: 'ativa' },
      ],
      classTeachers: [],
      attendance: [
        { id: 'a1', class_id: 'c1', student_id: 's1', date: '2026-08-10', status: 'P' },
        { id: 'a2', class_id: 'c1', student_id: 's2', date: '2026-08-10', status: 'F' },
        { id: 'a3', class_id: 'c2', student_id: 's1', date: '2026-08-10', status: 'P' },
      ],
    }, { from: '2026-08-01', to: '2026-08-31' });

    expect(result.records).toBe(3);
    expect(result.distinctCalls).toBe(2);
  });

  it('keeps completed legacy replacements in the denominator and replacement total', () => {
    const result = buildAnalytics({
      classes: [{ id: 'c1', name: 'A' }], students: [{ id: 's1', name: 'Ana' }],
      enrollments: [{ id: 'e1', class_id: 'c1', student_id: 's1', status: 'ativa' }], classTeachers: [],
      attendance: [{ id: 'a1', class_id: 'c1', student_id: 's1', date: '2026-08-10', status: 'RC', completed_at: '2026-08-11T12:00:00Z' }],
    }, { from: '2026-08-01', to: '2026-08-31' });

    expect(result).toMatchObject({ records: 1, replacements: 1, attendanceRate: 0, distinctCalls: 1 });
  });

  it('evaluates dropout risk per class (student_id|class_id) without interleaving attendance across classes', () => {
    const result = buildAnalytics({
      classes: [
        { id: 'c1', name: 'Turma de Matemática', course_id: 'course-1', active: 1 },
        { id: 'c2', name: 'Turma de História', course_id: 'course-1', active: 1 },
      ],
      students: [{ id: 's1', name: 'Carlos', registration_number: '123', active: 1 }],
      enrollments: [
        { id: 'e1', class_id: 'c1', student_id: 's1', status: 'ativa' },
        { id: 'e2', class_id: 'c2', student_id: 's1', status: 'ativa' },
      ],
      classTeachers: [],
      // Interleaved dates: c1 has 3 consecutive absences, while c2 has presences on alternate days
      attendance: [
        { id: 'a1', class_id: 'c1', student_id: 's1', date: '2026-08-01', status: 'F' },
        { id: 'a2', class_id: 'c2', student_id: 's1', date: '2026-08-02', status: 'P' },
        { id: 'a3', class_id: 'c1', student_id: 's1', date: '2026-08-03', status: 'F' },
        { id: 'a4', class_id: 'c2', student_id: 's1', date: '2026-08-04', status: 'P' },
        { id: 'a5', class_id: 'c1', student_id: 's1', date: '2026-08-05', status: 'F' },
      ],
    }, { from: '2026-08-01', to: '2026-08-31' });

    // In c1, s1 has 3 consecutive absences -> at risk in c1
    // In c2, s1 has 2 presences (100%) -> not at risk in c2
    expect(result.riskStudents).toBe(1);
    expect(result.topAbsentees).toHaveLength(1);
    expect(result.topAbsentees[0]).toEqual({
      studentId: 's1',
      name: 'Carlos',
      registrationNumber: '123',
      classId: 'c1',
      className: 'Turma de Matemática',
      absences: 3,
      rate: 0,
    });
  });
});
