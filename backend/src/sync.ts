import { decryptText, encryptText } from './crypto';
import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { dateInTimeZone, hasPermission, teacherCanEditDate } from './rbac';
import type { AuthUser, Env, SyncEntity, SyncOperation, SyncPushBody } from './types';

type Row = Record<string, unknown>;

const columns: Record<SyncEntity, readonly string[]> = {
  laboratories: ['name', 'active'],
  courses: ['code', 'name', 'active'],
  classes: ['course_id', 'name', 'shift', 'week_day', 'is_kids', 'laboratory_id', 'active'],
  class_teachers: ['class_id', 'user_id'],
  students: ['encrypted_name', 'encrypted_cpf', 'encrypted_contact', 'registration_number', 'birth_date', 'active'],
  enrollments: ['class_id', 'student_id', 'status'],
  attendance_records: ['class_id', 'student_id', 'date', 'status', 'notes', 'recorded_by_user_id', 'sync_status'],
  class_notes: ['class_id', 'date', 'notes', 'recorded_by_user_id'],
};

function isSyncEntity(value: unknown): value is SyncEntity {
  return typeof value === 'string' && Object.hasOwn(columns, value);
}

function validateOperation(value: unknown): SyncOperation {
  if (!value || typeof value !== 'object') throw new AppError(400, 'Operação de sync inválida.', 'VALIDATION_ERROR');
  const raw = value as Record<string, unknown>;
  if (!isSyncEntity(raw.entity)) throw new AppError(400, 'Entidade de sync inválida.', 'VALIDATION_ERROR');
  const action = raw.action;
  if (action !== 'upsert' && action !== 'delete') throw new AppError(400, 'Ação de sync inválida.', 'VALIDATION_ERROR');
  if (!Number.isSafeInteger(raw.baseVersion) || Number(raw.baseVersion) < 0) throw new AppError(400, 'baseVersion inválida.', 'VALIDATION_ERROR');
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) throw new AppError(400, 'Dados de sync inválidos.', 'VALIDATION_ERROR');
  return {
    operationId: requireString(raw.operationId, 'operationId', { max: 80 }),
    entity: raw.entity,
    action,
    id: requireString(raw.id, 'id', { max: 36 }),
    baseVersion: Number(raw.baseVersion),
    updatedAt: requireString(raw.updatedAt, 'updatedAt', { max: 40 }),
    data: raw.data as Row,
  };
}

async function teacherOwnsClass(env: Env, userId: string, classId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS allowed FROM class_teachers WHERE user_id = ? AND class_id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(userId, classId).first();
  return Boolean(row);
}

