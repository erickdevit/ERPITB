import { describe, expect, it } from 'vitest';
import { buildReplacementViews, filterReplacementViews } from './replacements-model';

describe('replacement views', () => {
  const rows = buildReplacementViews({
    classes: [{ id: 'class-1', name: 'Turma A' }],
    students: [{ id: 'student-1', name: 'Ana', registration_number: 'MAT-1' }],
    attendance: [
      { id: 'old', class_id: 'class-1', student_id: 'student-1', date: '2026-08-01', status: 'R', updated_at: '2026-08-01T10:00:00Z' },
      { id: 'current', class_id: 'class-1', student_id: 'student-1', date: '2026-08-01', status: 'RC', completed_at: '2026-08-20T12:00:00Z', updated_at: '2026-08-20T12:00:00Z' },
    ],
    replacements: [{ id: 'schedule-1', attendance_record_id: 'current', scheduled_date: '2026-08-20', scheduled_time: '09:30', notes: 'Reforço', completed_at: '2026-08-20T12:00:00Z' }],
  });

  it('deduplicates attendance and keeps structured schedule and completion data', () => {
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'current', completed: true, scheduledDate: '2026-08-20', notes: 'Reforço' });
  });

  it('combines history, class, period and student filters', () => {
    expect(filterReplacementViews(rows, { history: true, query: 'mat-1', classId: 'class-1', from: '2026-08-01', to: '2026-08-01' })).toHaveLength(1);
    expect(filterReplacementViews(rows, { history: false, query: '', classId: '', from: '', to: '' })).toHaveLength(0);
    expect(filterReplacementViews(rows, { history: true, query: '', classId: '', from: '2026-08-02', to: '' })).toHaveLength(0);
  });
});
