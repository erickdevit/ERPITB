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
  attendance_records: ['class_id', 'student_id', 'date', 'status', 'notes', 'completed_at', 'recorded_by_user_id', 'sync_status'],
  class_notes: ['class_id', 'date', 'notes', 'recorded_by_user_id'],
  replacements: ['attendance_record_id', 'class_id', 'student_id', 'attendance_date', 'scheduled_date', 'scheduled_time', 'notes', 'completed_at', 'recorded_by_user_id'],
  grade_tables: ['class_id', 'name', 'calculation_mode', 'passing_grade', 'published', 'sort_order', 'notes', 'created_by_user_id'],
  grade_items: ['class_id', 'grade_table_id', 'name', 'category', 'evaluation_date', 'max_score', 'weight', 'sort_order', 'notes', 'created_by_user_id'],
  student_grades: ['class_id', 'grade_table_id', 'grade_item_id', 'student_id', 'score', 'remarks', 'recorded_by_user_id'],
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

export function isReplacementCompletion(operation: SyncOperation, existing: Row | null): boolean {
  if (!existing || operation.entity !== 'attendance_records' || operation.action !== 'upsert') return false;
  const completedAt = operation.data.completed_at;
  return existing.status === 'R' && operation.data.status === 'RC'
    && typeof completedAt === 'string' && !Number.isNaN(Date.parse(completedAt));
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
  if (operation.entity === 'grade_tables' || operation.entity === 'grade_items' || operation.entity === 'student_grades') {
    if (!hasPermission(user.role, 'grades:write')) throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    if (user.role === 'professor' && !await teacherOwnsClass(env, user.id, classId)) {
      throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
    }
    return;
  }
  if (operation.entity === 'class_notes' || operation.entity === 'replacements') {
    if (!hasPermission(user.role, 'attendance:write')) throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    if (user.role === 'professor' && !await teacherOwnsClass(env, user.id, classId)) {
      throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
    }
    if (operation.entity === 'replacements' && operation.action === 'upsert') {
      const attendanceId = String(operation.data.attendance_record_id ?? existing?.attendance_record_id ?? '');
      const attendance = await env.DB.prepare(
        `SELECT class_id, student_id, date, status FROM attendance_records WHERE id = ? AND deleted_at IS NULL`,
      ).bind(attendanceId).first<{ class_id: string; student_id: string; date: string; status: string }>();
      const completingExisting = Boolean(operation.data.completed_at ?? existing?.completed_at);
      if (!attendance || (attendance.status !== 'R' && !(attendance.status === 'RC' && completingExisting))
        || attendance.class_id !== classId
        || attendance.student_id !== String(operation.data.student_id ?? existing?.student_id ?? '')
        || attendance.date !== String(operation.data.attendance_date ?? existing?.attendance_date ?? '')) {
        throw new AppError(400, 'A reposição deve estar vinculada a uma frequência marcada como reposição.', 'VALIDATION_ERROR');
      }
    }
    return;
  }
  if (operation.entity === 'attendance_records') {
    if (!hasPermission(user.role, 'attendance:write')) throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    const classId = String(operation.data.class_id ?? existing?.class_id ?? '');
    const date = String(operation.data.date ?? existing?.date ?? '');
    if (user.role === 'professor') {
      if (!await teacherOwnsClass(env, user.id, classId)) throw new AppError(403, 'Turma não atribuída ao professor.', 'FORBIDDEN');
      if (isReplacementCompletion(operation, existing)) {
        const schedule = await env.DB.prepare(
          `SELECT 1 AS valid FROM replacements
            WHERE attendance_record_id = ? AND class_id = ? AND student_id = ? AND attendance_date = ?
              AND deleted_at IS NULL LIMIT 1`,
        ).bind(existing!.id, classId, String(existing!.student_id), String(existing!.date)).first();
        if (!schedule) throw new AppError(400, 'A reposição precisa estar agendada antes da conclusão.', 'REPLACEMENT_SCHEDULE_REQUIRED');
        return;
      }
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
  if (user.role === 'professor') throw new AppError(403, 'Professores só sincronizam lançamentos de frequência e notas.', 'FORBIDDEN');
  if (operation.entity === 'students' || operation.entity === 'enrollments') {
    if (!hasPermission(user.role, 'students:write')) {
      throw new AppError(403, 'Ação não permitida.', 'FORBIDDEN');
    }
    if (operation.entity === 'students' && operation.action === 'delete' && !hasPermission(user.role, 'students:delete')) {
      throw new AppError(403, 'Apenas administradores excluem alunos.', 'FORBIDDEN');
    }
    if (operation.entity === 'enrollments' && operation.action === 'upsert' && operation.data.status === 'ativa') {
      const studentId = String(operation.data.student_id ?? existing?.student_id ?? '');
      const other = await env.DB.prepare(
        `SELECT id FROM enrollments WHERE student_id = ? AND status = 'ativa' AND deleted_at IS NULL AND id <> ? LIMIT 1`,
      ).bind(studentId, operation.id).first();
      if (other) throw new AppError(409, 'O aluno já possui outra matrícula ativa. Conclua a transferência da turma anterior.', 'ACTIVE_ENROLLMENT_EXISTS');
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
  if (operation.entity === 'replacements') data.recorded_by_user_id = user.id;
  if (operation.entity === 'grade_tables') {
    data.created_by_user_id = existing?.created_by_user_id ?? data.created_by_user_id ?? user.id;
    data.calculation_mode = data.calculation_mode ?? existing?.calculation_mode ?? 'simple';
    data.passing_grade = data.passing_grade !== undefined ? Number(data.passing_grade) : Number(existing?.passing_grade ?? 6.0);
    data.published = data.published !== undefined ? (data.published === false || data.published === 0 ? 0 : 1) : Number(existing?.published ?? 1);
    data.sort_order = data.sort_order !== undefined ? Number(data.sort_order) : Number(existing?.sort_order ?? 0);
  }
  if (operation.entity === 'grade_items') {
    data.created_by_user_id = existing?.created_by_user_id ?? data.created_by_user_id ?? user.id;
    data.max_score = data.max_score !== undefined ? Number(data.max_score) : Number(existing?.max_score ?? 10.0);
    data.weight = data.weight !== undefined ? Number(data.weight) : Number(existing?.weight ?? 1.0);
    data.sort_order = data.sort_order !== undefined ? Number(data.sort_order) : Number(existing?.sort_order ?? 0);
  }
  if (operation.entity === 'student_grades') {
    data.recorded_by_user_id = user.id;
    if (data.score === null || data.score === '') {
      data.score = null;
    } else if (data.score !== undefined) {
      data.score = Number(data.score);
    } else if (existing && 'score' in existing) {
      data.score = existing.score;
    } else {
      data.score = null;
    }
  }
  const selected: Row = {};
  for (const column of columns[operation.entity]) {
    const value = data[column] !== undefined ? data[column] : existing?.[column];
    if (value !== undefined) selected[column] = value;
  }
  return selected;
}

function ensureRequired(entity: SyncEntity, payload: Row): void {
  const required: Record<SyncEntity, readonly string[]> = {
    laboratories: ['name', 'active'],
    courses: ['code', 'name', 'active'],
    classes: ['course_id', 'name', 'shift', 'active'],
    class_teachers: ['class_id', 'user_id'],
    students: ['encrypted_name', 'registration_number', 'active'],
    enrollments: ['class_id', 'student_id', 'status'],
    attendance_records: ['class_id', 'student_id', 'date', 'status', 'recorded_by_user_id'],
    class_notes: ['class_id', 'date', 'recorded_by_user_id'],
    replacements: ['attendance_record_id', 'class_id', 'student_id', 'attendance_date', 'scheduled_date', 'scheduled_time', 'recorded_by_user_id'],
    grade_tables: ['class_id', 'name', 'calculation_mode', 'passing_grade', 'published', 'created_by_user_id'],
    grade_items: ['class_id', 'grade_table_id', 'name', 'category', 'max_score', 'weight', 'created_by_user_id'],
    student_grades: ['class_id', 'grade_table_id', 'grade_item_id', 'student_id', 'recorded_by_user_id'],
  };
  for (const field of required[entity]) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      throw new AppError(400, `Campo ${field} ausente na operação de ${entity}.`, 'VALIDATION_ERROR');
    }
  }
  if (entity === 'attendance_records' && !['P', 'F', 'J', 'A', 'R', 'RC'].includes(String(payload.status))) {
    throw new AppError(400, 'Status de frequência inválido.', 'VALIDATION_ERROR');
  }
  if (entity === 'enrollments' && !['ativa', 'trancada', 'concluida'].includes(String(payload.status))) {
    throw new AppError(400, 'Status de matrícula inválido.', 'VALIDATION_ERROR');
  }
  if (entity === 'grade_tables') {
    if (!['simple', 'weighted', 'sum'].includes(String(payload.calculation_mode))) {
      throw new AppError(400, 'Modo de cálculo da tabela de notas inválido.', 'VALIDATION_ERROR');
    }
    const passing = Number(payload.passing_grade);
    if (Number.isNaN(passing) || passing < 0 || passing > 10) {
      throw new AppError(400, 'Média mínima de aprovação deve estar entre 0 e 10.', 'VALIDATION_ERROR');
    }
  }
  if (entity === 'grade_items') {
    const maxScore = Number(payload.max_score);
    const weight = Number(payload.weight);
    if (Number.isNaN(maxScore) || maxScore <= 0 || maxScore > 100) {
      throw new AppError(400, 'Valor máximo da avaliação inválido.', 'VALIDATION_ERROR');
    }
    if (Number.isNaN(weight) || weight <= 0 || weight > 100) {
      throw new AppError(400, 'Peso da avaliação inválido.', 'VALIDATION_ERROR');
    }
  }
  if (entity === 'student_grades' && payload.score !== null && payload.score !== undefined) {
    const score = Number(payload.score);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      throw new AppError(400, 'Nota lançada inválida.', 'VALIDATION_ERROR');
    }
  }
  if (entity === 'replacements') {
    const attendanceDate = String(payload.attendance_date);
    const scheduledDate = String(payload.scheduled_date);
    const scheduledTime = String(payload.scheduled_time);
    if (![attendanceDate, scheduledDate].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      || [attendanceDate, scheduledDate].some((value) => Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) {
      throw new AppError(400, 'Data ou horário de reposição inválido.', 'VALIDATION_ERROR');
    }
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
  if (byId) return byId;
  if (operation.entity === 'replacements') {
    const attendanceRecordId = operation.data.attendance_record_id;
    if (typeof attendanceRecordId !== 'string') return null;
    return env.DB.prepare(
      `SELECT * FROM replacements WHERE attendance_record_id = ? LIMIT 1`,
    ).bind(attendanceRecordId).first<Row>();
  }
  if (operation.entity === 'class_notes') {
    const classId = operation.data.class_id;
    const date = operation.data.date;
    if (typeof classId !== 'string' || typeof date !== 'string') return null;
    return env.DB.prepare(
      `SELECT * FROM class_notes WHERE class_id = ? AND date = ? LIMIT 1`,
    ).bind(classId, date).first<Row>();
  }
  if (operation.entity === 'enrollments') {
    const classId = operation.data.class_id;
    const studentId = operation.data.student_id;
    if (typeof classId !== 'string' || typeof studentId !== 'string') return null;
    return env.DB.prepare(
      `SELECT * FROM enrollments WHERE class_id = ? AND student_id = ? LIMIT 1`,
    ).bind(classId, studentId).first<Row>();
  }
  if (operation.entity === 'class_teachers') {
    const classId = operation.data.class_id;
    const userId = operation.data.user_id;
    if (typeof classId !== 'string' || typeof userId !== 'string') return null;
    return env.DB.prepare(
      `SELECT * FROM class_teachers WHERE class_id = ? AND user_id = ? LIMIT 1`,
    ).bind(classId, userId).first<Row>();
  }
  if (operation.entity === 'student_grades') {
    const gradeItemId = operation.data.grade_item_id;
    const studentId = operation.data.student_id;
    if (typeof gradeItemId !== 'string' || typeof studentId !== 'string') return null;
    return env.DB.prepare(
      `SELECT * FROM student_grades WHERE grade_item_id = ? AND student_id = ? LIMIT 1`,
    ).bind(gradeItemId, studentId).first<Row>();
  }
  if (operation.entity !== 'attendance_records') return null;
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
  const targetId = String(existing?.id ?? operation.id);
  if (operation.action === 'delete') {
    if (!existing) {
      const result = { operationId: operation.operationId, status: 'applied', version: 0 };
      await env.DB.prepare(`INSERT INTO sync_operations (operation_id, device_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)`).bind(operation.operationId, deviceId, user.id, JSON.stringify(result), timestamp).run();
      return result;
    }
    payload = { ...existing, id: targetId, deleted_at: timestamp, updated_at: timestamp, sync_version: version };
    statement = env.DB.prepare(`UPDATE ${operation.entity} SET deleted_at = ?, updated_at = ?, sync_version = ? WHERE id = ?`).bind(timestamp, timestamp, version, targetId);
  } else {
    const normalized = await normalizePayload(env, user, operation, existing);
    ensureRequired(operation.entity, normalized);
    const fields = Object.keys(normalized);
    const insertFields = ['id', ...fields, 'sync_version', 'created_at', 'updated_at'];
    const insertValues = [targetId, ...fields.map((field) => normalized[field] ?? null), version, existing?.created_at ?? timestamp, timestamp];
    const updateSql = [...fields.map((field) => `${field} = excluded.${field}`), 'sync_version = excluded.sync_version', 'deleted_at = NULL', 'updated_at = excluded.updated_at'].join(', ');
    statement = env.DB.prepare(
      `INSERT INTO ${operation.entity} (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updateSql}`,
    ).bind(...insertValues);
    payload = { id: targetId, ...normalized, sync_version: version, created_at: existing?.created_at ?? timestamp, updated_at: timestamp, deleted_at: null };
  }
  const result = { operationId: operation.operationId, status: 'applied', version };
  await env.DB.batch([
    statement,
    env.DB.prepare(`INSERT INTO sync_changes (entity_name, entity_id, operation, payload_json, changed_by_user_id, changed_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(operation.entity, targetId, operation.action, JSON.stringify(payload), user.id, timestamp),
    env.DB.prepare(`INSERT INTO sync_operations (operation_id, device_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)`).bind(operation.operationId, deviceId, user.id, JSON.stringify(result), timestamp),
    env.DB.prepare(`INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'SYNC_APPLY', ?, ?, ?, ?)`).bind(uuid(), user.id, operation.entity, targetId, JSON.stringify({ operationId: operation.operationId, deviceId }), timestamp),
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
      const known = error instanceof AppError;
      if (!known) console.error(JSON.stringify({ event: 'sync_operation_failed', userId: user.id, operationId: operation.operationId, entity: operation.entity, error: error instanceof Error ? error.message : String(error) }));
      results.push({
        operationId: operation.operationId,
        status: 'rejected',
        code: known ? error.code : 'SYNC_INTERNAL_ERROR',
        message: known ? error.message : 'Não foi possível processar esta alteração. Ela foi preservada para revisão.',
      });
    }
  }
  return { results };
}

async function mayReadChange(env: Env, user: AuthUser, entity: SyncEntity, payload: Row): Promise<boolean> {
  if (user.role !== 'professor') return true;
  if (entity === 'laboratories' || entity === 'courses') return true;
  if (entity === 'classes') return teacherOwnsClass(env, user.id, String(payload.id));
  if (entity === 'class_teachers') return String(payload.user_id) === user.id || teacherOwnsClass(env, user.id, String(payload.class_id));
  if (entity === 'students') {
    const studentId = String(payload.id ?? '');
    const row = await env.DB.prepare(
      `SELECT 1 AS allowed FROM enrollments e JOIN class_teachers ct ON ct.class_id = e.class_id WHERE e.student_id = ? AND ct.user_id = ? AND e.deleted_at IS NULL AND ct.deleted_at IS NULL LIMIT 1`,
    ).bind(studentId, user.id).first();
    return Boolean(row);
  }
  if (
    entity === 'enrollments' ||
    entity === 'attendance_records' ||
    entity === 'class_notes' ||
    entity === 'replacements' ||
    entity === 'grade_tables' ||
    entity === 'grade_items' ||
    entity === 'student_grades'
  ) {
    return teacherOwnsClass(env, user.id, String(payload.class_id ?? ''));
  }
  return false;
}

async function clientPayload(env: Env, entity: SyncEntity, payload: Row): Promise<Row> {
  if (entity !== 'students' || !payload.encrypted_name) return payload;
  const result = { ...payload };
  try {
    result.name = await decryptText(env, String(payload.encrypted_name));
    result.cpf = payload.encrypted_cpf ? await decryptText(env, String(payload.encrypted_cpf)) : null;
    result.contact = payload.encrypted_contact ? await decryptText(env, String(payload.encrypted_contact)) : null;
  } catch {
    result.name = result.name || `Aluno ${result.registration_number || result.id || ''}`;
  }
  delete result.encrypted_name;
  delete result.encrypted_cpf;
  delete result.encrypted_contact;
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
