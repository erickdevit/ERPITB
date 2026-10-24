import { AppError } from './http';
import type { AuthUser, Role } from './types';

export type Permission =
  | 'laboratories:create'
  | 'laboratories:update'
  | 'laboratories:delete'
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
  | 'grades:write'
  | 'conflicts:resolve'
  | 'audit:read'
  | 'finance:read'
  | 'finance:write'
  | 'reports:finance'
  | 'branding:manage'
  | 'api_keys:manage';

const grants: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    'laboratories:create', 'laboratories:update', 'laboratories:delete',
    'courses:create', 'courses:update', 'courses:delete',
    'classes:create', 'classes:update', 'classes:delete',
    'students:write', 'students:delete', 'teachers:assign', 'attendance:write', 'grades:write',
    'conflicts:resolve', 'audit:read',
    'finance:read', 'finance:write', 'reports:finance', 'branding:manage', 'api_keys:manage',
  ]),
  pedagogico: new Set([
    'laboratories:update', 'courses:update', 'classes:update', 'students:write', 'teachers:assign',
    'attendance:write', 'grades:write', 'conflicts:resolve', 'audit:read',
  ]),
  professor: new Set(['attendance:write', 'grades:write']),
  financeiro: new Set(['finance:read', 'finance:write', 'reports:finance']),
  machine: new Set([]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return grants[role]?.has(permission) ?? false;
}

export function canAccessStudentPii(user: AuthUser): boolean {
  if (!user.isApiKey) {
    return user.role === 'admin' || user.role === 'pedagogico';
  }
  const scopes = user.scopes ?? [];
  return scopes.includes('students:pii') || scopes.includes('*');
}

export function requireScope(user: AuthUser, ...requiredScopes: string[]): void {
  if (user.isApiKey || user.role === 'machine') {
    const scopes = user.scopes ?? [];
    if (scopes.includes('*')) return;
    const hasScope = requiredScopes.some((s) => scopes.includes(s));
    if (!hasScope) {
      throw new AppError(403, 'A chave de API não possui escopo suficiente para esta ação.', 'FORBIDDEN');
    }
  }
}

const PERMISSION_SCOPE_ALIASES: Record<string, string[]> = {
  'classes:create': ['classes:write'],
  'classes:update': ['classes:write'],
  'classes:delete': ['classes:write'],
  'courses:create': ['courses:write', 'classes:write'],
  'courses:update': ['courses:write', 'classes:write'],
  'courses:delete': ['courses:write', 'classes:write'],
  'laboratories:create': ['laboratories:write', 'classes:write'],
  'laboratories:update': ['laboratories:write', 'classes:write'],
  'laboratories:delete': ['laboratories:write', 'classes:write'],
  'students:delete': ['students:write'],
  'teachers:assign': ['classes:write'],
};

export function requirePermission(user: AuthUser, permission: Permission): void {
  if (user.isApiKey || user.role === 'machine') {
    const scopes = user.scopes ?? [];
    const aliases = PERMISSION_SCOPE_ALIASES[permission] ?? [];
    const hasAccess = scopes.includes('*') || scopes.includes(permission) || aliases.some((a) => scopes.includes(a));
    if (!hasAccess) {
      throw new AppError(403, 'A chave de API não possui escopo suficiente para esta ação.', 'FORBIDDEN');
    }
    return;
  }
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
