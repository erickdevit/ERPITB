import { describe, expect, it } from 'vitest';
import { activeEnrollmentFor, planEnrollmentMove } from './enrollment';

const enrollment = (id: string, classId: string, status = 'ativa', deletedAt: string | null = null) => ({
  id,
  student_id: 'student-1',
  class_id: classId,
  status,
  deleted_at: deletedAt,
});

describe('planEnrollmentMove', () => {
  it('does nothing when the only current enrollment is already the target', () => {
    expect(planEnrollmentMove([enrollment('a', 'class-a')], 'student-1', 'class-a')).toEqual({
      remove: [], target: enrollment('a', 'class-a'), unchanged: true,
    });
  });

  it('removes every other active enrollment and reuses an archived target', () => {
    const archived = enrollment('old-target', 'class-c', 'trancada', '2026-01-01T00:00:00.000Z');
    const plan = planEnrollmentMove([
      enrollment('a', 'class-a'),
      enrollment('b', 'class-b'),
      archived,
    ], 'student-1', 'class-c');

    expect(plan.remove.map((item) => item.id)).toEqual(['a', 'b']);
    expect(plan.target).toEqual(archived);
    expect(plan.unchanged).toBe(false);
  });
});

describe('activeEnrollmentFor', () => {
  it('ignores deleted and inactive enrollments', () => {
    expect(activeEnrollmentFor([
      enrollment('deleted', 'class-a', 'ativa', '2026-01-01T00:00:00.000Z'),
      enrollment('inactive', 'class-b', 'trancada'),
      enrollment('active', 'class-c'),
    ], 'student-1')?.id).toBe('active');
  });
});
