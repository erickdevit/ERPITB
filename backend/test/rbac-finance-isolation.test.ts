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

describe('RBAC Strict Read Isolation for Financeiro', () => {
  it('blocks financeiro from accessing attendance, grades, notes, and dashboard, while allowing financial routes', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin ITB', email: 'admin@itbcursos.com', password: 'Password@123' },
    });
    const adminToken = bootRes.data.accessToken;

    // 2. Create user with role: financeiro
    const finUserRes = await request(env, '/api/v1/users', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Carlos Financeiro',
        email: 'financeiro@itbcursos.com',
        role: 'financeiro',
        password: 'FinPassword@123',
      },
    });
    expect(finUserRes.status).toBe(201);

    // 3. Login as financeiro
    const loginRes = await request(env, '/api/auth/login', {
      method: 'POST',
      body: { email: 'financeiro@itbcursos.com', password: 'FinPassword@123' },
    });
    expect(loginRes.status).toBe(200);
    const finToken = loginRes.data.accessToken;

    // 4. Setup Course and Class as admin
    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Administração', workloadHours: 100 },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token: adminToken,
      body: { courseId, name: 'Turma ADM-2026', shift: 'manha' },
    });
    const classId = classRes.data.id;

    // 5. Financeiro tries to access ATTENDANCE -> Expect 403 Forbidden
    const attListRes = await request(env, `/api/v1/attendance?classId=${classId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(attListRes.status).toBe(403);
    expect(attListRes.data.error.code).toBe('FORBIDDEN');
    expect(attListRes.data.error.message).toBe('Acesso restrito ao corpo docente e pedagógico.');

    // 6. Financeiro tries to access GRADE TABLES -> Expect 403 Forbidden
    const gradeTablesRes = await request(env, `/api/v1/grade-tables?classId=${classId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(gradeTablesRes.status).toBe(403);
    expect(gradeTablesRes.data.error.code).toBe('FORBIDDEN');

    // 7. Financeiro tries to access GRADE ITEMS -> Expect 403 Forbidden
    const gradeItemsRes = await request(env, `/api/v1/grade-items?classId=${classId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(gradeItemsRes.status).toBe(403);
    expect(gradeItemsRes.data.error.code).toBe('FORBIDDEN');

    // 8. Financeiro tries to access STUDENT GRADES -> Expect 403 Forbidden
    const studentGradesRes = await request(env, `/api/v1/student-grades?classId=${classId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(studentGradesRes.status).toBe(403);
    expect(studentGradesRes.data.error.code).toBe('FORBIDDEN');

    // 9. Financeiro tries to access REPLACEMENTS -> Expect 403 Forbidden
    const replacementsRes = await request(env, `/api/v1/replacements?classId=${classId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(replacementsRes.status).toBe(403);
    expect(replacementsRes.data.error.code).toBe('FORBIDDEN');

    // 10. Financeiro tries to access DASHBOARD -> Expect 403 Forbidden
    const dashboardRes = await request(env, '/api/v1/dashboard', {
      method: 'GET',
      token: finToken,
    });
    expect(dashboardRes.status).toBe(403);
    expect(dashboardRes.data.error.code).toBe('FORBIDDEN');

    // 11. Financeiro CAN access Financial Routes
    const feesRes = await request(env, '/api/v1/finance/fees', {
      method: 'GET',
      token: finToken,
    });
    expect(feesRes.status).toBe(200);
    expect(feesRes.data.items).toBeDefined();

    const cashRes = await request(env, '/api/v1/finance/cash', {
      method: 'GET',
      token: finToken,
    });
    expect(cashRes.status).toBe(200);
    expect(cashRes.data.items).toBeDefined();

    // 12. Financeiro CAN read students & classes for billing purposes
    const studentsRes = await request(env, '/api/v1/students', {
      method: 'GET',
      token: finToken,
    });
    expect(studentsRes.status).toBe(200);
  });
});
