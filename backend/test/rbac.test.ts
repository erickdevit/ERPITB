import { describe, expect, it } from 'vitest';
import { dateInTimeZone, hasPermission, teacherCanEditDate } from '../src/rbac';

describe('RBAC and attendance window', () => {
  it('keeps destructive course operations admin-only', () => {
    expect(hasPermission('admin', 'courses:delete')).toBe(true);
    expect(hasPermission('pedagogico', 'courses:delete')).toBe(false);
    expect(hasPermission('professor', 'courses:update')).toBe(false);
    expect(hasPermission('admin', 'students:delete')).toBe(true);
    expect(hasPermission('pedagogico', 'students:delete')).toBe(false);
  });

  it('allows professors to edit for seven days', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    expect(teacherCanEditDate('2026-07-13', now)).toBe(true);
    expect(teacherCanEditDate('2026-07-12', now)).toBe(false);
    expect(teacherCanEditDate('2026-07-21', now)).toBe(false);
  });

  it('uses the institution calendar instead of UTC around midnight', () => {
    const now = new Date('2026-07-20T02:00:00.000Z');
    expect(dateInTimeZone(now, 'America/Sao_Paulo')).toBe('2026-07-19');
    expect(teacherCanEditDate('2026-07-12', now, 'America/Sao_Paulo')).toBe(true);
    expect(teacherCanEditDate('2026-07-20', now, 'America/Sao_Paulo')).toBe(false);
  });
});
