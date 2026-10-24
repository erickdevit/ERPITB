import { AppError, nowIso, readJson, uuid } from './http';
import { requirePermission, requireScope } from './rbac';
import type { AuthUser, ClassSession, Env } from './types';

export async function ensureClassSession(
  env: Env,
  classId: string,
  date: string,
  userId: string,
  summary?: string,
): Promise<string> {
  const existing = await env.DB.prepare(
    `SELECT id FROM class_sessions WHERE class_id = ? AND date = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(classId, date).first<{ id: string }>();

  if (existing) return existing.id;

  const id = uuid();
  const timestamp = nowIso();

  await env.DB.prepare(`
    INSERT INTO class_sessions (id, class_id, date, recorded_by_user_id, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(class_id, date) DO UPDATE SET
      deleted_at = NULL,
      updated_at = excluded.updated_at
  `).bind(id, classId, date, userId, summary ?? null, timestamp, timestamp).run();

  return id;
}

export async function listClassSessions(env: Env, user: AuthUser, classId: string): Promise<{ items: ClassSession[]; total: number }> {
  requireScope(user, 'classes:read', 'attendance:read');
  const rows = await env.DB.prepare(`
    SELECT id, class_id, date, recorded_by_user_id, summary, created_at, updated_at
      FROM class_sessions
     WHERE class_id = ? AND deleted_at IS NULL
     ORDER BY date DESC
  `).bind(classId).all<{
    id: string; class_id: string; date: string; recorded_by_user_id: string;
    summary: string | null; created_at: string; updated_at: string;
  }>();

  return {
    items: rows.results.map((r) => ({
      id: r.id,
      classId: r.class_id,
      date: r.date,
      recordedByUserId: r.recorded_by_user_id,
      summary: r.summary ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total: rows.results.length,
  };
}

export async function countDistinctClassLessons(env: Env, classId: string): Promise<number> {
  // Check from class_sessions first, union with distinct attendance dates
  const countRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT session_date) AS total FROM (
      SELECT date AS session_date FROM class_sessions WHERE class_id = ? AND deleted_at IS NULL
      UNION
      SELECT date AS session_date FROM attendance_records WHERE class_id = ? AND deleted_at IS NULL
    )
  `).bind(classId, classId).first<{ total: number }>();

  return countRow?.total ?? 0;
}
