import { describe, expect, it } from 'vitest';
import { latestAttendance } from './attendance';

describe('latestAttendance', () => {
  it('retains only the most recent status for the same class, student and day', () => {
    const rows = latestAttendance([
      { id: 'first', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'P', updated_at: '2026-08-15T10:00:00.000Z' },
      { id: 'last', class_id: 'class-1', student_id: 'student-1', date: '2026-08-15', status: 'F', updated_at: '2026-08-15T10:01:00.000Z' },
      { id: 'other-day', class_id: 'class-1', student_id: 'student-1', date: '2026-08-16', status: 'P', updated_at: '2026-08-16T10:00:00.000Z' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === '2026-08-15')?.status).toBe('F');
  });
});
