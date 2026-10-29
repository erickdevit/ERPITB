import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';

class D1PreparedStatementImpl {
  constructor(private db: DatabaseSync, private sql: string, private params: any[] = []) {}
  bind(...params: unknown[]) {
    return new D1PreparedStatementImpl(this.db, this.sql, params as any[]);
  }
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
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

class D1DatabaseImpl {
  constructor(public rawDb: DatabaseSync) {}
  prepare(sql: string) {
    return new D1PreparedStatementImpl(this.rawDb, sql);
  }
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
  async exec(sql: string) {
    this.rawDb.exec(sql);
    return { count: 1, duration: 0 };
  }
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

function createStreamCollector(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let running = true;

  const loop = (async () => {
    try {
      while (running) {
        const res = await reader.read();
        if (res.done) break;
        chunks.push(decoder.decode(res.value));
      }
    } catch {
      // Stream cancelled
    }
  })();

  return {
    chunks,
    async waitForChunk(predicate: (c: string) => boolean, timeoutMs = 400): Promise<string | null> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = chunks.find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 15));
      }
      return chunks.find(predicate) ?? null;
    },
    async close() {
      running = false;
      await reader.cancel().catch(() => {});
      await loop.catch(() => {});
    },
  };
}

describe('R2 & R5: Multi-Client Concurrency Isolation & Public Boletim Routes', () => {
  it('isolates SSE streams so Professor A attendance registration does NOT trigger events on Professor B or Financeiro', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap Admin
    const bootRes = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: JSON.stringify({
          name: 'Admin Root',
          email: 'admin.isolation@itbcursos.com',
          password: 'Password@123',
        }),
      }),
      env,
    );
    const { accessToken: adminToken } = (await bootRes.json()) as { accessToken: string };

    // 2. Create Professor A, Professor B, and Financeiro
    const createUser = async (name: string, email: string, role: string) => {
      const res = await worker.fetch(
        new Request('https://erp.itbcursos.com/api/v1/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ name, email, password: 'Password@123', role }),
        }),
        env,
      );
      expect([200, 201]).toContain(res.status);
      const user = (await res.json()) as { id: string };
      const loginRes = await worker.fetch(
        new Request('https://erp.itbcursos.com/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'Password@123' }),
        }),
        env,
      );
      const loginData = (await loginRes.json()) as { accessToken: string };
      return { id: user.id, token: loginData.accessToken };
    };

    const profA = await createUser('Prof A', 'profa@itbcursos.com', 'professor');
    const profB = await createUser('Prof B', 'profb@itbcursos.com', 'professor');
    const finUser = await createUser('Fin User', 'fin@itbcursos.com', 'financeiro');

    // 3. Create Course, Class A (assigned to Prof A), Class B (assigned to Prof B)
    const courseRes = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/courses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ code: 'INF-01', name: 'Informática Essencial' }),
      }),
      env,
    );
    const course = (await courseRes.json()) as { id: string };

    const classARes = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/classes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          courseId: course.id,
          name: 'Turma A Manhã',
          shift: 'manha',
          teacherId: profA.id,
        }),
      }),
      env,
    );
    const classA = (await classARes.json()) as { id: string };

    const classBRes = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/classes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          courseId: course.id,
          name: 'Turma B Noite',
          shift: 'noite',
          teacherId: profB.id,
        }),
      }),
      env,
    );
    const classB = (await classBRes.json()) as { id: string };

    // Enroll a student in Class A
    const studentARes = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/students', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Aluno Turma A',
          registrationNumber: 'MAT-ISO-001',
          classId: classA.id,
        }),
      }),
      env,
    );
    const studentA = (await studentARes.json()) as { id: string };

    // 4. Connect SSE streams for Prof B, Financeiro, and Admin
    const sseProfB = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/events', {
        headers: { authorization: `Bearer ${profB.token}` },
      }),
      env,
    );
    const sseFin = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/events', {
        headers: { authorization: `Bearer ${finUser.token}` },
      }),
      env,
    );
    const sseAdmin = await worker.fetch(
      new Request('https://erp.itbcursos.com/api/v1/events', {
        headers: { authorization: `Bearer ${adminToken}` },
      }),
      env,
    );

    const colProfB = createStreamCollector(sseProfB.body!);
    const colFin = createStreamCollector(sseFin.body!);
    const colAdmin = createStreamCollector(sseAdmin.body!);

    try {
      // Drain initial connected preamble from all 3 streams
      expect(await colProfB.waitForChunk((c) => c.includes(': connected'))).toContain(': connected');
      expect(await colFin.waitForChunk((c) => c.includes(': connected'))).toContain(': connected');
      expect(await colAdmin.waitForChunk((c) => c.includes(': connected'))).toContain(': connected');

      colProfB.chunks.length = 0;
      colFin.chunks.length = 0;
      colAdmin.chunks.length = 0;

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

      // 5. Prof A registers attendance on Class A via POST /api/v1/entities/batch
      const batchRes = await worker.fetch(
        new Request('https://erp.itbcursos.com/api/v1/entities/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${profA.token}` },
          body: JSON.stringify({
            deviceId: 'device-prof-a',
            operations: [
              {
                operationId: 'op-att-a-1',
                entity: 'attendance_records',
                action: 'upsert',
                id: 'att-iso-1',
                baseVersion: 0,
                updatedAt: new Date().toISOString(),
                data: {
                  class_id: classA.id,
                  student_id: studentA.id,
                  date: today,
                  status: 'P',
                  notes: 'Presente na Turma A',
                },
              },
            ],
          }),
        }),
        env,
      );
      expect([200, 201]).toContain(batchRes.status);

      // Admin stream receives the scoped entity_changed event with classId & entities
      const adminChunk = await colAdmin.waitForChunk((c) => c.includes('event: entity_changed'));
      expect(adminChunk).toContain('event: entity_changed');
      expect(adminChunk).toContain('"entity":"attendance_records"');
      expect(adminChunk).toContain(`"classId":"${classA.id}"`);
      expect(adminChunk).toContain(`"userId":"${profA.id}"`);

      // Wait briefly to confirm Prof B and Financeiro receive ZERO events
      await new Promise((r) => setTimeout(r, 80));
      expect(colProfB.chunks).toHaveLength(0);
      expect(colFin.chunks).toHaveLength(0);

      // 6. Verify public boletim alias routes (/boletim/:code, /public/student/:code)
      const publicBoletimRes = await worker.fetch(
        new Request('https://erp.itbcursos.com/boletim/MAT-ISO-001', {
          headers: { Accept: 'application/json' },
        }),
        env,
      );
      expect(publicBoletimRes.status).toBe(200);
      const publicPayload = (await publicBoletimRes.json()) as { student: { name: string } };
      expect(publicPayload.student.name).toBe('Aluno Turma A');

      // 7. Verify immediate user cache invalidation when Admin disables FinUser
      const disableRes = await worker.fetch(
        new Request(`https://erp.itbcursos.com/api/v1/users/${finUser.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ active: false }),
        }),
        env,
      );
      expect(disableRes.status).toBe(200);

      // FinUser receives session_revoked immediately on SSE
      const revokeChunk = await colFin.waitForChunk((c) => c.includes('event: session_revoked'));
      expect(revokeChunk).toContain('event: session_revoked');

      // FinUser's cached JWT is rejected immediately on the next HTTP call without waiting 60s
      const afterDisableRes = await worker.fetch(
        new Request(`https://erp.itbcursos.com/api/v1/finance/fees`, {
          headers: { authorization: `Bearer ${finUser.token}` },
        }),
        env,
      );
      expect(afterDisableRes.status).toBe(401);
    } finally {
      await colProfB.close();
      await colFin.close();
      await colAdmin.close();
    }
  });
});
