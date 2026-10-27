import { hashPassword } from './auth';
import { decryptText, encryptText } from './crypto';
import { AppError, normalizeEmail, nowIso, readJson, requireString, uuid } from './http';
import { canAccessStudentPii, dateInTimeZone, requirePermission, requireScope, teacherCanEditDate } from './rbac';
import { assertConcurrencyVersion, formatETag, parseIfMatchHeader } from './concurrency';
import { broadcastEvent } from './events-bus';
import type { AttendanceStatus, AuthUser, Env, Role } from './types';

type JsonRecord = Record<string, unknown>;

function boolInt(value: unknown, fallback = true): number {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true' || trimmed === '1' || trimmed === 'ativo' || trimmed === 'active') return 1;
    if (trimmed === 'false' || trimmed === '0' || trimmed === 'inativo' || trimmed === 'inactive') return 0;
  }
  throw new AppError(400, 'Valor booleano inválido.', 'VALIDATION_ERROR');
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AppError(400, `${field} inválido.`, 'VALIDATION_ERROR');
  }
  return value as T;
}

function parseDate(value: unknown, field = 'data'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AppError(400, `${field} inválida.`, 'VALIDATION_ERROR');
  }
  return value;
}

function parseBirthDate(value: unknown): string {
  const date = parseDate(value, 'data de nascimento');
  if (date > new Date().toISOString().slice(0, 10)) {
    throw new AppError(400, 'A data de nascimento não pode estar no futuro.', 'VALIDATION_ERROR');
  }
  return date;
}

function audit(env: Env, user: AuthUser, action: string, entity: string, entityId: string | null, details: unknown = {}): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uuid(), user.id, action, entity, entityId, JSON.stringify(details), nowIso());
}

function change(env: Env, user: AuthUser, entity: string, entityId: string, operation: 'upsert' | 'delete', payload: unknown): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO sync_changes (entity_name, entity_id, operation, payload_json, changed_by_user_id, changed_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(entity, entityId, operation, JSON.stringify(payload), user.id, nowIso());
}

async function requireClassAccess(env: Env, user: AuthUser, classId: string): Promise<void> {
  const activeClass = await env.DB.prepare(`SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL`).bind(classId).first();
  if (!activeClass) throw new AppError(404, 'Turma não encontrada.', 'NOT_FOUND');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  if (user.role !== 'professor') return;
  const assigned = await env.DB.prepare(
    `SELECT 1 AS allowed FROM class_teachers WHERE class_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(classId, user.id).first();
  if (!assigned) throw new AppError(403, 'Professor não atribuído a esta turma.', 'FORBIDDEN');
}

async function getEntityRow(env: Env, table: string, id: string): Promise<JsonRecord> {
  const allowed = new Set([
    'laboratories', 'courses', 'classes', 'class_teachers', 'students',
    'enrollments', 'attendance_records', 'class_notes', 'replacements',
    'grade_tables', 'grade_items', 'student_grades',
  ]);
  if (!allowed.has(table)) throw new AppError(500, 'Entidade de sync inválida.');
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<JsonRecord>();
  if (!row) throw new AppError(404, 'Registro não encontrado.', 'NOT_FOUND');
  return row;
}

async function clientEntityRow(env: Env, entity: string, row: JsonRecord, user?: AuthUser): Promise<JsonRecord> {
  if (entity !== 'students' || !row.encrypted_name) return row;
  const result = { ...row };
  const hasPii = user ? canAccessStudentPii(user) : true;
  result.name = await decryptText(env, String(row.encrypted_name));
  result.cpf = hasPii && row.encrypted_cpf ? await decryptText(env, String(row.encrypted_cpf)) : null;
  result.contact = hasPii && row.encrypted_contact ? await decryptText(env, String(row.encrypted_contact)) : null;
  delete result.encrypted_name; delete result.encrypted_cpf; delete result.encrypted_contact;
  return result;
}

export async function listLaboratories(env: Env, user: AuthUser): Promise<unknown> {
  requireScope(user, 'laboratories:read', 'classes:read');
  const rows = await env.DB.prepare(
    `SELECT id, name, active, sync_version, created_at, updated_at FROM laboratories WHERE deleted_at IS NULL ORDER BY name`,
  ).all();
  return { items: rows.results };
}

export async function createLaboratory(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'laboratories:create');
  const body = await readJson<JsonRecord>(request);
  const timestamp = nowIso();
  const row = {
    id: uuid(),
    name: requireString(body.name, 'nome', { min: 2, max: 160 }),
    active: boolInt(body.active),
    sync_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO laboratories (id, name, active, sync_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
    ).bind(row.id, row.name, row.active, timestamp, timestamp),
    change(env, user, 'laboratories', row.id, 'upsert', row),
    audit(env, user, 'CREATE', 'laboratories', row.id),
  ]);
  return row;
}

export async function getLaboratory(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'laboratories:read', 'classes:read');
  const row = await env.DB.prepare(
    `SELECT id, name, active, sync_version, created_at, updated_at FROM laboratories WHERE id = ? AND deleted_at IS NULL`
  ).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Laboratório não encontrado.', 'NOT_FOUND');
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(Number(row.sync_version ?? 1)) },
  });
}

export async function updateLaboratory(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'laboratories:update');
  const current = await getEntityRow(env, 'laboratories', id);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<JsonRecord>(request);
  const name = body.name === undefined ? String(current.name) : requireString(body.name, 'nome', { min: 2, max: 160 });
  const active = body.active === undefined ? Number(current.active) : boolInt(body.active);
  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE laboratories SET name = ?, active = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`,
  ).bind(name, active, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await getEntityRow(env, 'laboratories', id);
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  const row = await getEntityRow(env, 'laboratories', id);
  await env.DB.batch([change(env, user, 'laboratories', id, 'upsert', row), audit(env, user, 'UPDATE', 'laboratories', id)]);

  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(nextVersion) },
  });
}

export async function listCourses(env: Env, user: AuthUser): Promise<unknown> {
  requireScope(user, 'courses:read', 'classes:read');
  const rows = user.role === 'professor'
    ? await env.DB.prepare(
      `SELECT DISTINCT co.id, co.code, co.name, co.active, co.sync_version, co.created_at, co.updated_at
         FROM courses co JOIN classes c ON c.course_id = co.id
         JOIN class_teachers ct ON ct.class_id = c.id AND ct.user_id = ? AND ct.deleted_at IS NULL
        WHERE co.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY co.name`,
    ).bind(user.id).all()
    : await env.DB.prepare(
      `SELECT id, code, name, active, sync_version, created_at, updated_at FROM courses WHERE deleted_at IS NULL ORDER BY name`,
    ).all();
  return { items: rows.results };
}

export async function getCourse(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'courses:read', 'classes:read');
  const row = await env.DB.prepare(
    `SELECT id, code, name, active, sync_version, created_at, updated_at FROM courses WHERE id = ? AND deleted_at IS NULL`
  ).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Curso não encontrado.', 'NOT_FOUND');
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(Number(row.sync_version ?? 1)) },
  });
}

export async function createCourse(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'courses:create');
  const body = await readJson<JsonRecord>(request);
  const timestamp = nowIso();
  const code = typeof body.code === 'string' && body.code.trim().length > 0 ? body.code.trim().toUpperCase() : null;
  const row = {
    id: uuid(),
    code,
    name: requireString(body.name, 'nome', { min: 2, max: 160 }),
    active: boolInt(body.active),
    sync_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO courses (id, code, name, active, sync_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).bind(row.id, row.code, row.name, row.active, timestamp, timestamp),
    change(env, user, 'courses', row.id, 'upsert', row),
    audit(env, user, 'CREATE', 'courses', row.id),
  ]);
  return row;
}

