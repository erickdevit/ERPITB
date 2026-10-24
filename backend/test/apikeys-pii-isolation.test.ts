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

describe('M2M API Keys & LGPD PII Isolation', () => {
  it('enforces machine role and redacts CPF/contact unless students:pii scope is granted', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin ITB', email: 'admin@itbcursos.com', password: 'Password@123' },
    });
    const adminToken = bootRes.data.accessToken;

    // 2. Setup Course, Class, Student with CPF and Contact
    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Segurança da Informação', workloadHours: 60 },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token: adminToken,
      body: { courseId, name: 'Turma SEC-2026', shift: 'noite' },
    });
    const classId = classRes.data.id;

    const studentRes = await request(env, '/api/v1/students', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Roberta Lima',
        registrationNumber: 'ITB-2026-888',
        classId,
        cpf: '333.444.555-66',
        contact: '(11) 91234-5678',
      },
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.data.id;

    // 3. Create M2M API Key WITHOUT students:pii
    const keyWithoutPiiRes = await request(env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Portal Externo Read-Only',
        scopes: ['students:read', 'classes:read'],
      },
    });
    expect(keyWithoutPiiRes.status).toBe(201);
    const secretWithoutPii = keyWithoutPiiRes.data.secret;

    // 4. Query student with Key WITHOUT students:pii
    const listResWithoutPii = await request(env, '/api/v1/students', {
      method: 'GET',
      headers: { 'x-api-key': secretWithoutPii },
    });
    expect(listResWithoutPii.status).toBe(200);
    expect(listResWithoutPii.data.items.length).toBe(1);
    const studentItem1 = listResWithoutPii.data.items[0];
    expect(studentItem1.name).toBe('Roberta Lima');
    expect(studentItem1.cpf).toBeNull();
    expect(studentItem1.contact).toBeNull();

    // Query single student with Key WITHOUT students:pii
    const getResWithoutPii = await request(env, `/api/v1/students/${studentId}`, {
      method: 'GET',
      headers: { 'x-api-key': secretWithoutPii },
    });
    expect(getResWithoutPii.status).toBe(200);
    expect(getResWithoutPii.data.cpf).toBeNull();
    expect(getResWithoutPii.data.contact).toBeNull();

    // 5. Create M2M API Key WITH students:pii
    const keyWithPiiRes = await request(env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Sistema de Matrícula Integrado',
        scopes: ['students:read', 'students:pii'],
      },
    });
    expect(keyWithPiiRes.status).toBe(201);
    const secretWithPii = keyWithPiiRes.data.secret;

    // 6. Query student with Key WITH students:pii
    const listResWithPii = await request(env, '/api/v1/students', {
      method: 'GET',
      headers: { 'x-api-key': secretWithPii },
    });
    expect(listResWithPii.status).toBe(200);
    const studentItem2 = listResWithPii.data.items[0];
    expect(studentItem2.name).toBe('Roberta Lima');
    expect(studentItem2.cpf).toBe('333.444.555-66');
    expect(studentItem2.contact).toBe('(11) 91234-5678');

    // Query single student with Key WITH students:pii
    const getResWithPii = await request(env, `/api/v1/students/${studentId}`, {
      method: 'GET',
      headers: { 'x-api-key': secretWithPii },
    });
    expect(getResWithPii.status).toBe(200);
    expect(getResWithPii.data.cpf).toBe('333.444.555-66');
    expect(getResWithPii.data.contact).toBe('(11) 91234-5678');
  });
});
