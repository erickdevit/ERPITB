export type Role = 'admin' | 'pedagogico' | 'professor';
export type AttendanceStatus = 'P' | 'F' | 'J' | 'A';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
  BOOTSTRAP_SECRET: string;
  ALLOWED_ORIGIN?: string;
  ACCESS_TOKEN_TTL_MINUTES?: string;
  REFRESH_TOKEN_TTL_DAYS?: string;
  INSTITUTION_TIMEZONE?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface TokenClaims extends JWTPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface JWTPayload {
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface SyncOperation {
  operationId: string;
  entity: SyncEntity;
  action: 'upsert' | 'delete';
  id: string;
  baseVersion: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

export type SyncEntity =
  | 'courses'
  | 'classes'
  | 'class_teachers'
  | 'students'
  | 'enrollments'
  | 'attendance_records'
  | 'class_notes';

export interface SyncPushBody {
  deviceId: string;
  operations: SyncOperation[];
}
