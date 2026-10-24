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

describe('Idempotency Engine Middleware', () => {
  it('replays identical responses with x-idempotency: replay and rejects payload mismatches with 422', async () => {
    const { env, rawDb } = createTestEnvironment();

    // 1. Bootstrap admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin ITB', email: 'admin@itbcursos.com', password: 'Password@123' },
    });
    const token = bootRes.data.accessToken;

    // 2. Setup Course, Class, Student, Enrollment
    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token,
      body: { name: 'Gestão Empresarial', workloadHours: 80 },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token,
      body: { courseId, name: 'Turma GE-2026', shift: 'noite' },
    });
    const classId = classRes.data.id;

    const studentRes = await request(env, '/api/v1/students', {
      method: 'POST',
      token,
      body: {
        name: 'Marcos Vinicius',
        registrationNumber: 'ITB-2026-202',
        classId,
        cpf: '222.333.444-55',
      },
    });
    const studentId = studentRes.data.id;

    const today = new Date().toISOString().slice(0, 10);
    const attendancePayload = {
      classId,
      date: today,
      records: [
        { studentId, status: 'P', notes: 'Presença confirmada' },
      ],
      generalNotes: 'Aula inaugural do módulo',
    };

    // 3. Batch Attendance with x-idempotency-key (Initial call)
    const attRes1 = await request(env, '/api/v1/attendance', {
      method: 'POST',
      token,
      headers: { 'x-idempotency-key': 'idem-att-key-001' },
      body: attendancePayload,
    });
    expect(attRes1.status).toBe(201);
    expect(attRes1.data.items.length).toBe(1);
    expect(attRes1.data.items[0].status).toBe('P');
    expect(attRes1.headers.get('x-idempotency')).toBeNull();

    // 4. Batch Attendance with SAME x-idempotency-key and SAME body (Replay)
    const attResReplay = await request(env, '/api/v1/attendance', {
      method: 'POST',
      token,
      headers: { 'x-idempotency-key': 'idem-att-key-001' },
      body: attendancePayload,
    });
    expect(attResReplay.status).toBe(201);
    expect(attResReplay.headers.get('x-idempotency')).toBe('replay');
    expect(attResReplay.data.items.length).toBe(1);
    expect(attResReplay.data.items[0].status).toBe('P');

    // 5. Batch Attendance with SAME x-idempotency-key but DIFFERENT body (Mismatch)
    const attResMismatch = await request(env, '/api/v1/attendance', {
      method: 'POST',
      token,
      headers: { 'x-idempotency-key': 'idem-att-key-001' },
      body: {
        ...attendancePayload,
        generalNotes: 'Notas alteradas que causam divergência de hash',
      },
    });
    expect(attResMismatch.status).toBe(422);
    expect(attResMismatch.data.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect(attResMismatch.data.error.message).toBe('Esta chave de idempotência já foi utilizada com parâmetros diferentes.');

    // 6. Manual Cash Entry with x-idempotency-key
    const cashPayload = {
      type: 'entrada',
      amountCents: 25000,
      date: today,
      category: 'Doação',
      description: 'Doação recebida para laboratório',
      paymentMethod: 'PIX',
    };

    const cashRes1 = await request(env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token,
      headers: { 'x-idempotency-key': 'idem-cash-key-999' },
      body: cashPayload,
    });
    expect(cashRes1.status).toBe(201);

    // Verify 1 cash transaction was written
    const cashCount1 = rawDb.prepare(`SELECT COUNT(*) as count FROM cash_transactions WHERE category = 'Doação'`).get() as { count: number };
    expect(cashCount1.count).toBe(1);

    // Replay Cash Entry
    const cashResReplay = await request(env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token,
      headers: { 'x-idempotency-key': 'idem-cash-key-999' },
      body: cashPayload,
    });
    expect(cashResReplay.status).toBe(201);
    expect(cashResReplay.headers.get('x-idempotency')).toBe('replay');

    // Verify no duplicate row was created in cash_transactions!
    const cashCount2 = rawDb.prepare(`SELECT COUNT(*) as count FROM cash_transactions WHERE category = 'Doação'`).get() as { count: number };
    expect(cashCount2.count).toBe(1);
  });
});
