import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';

class D1PreparedStatementImpl {
  constructor(private db: DatabaseSync, private sql: string, private params: any[] = []) {}
  bind(...params: unknown[]) { return new D1PreparedStatementImpl(this.db, this.sql, params as any[]); }
  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] ?? null) as T;
    return row as T;
  }
  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.params) as T[];
    return { results, success: true, meta: {} };
  }
  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const stmt = this.db.prepare(this.sql);
    const result = stmt.run(...this.params);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class D1DatabaseImpl {
  constructor(public rawDb: DatabaseSync) {}
  prepare(sql: string) { return new D1PreparedStatementImpl(this.rawDb, sql); }
  async batch(statements: D1PreparedStatementImpl[]) {
    this.rawDb.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.rawDb.exec('COMMIT;');
      return results;
    } catch (err) {
      this.rawDb.exec('ROLLBACK;');
      throw err;
    }
  }
  async exec(sql: string) { this.rawDb.exec(sql); return { count: 1, duration: 0 }; }
}

function createTestEnvironment(): { env: Env; rawDb: DatabaseSync } {
  const rawDb = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8');
  rawDb.exec(schema);

  const env: Env = {
    DB: new D1DatabaseImpl(rawDb) as unknown as D1Database,
    JWT_SECRET: 'erpitb-local-jwt-secret-min-32-chars-key-2026',
    DATA_ENCRYPTION_KEY: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=',
    BOOTSTRAP_SECRET: 'bootstrap-secret-local-32-bytes-min-key',
    ALLOWED_ORIGIN: '*',
    ACCESS_TOKEN_TTL_MINUTES: '15',
    REFRESH_TOKEN_TTL_DAYS: '30',
    INSTITUTION_TIMEZONE: 'America/Sao_Paulo',
  };

  return { env, rawDb };
}

async function request(
  env: Env,
  path: string,
  options: {
    method?: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; data: any; headers: Headers }> {
  const url = `https://erp.itbcursos.com${path}`;
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const req = new Request(url, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const res = await worker.fetch(req, env);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

describe('Optimistic Concurrency Control (ETags & If-Match)', () => {
  it('manages ETags on GET and detects concurrency conflicts returning HTTP 409', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'bootstrap-secret-local-32-bytes-min-key' },
      body: {
        name: 'Admin ITB',
        email: 'admin@itbcursos.com',
        password: 'Password@123',
      },
    });
    expect(bootRes.status).toBe(201);
    const token = bootRes.data.accessToken;

    // 2. Create Course & Class
    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token,
      body: { name: 'Desenvolvimento Web', workloadHours: 120 },
    });
    expect(courseRes.status).toBe(201);
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token,
      body: { courseId, name: 'Turma Alpha 2026', shift: 'manha' },
    });
    expect(classRes.status).toBe(201);
    const classId = classRes.data.id;

    // 3. Create Student
    const studentRes = await request(env, '/api/v1/students', {
      method: 'POST',
      token,
      body: {
        name: 'Carolina Santos',
        registrationNumber: 'ITB-2026-101',
        classId,
        cpf: '123.456.789-00',
        contact: '(11) 98765-4321',
      },
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.data.id;

    // 4. GET student and verify ETag header
    const getStudentRes = await request(env, `/api/v1/students/${studentId}`, {
      method: 'GET',
      token,
    });
    expect(getStudentRes.status).toBe(200);
    const etag = getStudentRes.headers.get('etag');
    expect(etag).toBe('W/"1"');

    // 5. UPDATE student with correct If-Match
    const patchRes1 = await request(env, `/api/v1/students/${studentId}`, {
      method: 'PATCH',
      token,
      headers: { 'If-Match': 'W/"1"' },
      body: { name: 'Carolina Santos Silva' },
    });
    expect(patchRes1.status).toBe(200);
    expect(patchRes1.headers.get('etag')).toBe('W/"2"');

    // 6. UPDATE student with STALE If-Match (expect 409 CONCURRENCY_CONFLICT)
    const patchResConflict = await request(env, `/api/v1/students/${studentId}`, {
      method: 'PATCH',
      token,
      headers: { 'If-Match': 'W/"1"' }, // Stale version 1 while server is at version 2
      body: { name: 'Carolina Santos Conflito' },
    });
    expect(patchResConflict.status).toBe(409);
    expect(patchResConflict.data.ok).toBe(false);
    expect(patchResConflict.data.code).toBe('CONCURRENCY_CONFLICT');
    expect(patchResConflict.data.error).toBe('Registro foi modificado concorrentemente por outro usuário.');
    expect(patchResConflict.data.serverVersion).toBe(2);

    // 7. Test Concurrency on Grade Tables
    const gradeTableRes = await request(env, '/api/v1/grade-tables', {
      method: 'POST',
      token,
      body: {
        classId,
        name: 'Módulo 1 - Frontend',
        passingGrade: 7.0,
      },
    });
    expect(gradeTableRes.status).toBe(201);
    const tableId = gradeTableRes.data.id;
    expect(gradeTableRes.headers.get('etag')).toBe('W/"1"');

    // GET Grade Table
    const getTableRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
      method: 'GET',
      token,
    });
    expect(getTableRes.status).toBe(200);
    expect(getTableRes.headers.get('etag')).toBe('W/"1"');

    // Conflicting delete with wrong version
    const deleteConflictRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
      method: 'DELETE',
      token,
      headers: { 'If-Match': 'W/"99"' },
    });
    expect(deleteConflictRes.status).toBe(409);
    expect(deleteConflictRes.data.code).toBe('CONCURRENCY_CONFLICT');
    expect(deleteConflictRes.data.serverVersion).toBe(1);

    // Successful delete with matching version
    const deleteSuccessRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
      method: 'DELETE',
      token,
      headers: { 'If-Match': 'W/"1"' },
    });
    expect(deleteSuccessRes.status).toBe(200);
    expect(deleteSuccessRes.data.ok).toBe(true);
  });
});