async function authorizeOperation(env: Env, user: AuthUser, operation: SyncOperation, existing: Row | null): Promise<void> {
  if (operation.entity === 'class_teachers') {
    if (user.role === 'professor') throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    const teacherId = String(operation.data.user_id ?? existing?.user_id ?? '');
    if (operation.action === 'upsert') {
      const valid = await env.DB.prepare(`SELECT 1 AS valid FROM users WHERE id = ? AND role = 'professor' AND active = 1`).bind(teacherId).first();
      if (!valid) throw new AppError(400, 'Professor inválido.', 'VALIDATION_ERROR');
    } else {
      const activeClass = await env.DB.prepare(`SELECT 1 AS active FROM classes WHERE id = ? AND deleted_at IS NULL`).bind(classId).first();
      if (!activeClass) return;
      const alternatives = await env.DB.prepare(`SELECT COUNT(*) AS total FROM class_teachers ct JOIN users u ON u.id = ct.user_id WHERE ct.class_id = ? AND ct.user_id <> ? AND ct.deleted_at IS NULL AND u.role = 'professor' AND u.active = 1`).bind(classId, teacherId).first<{ total: number }>();
      if (Number(alternatives?.total ?? 0) < 1) throw new AppError(400, 'A turma deve manter ao menos um professor ativo.', 'TEACHER_REQUIRED');
    }
    return;
  }
  if (operation.entity === 'class_notes') {
    if (!hasPermission(user.role, 'attendance:write')) throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    if (user.role === 'professor' && !await teacherOwnsClass(env, user.id, classId)) {
      throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
    }
    return;
  }
  if (operation.entity === 'attendance_records') {
    if (!hasPermission(user.role, 'attendance:write')) throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    const date = String(operation.data.date ?? existing?.date ?? '');
    if (user.role === 'professor') {
      if (!await teacherOwnsClass(env, user.id, classId)) throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
      const timeZone = env.INSTITUTION_TIMEZONE ?? 'America/Sao_Paulo';
      if (!teacherCanEditDate(date, new Date(), timeZone)) throw new AppError(403, 'Chamada fora da janela de sete dias.', 'EDIT_WINDOW_CLOSED');
      if (!existing) {
        const recordedAt = new Date(String(operation.data.created_at ?? operation.updatedAt));
        if (Number.isNaN(recordedAt.valueOf()) || dateInTimeZone(recordedAt, timeZone) !== date) {
          throw new AppError(403, 'Uma nova chamada deve ter sido aberta no dia da aula.', 'NEW_ATTENDANCE_DATE_CLOSED');
        }
      }
    }
    return;
  }
  if (user.role === 'professor') throw new AppError(403, 'Professores só sincronizam lançamentos de frequência.', 'FORBIDDEN');
  if (operation.entity === 'students' || operation.entity === 'enrollments') {
    if (!hasPermission(user.role, 'students:write')) {
      throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    }
    if (operation.entity === 'students' && operation.action === 'delete' && !hasPermission(user.role, 'students:delete')) {
      throw new AppError(403, 'Apenas administradores excluem alunos.', 'FORBIDDEN');
    }
    return;
  }
  if (operation.entity === 'laboratories') {
    if (operation.action === 'delete' || (!existing && operation.action === 'upsert')) {
      if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores criam ou excluem laboratórios.', 'FORBIDDEN');
      if (operation.action === 'delete') {
        const linked = await env.DB.prepare(`SELECT 1 AS linked FROM classes WHERE laboratory_id = ? AND deleted_at IS NULL LIMIT 1`).bind(operation.id).first();
        if (linked) throw new AppError(409, 'Exclua ou altere as turmas deste laboratório antes de excluí-lo.', 'LINKED_RECORDS');
      }
    }
    return;
  }
  if (operation.entity === 'courses') {
    if (operation.action === 'delete' || (!existing && operation.action === 'upsert')) {
      if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores criam ou excluem cursos.', 'FORBIDDEN');
      if (operation.action === 'delete') {
        const linked = await env.DB.prepare(`SELECT 1 AS linked FROM classes WHERE course_id = ? AND deleted_at IS NULL LIMIT 1`).bind(operation.id).first();
        if (linked) throw new AppError(409, 'Exclua as turmas deste curso antes de excluí-lo.', 'LINKED_RECORDS');
      }
    }
    return;
  }
  if (operation.entity === 'classes') {
    if (operation.action === 'delete' || (!existing && operation.action === 'upsert')) {
      if (user.role !== 'admin') throw new AppError(403, 'Apenas administradores criam ou excluem turmas.', 'FORBIDDEN');
      if (operation.action === 'delete') {
        const linked = await env.DB.prepare(
          `SELECT 1 AS linked FROM enrollments e JOIN students s ON s.id = e.student_id
            WHERE e.class_id = ? AND e.status = 'ativa' AND e.deleted_at IS NULL
              AND s.active = 1 AND s.deleted_at IS NULL LIMIT 1`,
        ).bind(operation.id).first();
        if (linked) throw new AppError(409, 'Transfira ou exclua os alunos ativos antes de excluir a turma.', 'LINKED_RECORDS');
      }
    }
  }
}

async function normalizePayload(env: Env, user: AuthUser, operation: SyncOperation, existing: Row | null): Promise<Row> {
  const data: Row = { ...operation.data };
  if (operation.entity === 'students') {
    if (typeof data.name === 'string') data.encrypted_name = await encryptText(env, data.name);
    if (typeof data.cpf === 'string') data.encrypted_cpf = await encryptText(env, data.cpf);
    if (typeof data.contact === 'string') data.encrypted_contact = await encryptText(env, data.contact);
    if (data.cpf === null) data.encrypted_cpf = null;
    if (data.contact === null) data.encrypted_contact = null;
    delete data.name; delete data.cpf; delete data.contact;
  }
  if (operation.entity === 'attendance_records') {
    data.recorded_by_user_id = user.id;
    data.sync_status = 'SYNCED';
  }
  if (operation.entity === 'class_notes') {
    data.recorded_by_user_id = user.id;
  }
  const selected: Row = {};
  for (const column of columns[operation.entity]) {
    const value = data[column] ?? existing?.[column];
    if (value !== undefined) selected[column] = value;
  }
  return selected;
}

