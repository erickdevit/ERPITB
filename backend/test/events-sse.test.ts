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

describe('Real-Time SSE Stream Endpoint (/api/v1/events)', () => {
  it('rejects unauthenticated requests with HTTP 401', async () => {
    const { env } = createTestEnvironment();
    const unauthReq = new Request('https://erp.itbcursos.com/api/v1/events');
    const unauthRes = await worker.fetch(unauthReq, env);
    expect(unauthRes.status).toBe(401);
  });

  it('streams keep-alives and genuinely broadcasts real-time events triggered by API mutations', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap admin
    const bootReq = new Request('https://erp.itbcursos.com/api/auth/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-secret': env.BOOTSTRAP_SECRET,
      },
      body: JSON.stringify({
        name: 'Admin SSE',
        email: 'admin.sse@itbcursos.com',
        password: 'Password@123',
      }),
    });
    const bootRes = await worker.fetch(bootReq, env);
    const { accessToken: token } = (await bootRes.json()) as { accessToken: string };

    // 2. Connect to SSE stream — AUTHENTIC URL WITHOUT ?test=true
    const sseReq = new Request('https://erp.itbcursos.com/api/v1/events', {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const sseRes = await worker.fetch(sseReq, env);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');
    expect(sseRes.headers.get('cache-control')).toContain('no-cache');

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();

    try {
      // 3. Read initial connected preamble & ping heartbeat
      const chunk1 = await reader.read();
      expect(chunk1.done).toBe(false);
      const text1 = decoder.decode(chunk1.value);
      expect(text1).toContain(': connected');
      expect(text1).toContain(': keep-alive');
      expect(text1).toContain('event: ping');

      // 4. Perform genuine API mutation: Update Branding
      const brandReq = new Request('https://erp.itbcursos.com/api/v1/admin/branding', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          appName: 'ITB Realtime Portal',
          accentColor: '#102A43',
        }),
      });
      const brandRes = await worker.fetch(brandReq, env);
      expect(brandRes.status).toBe(200);

      // Read chunk from SSE stream — verifies authentic real-time reception!
      const chunk2 = await reader.read();
      expect(chunk2.done).toBe(false);
      const text2 = decoder.decode(chunk2.value);
      expect(text2).toContain('event: branding_updated');
      expect(text2).toContain('ITB Realtime Portal');

      // 5. Perform genuine API mutation: Create Course & Class
      const courseRes = await worker.fetch(new Request('https://erp.itbcursos.com/api/v1/courses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: 'ADM101', name: 'Administração Básica' }),
      }), env);
      expect([200, 201]).toContain(courseRes.status);
      const courseData = (await courseRes.json()) as { id: string };

      const classRes = await worker.fetch(new Request('https://erp.itbcursos.com/api/v1/classes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseId: courseData.id,
          name: 'Turma SSE Realtime',
          shift: 'noite',
          weekDay: 'terca',
        }),
      }), env);
      expect([200, 201]).toContain(classRes.status);

      // Read chunk from SSE stream — verifies entity_changed
      const chunk3 = await reader.read();
      expect(chunk3.done).toBe(false);
      const text3 = decoder.decode(chunk3.value);
      expect(text3).toContain('event: entity_changed');

      // 6. Perform genuine API mutation: Revoke Session via Logout
      const loginRes = await worker.fetch(new Request('https://erp.itbcursos.com/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin.sse@itbcursos.com', password: 'Password@123' }),
      }), env);
      const loginData = (await loginRes.json()) as { refreshToken: string };

      const logoutReq = new Request('https://erp.itbcursos.com/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ refreshToken: loginData.refreshToken }),
      });
      const logoutRes = await worker.fetch(logoutReq, env);
      expect(logoutRes.status).toBe(200);

      // Read chunk from SSE stream — verifies session_revoked event
      const chunk4 = await reader.read();
      expect(chunk4.done).toBe(false);
      const text4 = decoder.decode(chunk4.value);
      expect(text4).toContain('event: session_revoked');
    } finally {
      // 7. Clean up connection without memory leak
      await reader.cancel();
    }
  });

  it('replays missed events when connecting with ?since= timestamp parameter', async () => {
    const { env } = createTestEnvironment();

    const bootRes = await worker.fetch(new Request('https://erp.itbcursos.com/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: JSON.stringify({ name: 'Admin SSE 2', email: 'admin.sse2@itbcursos.com', password: 'Password@123' }),
    }), env);
    const { accessToken: token } = (await bootRes.json()) as { accessToken: string };

    // Mutate branding before client connects
    await worker.fetch(new Request('https://erp.itbcursos.com/api/v1/admin/branding', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ appName: 'ERPITB Replay Test', accentColor: '#102A43' }),
    }), env);

    // Client connects requesting events since 2026-01-01
    const sseReq = new Request('https://erp.itbcursos.com/api/v1/events?since=2026-01-01T00:00:00.000Z', {
      headers: { authorization: `Bearer ${token}` },
    });
    const sseRes = await worker.fetch(sseReq, env);
    expect(sseRes.status).toBe(200);

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();

    try {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      const text = decoder.decode(chunk.value);
      expect(text).toContain(': connected');
      expect(text).toContain('event: branding_updated');
      expect(text).toContain('ERPITB Replay Test');
    } finally {
      await reader.cancel();
    }
  });
});
