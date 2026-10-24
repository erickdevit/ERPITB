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

  it('enforces least-privilege for role financeiro and isolates financial operations', () => {
    // financeiro has finance access
    expect(hasPermission('financeiro', 'finance:read')).toBe(true);
    expect(hasPermission('financeiro', 'finance:write')).toBe(true);
    expect(hasPermission('financeiro', 'reports:finance')).toBe(true);

    // financeiro cannot write grades, attendance, manage courses or api keys
    expect(hasPermission('financeiro', 'grades:write')).toBe(false);
    expect(hasPermission('financeiro', 'attendance:write')).toBe(false);
    expect(hasPermission('financeiro', 'courses:delete')).toBe(false);
    expect(hasPermission('financeiro', 'api_keys:manage')).toBe(false);
    expect(hasPermission('financeiro', 'branding:manage')).toBe(false);

    // professors and pedagogico cannot access financial operations
    expect(hasPermission('professor', 'finance:read')).toBe(false);
    expect(hasPermission('professor', 'finance:write')).toBe(false);
    expect(hasPermission('pedagogico', 'finance:read')).toBe(false);
    expect(hasPermission('pedagogico', 'finance:write')).toBe(false);

    // admin has both
    expect(hasPermission('admin', 'finance:read')).toBe(true);
    expect(hasPermission('admin', 'finance:write')).toBe(true);
    expect(hasPermission('admin', 'branding:manage')).toBe(true);
    expect(hasPermission('admin', 'api_keys:manage')).toBe(true);
  });
});