export async function updateCourse(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'courses:update');
  const current = await getEntityRow(env, 'courses', id);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<JsonRecord>(request);
  const code = body.code === undefined ? (current.code as string | null) : (typeof body.code === 'string' && body.code.trim().length > 0 ? body.code.trim().toUpperCase() : null);
  const name = body.name === undefined ? String(current.name) : requireString(body.name, 'nome', { min: 2, max: 160 });
  const active = body.active === undefined ? Number(current.active) : boolInt(body.active);
  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE courses SET code = ?, name = ?, active = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`,
  ).bind(code, name, active, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await getEntityRow(env, 'courses', id);
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  const row = await getEntityRow(env, 'courses', id);
  await env.DB.batch([change(env, user, 'courses', id, 'upsert', row), audit(env, user, 'UPDATE', 'courses', id)]);

  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(nextVersion) },
  });
}

export async function deleteEntity(env: Env, user: AuthUser, table: 'laboratories' | 'courses' | 'classes', id: string, request?: Request): Promise<unknown> {
  const perm = table === 'laboratories' ? 'laboratories:delete' : table === 'courses' ? 'courses:delete' : 'classes:delete';
  requirePermission(user, perm);

  const current = await env.DB.prepare(`SELECT sync_version FROM ${table} WHERE id = ? AND deleted_at IS NULL`).bind(id).first<{ sync_version: number }>();
  if (!current) throw new AppError(404, 'Registro não encontrado.', 'NOT_FOUND');

  if (request) {
    const ifMatch = parseIfMatchHeader(request);
    assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);
  }

  const linked = table === 'laboratories'
    ? await env.DB.prepare(`SELECT 1 AS linked FROM classes WHERE laboratory_id = ? AND deleted_at IS NULL LIMIT 1`).bind(id).first()
    : table === 'courses'
    ? await env.DB.prepare(`SELECT 1 AS linked FROM classes WHERE course_id = ? AND deleted_at IS NULL LIMIT 1`).bind(id).first()
    : await env.DB.prepare(
      `SELECT 1 AS linked FROM enrollments e JOIN students s ON s.id = e.student_id
        WHERE e.class_id = ? AND e.status = 'ativa' AND e.deleted_at IS NULL
          AND s.active = 1 AND s.deleted_at IS NULL LIMIT 1`,
    ).bind(id).first();
  if (linked) {
    throw new AppError(
      409,
      table === 'laboratories'
        ? 'Exclua ou altere as turmas deste laboratório antes de excluí-lo.'
        : table === 'courses'
        ? 'Exclua as turmas deste curso antes de excluí-lo.'
        : 'Transfira ou exclua os alunos ativos antes de excluir a turma.',
      'LINKED_RECORDS',
    );
  }
  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;
  const result = await env.DB.prepare(
    `UPDATE ${table} SET active = 0, deleted_at = ?, updated_at = ?, sync_version = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`,
  ).bind(timestamp, timestamp, nextVersion, id, currentVersion).run();
  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM ${table} WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Registro não encontrado.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }
  const tombstone = { id, deleted_at: timestamp, updated_at: timestamp };
  await env.DB.batch([change(env, user, table, id, 'delete', tombstone), audit(env, user, 'DELETE', table, id)]);
  return { ok: true };
}

export async function listClasses(env: Env, user: AuthUser): Promise<unknown> {
  requireScope(user, 'classes:read');
  const filter = user.role === 'professor'
    ? `JOIN class_teachers ct ON ct.class_id = c.id AND ct.user_id = ? AND ct.deleted_at IS NULL`
    : '';

  try {
    const statement = env.DB.prepare(
      `SELECT c.id, c.course_id, c.name, c.class_number, c.shift, c.week_day, c.is_kids, c.laboratory_id, c.active, c.sync_version, c.created_at, c.updated_at,
              co.code AS course_code, co.name AS course_name, l.name AS laboratory_name
         FROM classes c JOIN courses co ON co.id = c.course_id
         LEFT JOIN laboratories l ON l.id = c.laboratory_id ${filter}
        WHERE c.deleted_at IS NULL ORDER BY COALESCE(c.class_number, 999999) ASC, co.name ASC, c.name ASC`,
    );
    const rows = user.role === 'professor' ? await statement.bind(user.id).all() : await statement.all();
    return { items: rows.results };
  } catch (err) {
    const fallbackStatement = env.DB.prepare(
      `SELECT c.id, c.course_id, c.name, NULL AS class_number, c.shift, c.week_day, c.is_kids, c.laboratory_id, c.active, c.sync_version, c.created_at, c.updated_at,
              co.code AS course_code, co.name AS course_name, l.name AS laboratory_name
         FROM classes c JOIN courses co ON co.id = c.course_id
         LEFT JOIN laboratories l ON l.id = c.laboratory_id ${filter}
        WHERE c.deleted_at IS NULL ORDER BY co.name ASC, c.name ASC`,
    );
    const fallbackRows = user.role === 'professor' ? await fallbackStatement.bind(user.id).all() : await fallbackStatement.all();
    return { items: fallbackRows.results };
  }
}

export async function getClass(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'classes:read');
  await requireClassAccess(env, user, id);
  let row: Record<string, unknown> | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT c.id, c.course_id, c.name, c.class_number, c.shift, c.week_day, c.is_kids, c.laboratory_id, c.active, c.sync_version, c.created_at, c.updated_at,
              co.code AS course_code, co.name AS course_name, l.name AS laboratory_name
         FROM classes c JOIN courses co ON co.id = c.course_id
         LEFT JOIN laboratories l ON l.id = c.laboratory_id
        WHERE c.id = ? AND c.deleted_at IS NULL`
    ).bind(id).first<Record<string, unknown>>();
  } catch {
    row = await env.DB.prepare(
      `SELECT c.id, c.course_id, c.name, NULL AS class_number, c.shift, c.week_day, c.is_kids, c.laboratory_id, c.active, c.sync_version, c.created_at, c.updated_at,
              co.code AS course_code, co.name AS course_name, l.name AS laboratory_name
         FROM classes c JOIN courses co ON co.id = c.course_id
         LEFT JOIN laboratories l ON l.id = c.laboratory_id
        WHERE c.id = ? AND c.deleted_at IS NULL`
    ).bind(id).first<Record<string, unknown>>();
  }
  if (!row) throw new AppError(404, 'Turma não encontrada.', 'NOT_FOUND');
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(Number(row.sync_version ?? 1)) },
  });
}

export async function createClass(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'classes:create');
  const body = await readJson<JsonRecord>(request);
  const timestamp = nowIso();
  const rawName = requireString(body.name, 'nome', { min: 2, max: 120 });

  // 1. Extract numeric ID from name if present (e.g. "Turma 01 - Informática", "01 - Informática", "Turma 1")
  let parsedNumber: number | undefined = undefined;
  const numMatch = rawName.match(/\b0*(\d+)\b/);
  if (numMatch && numMatch[1]) {
    const n = parseInt(numMatch[1], 10);
    if (!Number.isNaN(n) && n > 0) parsedNumber = n;
  }

  // 2. Determine canonical class_number
  let classNumber: number;
  if (typeof body.classNumber === 'number' && Number.isSafeInteger(body.classNumber) && body.classNumber > 0) {
    classNumber = body.classNumber;
  } else if (parsedNumber !== undefined) {
    classNumber = parsedNumber;
  } else {
    const maxRow = await env.DB.prepare('SELECT MAX(class_number) AS max_num FROM classes WHERE deleted_at IS NULL').first<{ max_num: number | null }>();
    classNumber = (maxRow?.max_num ?? 0) + 1;
  }

  let storedName = rawName;
  if (body.cleanName === true) {
    let cleaned = rawName.trim();
    if (/^(?:turma\s*)?0*\d+$/i.test(cleaned)) {
      cleaned = 'Turma';
    } else {
      const stripped = cleaned
        .replace(/^(?:turma\s*)?0*\d+\s*[-–—:]\s*/i, '')
        .replace(/\s*[-–—:]\s*(?:turma\s*)?0*\d+$/i, '')
        .replace(/\s+0*\d+$/i, '')
        .trim();
      if (stripped.length >= 2) {
        cleaned = stripped;
      } else if (stripped.length === 1) {
        cleaned = `Turma ${stripped}`;
      }
    }
    storedName = cleaned;
  }

  const row = {
    id: uuid(),
    course_id: requireString(body.courseId, 'courseId', { max: 36 }),
    name: storedName,
    class_number: classNumber,
    shift: oneOf(body.shift, 'turno', ['manha', 'tarde', 'noite', 'integral'] as const),
    week_day: typeof (body.weekDay ?? body.week_day) === 'string' && String(body.weekDay ?? body.week_day).trim().length > 0 ? String(body.weekDay ?? body.week_day).trim() : null,
    is_kids: boolInt(body.isKids ?? body.is_kids, false),
    laboratory_id: typeof (body.laboratoryId ?? body.laboratory_id) === 'string' && String(body.laboratoryId ?? body.laboratory_id).length > 0 ? String(body.laboratoryId ?? body.laboratory_id) : null,
    active: boolInt(body.active), sync_version: 1, created_at: timestamp, updated_at: timestamp,
  };
  const teacherId = typeof body.teacherId === 'string' && body.teacherId.length > 0 ? requireString(body.teacherId, 'professor', { max: 36 }) : null;
  if (teacherId) {
    const professor = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'professor' AND active = 1`).bind(teacherId).first();
    if (!professor) throw new AppError(400, 'Professor inválido.', 'VALIDATION_ERROR');
  }
  const assignment = teacherId ? { id: uuid(), class_id: row.id, user_id: teacherId, sync_version: 1, created_at: timestamp, updated_at: timestamp } : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO classes (id, course_id, name, class_number, shift, week_day, is_kids, laboratory_id, active, sync_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(row.id, row.course_id, row.name, row.class_number, row.shift, row.week_day, row.is_kids, row.laboratory_id, row.active, timestamp, timestamp),
    change(env, user, 'classes', row.id, 'upsert', row),
    ...(assignment ? [env.DB.prepare(`INSERT INTO class_teachers (id, class_id, user_id, sync_version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`).bind(assignment.id, row.id, teacherId, timestamp, timestamp), change(env, user, 'class_teachers', assignment.id, 'upsert', assignment)] : []),
    audit(env, user, 'CREATE', 'classes', row.id, { teacherId: teacherId ?? undefined }),
  ]);

  broadcastEvent('entity_changed', {
    entity: 'classes',
    operation: 'upsert',
    id: row.id,
    timestamp,
  }, { env });

  return { ...row, teacher_id: teacherId };
}

export async function updateClass(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'classes:update');
  const current = await getEntityRow(env, 'classes', id);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<JsonRecord>(request);
  const courseId = body.courseId === undefined ? String(current.course_id) : requireString(body.courseId, 'courseId', { max: 36 });
  const rawName = body.name === undefined ? String(current.name) : requireString(body.name, 'nome', { min: 2, max: 120 });
  let storedName = rawName;
  let classNumber = body.classNumber !== undefined
    ? (typeof body.classNumber === 'number' ? body.classNumber : parseInt(String(body.classNumber), 10))
    : (current.class_number !== null && current.class_number !== undefined ? Number(current.class_number) : null);

  if (body.name !== undefined) {
    const numMatch = rawName.match(/\b0*(\d+)\b/);
    if (numMatch && numMatch[1] && (classNumber === null || classNumber === undefined)) {
      classNumber = parseInt(numMatch[1], 10);
    }
    if (body.cleanName === true) {
      let cleaned = rawName.trim();
      if (/^(?:turma\s*)?0*\d+$/i.test(cleaned)) {
        cleaned = 'Turma';
      } else {
        const stripped = cleaned
          .replace(/^(?:turma\s*)?0*\d+\s*[-–—:]\s*/i, '')
          .replace(/\s*[-–—:]\s*(?:turma\s*)?0*\d+$/i, '')
          .replace(/\s+0*\d+$/i, '')
          .trim();
        if (stripped.length >= 2) {
          cleaned = stripped;
        } else if (stripped.length === 1) {
          cleaned = `Turma ${stripped}`;
        }
      }
      storedName = cleaned;
    }
  }

  const shift = body.shift === undefined ? String(current.shift) : oneOf(body.shift, 'turno', ['manha', 'tarde', 'noite', 'integral'] as const);
  const rawWeekDay = body.weekDay !== undefined ? body.weekDay : body.week_day;
  const weekDay = rawWeekDay === undefined ? (current.week_day as string | null) : (typeof rawWeekDay === 'string' && rawWeekDay.trim().length > 0 ? rawWeekDay.trim() : null);
  const isKids = body.isKids === undefined ? (body.is_kids !== undefined ? Number(body.is_kids) : Number(current.is_kids ?? 0)) : boolInt(body.isKids, false);
  const rawLabId = body.laboratoryId !== undefined ? body.laboratoryId : body.laboratory_id;
  const laboratoryId = rawLabId === undefined ? (current.laboratory_id as string | null) : (typeof rawLabId === 'string' && rawLabId.length > 0 ? rawLabId : null);
  const active = body.active === undefined ? Number(current.active) : boolInt(body.active);
  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE classes SET course_id = ?, name = ?, class_number = ?, shift = ?, week_day = ?, is_kids = ?, laboratory_id = ?, active = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`,
  ).bind(courseId, storedName, classNumber, shift, weekDay, isKids, laboratoryId, active, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await getEntityRow(env, 'classes', id);
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  const row = await getEntityRow(env, 'classes', id);
  await env.DB.batch([change(env, user, 'classes', id, 'upsert', row), audit(env, user, 'UPDATE', 'classes', id)]);

  broadcastEvent('entity_changed', {
    entity: 'classes',
    operation: 'upsert',
    id,
    timestamp,
  }, { env });

  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(nextVersion) },
  });
}

