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

describe('Branding, API Keys, Sessions and Enrollment Locking', () => {
  it('manages branding, creates machine API keys with granular scopes, and locks enrollments', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap Admin
    const bootstrapRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'StrongPassword123!' },
    });
    const adminToken = bootstrapRes.data.accessToken;

    // 2. Branding: Get default branding without auth (public)
    const publicBranding = await request(env, '/api/v1/admin/branding');
    expect(publicBranding.status).toBe(200);
    expect(publicBranding.data.appName).toBe('ERPITB');
    expect(publicBranding.data.accentColor).toBe('#102A43');

    // 3. Branding: Update branding as admin
    const updateBrandingRes = await request(env, '/api/v1/admin/branding', {
      method: 'PUT',
      token: adminToken,
      body: {
        appName: 'Instituto Transforma Brasil',
        accentColor: '#0055A5',
        printWatermarkText: 'DOCUMENTO OFICIAL ITB',
        printWatermarkGrayscale: false,
        showHeaderLogoLeft: true,
        showHeaderLogoRight: true,
      },
    });
    expect(updateBrandingRes.status).toBe(200);
    expect(updateBrandingRes.data.appName).toBe('Instituto Transforma Brasil');
    expect(updateBrandingRes.data.accentColor).toBe('#0055A5');
    expect(updateBrandingRes.data.printWatermarkGrayscale).toBe(false);

    // Branding: Contrast rejection (too light)
    const badContrastRes = await request(env, '/api/v1/admin/branding', {
      method: 'PUT',
      token: adminToken,
      body: { accentColor: '#FEFEFE' },
    });
    expect(badContrastRes.status).toBe(400);

    // 4. API Keys: Admin creates machine API key with granular scopes
    const createKeyRes = await request(env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Integração Portal Externo',
        scopes: ['students:read', 'finance:read'],
      },
    });
    expect(createKeyRes.status).toBe(201);
    expect(createKeyRes.data.secret).toMatch(/^itb_live_/);
    const rawSecret = createKeyRes.data.secret;
    const apiKeyId = createKeyRes.data.key.id;

    // List API keys: secret is NOT returned in list!
    const listKeysRes = await request(env, '/api/v1/admin/api-keys', {
      method: 'GET',
      token: adminToken,
    });
    expect(listKeysRes.status).toBe(200);
    expect(listKeysRes.data.items[0].keyPrefix).toBe(rawSecret.slice(0, 16));
    expect(listKeysRes.data.items[0].secret).toBeUndefined();

    // 5. Machine Authentication with API Key
    // Authenticate machine client via x-api-key header for allowed scope (finance:read)
    const machineFinRes = await request(env, '/api/v1/finance/fees', {
      method: 'GET',
      headers: { 'x-api-key': rawSecret },
    });
    expect(machineFinRes.status).toBe(200);

    // Machine client tries operation outside its scope (finance:write) => 403 Forbidden!
    const machineDisallowedRes = await request(env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      headers: { 'x-api-key': rawSecret },
      body: { type: 'entrada', amountCents: 1000, date: '2026-10-24', category: 'X', description: 'Y', paymentMethod: 'PIX' },
    });
    expect(machineDisallowedRes.status).toBe(403);

    // 6. Rotate API key
    const rotateRes = await request(env, `/api/v1/admin/api-keys/${apiKeyId}/rotate`, {
      method: 'POST',
      token: adminToken,
    });
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.data.secret).toMatch(/^itb_live_/);
    const newSecret = rotateRes.data.secret;

    // Old secret now fails (revoked)
    const oldSecretTry = await request(env, '/api/v1/finance/fees', {
      method: 'GET',
      headers: { 'x-api-key': rawSecret },
    });
    expect(oldSecretTry.status).toBe(401);

    // New secret succeeds
    const newSecretTry = await request(env, '/api/v1/finance/fees', {
      method: 'GET',
      headers: { 'x-api-key': newSecret },
    });
    expect(newSecretTry.status).toBe(200);

    // 7. Lock enrollment (Trancar matrícula)
    // Create class and student
    const courseRes = await request(env, '/api/courses', {
      method: 'POST', token: adminToken, body: { name: 'Curso Teste' },
    });
    const classRes = await request(env, '/api/classes', {
      method: 'POST', token: adminToken, body: { courseId: courseRes.data.id, name: 'Turma B', shift: 'tarde' },
    });
    const studentRes = await request(env, '/api/students', {
      method: 'POST',
      token: adminToken,
      body: { classId: classRes.data.id, name: 'Aluno Bloqueavel', registrationNumber: 'ITB-LOCK-1' },
    });
    const studentId = studentRes.data.id;

    // Lock student enrollment
    const lockRes = await request(env, `/api/v1/students/${studentId}/lock`, {
      method: 'POST',
      token: adminToken,
    });
    expect(lockRes.status).toBe(200);
    expect(lockRes.data.ok).toBe(true);
  });
});