function ensureRequired(entity: SyncEntity, payload: Row): void {
  const required: Record<SyncEntity, readonly string[]> = {
    courses: ['code', 'name', 'active'],
    classes: ['course_id', 'name', 'shift', 'active'],
    class_teachers: ['class_id', 'user_id'],
    students: ['encrypted_name', 'registration_number', 'active'],
    enrollments: ['class_id', 'student_id', 'status'],
    attendance_records: ['class_id', 'student_id', 'date', 'status', 'recorded_by_user_id'],
    class_notes: ['class_id', 'date', 'recorded_by_user_id'],
  };
  for (const field of required[entity]) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      throw new AppError(400, `Campo ${field} ausente na operação de ${entity}.`, 'VALIDATION_ERROR');
    }
  }
  if (entity === 'attendance_records' && !['P', 'F', 'J', 'A'].includes(String(payload.status))) {
    throw new AppError(400, 'Status de frequência inválido.', 'VALIDATION_ERROR');
  }
  if (entity === 'students' && payload.birth_date != null) {
    const birthDate = String(payload.birth_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(Date.parse(`${birthDate}T00:00:00Z`)) || birthDate > new Date().toISOString().slice(0, 10)) {
      throw new AppError(400, 'Data de nascimento inválida.', 'VALIDATION_ERROR');
    }
  }
}

async function findExisting(env: Env, operation: SyncOperation): Promise<Row | null> {
  const byId = await env.DB.prepare(`SELECT * FROM ${operation.entity} WHERE id = ?`).bind(operation.id).first<Row>();
  if (byId || operation.entity !== 'attendance_records') return byId;
  const classId = operation.data.class_id;
  const studentId = operation.data.student_id;
  const date = operation.data.date;
  if (typeof classId !== 'string' || typeof studentId !== 'string' || typeof date !== 'string') return null;
  return env.DB.prepare(
    `SELECT * FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ? LIMIT 1`,
  ).bind(classId, studentId, date).first<Row>();
}

async function createConflict(env: Env, user: AuthUser, deviceId: string, operation: SyncOperation, existing: Row): Promise<Row> {
  const id = uuid();
  const timestamp = nowIso();
  const result = { operationId: operation.operationId, status: 'conflict', conflictId: id, remoteVersion: Number(existing.sync_version ?? 0) };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sync_conflicts (id, attendance_record_id, operation_id, device_id, entity_name, entity_id, local_data_json, remote_data_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    ).bind(id, operation.entity === 'attendance_records' ? existing.id : null, operation.operationId, deviceId, operation.entity, existing.id ?? operation.id, JSON.stringify(operation.data), JSON.stringify(existing), timestamp),
    env.DB.prepare(
      `INSERT INTO sync_operations (operation_id, device_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(operation.operationId, deviceId, user.id, JSON.stringify(result), timestamp),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'SYNC_CONFLICT', ?, ?, ?, ?)`,
    ).bind(uuid(), user.id, operation.entity, operation.id, JSON.stringify({ conflictId: id, deviceId }), timestamp),
  ]);
  return result;
}

