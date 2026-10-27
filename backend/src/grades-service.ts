import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission, requireScope } from './rbac';
import { assertConcurrencyVersion, formatETag, parseIfMatchHeader } from './concurrency';
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

// ==========================================
// 1. GRADE TABLES
// ==========================================

export async function listGradeTables(env: Env, user: AuthUser, url: URL): Promise<{ items: unknown[] }> {
  requireScope(user, 'grades:read');
  const classId = url.searchParams.get('classId');
  if (classId) {
    await requireClassAccess(env, user, classId);
  } else if (user.role === 'financeiro') {
    throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  }

  let sql = `SELECT * FROM grade_tables WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (classId) {
    sql += ` AND class_id = ?`;
    binds.push(classId);
  }
  sql += ` ORDER BY sort_order ASC, created_at DESC`;

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { items: rows.results };
}

export async function getGradeTable(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'grades:read');
  const row = await env.DB.prepare(`SELECT * FROM grade_tables WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Tabela de notas não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(row.class_id));

  const version = Number(row.sync_version ?? 1);
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(version),
    },
  });
}

export async function createGradeTable(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const body = await readJson<Record<string, unknown>>(request);
  const classId = requireString(body.classId, 'classId', { max: 36 });
  await requireClassAccess(env, user, classId);

  const name = requireString(body.name, 'nome', { min: 2, max: 120 });
  const calculationMode = ['simple', 'weighted', 'sum'].includes(String(body.calculationMode))
    ? String(body.calculationMode)
    : 'simple';
  const passingGrade = typeof body.passingGrade === 'number' ? body.passingGrade : 6.0;
  const published = body.published === false || body.published === 0 ? 0 : 1;
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;
  const startDate = typeof body.startDate === 'string' ? body.startDate : null;
  const endDate = typeof body.endDate === 'string' ? body.endDate : null;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const id = uuid();
  const timestamp = nowIso();

  await env.DB.prepare(`
      INSERT INTO grade_tables (
        id, class_id, name, calculation_mode, passing_grade, published,
        sort_order, start_date, end_date, notes, created_by_user_id,
        sync_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id, classId, name, calculationMode, passingGrade, published,
      sortOrder, startDate, endDate, notes, user.id, timestamp, timestamp
    ).run();

  const created = await env.DB.prepare(`SELECT * FROM grade_tables WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(1),
    },
  });
}

export async function updateGradeTable(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM grade_tables WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Tabela de notas não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<Record<string, unknown>>(request);
  const name = body.name !== undefined ? requireString(body.name, 'nome', { min: 2, max: 120 }) : String(current.name);
  const calculationMode = body.calculationMode !== undefined
    ? (['simple', 'weighted', 'sum'].includes(String(body.calculationMode)) ? String(body.calculationMode) : 'simple')
    : String(current.calculation_mode);
  const passingGrade = typeof body.passingGrade === 'number' ? body.passingGrade : Number(current.passing_grade);
  const published = body.published !== undefined ? (body.published ? 1 : 0) : Number(current.published);
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : Number(current.sort_order);
  const startDate = body.startDate !== undefined ? (typeof body.startDate === 'string' ? body.startDate : null) : (current.start_date as string | null);
  const endDate = body.endDate !== undefined ? (typeof body.endDate === 'string' ? body.endDate : null) : (current.end_date as string | null);
  const notes = body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes : null) : (current.notes as string | null);

  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`
    UPDATE grade_tables
       SET name = ?, calculation_mode = ?, passing_grade = ?, published = ?,
           sort_order = ?, start_date = ?, end_date = ?, notes = ?,
           sync_version = ?, updated_at = ?
     WHERE id = ? AND sync_version = ? AND deleted_at IS NULL
  `).bind(
    name, calculationMode, passingGrade, published,
    sortOrder, startDate, endDate, notes, nextVersion, timestamp, id, currentVersion
  ).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM grade_tables WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Tabela de notas não encontrada.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  const updated = await env.DB.prepare(`SELECT * FROM grade_tables WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function deleteGradeTable(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM grade_tables WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Tabela de notas não encontrada.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE grade_tables SET deleted_at = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`
  ).bind(timestamp, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM grade_tables WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Tabela de notas não encontrada.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  await env.DB.prepare(
    `UPDATE grade_items SET deleted_at = ?, sync_version = sync_version + 1, updated_at = ? WHERE grade_table_id = ? AND deleted_at IS NULL`
  ).bind(timestamp, timestamp, id).run();

  await env.DB.prepare(
    `UPDATE student_grades SET deleted_at = ?, sync_version = sync_version + 1, updated_at = ? WHERE grade_table_id = ? AND deleted_at IS NULL`
  ).bind(timestamp, timestamp, id).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ==========================================
// 2. GRADE ITEMS
// ==========================================

export async function listGradeItems(env: Env, user: AuthUser, url: URL): Promise<{ items: unknown[] }> {
  requireScope(user, 'grades:read');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  const gradeTableId = url.searchParams.get('gradeTableId');
  const classId = url.searchParams.get('classId');

  let sql = `SELECT * FROM grade_items WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (gradeTableId) {
    sql += ` AND grade_table_id = ?`;
    binds.push(gradeTableId);
  }
  if (classId) {
    sql += ` AND class_id = ?`;
    binds.push(classId);
  }
  sql += ` ORDER BY sort_order ASC, created_at ASC`;

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { items: rows.results };
}

export async function getGradeItem(env: Env, user: AuthUser, id: string): Promise<Response> {
  requireScope(user, 'grades:read');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');
  const row = await env.DB.prepare(`SELECT * FROM grade_items WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, 'Item de avaliação não encontrado.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(row.class_id));

  return new Response(JSON.stringify(row), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(Number(row.sync_version ?? 1)),
    },
  });
}

