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
): Promise<{ status: number; data: any; headers: Headers; rawBody: string }> {
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
  const rawBody = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(rawBody);
  } catch {}
  return { status: res.status, data, headers: res.headers, rawBody };
}

describe('Empirical Challenger: Milestone 1 Backend Core & Security', () => {
  // Setup helper: bootstrap admin, course, class, student
  async function setupBase(env: Env) {
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Root', email: 'admin.root@itbcursos.com', password: 'Password@123' },
    });
    const adminToken = bootRes.data.accessToken;

    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Robótica Básica', workloadHours: 60 },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token: adminToken,
      body: { courseId, name: 'Turma RB-2026', shift: 'manha' },
    });
    const classId = classRes.data.id;

    const studentRes = await request(env, '/api/v1/students', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Aluno Teste Alpha',
        registrationNumber: 'ITB-2026-ALPHA',
        classId,
        cpf: '111.222.333-44',
      },
    });
    const studentId = studentRes.data.id;

    return { adminToken, courseId, classId, studentId };
  }

  // ============================================================
  // 1. ADVERSARIAL OPTIMISTIC CONCURRENCY TESTS
  // ============================================================
  describe('1. Optimistic Concurrency Control', () => {
    it('1.1 Verifies exact HTTP 409 Conflict with serverVersion on mismatched If-Match', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // Current version is 1
      const res = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': 'W/"99"' },
        body: { name: 'Novo Nome Stale' },
      });

      expect(res.status).toBe(409);
      expect(res.data).toEqual({
        ok: false,
        error: 'Registro foi modificado concorrentemente por outro usuário.',
        code: 'CONCURRENCY_CONFLICT',
        serverVersion: 1,
      });
    });

    it('1.2 Verifies exact HTTP 409 on unquoted numeric If-Match mismatch and un-prefixed If-Match', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // Unquoted 999
      const res1 = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': '999' },
        body: { name: 'Novo Nome Unquoted' },
      });
      expect(res1.status).toBe(409);
      expect(res1.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(res1.data.serverVersion).toBe(1);

      // Quoted without weak tag: "999"
      const res2 = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': '"999"' },
        body: { name: 'Novo Nome Quoted' },
      });
      expect(res2.status).toBe(409);
      expect(res2.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(res2.data.serverVersion).toBe(1);
    });

    it('1.3 Missing If-Match allows unconditional mutation and increments version', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // No If-Match header provided
      const res = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: 'Novo Nome Sem If-Match' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');

      // Verify GET returns updated ETag W/"2"
      const getRes = await request(env, `/api/v1/students/${studentId}`, {
        method: 'GET',
        token: adminToken,
      });
      expect(getRes.headers.get('etag')).toBe('W/"2"');
    });

    it('1.4 Malformed / Invalid If-Match (NaN or empty) is treated as null / unconditional', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // Malformed string "invalid-etag"
      const res1 = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': 'invalid-etag' },
        body: { name: 'Update With Invalid ETag' },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get('etag')).toBe('W/"2"');

      // Empty string
      const res2 = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': '' },
        body: { name: 'Update With Empty ETag' },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get('etag')).toBe('W/"3"');
    });

    it('1.5 Concurrency across multiple entities: grade-tables, grade-items, replacements, enrollments', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, classId, studentId } = await setupBase(env);

      // Create Grade Table
      const gtRes = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        token: adminToken,
        body: { classId, name: 'Avaliações Trimestre 1' },
      });
      expect(gtRes.status).toBe(201);
      const gtId = gtRes.data.id;

      // Grade table update with mismatched If-Match
      const gtConflict = await request(env, `/api/v1/grade-tables/${gtId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': 'W/"42"' },
        body: { name: 'Conflito' },
      });
      expect(gtConflict.status).toBe(409);
      expect(gtConflict.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(gtConflict.data.serverVersion).toBe(1);

      // Create Grade Item
      const giRes = await request(env, '/api/v1/grade-items', {
        method: 'POST',
        token: adminToken,
        body: { classId, gradeTableId: gtId, name: 'Prova 1', maxScore: 10, weight: 1 },
      });
      expect(giRes.status).toBe(201);
      const giId = giRes.data.id;

      // Grade item update with mismatched If-Match
      const giConflict = await request(env, `/api/v1/grade-items/${giId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': 'W/"42"' },
        body: { name: 'Item Conflito' },
      });
      expect(giConflict.status).toBe(409);
      expect(giConflict.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(giConflict.data.serverVersion).toBe(1);

      // Schedule Replacement
      const attId = 'att-rec-uuid-1';
      const repRes = await request(env, '/api/v1/replacements', {
        method: 'POST',
        token: adminToken,
        body: {
          attendanceRecordId: attId,
          classId,
          studentId,
          attendanceDate: '2026-10-20',
          scheduledDate: '2026-10-25',
          scheduledTime: '14:00',
        },
      });
      expect(repRes.status).toBe(201);
      const repId = repRes.data.id;

      // Replacement update with mismatched If-Match
      const repConflict = await request(env, `/api/v1/replacements/${repId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': 'W/"42"' },
        body: { notes: 'Tentativa de alteração conflitante' },
      });
      expect(repConflict.status).toBe(409);
      expect(repConflict.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(repConflict.data.serverVersion).toBe(1);

      // Replacement complete with mismatched If-Match
      const repCompleteConflict = await request(env, `/api/v1/replacements/${repId}/complete`, {
        method: 'POST',
        token: adminToken,
        headers: { 'If-Match': 'W/"42"' },
        body: { completedAt: '2026-10-25T15:00:00Z' },
      });
      expect(repCompleteConflict.status).toBe(409);
      expect(repCompleteConflict.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(repCompleteConflict.data.serverVersion).toBe(1);
    });

    it('1.6 Simultaneous sequential race simulation: second mutator with stale ETag is rejected with 409', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // User A reads student (version 1)
      const userA_read = await request(env, `/api/v1/students/${studentId}`, { method: 'GET', token: adminToken });
      const versionA = userA_read.headers.get('etag');
      expect(versionA).toBe('W/"1"');

      // User B reads student (version 1)
      const userB_read = await request(env, `/api/v1/students/${studentId}`, { method: 'GET', token: adminToken });
      const versionB = userB_read.headers.get('etag');
      expect(versionB).toBe('W/"1"');

      // User A commits first mutation
      const userA_mutate = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': versionA! },
        body: { name: 'Alterado por Usuário A' },
      });
      expect(userA_mutate.status).toBe(200);
      expect(userA_mutate.headers.get('etag')).toBe('W/"2"');

      // User B attempts to commit mutation with stale version 1
      const userB_mutate = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        token: adminToken,
        headers: { 'If-Match': versionB! },
        body: { name: 'Alterado por Usuário B' },
      });
      expect(userB_mutate.status).toBe(409);
      expect(userB_mutate.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(userB_mutate.data.serverVersion).toBe(2);
    });

    it('1.7 Concurrent in-flight parallel mutations with same If-Match via Promise.all', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, studentId } = await setupBase(env);

      // Both requests send If-Match: W/"1" concurrently
      const [resA, resB] = await Promise.all([
        request(env, `/api/v1/students/${studentId}`, {
          method: 'PATCH',
          token: adminToken,
          headers: { 'If-Match': 'W/"1"' },
          body: { name: 'Nome Mutante Alpha' },
        }),
        request(env, `/api/v1/students/${studentId}`, {
          method: 'PATCH',
          token: adminToken,
          headers: { 'If-Match': 'W/"1"' },
          body: { name: 'Nome Mutante Beta' },
        }),
      ]);

      console.log('CONCURRENT RES A:', resA.status, resA.data?.code);
      console.log('CONCURRENT RES B:', resB.status, resB.data?.code);
      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(409);
      expect(statuses).toContain(200);
    });
  });

  // ============================================================
  // 2. ADVERSARIAL IDEMPOTENCY TESTS
  // ============================================================
  describe('2. Idempotency Engine Middleware', () => {
    it('2.1 Replays identical cash entry with x-idempotency: replay header', async () => {
      const { env, rawDb } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      const cashPayload = {
        type: 'entrada',
        amountCents: 15000,
        date: '2026-10-24',
        category: 'Doação',
        description: 'Doação para material didático',
        paymentMethod: 'PIX',
      };

      // Call 1: initial submission
      const res1 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'idem-test-key-1' },
        body: cashPayload,
      });
      expect(res1.status).toBe(201);
      expect(res1.headers.get('x-idempotency')).toBeNull();

      // Call 2: exact replay
      const res2 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'idem-test-key-1' },
        body: cashPayload,
      });
      expect(res2.status).toBe(201);
      expect(res2.headers.get('x-idempotency')).toBe('replay');
      expect(res2.data.id).toBe(res1.data.id);

      // Verify DB count is exactly 1 (no duplicate insertion)
      const countRow = rawDb.prepare(`SELECT COUNT(*) as count FROM cash_transactions WHERE category = 'Doação'`).get() as { count: number };
      expect(countRow.count).toBe(1);
    });

    it('2.2 Rejects altered payload on same idempotency key with HTTP 422 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      const { env } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      const payload1 = {
        type: 'entrada',
        amountCents: 10000,
        date: '2026-10-24',
        category: 'Mensalidade',
        description: 'Mensalidade de Outubro',
        paymentMethod: 'dinheiro',
      };

      // First call
      const res1 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'idem-mismatch-key-2' },
        body: payload1,
      });
      expect(res1.status).toBe(201);

      // Second call with altered amountCents
      const res2 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'idem-mismatch-key-2' },
        body: { ...payload1, amountCents: 20000 },
      });
      expect(res2.status).toBe(422);
      expect(res2.data.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
      expect(res2.data.error.message).toContain('Esta chave de idempotência já foi utilizada com parâmetros diferentes.');
    });

    it('2.3 Supports idempotency-key header (standard RFC header without x- prefix)', async () => {
      const { env } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      const payload = {
        type: 'saida',
        amountCents: 5000,
        date: '2026-10-24',
        category: 'Material de Limpeza',
        description: 'Compra de desinfetante e sabão',
        paymentMethod: 'PIX',
      };

      const res1 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'idempotency-key': 'idem-std-key-3' },
        body: payload,
      });
      expect(res1.status).toBe(201);

      const res2 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'idempotency-key': 'idem-std-key-3' },
        body: payload,
      });
      expect(res2.status).toBe(201);
      expect(res2.headers.get('x-idempotency')).toBe('replay');
    });

    it('2.4 Cross-user idempotency collision inspection', async () => {
      const { env, rawDb } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      // Create a second admin/financial user
      await request(env, '/api/v1/users', {
        method: 'POST',
        token: adminToken,
        body: { name: 'User 2', email: 'user2@itbcursos.com', role: 'admin', password: 'Password@123' },
      });
      const login2 = await request(env, '/api/auth/login', {
        method: 'POST',
        body: { email: 'user2@itbcursos.com', password: 'Password@123' },
      });
      const tokenUser2 = login2.data.accessToken;

      const payloadUser1 = {
        type: 'entrada',
        amountCents: 11111,
        date: '2026-10-24',
        category: 'Doação',
        description: 'User 1 donation',
        paymentMethod: 'PIX',
      };

      const payloadUser2 = {
        type: 'entrada',
        amountCents: 22222,
        date: '2026-10-24',
        category: 'Doação',
        description: 'User 2 donation',
        paymentMethod: 'PIX',
      };

      // User 1 uses key 'shared-idem-key'
      const resUser1 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'shared-idem-key' },
        body: payloadUser1,
      });
      expect(resUser1.status).toBe(201);

      // User 2 uses SAME key 'shared-idem-key' with their own payload
      const resUser2 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: tokenUser2,
        headers: { 'x-idempotency-key': 'shared-idem-key' },
        body: payloadUser2,
      });
      expect(resUser2.status).toBe(201);

      // User 1 replays their original request with payloadUser1
      const replayUser1 = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': 'shared-idem-key' },
        body: payloadUser1,
      });

      // Let's inspect the database row for 'shared-idem-key'
      const keyRow = rawDb.prepare(`SELECT * FROM idempotency_keys WHERE key = 'shared-idem-key'`).get() as any;
      console.log('IDEMPOTENCY ROW:', keyRow);
      console.log('REPLAY DATA FOR USER 1:', replayUser1.data);
      expect(replayUser1.status).toBe(201);
      // User 1 must receive their own cached response (amountCents: 11111), NOT User 2's (22222)!
      expect(replayUser1.data.amountCents).toBe(11111);
    });
  });

  // ============================================================
  // 3. SSE STREAM LIFECYCLE TESTS
  // ============================================================
  describe('3. SSE Stream Lifecycle (/api/v1/events)', () => {
    it('3.1 Rejects unauthenticated SSE connection with HTTP 401', async () => {
      const { env } = createTestEnvironment();
      const unauthReq = new Request('https://erp.itbcursos.com/api/v1/events');
      const unauthRes = await worker.fetch(unauthReq, env);
      expect(unauthRes.status).toBe(401);
    });

    it('3.2 Emits connected header, keep-alive, ping heartbeat, and live broadcast events', async () => {
      const { env } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      const sseReq = new Request('https://erp.itbcursos.com/api/v1/events', {
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const sseRes = await worker.fetch(sseReq, env);
      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(sseRes.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(sseRes.headers.get('connection')).toBe('keep-alive');

      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      try {
        const chunk1 = await reader.read();
        const text1 = decoder.decode(chunk1.value);
        expect(text1).toContain(': connected\n\n');
        expect(text1).toContain(': keep-alive\n\n');
        expect(text1).toContain('event: ping');

        // Trigger authentic mutation
        await request(env, '/api/v1/admin/branding', {
          method: 'PUT',
          token: adminToken,
          body: { appName: 'Adversarial Live Test', accentColor: '#102A43' },
        });

        const chunk2 = await reader.read();
        const text2 = decoder.decode(chunk2.value);
        expect(text2).toContain('event: branding_updated');
        expect(text2).toContain('Adversarial Live Test');
      } finally {
        await reader.cancel();
      }
    });

    it('3.3 Handles client cancellation / early termination cleanly without memory leak', async () => {
      const { env } = createTestEnvironment();
      const { adminToken } = await setupBase(env);

      const sseReq = new Request('https://erp.itbcursos.com/api/v1/events', {
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const sseRes = await worker.fetch(sseReq, env);
      expect(sseRes.body).toBeDefined();

      const reader = sseRes.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      expect(firstChunk.value).toBeDefined();

      // Client closes connection early
      await reader.cancel('Client disconnected');
      const nextRead = await reader.read();
      expect(nextRead.done).toBe(true);
    });
  });

  // ============================================================
  // 4. RBAC STRICT READ ISOLATION FOR FINANCEIRO
  // ============================================================
  describe('4. RBAC Read Isolation for Financeiro', () => {
    async function setupFinanceiro(env: Env) {
      const { adminToken, classId, studentId, courseId } = await setupBase(env);

      // Create financeiro user
      await request(env, '/api/v1/users', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Fiscal Financeiro',
          email: 'fiscal@itbcursos.com',
          role: 'financeiro',
          password: 'Password@123',
        },
      });

      const loginRes = await request(env, '/api/auth/login', {
        method: 'POST',
        body: { email: 'fiscal@itbcursos.com', password: 'Password@123' },
      });
      const finToken = loginRes.data.accessToken;

      return { adminToken, finToken, classId, studentId, courseId };
    }

    it('4.1 Rejects financeiro on /api/v1/attendance with HTTP 403 Forbidden', async () => {
      const { env } = createTestEnvironment();
      const { finToken, classId } = await setupFinanceiro(env);

      const res = await request(env, `/api/v1/attendance?classId=${classId}`, {
        method: 'GET',
        token: finToken,
      });
      expect(res.status).toBe(403);
      expect(res.data.error.code).toBe('FORBIDDEN');
      expect(res.data.error.message).toBe('Acesso restrito ao corpo docente e pedagógico.');
    });

    it('4.2 Rejects financeiro on /api/v1/grade-tables with HTTP 403 Forbidden', async () => {
      const { env } = createTestEnvironment();
      const { finToken, classId } = await setupFinanceiro(env);

      const res = await request(env, `/api/v1/grade-tables?classId=${classId}`, {
        method: 'GET',
        token: finToken,
      });
      expect(res.status).toBe(403);
      expect(res.data.error.code).toBe('FORBIDDEN');
      expect(res.data.error.message).toBe('Acesso restrito ao corpo docente e pedagógico.');
    });

    it('4.3 Rejects financeiro on /api/v1/student-grades with HTTP 403 Forbidden', async () => {
      const { env } = createTestEnvironment();
      const { finToken, classId } = await setupFinanceiro(env);

      const res = await request(env, `/api/v1/student-grades?classId=${classId}`, {
        method: 'GET',
        token: finToken,
      });
      expect(res.status).toBe(403);
      expect(res.data.error.code).toBe('FORBIDDEN');
      expect(res.data.error.message).toBe('Acesso restrito ao corpo docente e pedagógico.');
    });

    it('4.4 Empirically tests /sync/pull behavior with financeiro token', async () => {
      const { env } = createTestEnvironment();
      const { adminToken, finToken, classId, studentId } = await setupFinanceiro(env);

      // Create attendance and grade entries as admin (these generate sync_changes)
      await request(env, '/api/v1/attendance', {
        method: 'POST',
        token: adminToken,
        body: {
          classId,
          date: '2026-10-24',
          records: [{ studentId, status: 'P', notes: 'Presença confirmada' }],
        },
      });

      // Call /sync/pull as financeiro -> DISPATCH specifies HTTP 403 Forbidden
      const pullRes = await request(env, '/api/sync/pull?cursor=0', {
        method: 'GET',
        token: finToken,
      });

      expect(pullRes.status).toBe(403);
      expect(pullRes.data.error.code).toBe('FORBIDDEN');
    });

    it('4.5 Confirms financeiro CAN read financial fees and cash without errors', async () => {
      const { env } = createTestEnvironment();
      const { finToken } = await setupFinanceiro(env);

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
    });
  });
});