export async function listUsers(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  if (user.role === 'professor') throw new AppError(403, 'Acesso negado.', 'FORBIDDEN');
  const role = url.searchParams.get('role');
  const active = url.searchParams.get('active');
  const search = url.searchParams.get('q')?.trim();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (role) { where.push('role = ?'); binds.push(oneOf<Role>(role, 'perfil', ['admin', 'pedagogico', 'professor'])); }
  if (active != null) {
    if (active !== 'true' && active !== 'false') throw new AppError(400, 'Filtro active inválido.', 'VALIDATION_ERROR');
    where.push('active = ?'); binds.push(active === 'true' ? 1 : 0);
  }
  if (search) { where.push('(name LIKE ? OR email LIKE ?)'); binds.push(`%${search}%`, `%${search}%`); }
  const statement = env.DB.prepare(`SELECT id, name, email, role, active, created_at, updated_at FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name`).bind(...binds);
  return { items: (await statement.all()).results };
}

export async function getUser(env: Env, user: AuthUser, id: string): Promise<Response> {
  if (user.role !== 'admin' && user.id !== id) throw new AppError(403, 'Acesso negado.', 'FORBIDDEN');
  const row = await env.DB.prepare(
    `SELECT id, name, email, role, active, created_at, updated_at FROM users WHERE id = ?`
  ).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function createUser(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores criam usuários.', 'FORBIDDEN');
  const body = await readJson<JsonRecord>(request);
  const role = oneOf<Role>(body.role, 'perfil', ['admin', 'pedagogico', 'professor', 'financeiro']);
  const password = requireString(body.password, 'senha', { min: 6, max: 200 });
  const timestamp = nowIso();
  const row = { id: uuid(), name: requireString(body.name, 'nome', { min: 2, max: 120 }), email: normalizeEmail(body.email), role, active: 1, created_at: timestamp, updated_at: timestamp };
  const passwordHash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(row.id, row.name, row.email, passwordHash, role, timestamp, timestamp),
    audit(env, user, 'CREATE', 'users', row.id, { role }),
  ]);
  return row;
}

async function ensureProfessorMayBeDisabled(env: Env, professorId: string): Promise<void> {
  const orphaned = await env.DB.prepare(
    `SELECT c.name FROM classes c
       JOIN class_teachers own ON own.class_id = c.id AND own.user_id = ? AND own.deleted_at IS NULL
      WHERE c.active = 1 AND c.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM class_teachers other JOIN users u ON u.id = other.user_id
           WHERE other.class_id = c.id AND other.user_id <> ? AND other.deleted_at IS NULL
             AND u.role = 'professor' AND u.active = 1
        ) LIMIT 1`,
  ).bind(professorId, professorId).first<{ name: string }>();
  if (orphaned) {
    throw new AppError(409, `Reatribua a turma ${orphaned.name} antes de desativar este professor.`, 'TEACHER_REQUIRED');
  }
}

export async function updateUser(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores alteram usuários.', 'FORBIDDEN');
  const current = await env.DB.prepare(`SELECT id, name, email, role, active FROM users WHERE id = ?`).bind(id).first<JsonRecord>();
  if (!current) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');
  const body = await readJson<JsonRecord>(request);
  const name = body.name === undefined ? String(current.name) : requireString(body.name, 'nome', { min: 2, max: 120 });
  const email = body.email === undefined ? String(current.email) : normalizeEmail(body.email);
  const role = body.role === undefined ? current.role as Role : oneOf<Role>(body.role, 'perfil', ['admin', 'pedagogico', 'professor', 'financeiro']);
  const active = body.active === undefined ? Number(current.active) : boolInt(body.active);
  if (id === user.id && (!active || role !== 'admin')) throw new AppError(400, 'Você não pode remover seu próprio acesso administrativo.', 'SELF_LOCKOUT');
  if (current.role === 'admin' && (role !== 'admin' || !active)) {
    const admins = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND active = 1`).first<{ total: number }>();
    if (Number(admins?.total ?? 0) <= 1) throw new AppError(400, 'É necessário manter ao menos um administrador ativo.', 'LAST_ADMIN');
  }
  if (current.role === 'professor' && (role !== 'professor' || !active)) {
    await ensureProfessorMayBeDisabled(env, id);
  }
  const password = !body.password || typeof body.password !== 'string' || !body.password.trim() ? null : requireString(body.password, 'senha', { min: 6, max: 200 });
  const timestamp = nowIso();
  if (password) {
    const passwordHash = await hashPassword(password);
    await env.DB.prepare(`UPDATE users SET name = ?, email = ?, role = ?, active = ?, password_hash = ?, updated_at = ? WHERE id = ?`).bind(name, email, role, active, passwordHash, timestamp, id).run();
  } else {
    await env.DB.prepare(`UPDATE users SET name = ?, email = ?, role = ?, active = ?, updated_at = ? WHERE id = ?`).bind(name, email, role, active, timestamp, id).run();
  }
  await env.DB.batch([audit(env, user, 'UPDATE', 'users', id, { role, active: Boolean(active) })]);
  return { id, name, email, role, active, updated_at: timestamp };
}

export async function deleteUser(env: Env, user: AuthUser, id: string): Promise<unknown> {
  if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores podem excluir usuários.', 'FORBIDDEN');
  if (id === user.id) throw new AppError(400, 'Você não pode excluir seu próprio usuário.', 'SELF_LOCKOUT');

  const current = await env.DB.prepare(`SELECT id, name, email, role, active FROM users WHERE id = ?`).bind(id).first<{ id: string; name: string; email: string; role: Role; active: number }>();
  if (!current) throw new AppError(404, 'Usuário não encontrado.', 'NOT_FOUND');

  if (current.role === 'admin') {
    const admins = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND id <> ? AND active = 1`).bind(id).first<{ total: number }>();
    if (Number(admins?.total ?? 0) < 1) throw new AppError(400, 'É necessário manter ao menos um administrador ativo no sistema.', 'LAST_ADMIN');
  }

  // 1. STRICT REQUIREMENT: User must NOT be assigned to any class
  const assignedClass = await env.DB.prepare(
    `SELECT c.id, c.name
       FROM class_teachers ct
       JOIN classes c ON c.id = ct.class_id AND c.deleted_at IS NULL
      WHERE ct.user_id = ? AND ct.deleted_at IS NULL
      LIMIT 1`,
  ).bind(id).first<{ id: string; name: string }>();

  if (assignedClass) {
    throw new AppError(
      400,
      `Não é possível excluir o usuário "${current.name}" pois ele está vinculado à turma "${assignedClass.name}". Desvincule-o de todas as turmas antes de realizar a exclusão.`,
      'USER_ASSIGNED_TO_CLASS',
    );
  }

  // 2. SENSITIVITY CHECK: Verify if user recorded historical attendance or notes
  const hasAttendance = await env.DB.prepare(`SELECT 1 AS linked FROM attendance_records WHERE recorded_by_user_id = ? LIMIT 1`).bind(id).first();
  const hasNotes = await env.DB.prepare(`SELECT 1 AS linked FROM class_notes WHERE recorded_by_user_id = ? LIMIT 1`).bind(id).first();
  const hasReplacements = await env.DB.prepare(`SELECT 1 AS linked FROM replacements WHERE recorded_by_user_id = ? LIMIT 1`).bind(id).first();

  if (hasAttendance || hasNotes || hasReplacements) {
    throw new AppError(
      400,
      `Não é possível excluir permanentemente o usuário "${current.name}" pois existem registros históricos de chamadas ou atividades vinculadas a este login. Inative o usuário para revogar seu acesso mantendo a rastreabilidade.`,
      'USER_HAS_HISTORICAL_RECORDS',
    );
  }

  // 3. Remove tokens, logs and user record
  await env.DB.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM class_teachers WHERE user_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM sync_operations WHERE user_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM sync_changes WHERE changed_by_user_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM audit_logs WHERE user_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  await env.DB.batch([audit(env, user, 'DELETE', 'users', id, { name: current.name, email: current.email, role: current.role })]);

  broadcastEvent('session_revoked', {
    userId: id,
    reason: 'USER_DELETED',
    timestamp: nowIso(),
  }, { targetUserId: id, env });

  return { ok: true, deleted: id };
}


