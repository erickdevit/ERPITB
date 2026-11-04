import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission, requireScope } from './rbac';
import { assertConcurrencyVersion, formatETag, parseIfMatchHeader } from './concurrency';
import { decryptText } from './crypto';
import type { AuthUser, Env } from './types';

async function requireClassAccess(env: Env, user: AuthUser, classId: string): Promise<void> {
  if (user.role === 'financeiro') {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }
  const cls = await env.DB.prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`).bind(classId).first();
  if (!cls) throw new AppError(404, 'Turma não encontrada.', 'NOT_FOUND');
  if (user.role !== 'professor') return;
  const assigned = await env.DB.prepare(
    `SELECT 1 AS allowed FROM class_teachers WHERE class_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`
  ).bind(classId, user.id).first();
  if (!assigned) throw new AppError(403, 'Professor não atribuído a esta turma.', 'FORBIDDEN');
}

export async function listReplacements(env: Env, user: AuthUser, url: URL): Promise<{ items: unknown[] }> {
  requireScope(user, 'attendance:read');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const classId = url.searchParams.get('classId');
  const studentId = url.searchParams.get('studentId');
  const pending = url.searchParams.get('pending');

  if (classId) await requireClassAccess(env, user, classId);

  let sql = `
    SELECT r.*, s.encrypted_name, s.registration_number, c.name AS class_name
      FROM replacements r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN classes c ON c.id = r.class_id
     WHERE r.deleted_at IS NULL
  `;
  const binds: unknown[] = [];

  if (classId) {
    sql += ` AND r.class_id = ?`;
    binds.push(classId);
  }
  if (studentId) {
    sql += ` AND r.student_id = ?`;
    binds.push(studentId);
  }
  if (pending === 'true') {
    sql += ` AND r.completed_at IS NULL`;
  } else if (pending === 'false') {
    sql += ` AND r.completed_at IS NOT NULL`;
  }
  sql += ` ORDER BY r.scheduled_date DESC, r.scheduled_time DESC`;

  const rows = await env.DB.prepare(sql).bind(...binds).all<{
    id: string; attendance_record_id: string; class_id: string; student_id: string;
    attendance_date: string; scheduled_date: string; scheduled_time: string;
    notes: string | null; completed_at: string | null; recorded_by_user_id: string;
    sync_version: number; created_at: string; updated_at: string;
    encrypted_name: string; registration_number: string; class_name: string | null;
  }>();

  const items = await Promise.all(
    rows.results.map(async (r) => {
      let studentName = `Aluno ${r.registration_number || r.student_id.slice(0, 8)}`;
      try {
        studentName = await decryptText(env, r.encrypted_name);
      } catch {}
      const { encrypted_name, ...safe } = r;
      return {
        ...safe,
        studentName,
      };
    })
  );

  return { items };
}

export async function getReplacement(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'attendance:read');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const row = await env.DB.prepare(
    `SELECT r.*, s.encrypted_name, s.registration_number, c.name AS class_name
       FROM replacements r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN classes c ON c.id = r.class_id
      WHERE r.id = ? AND r.deleted_at IS NULL`
  ).bind(id).first<{
    id: string; attendance_record_id: string; class_id: string; student_id: string;
    attendance_date: string; scheduled_date: string; scheduled_time: string;
    notes: string | null; completed_at: string | null; recorded_by_user_id: string;
    sync_version: number; created_at: string; updated_at: string;
    encrypted_name: string; registration_number: string; class_name: string | null;
  }>();

  if (!row) throw new AppError(404, 'Reposição não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, row.class_id);

  let studentName = `Aluno ${row.registration_number || row.student_id.slice(0, 8)}`;
  try {
    studentName = await decryptText(env, row.encrypted_name);
  } catch {}
  const { encrypted_name, ...safe } = row;

  return new Response(JSON.stringify({ ...safe, studentName }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(Number(row.sync_version ?? 1)),
    },
  });
}

export async function createReplacement(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'attendance:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const body = await readJson<Record<string, unknown>>(request);
  const attendanceRecordId = requireString(body.attendanceRecordId, 'attendanceRecordId', { max: 36 });
  const classId = requireString(body.classId, 'classId', { max: 36 });
  const studentId = requireString(body.studentId, 'studentId', { max: 36 });
  const attendanceDate = requireString(body.attendanceDate, 'attendanceDate', { max: 10 });
  const scheduledDate = requireString(body.scheduledDate, 'scheduledDate', { max: 10 });
  const scheduledTime = requireString(body.scheduledTime, 'scheduledTime', { max: 10 });
  const notes = typeof body.notes === 'string' ? body.notes : null;

  await requireClassAccess(env, user, classId);

  const id = uuid();
  const timestamp = nowIso();

  await env.DB.prepare(`
      INSERT INTO replacements (
        id, attendance_record_id, class_id, student_id, attendance_date,
        scheduled_date, scheduled_time, notes, completed_at, recorded_by_user_id,
        sync_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
    `).bind(
      id, attendanceRecordId, classId, studentId, attendanceDate,
      scheduledDate, scheduledTime, notes, user.id, timestamp, timestamp
    ).run();

  const created = await env.DB.prepare(`SELECT * FROM replacements WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(1),
    },
  });
}

export async function updateReplacement(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'attendance:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM replacements WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Reposição não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<Record<string, unknown>>(request);
  const scheduledDate = body.scheduledDate !== undefined ? requireString(body.scheduledDate, 'scheduledDate', { max: 10 }) : String(current.scheduled_date);
  const scheduledTime = body.scheduledTime !== undefined ? requireString(body.scheduledTime, 'scheduledTime', { max: 10 }) : String(current.scheduled_time);
  const notes = body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes : null) : (current.notes as string | null);
  const completedAt = body.completedAt !== undefined ? (typeof body.completedAt === 'string' ? body.completedAt : null) : (current.completed_at as string | null);

  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`
    UPDATE replacements
       SET scheduled_date = ?, scheduled_time = ?, notes = ?, completed_at = ?,
           sync_version = ?, updated_at = ?
     WHERE id = ? AND sync_version = ? AND deleted_at IS NULL
  `).bind(scheduledDate, scheduledTime, notes, completedAt, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM replacements WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Reposição não encontrada.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  // If completed, update attendance record status to 'RC' (Reposição Concluída)
  if (completedAt && !current.completed_at) {
    await env.DB.prepare(`
      UPDATE attendance_records
         SET status = 'RC', sync_version = sync_version + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
    `).bind(timestamp, String(current.attendance_record_id)).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM replacements WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function completeReplacement(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'attendance:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM replacements WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Reposição não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  let body: Record<string, unknown> = {};
  try {
    body = await readJson<Record<string, unknown>>(request);
  } catch {}

  const timestamp = nowIso();
  const completedAt = typeof body.completedAt === 'string' ? body.completedAt : timestamp;
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`
    UPDATE replacements
       SET completed_at = ?, sync_version = ?, updated_at = ?
     WHERE id = ? AND sync_version = ? AND deleted_at IS NULL
  `).bind(completedAt, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM replacements WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Reposição não encontrada.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  if (!current.completed_at) {
    await env.DB.prepare(`
      UPDATE attendance_records
         SET status = 'RC', sync_version = sync_version + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
    `).bind(timestamp, String(current.attendance_record_id)).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM replacements WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