export async function createGradeItem(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const body = await readJson<Record<string, unknown>>(request);
  const gradeTableId = requireString(body.gradeTableId, 'gradeTableId', { max: 36 });
  const table = await env.DB.prepare(`SELECT id, class_id FROM grade_tables WHERE id = ? AND deleted_at IS NULL`).bind(gradeTableId).first<{ id: string; class_id: string }>();
  if (!table) throw new AppError(404, 'Tabela de notas vinculada não encontrada.', 'NOT_FOUND');

  const classId = String(body.classId || table.class_id);
  await requireClassAccess(env, user, classId);

  const name = requireString(body.name, 'nome', { min: 2, max: 120 });
  const category = requireString(body.category || 'Avaliação', 'categoria', { min: 1, max: 60 });
  const evaluationDate = typeof body.evaluationDate === 'string' ? body.evaluationDate : null;
  const maxScore = typeof body.maxScore === 'number' && body.maxScore > 0 ? body.maxScore : 10.0;
  const weight = typeof body.weight === 'number' && body.weight > 0 ? body.weight : 1.0;
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const id = uuid();
  const timestamp = nowIso();

  await env.DB.prepare(`
      INSERT INTO grade_items (
        id, class_id, grade_table_id, name, category, evaluation_date,
        max_score, weight, sort_order, notes, created_by_user_id,
        sync_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      id, classId, gradeTableId, name, category, evaluationDate,
      maxScore, weight, sortOrder, notes, user.id, timestamp, timestamp
    ).run();

  const created = await env.DB.prepare(`SELECT * FROM grade_items WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(1),
    },
  });
}