export async function listClassTeachers(env: Env, user: AuthUser, classId: string): Promise<unknown> {
  requireScope(user, 'classes:read');
  if (user.role === 'professor') throw new AppError(403, 'Acesso negado.', 'FORBIDDEN');
  const rows = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, ct.id AS assignment_id
       FROM class_teachers ct JOIN users u ON u.id = ct.user_id
      WHERE ct.class_id = ? AND ct.deleted_at IS NULL AND u.active = 1 ORDER BY u.name`,
  ).bind(classId).all();
  return { items: rows.results };
}

export async function assignTeacher(request: Request, env: Env, user: AuthUser, classId: string): Promise<unknown> {
  requirePermission(user, 'teachers:assign');
  const body = await readJson<JsonRecord>(request);
  const userId = requireString(body.userId, 'userId', { max: 36 });
  const professor = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND role = 'professor' AND active = 1`).bind(userId).first();
  if (!professor) throw new AppError(400, 'Professor inválido.', 'VALIDATION_ERROR');
  await requireClassAccess(env, { ...user, role: 'admin' }, classId);
  const timestamp = nowIso();
  const existing = await env.DB.prepare(`SELECT id FROM class_teachers WHERE class_id = ? AND user_id = ?`).bind(classId, userId).first<{ id: string }>();
  const id = existing?.id ?? uuid();
  await env.DB.prepare(
    `INSERT INTO class_teachers (id, class_id, user_id, sync_version, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(class_id, user_id) DO UPDATE SET deleted_at = NULL, sync_version = sync_version + 1, updated_at = excluded.updated_at`,
  ).bind(id, classId, userId, timestamp, timestamp).run();
  const row = await getEntityRow(env, 'class_teachers', id);
  await env.DB.batch([change(env, user, 'class_teachers', id, 'upsert', row), audit(env, user, 'ASSIGN', 'class_teachers', id)]);
  return row;
}

export async function removeTeacher(env: Env, user: AuthUser, classId: string, teacherId: string): Promise<unknown> {
  requirePermission(user, 'teachers:assign');
  const timestamp = nowIso();
  const row = await env.DB.prepare(`SELECT id FROM class_teachers WHERE class_id = ? AND user_id = ? AND deleted_at IS NULL`).bind(classId, teacherId).first<{ id: string }>();
  if (!row) throw new AppError(404, 'Vínculo não encontrado.', 'NOT_FOUND');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM class_teachers ct JOIN users u ON u.id = ct.user_id WHERE ct.class_id = ? AND ct.user_id <> ? AND ct.deleted_at IS NULL AND u.role = 'professor' AND u.active = 1`).bind(classId, teacherId).first<{ total: number }>();
  if (Number(count?.total ?? 0) < 1) throw new AppError(400, 'A turma deve manter ao menos um professor ativo.', 'TEACHER_REQUIRED');
  await env.DB.prepare(`UPDATE class_teachers SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?`).bind(timestamp, timestamp, row.id).run();
  await env.DB.batch([
    change(env, user, 'class_teachers', row.id, 'delete', { id: row.id, class_id: classId, user_id: teacherId, deleted_at: timestamp }),
    audit(env, user, 'REMOVE', 'class_teachers', row.id),
  ]);
  return { ok: true };
}

interface StudentRow extends JsonRecord {
  id: string; encrypted_name: string; encrypted_cpf: string | null; encrypted_contact: string | null;
}

async function clearStudent(env: Env, row: StudentRow, user?: AuthUser): Promise<JsonRecord> {
  const { encrypted_name, encrypted_cpf, encrypted_contact, ...safe } = row;
  let name = `Aluno ${row.registration_number || row.id.slice(0, 8)}`;
  let cpf: string | null = null;
  let contact: string | null = null;
  const hasPii = user ? canAccessStudentPii(user) : true;
  try {
    name = await decryptText(env, encrypted_name);
    cpf = hasPii && encrypted_cpf ? await decryptText(env, encrypted_cpf) : null;
    contact = hasPii && encrypted_contact ? await decryptText(env, encrypted_contact) : null;
  } catch {
    // fallback gracefully
  }
  return {
    ...safe,
    name,
    cpf,
    contact,
  };
}

export async function listStudents(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  requireScope(user, 'students:read');
  const classId = url.searchParams.get('classId');
  if (classId) await requireClassAccess(env, user, classId);
  const rows = classId
    ? await env.DB.prepare(
      `SELECT s.*, e.status AS enrollment_status, e.id AS enrollment_id, e.class_id
         FROM students s JOIN enrollments e ON e.student_id = s.id
        WHERE e.class_id = ? AND e.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY s.registration_number`,
    ).bind(classId).all<StudentRow>()
    : user.role === 'professor'
    ? await env.DB.prepare(
      `SELECT DISTINCT s.id, s.encrypted_name, s.encrypted_cpf, s.encrypted_contact, s.registration_number, s.birth_date, s.active, s.sync_version, s.created_at, s.updated_at, e.status AS enrollment_status, e.id AS enrollment_id, e.class_id
         FROM students s JOIN enrollments e ON e.student_id = s.id
         JOIN class_teachers ct ON ct.class_id = e.class_id
        WHERE ct.user_id = ? AND ct.deleted_at IS NULL AND e.deleted_at IS NULL AND s.deleted_at IS NULL
        ORDER BY s.registration_number`,
    ).bind(user.id).all<StudentRow>()
    : await env.DB.prepare(`SELECT * FROM students WHERE deleted_at IS NULL ORDER BY registration_number`).all<StudentRow>();
  return { items: await Promise.all(rows.results.map((row) => clearStudent(env, row, user))) };
}

export async function getStudent(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'students:read');
  const row = await env.DB.prepare(`SELECT * FROM students WHERE id = ? AND deleted_at IS NULL`).bind(id).first<StudentRow>();
  if (!row) throw new AppError(404, 'Aluno não encontrado.', 'NOT_FOUND');
  if (user.role === 'professor') {
    const allowed = await env.DB.prepare(
      `SELECT 1 FROM enrollments e JOIN class_teachers ct ON ct.class_id = e.class_id
        WHERE e.student_id = ? AND ct.user_id = ? AND e.deleted_at IS NULL AND ct.deleted_at IS NULL LIMIT 1`
    ).bind(id, user.id).first();
    if (!allowed) throw new AppError(403, 'Acesso negado a este aluno.', 'FORBIDDEN');
  }
  const cleared = await clearStudent(env, row, user);
  const version = Number(row.sync_version ?? 1);
  return new Response(JSON.stringify(cleared), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(version),
    },
  });
}

export async function createStudent(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'students:write');
  const body = await readJson<JsonRecord>(request);
  const classId = requireString(body.classId, 'turma', { max: 36 });
  await requireClassAccess(env, user, classId);
  const timestamp = nowIso();
  const clear = {
    id: uuid(), name: requireString(body.name, 'nome', { min: 2, max: 160 }),
    cpf: body.cpf == null ? null : requireString(body.cpf, 'cpf', { min: 11, max: 20 }),
    contact: body.contact == null ? null : requireString(body.contact, 'contato', { max: 200 }),
    registration_number: requireString(body.registrationNumber, 'matrícula', { min: 2, max: 40 }),
    birth_date: body.birthDate == null ? null : parseBirthDate(body.birthDate),
    active: boolInt(body.active), sync_version: 1, created_at: timestamp, updated_at: timestamp,
  };
  const encrypted = {
    ...clear,
    encrypted_name: await encryptText(env, clear.name),
    encrypted_cpf: clear.cpf ? await encryptText(env, clear.cpf) : null,
    encrypted_contact: clear.contact ? await encryptText(env, clear.contact) : null,
  };
  const enrollment = { id: uuid(), class_id: classId, student_id: clear.id, status: 'ativa', sync_version: 1, created_at: timestamp, updated_at: timestamp };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO students (id, encrypted_name, encrypted_cpf, encrypted_contact, registration_number, birth_date, active, sync_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(clear.id, encrypted.encrypted_name, encrypted.encrypted_cpf, encrypted.encrypted_contact, clear.registration_number, clear.birth_date, clear.active, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO enrollments (id, class_id, student_id, status, sync_version, created_at, updated_at) VALUES (?, ?, ?, 'ativa', 1, ?, ?)`).bind(enrollment.id, classId, clear.id, timestamp, timestamp),
    change(env, user, 'students', clear.id, 'upsert', encrypted),
    change(env, user, 'enrollments', enrollment.id, 'upsert', enrollment),
    audit(env, user, 'CREATE', 'students', clear.id, { classId }),
  ]);
  broadcastEvent('entity_changed', { entity: 'students', operation: 'upsert', id: clear.id, timestamp }, { env });
  const hasPii = canAccessStudentPii(user);
  if (!hasPii) {
    clear.cpf = null;
    clear.contact = null;
  }
  return clear;
}

