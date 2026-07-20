import { AppError } from './http';
import type { AuthUser, Role } from './types';

export type Permission =
  | 'courses:create'
  | 'courses:update'
  | 'courses:delete'
  | 'classes:create'
  | 'classes:update'
  | 'classes:delete'
  | 'students:write'
  | 'students:delete'
  | 'teachers:assign'
  | 'attendance:write'
  | 'conflicts:resolve'
  | 'audit:read';

const grants: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    'courses:create', 'courses:update', 'courses:delete',
    'classes:create', 'classes:update', 'classes:delete',
    'students:write', 'students:delete', 'teachers:assign', 'attendance:write',
    'conflicts:resolve', 'audit:read',
  ]),
  pedagogico: new Set([
    'courses:update', 'classes:update', 'students:write', 'teachers:assign',
    'attendance:write', 'conflicts:resolve', 'audit:read',
  ]),
  professor: new Set(['attendance:write']),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return grants[role].has(permission);
}

export function requirePermission(user: AuthUser, permission: Permission): void {
  if (!hasPermission(user.role, permission)) {
    throw new AppError(403, 'Seu perfil não possui permissão para esta ação.', 'FORBIDDEN');
  }
}

export function dateInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function teacherCanEditDate(date: string, now = new Date(), timeZone = 'UTC'): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const currentDate = dateInTimeZone(now, timeZone);
  const classDay = Date.parse(`${date}T00:00:00Z`);
  const currentDay = Date.parse(`${currentDate}T00:00:00Z`);
  if (Number.isNaN(classDay) || classDay > currentDay) return false;
  return (currentDay - classDay) / 86_400_000 <= 7;
}