export async function updateGradeItem(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM grade_items WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Item de avaliação não encontrado.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const body = await readJson<Record<string, unknown>>(request);
  const name = body.name !== undefined ? requireString(body.name, 'nome', { min: 2, max: 120 }) : String(current.name);
  const category = body.category !== undefined ? requireString(body.category, 'categoria', { min: 1, max: 60 }) : String(current.category);
  const evaluationDate = body.evaluationDate !== undefined ? (typeof body.evaluationDate === 'string' ? body.evaluationDate : null) : (current.evaluation_date as string | null);
  const maxScore = typeof body.maxScore === 'number' && body.maxScore > 0 ? body.maxScore : Number(current.max_score);
  const weight = typeof body.weight === 'number' && body.weight > 0 ? body.weight : Number(current.weight);
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : Number(current.sort_order);
  const notes = body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes : null) : (current.notes as string | null);

  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`
    UPDATE grade_items
       SET name = ?, category = ?, evaluation_date = ?, max_score = ?,
           weight = ?, sort_order = ?, notes = ?, sync_version = ?, updated_at = ?
     WHERE id = ? AND sync_version = ? AND deleted_at IS NULL
  `).bind(
    name, category, evaluationDate, maxScore,
    weight, sortOrder, notes, nextVersion, timestamp, id, currentVersion
  ).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM grade_items WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Item de avaliação não encontrado.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  const updated = await env.DB.prepare(`SELECT * FROM grade_items WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function deleteGradeItem(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const current = await env.DB.prepare(`SELECT * FROM grade_items WHERE id = ? AND deleted_at IS NULL`).bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Item de avaliação não encontrado.', 'NOT_FOUND');
  await requireClassAccess(env, user, String(current.class_id));

  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(Number(current.sync_version ?? 1), ifMatch);

  const timestamp = nowIso();
  const currentVersion = Number(current.sync_version ?? 1);
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(
    `UPDATE grade_items SET deleted_at = ?, sync_version = ?, updated_at = ? WHERE id = ? AND sync_version = ? AND deleted_at IS NULL`
  ).bind(timestamp, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM grade_items WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Item de avaliação não encontrado.', 'NOT_FOUND');
    throw new AppError(409, 'Registro foi modificado concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  await env.DB.prepare(
    `UPDATE student_grades SET deleted_at = ?, sync_version = sync_version + 1, updated_at = ? WHERE grade_item_id = ? AND deleted_at IS NULL`
  ).bind(timestamp, timestamp, id).run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ==========================================
// 3. STUDENT GRADES
// ==========================================

export async function listStudentGrades(env: Env, user: AuthUser, url: URL): Promise<{ items: unknown[] }> {
  requireScope(user, 'grades:read');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const gradeItemId = url.searchParams.get('gradeItemId');
  const gradeTableId = url.searchParams.get('gradeTableId');
  const studentId = url.searchParams.get('studentId');
  const classId = url.searchParams.get('classId');

  let sql = `SELECT * FROM student_grades WHERE deleted_at IS NULL`;
  const binds: unknown[] = [];
  if (gradeItemId) {
    sql += ` AND grade_item_id = ?`;
    binds.push(gradeItemId);
  }
  if (gradeTableId) {
    sql += ` AND grade_table_id = ?`;
    binds.push(gradeTableId);
  }
  if (studentId) {
    sql += ` AND student_id = ?`;
    binds.push(studentId);
  }
  if (classId) {
    sql += ` AND class_id = ?`;
    binds.push(classId);
  }
  sql += ` ORDER BY created_at ASC`;

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { items: rows.results };
}

export async function saveStudentGrades(request: Request, env: Env, user: AuthUser): Promise<Response> {
  requirePermission(user, 'grades:write');
  if (user.role === 'financeiro') throw new AppError(403, 'Acesso restrito ao corpo docente e pedagógico.', 'FORBIDDEN');

  const body = await readJson<Record<string, unknown>>(request);
  const gradesArray = Array.isArray(body.grades) ? body.grades : [body];
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [];
  const savedRecords: unknown[] = [];

  for (const item of gradesArray) {
    if (!item || typeof item !== 'object') continue;
    const gradeItemId = requireString(item.gradeItemId, 'gradeItemId', { max: 36 });
    const studentId = requireString(item.studentId, 'studentId', { max: 36 });
    const score = typeof item.score === 'number' ? item.score : null;
    const remarks = typeof item.remarks === 'string' ? item.remarks : null;

    // Get item to retrieve class_id and grade_table_id
    const gradeItem = await env.DB.prepare(
      `SELECT class_id, grade_table_id FROM grade_items WHERE id = ? AND deleted_at IS NULL`
    ).bind(gradeItemId).first<{ class_id: string; grade_table_id: string }>();
    if (!gradeItem) throw new AppError(404, `Item de avaliação ${gradeItemId} não encontrado.`, 'NOT_FOUND');

    await requireClassAccess(env, user, gradeItem.class_id);

    const existing = await env.DB.prepare(
      `SELECT id, sync_version FROM student_grades WHERE grade_item_id = ? AND student_id = ?`
    ).bind(gradeItemId, studentId).first<{ id: string; sync_version: number }>();

    const id = existing?.id ?? uuid();
    const version = (existing?.sync_version ?? 0) + 1;

    statements.push(
      env.DB.prepare(`
        INSERT INTO student_grades (
          id, class_id, grade_table_id, grade_item_id, student_id,
          score, remarks, recorded_by_user_id, sync_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(grade_item_id, student_id) DO UPDATE SET
          score = excluded.score,
          remarks = excluded.remarks,
          recorded_by_user_id = excluded.recorded_by_user_id,
          sync_version = student_grades.sync_version + 1,
          deleted_at = NULL,
          updated_at = excluded.updated_at
      `).bind(
        id, gradeItem.class_id, gradeItem.grade_table_id, gradeItemId, studentId,
        score, remarks, user.id, timestamp, timestamp
      )
    );

    savedRecords.push({
      id,
      classId: gradeItem.class_id,
      gradeTableId: gradeItem.grade_table_id,
      gradeItemId,
      studentId,
      score,
      remarks,
      recordedByUserId: user.id,
      syncVersion: version,
      updatedAt: timestamp,
    });
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  const responseBody = Array.isArray(body.grades) ? { items: savedRecords } : savedRecords[0];
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