export async function updateStudent(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'students:write');
  const current = await getEntityRow(env, 'students', id) as StudentRow;
  const currentVersion = Number(current.sync_version ?? 1);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(currentVersion, ifMatch);

  const body = await readJson<JsonRecord>(request);
  const encryptedName = body.name === undefined ? current.encrypted_name : await encryptText(env, requireString(body.name, 'nome', { min: 2, max: 160 }));
  const encryptedCpf = body.cpf === undefined ? current.encrypted_cpf : body.cpf == null ? null : await encryptText(env, requireString(body.cpf, 'cpf', { min: 11, max: 20 }));
  const encryptedContact = body.contact === undefined ? current.encrypted_contact : body.contact == null ? null : await encryptText(env, requireString(body.contact, 'contato', { max: 200 }));
  const registration = body.registrationNumber === undefined ? String(current.registration_number) : requireString(body.registrationNumber, 'matrícula', { min: 2, max: 40 });
  const birthDate = body.birthDate === undefined ? current.birth_date : body.birthDate == null ? null : parseBirthDate(body.birthDate);
  const active = body.active === undefined ? Number(current.active) : boolInt(body.active);
  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE students SET encrypted_name = ?, encrypted_cpf = ?, encrypted_contact = ?, registration_number = ?, birth_date = ?, active = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`,
  ).bind(encryptedName, encryptedCpf, encryptedContact, registration, birthDate, active, nextVersion, timestamp, id, currentVersion).run();
  if (result.meta.changes === 0) {
    const latest = await getEntityRow(env, 'students', id).catch(() => null) as StudentRow | null;
    throw new AppError(409, 'Versão concorrente detectada ao atualizar aluno.', 'CONCURRENCY_CONFLICT', {
      serverVersion: latest ? Number(latest.sync_version ?? 1) : currentVersion,
    });
  }
  const row = await getEntityRow(env, 'students', id) as StudentRow;
  await env.DB.batch([change(env, user, 'students', id, 'upsert', row), audit(env, user, 'UPDATE', 'students', id)]);
  broadcastEvent('entity_changed', { entity: 'students', operation: 'upsert', id, timestamp }, { env });
  const cleared = await clearStudent(env, row, user);

  return new Response(JSON.stringify(cleared), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function inactivateStudent(env: Env, user: AuthUser, id: string, request?: Request): Promise<unknown> {
  requirePermission(user, 'students:delete');
  const current = await getEntityRow(env, 'students', id) as StudentRow;
  const currentVersion = Number(current.sync_version ?? 1);
  if (request) {
    const ifMatch = parseIfMatchHeader(request);
    assertConcurrencyVersion(currentVersion, ifMatch);
  }
  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;
  const result = await env.DB.prepare(`UPDATE students SET active = 0, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`).bind(nextVersion, timestamp, id, currentVersion).run();
  if (result.meta.changes === 0) {
    const latest = await getEntityRow(env, 'students', id).catch(() => null) as StudentRow | null;
    throw new AppError(409, 'Versão concorrente detectada ao inativar aluno.', 'CONCURRENCY_CONFLICT', {
      serverVersion: latest ? Number(latest.sync_version ?? 1) : currentVersion,
    });
  }
  const row = await getEntityRow(env, 'students', id);
  await env.DB.batch([change(env, user, 'students', id, 'upsert', row), audit(env, user, 'INACTIVATE', 'students', id)]);
  broadcastEvent('entity_changed', { entity: 'students', operation: 'upsert', id, timestamp }, { env });
  return { ok: true };
}

export async function enrollStudent(request: Request, env: Env, user: AuthUser, classId: string): Promise<unknown> {
  requirePermission(user, 'students:write');
  const body = await readJson<JsonRecord>(request);
  const studentId = requireString(body.studentId, 'studentId', { max: 36 });
  const status = oneOf(body.status ?? 'ativa', 'status', ['ativa', 'trancada', 'concluida'] as const);
  const timestamp = nowIso();
  if (status === 'ativa') {
    await env.DB.prepare(
      `UPDATE enrollments SET status = 'concluida', sync_version = sync_version + 1, updated_at = ?
        WHERE student_id = ? AND class_id <> ? AND status = 'ativa' AND deleted_at IS NULL`,
    ).bind(timestamp, studentId, classId).run();
  }
  const existing = await env.DB.prepare(`SELECT id FROM enrollments WHERE class_id = ? AND student_id = ?`).bind(classId, studentId).first<{ id: string }>();
  const id = existing?.id ?? uuid();
  await env.DB.prepare(
    `INSERT INTO enrollments (id, class_id, student_id, status, sync_version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(class_id, student_id) DO UPDATE SET status = excluded.status, deleted_at = NULL, sync_version = sync_version + 1, updated_at = excluded.updated_at`,
  ).bind(id, classId, studentId, status, timestamp, timestamp).run();
  const row = await getEntityRow(env, 'enrollments', id);
  await env.DB.batch([change(env, user, 'enrollments', id, 'upsert', row), audit(env, user, 'ENROLL', 'enrollments', id)]);
  return row;
}

export async function listEnrollments(env: Env, user: AuthUser, url: URL): Promise<{ items: unknown[] }> {
  requireScope(user, 'students:read', 'classes:read');
  const classId = url.searchParams.get('classId');
  const studentId = url.searchParams.get('studentId');
  const status = url.searchParams.get('status');

  if (classId) await requireClassAccess(env, user, classId);

  let sql = `SELECT * FROM enrollments WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (classId) { sql += ` AND class_id = ?`; binds.push(classId); }
  if (studentId) { sql += ` AND student_id = ?`; binds.push(studentId); }
  if (status) { sql += ` AND status = ?`; binds.push(status); }
  sql += ` ORDER BY created_at DESC`;

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { items: rows.results };
}

export async function getEnrollment(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'students:read', 'classes:read');
  const row = await env.DB.prepare(`SELECT * FROM enrollments WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Matrícula não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(row.class_id));
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(Number(row.sync_version ?? 1)) },
  });
}

export async function updateEnrollment(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'students:write');
  const current = await env.DB.prepare(`SELECT * FROM enrollments WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Matrícula não encontrada.', 'NOT_FOUND');

  const currentVersion = Number(current.sync_version ?? 1);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(currentVersion, ifMatch);

  const body = await readJson<Record<string, unknown>>(request);
  const status = ['ativa', 'trancada', 'concluida'].includes(String(body.status))
    ? String(body.status)
    : String(current.status);

  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`UPDATE enrollments SET status = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`).bind(status, nextVersion, timestamp, id, currentVersion).run();
  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM enrollments WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    throw new AppError(409, 'Versão concorrente detectada ao atualizar matrícula.', 'CONCURRENCY_CONFLICT', {
      serverVersion: latest ? Number(latest.sync_version ?? 1) : currentVersion,
    });
  }

  await env.DB.batch([
    audit(env, user, 'UPDATE', 'enrollments', id, { status }),
  ]);

  const updated = await env.DB.prepare(`SELECT * FROM enrollments WHERE id = ?`).bind(id).first();
  broadcastEvent('entity_changed', { entity: 'enrollments', operation: 'upsert', id, timestamp }, { env });
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { 'content-type': 'application/json', 'etag': formatETag(nextVersion) },
  });
}

export async function deleteEnrollment(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'students:write');
  const current = await env.DB.prepare(`SELECT * FROM enrollments WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Matrícula não encontrada.', 'NOT_FOUND');

  const currentVersion = Number(current.sync_version ?? 1);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(currentVersion, ifMatch);

  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;
  const result = await env.DB.prepare(`UPDATE enrollments SET status = 'concluida', deleted_at = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`).bind(timestamp, nextVersion, timestamp, id, currentVersion).run();
  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM enrollments WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    throw new AppError(409, 'Versão concorrente detectada ao remover matrícula.', 'CONCURRENCY_CONFLICT', {
      serverVersion: latest ? Number(latest.sync_version ?? 1) : currentVersion,
    });
  }

  await env.DB.batch([
    audit(env, user, 'DELETE', 'enrollments', id),
  ]);

  broadcastEvent('entity_changed', { entity: 'enrollments', operation: 'delete', id, timestamp }, { env });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}


export async function listAttendance(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  requireScope(user, 'attendance:read');
  if (user.role === 'financeiro') {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }
  const rawClassId = url.searchParams.get('classId');
  const classId = rawClassId ? requireString(rawClassId, 'classId', { max: 36 }) : undefined;
  if (classId) {
    await requireClassAccess(env, user, classId);
  }
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  let sql = `SELECT a.*, s.encrypted_name, s.registration_number FROM attendance_records a JOIN students s ON s.id = a.student_id WHERE a.deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (classId) {
    sql += ` AND a.class_id = ?`;
    binds.push(classId);
  } else if (user.role === 'professor') {
    sql += ` AND a.class_id IN (SELECT class_id FROM class_teachers WHERE user_id = ? AND deleted_at IS NULL)`;
    binds.push(user.id);
  }
  if (date) { sql += ` AND a.date = ?`; binds.push(parseDate(date)); }
  if (from) { sql += ` AND a.date >= ?`; binds.push(parseDate(from, 'data inicial')); }
  if (to) { sql += ` AND a.date <= ?`; binds.push(parseDate(to, 'data final')); }
  sql += ` ORDER BY a.date DESC, s.registration_number`;
  const result = await env.DB.prepare(sql).bind(...binds).all<StudentRow & JsonRecord>();
  const items = await Promise.all(result.results.map(async (row) => {
    const { encrypted_name, ...item } = row;
    let student_name = `Aluno ${item.registration_number || item.student_id || ''}`;
    try {
      student_name = await decryptText(env, encrypted_name);
    } catch {
      // fallback
    }
    return { ...item, student_name };
  }));
  const generalNote = classId && date ? await env.DB.prepare(`SELECT notes FROM class_notes WHERE class_id = ? AND date = ? AND deleted_at IS NULL`).bind(classId, parseDate(date)).first<{ notes: string | null }>() : null;
  return { items, generalNotes: generalNote?.notes ?? null };
}