async function applyOperation(env: Env, user: AuthUser, deviceId: string, operation: SyncOperation): Promise<Row> {
  const cached = await env.DB.prepare(`SELECT result_json FROM sync_operations WHERE operation_id = ?`).bind(operation.operationId).first<{ result_json: string }>();
  if (cached) return JSON.parse(cached.result_json) as Row;
  const existing = await findExisting(env, operation);
  await authorizeOperation(env, user, operation, existing);
  const remoteVersion = Number(existing?.sync_version ?? 0);
  if (existing && operation.baseVersion !== remoteVersion) {
    return createConflict(env, user, deviceId, operation, existing);
  }
  const timestamp = nowIso();
  const version = remoteVersion + 1;
  let payload: Row;
  let statement: D1PreparedStatement;
  if (operation.action === 'delete') {
    if (!existing) {
      const result = { operationId: operation.operationId, status: 'applied', version: 0 };
      await env.DB.prepare(`INSERT INTO sync_operations (operation_id, device_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)`).bind(operation.operationId, deviceId, user.id, JSON.stringify(result), timestamp).run();
      return result;
    }
    payload = { ...existing, id: operation.id, deleted_at: timestamp, updated_at: timestamp, sync_version: version };
    statement = env.DB.prepare(`UPDATE ${operation.entity} SET deleted_at = ?, updated_at = ?, sync_version = ? WHERE id = ?`).bind(timestamp, timestamp, version, operation.id);
  } else {
    const normalized = await normalizePayload(env, user, operation, existing);
    ensureRequired(operation.entity, normalized);
    const fields = Object.keys(normalized);
    const insertFields = ['id', ...fields, 'sync_version', 'created_at', 'updated_at'];
    const insertValues = [operation.id, ...fields.map((field) => normalized[field] ?? null), version, existing?.created_at ?? timestamp, timestamp];
    const updateSql = [...fields.map((field) => `${field} = excluded.${field}`), 'sync_version = excluded.sync_version', 'deleted_at = NULL', 'updated_at = excluded.updated_at'].join(', ');
    statement = env.DB.prepare(
      `INSERT INTO ${operation.entity} (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateSql}`,
    ).bind(...insertValues);
    payload = { id: operation.id, ...normalized, sync_version: version, created_at: existing?.created_at ?? timestamp, updated_at: timestamp, deleted_at: null };
  }
  const result = { operationId: operation.operationId, status: 'applied', version };
  await env.DB.batch([
    statement,
    env.DB.prepare(`INSERT INTO sync_changes (entity_name, entity_id, operation, payload_json, changed_by_user_id, changed_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(operation.entity, operation.id, operation.action, JSON.stringify(payload), user.id, timestamp),
    env.DB.prepare(`INSERT INTO sync_operations (operation_id, device_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)`).bind(operation.operationId, deviceId, user.id, JSON.stringify(result), timestamp),
    env.DB.prepare(`INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'SYNC_APPLY', ?, ?, ?, ?)`).bind(uuid(), user.id, operation.entity, operation.id, JSON.stringify({ operationId: operation.operationId, deviceId }), timestamp),
  ]);
  return result;
}

export async function push(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  const body = await readJson<SyncPushBody>(request);
  const deviceId = requireString(body.deviceId, 'deviceId', { max: 100 });
  if (!Array.isArray(body.operations) || body.operations.length > 200) {
    throw new AppError(400, 'Um lote pode conter no máximo 200 operações.', 'VALIDATION_ERROR');
  }
  const operations = body.operations.map(validateOperation);
  const duplicate = new Set<string>();
  for (const operation of operations) {
    if (duplicate.has(operation.operationId)) throw new AppError(400, 'operationId duplicado no lote.', 'VALIDATION_ERROR');
    duplicate.add(operation.operationId);
  }
  for (const operation of operations) {
    if (operation.action !== 'upsert' || operation.baseVersion !== 0) continue;
    if (operation.entity === 'classes') {
      const teacher = operations.find((candidate) => candidate.entity === 'class_teachers' && candidate.action === 'upsert' && candidate.data.class_id === operation.id);
      if (!teacher) throw new AppError(400, 'Toda nova turma precisa de um professor no mesmo lote.', 'TEACHER_REQUIRED');
      const valid = await env.DB.prepare(`SELECT 1 AS valid FROM users WHERE id = ? AND role = 'professor' AND active = 1`).bind(String(teacher.data.user_id ?? '')).first();
      if (!valid) throw new AppError(400, 'Professor inválido para a nova turma.', 'TEACHER_REQUIRED');
    }
    if (operation.entity === 'students') {
      const enrollment = operations.find((candidate) => candidate.entity === 'enrollments' && candidate.action === 'upsert' && candidate.data.student_id === operation.id && typeof candidate.data.class_id === 'string');
      if (!enrollment) throw new AppError(400, 'Todo novo aluno precisa de uma turma no mesmo lote.', 'CLASS_REQUIRED');
      const classId = String(enrollment.data.class_id);
      const activeClass = await env.DB.prepare(`SELECT 1 AS valid FROM classes WHERE id = ? AND active = 1 AND deleted_at IS NULL`).bind(classId).first();
      if (!activeClass) throw new AppError(400, 'Turma inválida para o novo aluno.', 'CLASS_REQUIRED');
      if (user.role === 'professor' && !await teacherOwnsClass(env, user.id, classId)) throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
    }
  }
  const results: Row[] = [];
  for (const operation of operations) {
    try {
      results.push(await applyOperation(env, user, deviceId, operation));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({
        operationId: operation.operationId,
        status: 'rejected',
        code: error.code,
        message: error.message,
      });
    }
  }
  return { results };
}

async function mayReadChange(env: Env, user: AuthUser, entity: SyncEntity, payload: Row): Promise<boolean> {
  if (user.role !== 'professor') return true;
  if (entity === 'classes') return teacherOwnsClass(env, user.id, String(payload.id));
  if (entity === 'class_teachers') return String(payload.user_id) === user.id || teacherOwnsClass(env, user.id, String(payload.class_id));
  if (entity === 'courses') {
    const row = await env.DB.prepare(
      `SELECT 1 AS allowed FROM classes c JOIN class_teachers ct ON ct.class_id = c.id WHERE c.course_id = ? AND ct.user_id = ? AND ct.deleted_at IS NULL LIMIT 1`,
    ).bind(String(payload.id), user.id).first();
    return Boolean(row);
  }
  if (entity === 'students') {
    const row = await env.DB.prepare(
      `SELECT 1 AS allowed FROM enrollments e JOIN class_teachers ct ON ct.class_id = e.class_id WHERE e.student_id = ? AND ct.user_id = ? AND e.deleted_at IS NULL AND ct.deleted_at IS NULL LIMIT 1`,
    ).bind(String(payload.id), user.id).first();
    return Boolean(row);
  }
  if (entity === 'class_notes') return teacherOwnsClass(env, user.id, String(payload.class_id));
  return teacherOwnsClass(env, user.id, String(payload.class_id));
}

async function clientPayload(env: Env, entity: SyncEntity, payload: Row): Promise<Row> {
  if (entity !== 'students' || !payload.encrypted_name) return payload;
  const result = { ...payload };
  result.name = await decryptText(env, String(payload.encrypted_name));
  result.cpf = payload.encrypted_cpf ? await decryptText(env, String(payload.encrypted_cpf)) : null;
  result.contact = payload.encrypted_contact ? await decryptText(env, String(payload.encrypted_contact)) : null;
  delete result.encrypted_name; delete result.encrypted_cpf; delete result.encrypted_contact;
  return result;
}

export async function pull(url: URL, env: Env, user: AuthUser): Promise<unknown> {
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 1), 500);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new AppError(400, 'Cursor inválido.', 'VALIDATION_ERROR');
  const rows = await env.DB.prepare(
    `SELECT seq, entity_name, entity_id, operation, payload_json, changed_at FROM sync_changes WHERE seq > ? ORDER BY seq LIMIT ?`,
  ).bind(cursor, limit * 3).all<{ seq: number; entity_name: SyncEntity; entity_id: string; operation: string; payload_json: string; changed_at: string }>();
  const changes: Row[] = [];
  let nextCursor = cursor;
  for (const row of rows.results) {
    nextCursor = row.seq;
    if (!isSyncEntity(row.entity_name)) continue;
    const payload = JSON.parse(row.payload_json) as Row;
    if (!await mayReadChange(env, user, row.entity_name, payload)) continue;
    changes.push({ seq: row.seq, entity: row.entity_name, entityId: row.entity_id, operation: row.operation, data: await clientPayload(env, row.entity_name, payload), changedAt: row.changed_at });
    if (changes.length >= limit) break;
  }
  return { changes, nextCursor, hasMore: rows.results.length === limit * 3 || changes.length === limit };
}