export async function saveAttendance(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'attendance:write');
  const body = await readJson<JsonRecord>(request);
  const classId = requireString(body.classId, 'classId', { max: 36 });
  const date = parseDate(body.date);
  await requireClassAccess(env, user, classId);
  const timeZone = env.INSTITUTION_TIMEZONE ?? 'America/Sao_Paulo';
  if (user.role === 'professor' && !teacherCanEditDate(date, new Date(), timeZone)) {
    throw new AppError(403, 'A chamada está fora da janela de edição de sete dias.', 'EDIT_WINDOW_CLOSED');
  }
  if (user.role === 'professor') {
    const existingCall = await env.DB.prepare(
      `SELECT 1 AS existing_call FROM attendance_records WHERE class_id = ? AND date = ? AND deleted_at IS NULL LIMIT 1`,
    ).bind(classId, date).first();
    if (!existingCall && date !== dateInTimeZone(new Date(), timeZone)) {
      throw new AppError(403, 'Uma nova chamada só pode ser aberta no dia da aula.', 'NEW_ATTENDANCE_DATE_CLOSED');
    }
  }
  if (user.role === 'pedagogico' && !teacherCanEditDate(date, new Date(), timeZone)) {
    requireString(body.justification, 'justificativa', { min: 10, max: 500 });
  }
  if (!Array.isArray(body.records) || body.records.length === 0 || body.records.length > 500) {
    throw new AppError(400, 'records deve conter de 1 a 500 lançamentos.', 'VALIDATION_ERROR');
  }
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [];
  const saved: JsonRecord[] = [];
  for (const raw of body.records) {
    if (!raw || typeof raw !== 'object') throw new AppError(400, 'Lançamento inválido.', 'VALIDATION_ERROR');
    const record = raw as JsonRecord;
    const studentId = requireString(record.studentId, 'studentId', { max: 36 });
    const status = oneOf<AttendanceStatus>(record.status, 'status', ['P', 'F', 'J', 'A', 'R', 'RC']);
    const notes = record.notes == null ? null : requireString(record.notes, 'observações', { max: 1000 });
    const enrolled = await env.DB.prepare(
      `SELECT 1 AS enrolled FROM enrollments WHERE class_id = ? AND student_id = ? AND status = 'ativa' AND deleted_at IS NULL`,
    ).bind(classId, studentId).first();
    if (!enrolled) throw new AppError(400, 'Aluno sem matrícula ativa na turma.', 'INVALID_ENROLLMENT', { studentId });
    const existing = await env.DB.prepare(
      `SELECT id, sync_version FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?`,
    ).bind(classId, studentId, date).first<{ id: string; sync_version: number }>();
    const id = existing?.id ?? uuid();
    const version = (existing?.sync_version ?? 0) + 1;
    statements.push(env.DB.prepare(
      `INSERT INTO attendance_records (id, class_id, student_id, date, status, notes, recorded_by_user_id, sync_status, sync_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', 1, ?, ?)
       ON CONFLICT(class_id, student_id, date) DO UPDATE SET status = excluded.status, notes = excluded.notes,
         recorded_by_user_id = excluded.recorded_by_user_id, sync_status = 'SYNCED', sync_version = attendance_records.sync_version + 1,
         deleted_at = NULL, updated_at = excluded.updated_at`,
    ).bind(id, classId, studentId, date, status, notes, user.id, timestamp, timestamp));
    const payload = { id, class_id: classId, student_id: studentId, date, status, notes, recorded_by_user_id: user.id, sync_status: 'SYNCED', sync_version: version, created_at: timestamp, updated_at: timestamp };
    statements.push(change(env, user, 'attendance_records', id, 'upsert', payload));
    saved.push(payload);
  }
  const generalNotes = body.generalNotes == null ? null : requireString(body.generalNotes, 'observação geral', { max: 2000 });
  const currentNote = await env.DB.prepare(`SELECT id, sync_version, created_at FROM class_notes WHERE class_id = ? AND date = ?`).bind(classId, date).first<{ id: string; sync_version: number; created_at: string }>();
  const noteId = currentNote?.id ?? uuid();
  const noteVersion = (currentNote?.sync_version ?? 0) + 1;
  const notePayload = { id: noteId, class_id: classId, date, notes: generalNotes, recorded_by_user_id: user.id, sync_version: noteVersion, created_at: currentNote?.created_at ?? timestamp, updated_at: timestamp };
  statements.push(env.DB.prepare(`INSERT INTO class_notes (id, class_id, date, notes, recorded_by_user_id, sync_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(class_id, date) DO UPDATE SET notes = excluded.notes, recorded_by_user_id = excluded.recorded_by_user_id, sync_version = class_notes.sync_version + 1, deleted_at = NULL, updated_at = excluded.updated_at`).bind(noteId, classId, date, generalNotes, user.id, currentNote?.created_at ?? timestamp, timestamp));
  statements.push(change(env, user, 'class_notes', noteId, 'upsert', notePayload));
  statements.push(
    env.DB.prepare(`
      INSERT INTO class_sessions (id, class_id, date, recorded_by_user_id, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(class_id, date) DO UPDATE SET
        deleted_at = NULL,
        summary = COALESCE(excluded.summary, class_sessions.summary),
        updated_at = excluded.updated_at
    `).bind(uuid(), classId, date, user.id, generalNotes, timestamp, timestamp)
  );
  statements.push(audit(env, user, 'ATTENDANCE_BATCH', 'attendance_records', classId, { date, count: saved.length, generalNotes, justification: body.justification ?? null }));
  await env.DB.batch(statements);
  broadcastEvent('entity_changed', { entity: 'attendance_records', operation: 'upsert', classId, date, timestamp }, { env });
  return { items: saved };
}

export async function dashboard(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  if (user.role === 'financeiro') {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }
  const from = parseDate(url.searchParams.get('from') ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), 'data inicial');
  const to = parseDate(url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10), 'data final');
  if (from > to) throw new AppError(400, 'O período informado é inválido.', 'VALIDATION_ERROR');
  const classJoin = user.role === 'professor'
    ? `JOIN class_teachers ct ON ct.class_id = c.id AND ct.user_id = ? AND ct.deleted_at IS NULL`
    : '';
  const statement = env.DB.prepare(
    `SELECT c.id, c.name, co.name AS course_name,
            COUNT(a.id) AS records,
            ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1) AS attendance_rate,
            SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status = 'F' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status = 'J' THEN 1 ELSE 0 END) AS justified,
            SUM(CASE WHEN a.status = 'A' THEN 1 ELSE 0 END) AS delayed
       FROM classes c JOIN courses co ON co.id = c.course_id ${classJoin}
       LEFT JOIN attendance_records a ON a.class_id = c.id AND a.deleted_at IS NULL AND a.date BETWEEN ? AND ?
      WHERE c.deleted_at IS NULL GROUP BY c.id, c.name, co.name ORDER BY c.name`,
  );
  const classes = user.role === 'professor' ? await statement.bind(user.id, from, to).all<JsonRecord>() : await statement.bind(from, to).all<JsonRecord>();
  const totals = classes.results.reduce<{ records: number; present: number; absent: number; justified: number; delayed: number }>((acc, row) => {
    acc.records += Number(row.records ?? 0); acc.present += Number(row.present ?? 0);
    acc.absent += Number(row.absent ?? 0); acc.justified += Number(row.justified ?? 0); acc.delayed += Number(row.delayed ?? 0); return acc;
  }, { records: 0, present: 0, absent: 0, justified: 0, delayed: 0 });
  const dailySql = user.role === 'professor'
    ? `SELECT a.date, ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / COUNT(*), 1) AS rate FROM attendance_records a JOIN class_teachers ct ON ct.class_id = a.class_id AND ct.user_id = ? AND ct.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? GROUP BY a.date ORDER BY a.date`
    : `SELECT a.date, ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / COUNT(*), 1) AS rate FROM attendance_records a WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? GROUP BY a.date ORDER BY a.date`;
  const dailyStatement = env.DB.prepare(dailySql);
  const daily = user.role === 'professor' ? await dailyStatement.bind(user.id, from, to).all() : await dailyStatement.bind(from, to).all();
  const absenteeSql = user.role === 'professor'
    ? `SELECT s.encrypted_name, s.registration_number, SUM(CASE WHEN a.status = 'F' THEN 1 ELSE 0 END) AS absences, ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / COUNT(*), 1) AS attendance_rate FROM attendance_records a JOIN students s ON s.id = a.student_id JOIN class_teachers ct ON ct.class_id = a.class_id AND ct.user_id = ? AND ct.deleted_at IS NULL WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? GROUP BY s.id, s.encrypted_name, s.registration_number HAVING absences > 0 ORDER BY absences DESC, attendance_rate ASC LIMIT 5`
    : `SELECT s.encrypted_name, s.registration_number, SUM(CASE WHEN a.status = 'F' THEN 1 ELSE 0 END) AS absences, ROUND(100.0 * SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) / COUNT(*), 1) AS attendance_rate FROM attendance_records a JOIN students s ON s.id = a.student_id WHERE a.deleted_at IS NULL AND a.date BETWEEN ? AND ? GROUP BY s.id, s.encrypted_name, s.registration_number HAVING absences > 0 ORDER BY absences DESC, attendance_rate ASC LIMIT 5`;
  const absenteeStatement = env.DB.prepare(absenteeSql);
  const absenteeRows = user.role === 'professor' ? await absenteeStatement.bind(user.id, from, to).all<{ encrypted_name: string; registration_number: string; absences: number; attendance_rate: number }>() : await absenteeStatement.bind(from, to).all<{ encrypted_name: string; registration_number: string; absences: number; attendance_rate: number }>();
  const topAbsentees = await Promise.all(absenteeRows.results.map(async (row) => {
    let name = `Aluno ${row.registration_number || ''}`;
    try {
      name = await decryptText(env, row.encrypted_name);
    } catch {
      // fallback
    }
    return {
      name,
      registrationNumber: row.registration_number,
      absences: Number(row.absences),
      attendanceRate: Number(row.attendance_rate),
    };
  }));
  const teacherSql = `SELECT u.id, u.name, COUNT(DISTINCT ct.class_id) AS classes, COUNT(DISTINCT e.student_id) AS students
     FROM users u JOIN class_teachers ct ON ct.user_id = u.id AND ct.deleted_at IS NULL
     JOIN classes c ON c.id = ct.class_id AND c.deleted_at IS NULL
     LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ativa' AND e.deleted_at IS NULL
    WHERE u.role = 'professor' AND u.active = 1 ${user.role === 'professor' ? 'AND u.id = ?' : ''}
      AND EXISTS (SELECT 1 FROM attendance_records ap WHERE ap.class_id = c.id AND ap.deleted_at IS NULL AND ap.date BETWEEN ? AND ?)
    GROUP BY u.id, u.name ORDER BY classes DESC, u.name`;
  const teacherStatement = env.DB.prepare(teacherSql);
  const teacherWorkload = user.role === 'professor' ? await teacherStatement.bind(user.id, from, to).all() : await teacherStatement.bind(from, to).all();
  return {
    globalAttendanceRate: totals.records ? Math.round((totals.present / totals.records) * 1000) / 10 : 0,
    distribution: totals,
    classes: classes.results,
    evolution: daily.results,
    topAbsentees,
    teacherWorkload: teacherWorkload.results,
    period: { from, to },
  };
}

export async function listConflicts(env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'conflicts:resolve');
  const rows = await env.DB.prepare(
    `SELECT sc.*, u.name AS resolved_by_name FROM sync_conflicts sc LEFT JOIN users u ON u.id = sc.resolved_by_user_id ORDER BY CASE sc.status WHEN 'PENDING' THEN 0 ELSE 1 END, sc.created_at DESC LIMIT 500`,
  ).all<JsonRecord>();
  return { items: await Promise.all(rows.results.map(async (row) => ({
    ...row,
    local_data: await clientEntityRow(env, String(row.entity_name), JSON.parse(String(row.local_data_json)) as JsonRecord),
    remote_data: await clientEntityRow(env, String(row.entity_name), JSON.parse(String(row.remote_data_json)) as JsonRecord),
  }))) };
}

export async function resolveConflict(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'conflicts:resolve');
  const body = await readJson<JsonRecord>(request);
  const decision = oneOf(body.decision, 'decisão', ['local', 'remote'] as const);
  const justification = requireString(body.justification, 'justificativa', { min: 10, max: 500 });
  const conflict = await env.DB.prepare(`SELECT * FROM sync_conflicts WHERE id = ? AND status = 'PENDING'`).bind(id).first<JsonRecord>();
  if (!conflict) throw new AppError(404, 'Conflito pendente não encontrado.', 'NOT_FOUND');
  const entity = requireString(conflict.entity_name, 'entidade');
  const recordId = requireString(conflict.entity_id, 'entityId');
  const current = await getEntityRow(env, entity, recordId);
  const statements: D1PreparedStatement[] = [];
  let accepted = current;
  if (decision === 'local') {
    if (entity !== 'attendance_records') throw new AppError(409, 'Tipo de conflito ainda não resolvível.', 'UNSUPPORTED_CONFLICT');
    const local = JSON.parse(String(conflict.local_data_json)) as JsonRecord;
    const status = oneOf(local.status, 'status', ['P', 'F', 'J', 'A', 'R', 'RC'] as const);
    const timestamp = nowIso();
    const version = Number(current.sync_version ?? 0) + 1;
    const completedAt = status === 'RC' ? local.completed_at ?? current.completed_at ?? timestamp : null;
    accepted = {
      ...current,
      status,
      notes: local.notes ?? null,
      completed_at: completedAt,
      recorded_by_user_id: user.id,
      sync_status: 'SYNCED',
      sync_version: version,
      updated_at: timestamp,
    };
    statements.push(env.DB.prepare(
      `UPDATE attendance_records SET status = ?, notes = ?, completed_at = ?, recorded_by_user_id = ?, sync_status = 'SYNCED', sync_version = ?, updated_at = ? WHERE id = ?`,
    ).bind(status, accepted.notes, completedAt, user.id, version, timestamp, recordId));
    statements.push(change(env, user, 'attendance_records', recordId, 'upsert', accepted));
  }
  statements.push(env.DB.prepare(
    `UPDATE sync_conflicts SET status = ?, resolved_by_user_id = ?, resolution_justification = ?, resolved_at = ? WHERE id = ? AND status = 'PENDING'`,
  ).bind(decision === 'local' ? 'LOCAL_ACCEPTED' : 'REMOTE_ACCEPTED', user.id, justification, nowIso(), id));
  statements.push(audit(env, user, 'RESOLVE_CONFLICT', 'sync_conflicts', id, { decision, justification }));
  await env.DB.batch(statements);
  const record = await clientEntityRow(env, entity, accepted);
  return { ok: true, decision, entity, record, version: Number(record.sync_version ?? 0) };
}

export async function listAudit(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  requirePermission(user, 'audit:read');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 500);
  const rows = await env.DB.prepare(
    `SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT ?`,
  ).bind(limit).all();
  return { items: rows.results };
}

export async function handleDataRoute(request: Request, env: Env, user: AuthUser, url: URL): Promise<unknown | undefined> {
  const method = request.method;
  const path = url.pathname;

  if (path === '/laboratories' && method === 'GET') return listLaboratories(env, user);
  if (path === '/laboratories' && method === 'POST') return createLaboratory(request, env, user);
  const laboratory = path.match(/^\/laboratories\/([^/]+)$/);
  if (laboratory && method === 'PATCH') return updateLaboratory(request, env, user, laboratory[1]!);
  if (laboratory && method === 'DELETE') return deleteEntity(env, user, 'laboratories', laboratory[1]!);

  if (path === '/courses' && method === 'GET') return listCourses(env, user);
  if (path === '/courses' && method === 'POST') return createCourse(request, env, user);
  const course = path.match(/^\/courses\/([^/]+)$/);
  if (course && method === 'PATCH') return updateCourse(request, env, user, course[1]!);
  if (course && method === 'DELETE') return deleteEntity(env, user, 'courses', course[1]!);

  if (path === '/classes' && method === 'GET') return listClasses(env, user);
  if (path === '/classes' && method === 'POST') return createClass(request, env, user);
  const classRoute = path.match(/^\/classes\/([^/]+)$/);
  if (classRoute && method === 'PATCH') return updateClass(request, env, user, classRoute[1]!);
  if (classRoute && method === 'DELETE') return deleteEntity(env, user, 'classes', classRoute[1]!);
  const teachers = path.match(/^\/classes\/([^/]+)\/teachers(?:\/([^/]+))?$/);
  if (teachers && method === 'GET' && !teachers[2]) return listClassTeachers(env, user, teachers[1]!);
  if (teachers && method === 'POST' && !teachers[2]) return assignTeacher(request, env, user, teachers[1]!);
  if (teachers && method === 'DELETE' && teachers[2]) return removeTeacher(env, user, teachers[1]!, teachers[2]!);
  const enrollment = path.match(/^\/classes\/([^/]+)\/enrollments$/);
  if (enrollment && method === 'POST') return enrollStudent(request, env, user, enrollment[1]!);

  if (path === '/users' && method === 'GET') return listUsers(url, env, user);
  if (path === '/users' && method === 'POST') return createUser(request, env, user);
  const userRoute = path.match(/^\/users\/([^/]+)$/);
  if (userRoute && method === 'PATCH') return updateUser(request, env, user, userRoute[1]!);
  if (userRoute && method === 'DELETE') return deleteUser(env, user, userRoute[1]!);
  if (path === '/students' && method === 'GET') return listStudents(url, env, user);
  if (path === '/students' && method === 'POST') return createStudent(request, env, user);
  const student = path.match(/^\/students\/([^/]+)$/);
  if (student && method === 'PATCH') return updateStudent(request, env, user, student[1]!);
  if (student && method === 'DELETE') return inactivateStudent(env, user, student[1]!);

  if (path === '/attendance' && method === 'GET') return listAttendance(url, env, user);
  if (path === '/attendance/batch' && method === 'PUT') return saveAttendance(request, env, user);
  if (path === '/dashboard' && method === 'GET') return dashboard(url, env, user);
  if (path === '/conflicts' && method === 'GET') return listConflicts(env, user);
  const conflict = path.match(/^\/conflicts\/([^/]+)\/resolve$/);
  if (conflict && method === 'POST') return resolveConflict(request, env, user, conflict[1]!);
  if (path === '/audit-logs' && method === 'GET') return listAudit(url, env, user);
  return undefined;
}

const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export async function getPublicStudentData(env: Env, rawIdentifier: string): Promise<unknown> {
  const identifier = rawIdentifier.trim();
  if (!identifier || identifier.length > 80) {
    throw new AppError(400, 'Identificador de aluno inválido.', 'VALIDATION_ERROR');
  }
  const student = await env.DB.prepare(
    `SELECT id, encrypted_name, registration_number, active, created_at
       FROM students
      WHERE (registration_number = ? COLLATE NOCASE OR id = ?) AND deleted_at IS NULL
      LIMIT 1`,
  ).bind(identifier, identifier).first<{ id: string; encrypted_name: string; registration_number: string; active: number; created_at: string }>();

  if (!student) {
    throw new AppError(404, 'Aluno não encontrado ou matrícula inválida.', 'NOT_FOUND');
  }

  let studentName = `Aluno ${student.registration_number || ''}`;
  try {
    studentName = await decryptText(env, student.encrypted_name);
  } catch {
    // fallback gracefully
  }

  const enrollmentsQuery = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, e.status AS enrollment_status,
            c.id AS class_id, c.name AS class_name, c.shift, c.week_day,
            co.id AS course_id, co.name AS course_name, co.code AS course_code
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id AND c.deleted_at IS NULL
       JOIN courses co ON co.id = c.course_id AND co.deleted_at IS NULL
      WHERE e.student_id = ? AND e.deleted_at IS NULL
      ORDER BY CASE e.status WHEN 'ativa' THEN 0 WHEN 'trancada' THEN 1 ELSE 2 END, c.name`,
  ).bind(student.id).all<{
    enrollment_id: string; enrollment_status: string; class_id: string; class_name: string;
    shift: string; week_day: string | null; course_id: string; course_name: string; course_code: string | null;
  }>();

  const attendanceQuery = await env.DB.prepare(
    `SELECT a.id, a.date, a.status, a.notes, a.completed_at,
            c.name AS class_name, co.name AS course_name
       FROM attendance_records a
       JOIN classes c ON c.id = a.class_id AND c.deleted_at IS NULL
       JOIN courses co ON co.id = c.course_id AND co.deleted_at IS NULL
      WHERE a.student_id = ? AND a.deleted_at IS NULL
      ORDER BY a.date DESC`,
  ).bind(student.id).all<{
    id: string; date: string; status: AttendanceStatus; notes: string | null;
    completed_at: string | null; class_name: string; course_name: string;
  }>();

  const records = attendanceQuery.results;
  const totalLessons = records.length;
  const present = records.filter((r) => r.status === 'P' || r.status === 'RC').length;
  const absent = records.filter((r) => r.status === 'F').length;
  const justified = records.filter((r) => r.status === 'J').length;
  const delayed = records.filter((r) => r.status === 'A').length;
  const replacement = records.filter((r) => r.status === 'R').length;
  const attendanceRate = totalLessons > 0 ? Math.round((present / totalLessons) * 1000) / 10 : 0;

  // Monthly breakdown
  const monthlyMap = new Map<string, { present: number; total: number }>();
  for (const r of records) {
    const monthKey = r.date.slice(0, 7);
    const curr = monthlyMap.get(monthKey) ?? { present: 0, total: 0 };
    curr.total += 1;
    if (r.status === 'P' || r.status === 'RC') curr.present += 1;
    monthlyMap.set(monthKey, curr);
  }

  const monthlyEvolution = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, data]) => {
      const [year, month] = monthKey.split('-');
      const mIdx = parseInt(month ?? '1', 10) - 1;
      const label = `${MONTH_NAMES_PT[mIdx] || month}/${year}`;
      const rate = data.total > 0 ? Math.round((data.present / data.total) * 1000) / 10 : 100;
      return {
        month: monthKey,
        label,
        rate,
        present: data.present,
        total: data.total,
        absent: data.total - data.present,
      };
    });

  const statusLabels: Record<string, string> = {
    P: 'Presente',
    F: 'Falta',
    J: 'Justificada',
    A: 'Atraso',
    R: 'Reposição Necessária',
    RC: 'Reposição Concluída',
  };

  // Report Card (Boletim de Notas) for published grade tables in enrolled/graded classes
  const gradeTablesQuery = await env.DB.prepare(
    `SELECT gt.id, gt.class_id, gt.name, gt.calculation_mode, gt.passing_grade, gt.published,
            gt.sort_order, gt.start_date, gt.end_date, gt.notes, gt.updated_at,
            c.name AS class_name, co.name AS course_name, co.code AS course_code,
            u.name AS teacher_name
       FROM grade_tables gt
       JOIN classes c ON c.id = gt.class_id AND c.deleted_at IS NULL
       JOIN courses co ON co.id = c.course_id AND co.deleted_at IS NULL
       LEFT JOIN users u ON u.id = gt.created_by_user_id
      WHERE gt.deleted_at IS NULL AND gt.published = 1
        AND (
          gt.class_id IN (SELECT class_id FROM enrollments WHERE student_id = ? AND deleted_at IS NULL)
          OR gt.id IN (SELECT grade_table_id FROM student_grades WHERE student_id = ? AND deleted_at IS NULL)
        )
      ORDER BY gt.sort_order ASC, gt.created_at ASC`,
  ).bind(student.id, student.id).all<{
    id: string; class_id: string; name: string; calculation_mode: 'simple' | 'weighted' | 'sum';
    passing_grade: number; published: number; sort_order: number; start_date: string | null; end_date: string | null;
    notes: string | null; updated_at: string;
    class_name: string; course_name: string; course_code: string | null; teacher_name: string | null;
  }>();

  const gradeItemsQuery = await env.DB.prepare(
    `SELECT gi.id, gi.class_id, gi.grade_table_id, gi.name, gi.category, gi.evaluation_date,
            gi.max_score, gi.weight, gi.sort_order, gi.notes
       FROM grade_items gi
       JOIN grade_tables gt ON gt.id = gi.grade_table_id AND gt.deleted_at IS NULL AND gt.published = 1
      WHERE gi.deleted_at IS NULL
        AND (
          gi.class_id IN (SELECT class_id FROM enrollments WHERE student_id = ? AND deleted_at IS NULL)
          OR gi.grade_table_id IN (SELECT grade_table_id FROM student_grades WHERE student_id = ? AND deleted_at IS NULL)
        )
      ORDER BY gi.sort_order ASC, gi.created_at ASC`,
  ).bind(student.id, student.id).all<{
    id: string; class_id: string; grade_table_id: string; name: string; category: string;
    evaluation_date: string | null; max_score: number; weight: number; sort_order: number; notes: string | null;
  }>();

  const studentGradesQuery = await env.DB.prepare(
    `SELECT sg.id, sg.grade_table_id, sg.grade_item_id, sg.score, sg.remarks, sg.updated_at
       FROM student_grades sg
       JOIN grade_items gi ON gi.id = sg.grade_item_id AND gi.deleted_at IS NULL
       JOIN grade_tables gt ON gt.id = sg.grade_table_id AND gt.deleted_at IS NULL AND gt.published = 1
      WHERE sg.student_id = ? AND sg.deleted_at IS NULL`,
  ).bind(student.id).all<{
    id: string; grade_table_id: string; grade_item_id: string; score: number | null; remarks: string | null; updated_at: string;
  }>();

  const gradeByItemId = new Map(studentGradesQuery.results.map((g) => [g.grade_item_id, g]));
  const itemsByTableId = new Map<string, typeof gradeItemsQuery.results>();
  for (const item of gradeItemsQuery.results) {
    const list = itemsByTableId.get(item.grade_table_id) ?? [];
    list.push(item);
    itemsByTableId.set(item.grade_table_id, list);
  }

  const categoryMap = new Map<string, { category: string; count: number; evaluatedCount: number; normalizedSum: number }>();

  const tables = gradeTablesQuery.results.map((table) => {
    const rawItems = itemsByTableId.get(table.id) ?? [];
    const items = rawItems.map((item) => {
      const entry = gradeByItemId.get(item.id);
      const score = entry?.score !== undefined && entry?.score !== null ? Number(entry.score) : null;
      const maxScore = Number(item.max_score || 10);
      const weight = Number(item.weight || 1);
      const normalizedScore = score !== null && maxScore > 0 ? Math.round(((score / maxScore) * 10) * 10) / 10 : null;

      const catKey = (item.category || 'Avaliação').trim();
      const catEntry = categoryMap.get(catKey) ?? { category: catKey, count: 0, evaluatedCount: 0, normalizedSum: 0 };
      catEntry.count += 1;
      if (normalizedScore !== null) {
        catEntry.evaluatedCount += 1;
        catEntry.normalizedSum += normalizedScore;
      }
      categoryMap.set(catKey, catEntry);

      return {
        id: item.id,
        name: item.name,
        category: catKey,
        evaluationDate: item.evaluation_date,
        maxScore,
        weight,
        notes: item.notes,
        score,
        normalizedScore,
        remarks: entry?.remarks ?? null,
        updatedAt: entry?.updated_at ?? null,
      };
    });

    const evaluated = items.filter((i) => i.score !== null);
    let average: number | null = null;
    if (evaluated.length > 0) {
      if (table.calculation_mode === 'sum') {
        const sum = evaluated.reduce((acc, i) => acc + (i.score ?? 0), 0);
        average = Math.round(Math.min(10, sum) * 10) / 10;
      } else if (table.calculation_mode === 'weighted') {
        const weightSum = evaluated.reduce((acc, i) => acc + i.weight, 0);
        const weightedTotal = evaluated.reduce((acc, i) => acc + ((i.normalizedScore ?? 0) * i.weight), 0);
        average = weightSum > 0 ? Math.round((weightedTotal / weightSum) * 10) / 10 : null;
      } else {
        const sumNorm = evaluated.reduce((acc, i) => acc + (i.normalizedScore ?? 0), 0);
        average = Math.round((sumNorm / evaluated.length) * 10) / 10;
      }
    }

    const passingGrade = Number(table.passing_grade ?? 6.0);
    const recoveryFloor = Math.max(4.0, passingGrade - 2.0);
    let status: 'aprovado' | 'recuperacao' | 'reprovado' | 'em_andamento' = 'em_andamento';
    let statusLabel = 'Em andamento';

    if (items.length > 0 && evaluated.length === items.length && average !== null) {
      if (average >= passingGrade) {
        status = 'aprovado';
        statusLabel = 'Aprovado';
      } else if (average >= recoveryFloor) {
        status = 'recuperacao';
        statusLabel = 'Em Recuperação';
      } else {
        status = 'reprovado';
        statusLabel = 'Reprovado';
      }
    } else if (table.calculation_mode === 'sum' && average !== null && average >= passingGrade) {
      status = 'aprovado';
      statusLabel = 'Aprovado';
    }

    return {
      id: table.id,
      name: table.name,
      className: table.class_name,
      courseName: table.course_name,
      courseCode: table.course_code,
      teacherName: table.teacher_name,
      calculationMode: table.calculation_mode,
      passingGrade,
      startDate: table.start_date ?? null,
      endDate: table.end_date ?? null,
      notes: table.notes,
      updatedAt: table.updated_at,
      average,
      status,
      statusLabel,
      totalItems: items.length,
      evaluatedItems: evaluated.length,
      items,
    };
  });

  const tablesWithAvg = tables.filter((t) => t.average !== null);
  const overallAverage = tablesWithAvg.length > 0
    ? Math.round((tablesWithAvg.reduce((acc, t) => acc + (t.average ?? 0), 0) / tablesWithAvg.length) * 10) / 10
    : null;
  const averagePassingGrade = tables.length > 0
    ? Math.round((tables.reduce((acc, t) => acc + t.passingGrade, 0) / tables.length) * 10) / 10
    : 6.0;

  let overallStatus: 'aprovado' | 'recuperacao' | 'reprovado' | 'em_andamento' | 'sem_notas' = 'sem_notas';
  let overallStatusLabel = 'Sem notas lançadas';
  if (tables.length > 0 && overallAverage !== null) {
    const allCompleted = tables.every((t) => t.totalItems > 0 && t.evaluatedItems === t.totalItems);
    if (!allCompleted) {
      overallStatus = 'em_andamento';
      overallStatusLabel = 'Em andamento';
    } else if (overallAverage >= averagePassingGrade) {
      overallStatus = 'aprovado';
      overallStatusLabel = 'Aprovado';
    } else if (overallAverage >= Math.max(4.0, averagePassingGrade - 2.0)) {
      overallStatus = 'recuperacao';
      overallStatusLabel = 'Em Recuperação';
    } else {
      overallStatus = 'reprovado';
      overallStatusLabel = 'Reprovado';
    }
  } else if (tables.length > 0) {
    overallStatus = 'em_andamento';
    overallStatusLabel = 'Em andamento';
  }

  const byCategory = Array.from(categoryMap.values()).map((c) => ({
    category: c.category,
    totalItems: c.count,
    evaluatedItems: c.evaluatedCount,
    average: c.evaluatedCount > 0 ? Math.round((c.normalizedSum / c.evaluatedCount) * 10) / 10 : null,
  }));

  return {
    student: {
      name: studentName,
      registrationNumber: student.registration_number,
      active: Boolean(student.active),
    },
    metrics: {
      totalLessons,
      present,
      absent,
      justified,
      delayed,
      replacement,
      attendanceRate,
    },
    classes: enrollmentsQuery.results.map((e) => ({
      className: e.class_name,
      courseName: e.course_name,
      courseCode: e.course_code,
      shift: e.shift,
      status: e.enrollment_status,
    })),
    monthlyEvolution,
    history: records.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      statusLabel: statusLabels[r.status] || r.status,
      className: r.class_name,
      courseName: r.course_name,
      notes: r.notes,
      completedAt: r.completed_at,
    })),
    reportCard: {
      overallAverage,
      passingGrade: averagePassingGrade,
      overallStatus,
      overallStatusLabel,
      totalTables: tables.length,
      totalAssessments: tables.reduce((acc, t) => acc + t.totalItems, 0),
      evaluatedAssessments: tables.reduce((acc, t) => acc + t.evaluatedItems, 0),
      byCategory,
      tables,
    },
  };
}
