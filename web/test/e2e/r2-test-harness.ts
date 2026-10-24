import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../../../backend/src/index';
import type { Env, Role } from '../../../backend/src/types';
import { ApiClient } from '../../src/lib/api';
import type { UserSession } from '../../src/types';

// Ensure localStorage exists in test environment
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as unknown as Storage;
}

export class D1PreparedStatementImpl {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private params: any[] = [],
  ) {}

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
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

export class D1DatabaseImpl {
  constructor(public rawDb: DatabaseSync) {}

  prepare(sql: string) {
    return new D1PreparedStatementImpl(this.rawDb, sql);
  }

  async batch(statements: D1PreparedStatementImpl[]) {
    this.rawDb.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
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

export interface TestContext {
  env: Env;
  rawDb: DatabaseSync;
  adminToken: string;
  financeToken: string;
  profToken: string;
  pedagogicToken: string;
  adminUser: { id: string; email: string };
  financeUser: { id: string; email: string };
  profUser: { id: string; email: string };
  pedagogicUser: { id: string; email: string };
  courseId: string;
  classId: string;
  studentId: string;
  enrollmentId: string;
}

import { resolve } from 'node:path';

export function createTestEnvironment(): { env: Env; rawDb: DatabaseSync } {
  const rawDb = new DatabaseSync(':memory:');
  const schemaPath = resolve(process.cwd(), '../backend/src/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
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

export async function request(
  env: Env,
  path: string,
  options: {
    method?: string;
    token?: string;
    apiKey?: string;
    idempotencyKey?: string;
    ifMatch?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; data: any; headers: Headers }> {
  const url = `https://erp.itbcursos.com${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
  }
  if (options.apiKey) {
    headers.set('x-api-key', options.apiKey);
  }
  if (options.idempotencyKey) {
    headers.set('x-idempotency-key', options.idempotencyKey);
  }
  if (options.ifMatch) {
    headers.set('if-match', options.ifMatch);
  }
  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const req = new Request(url, {
    method: options.method || (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const res = await worker.fetch(req, env);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

export async function initFullTestContext(): Promise<TestContext> {
  const { env, rawDb } = createTestEnvironment();

  // 1. Bootstrap Admin
  const bootRes = await request(env, '/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
    body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'AdminPassword123!' },
  });
  if (bootRes.status !== 201) {
    throw new Error(`Bootstrap failed: status=${bootRes.status}, data=${JSON.stringify(bootRes.data)}`);
  }
  const adminToken = bootRes.data.accessToken;
  const adminUser = { id: bootRes.data.user.id, email: 'admin@itbcursos.com' };

  // 2. Create other roles
  const finRes = await request(env, '/api/users', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Financeiro User', email: 'finance@itbcursos.com', password: 'FinPassword123!', role: 'financeiro' },
  });
  const finLogin = await request(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'finance@itbcursos.com', password: 'FinPassword123!' },
  });
  const financeToken = finLogin.data.accessToken;
  const financeUser = { id: finRes.data.id, email: 'finance@itbcursos.com' };

  const profRes = await request(env, '/api/users', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Prof Maria', email: 'maria@itbcursos.com', password: 'ProfPassword123!', role: 'professor' },
  });
  const profLogin = await request(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'maria@itbcursos.com', password: 'ProfPassword123!' },
  });
  const profToken = profLogin.data.accessToken;
  const profUser = { id: profRes.data.id, email: 'maria@itbcursos.com' };

  const pedRes = await request(env, '/api/users', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Coord Pedagogica', email: 'coord@itbcursos.com', password: 'PedPassword123!', role: 'pedagogico' },
  });
  const pedLogin = await request(env, '/api/auth/login', {
    method: 'POST',
    body: { email: 'coord@itbcursos.com', password: 'PedPassword123!' },
  });
  const pedagogicToken = pedLogin.data.accessToken;
  const pedagogicUser = { id: pedRes.data.id, email: 'coord@itbcursos.com' };

  // 3. Create Course, Class, Student, and Enrollment
  const courseRes = await request(env, '/api/courses', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Desenvolvimento Web Fullstack', code: 'DEV-FS' },
  });
  const courseId = courseRes.data.id;

  const classRes = await request(env, '/api/classes', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Turma Alpha 2026', courseId: courseId, shift: 'manha' },
  });
  if (classRes.status !== 201) {
    throw new Error(`Create class failed: ${classRes.status} ${JSON.stringify(classRes.data)}`);
  }
  const classId = classRes.data.id;

  // Assign professor to class
  await request(env, `/api/classes/${classId}/teachers`, {
    method: 'POST',
    token: adminToken,
    body: { userId: profUser.id },
  });

  const studentRes = await request(env, '/api/students', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Gabriel Martins',
      registrationNumber: 'ITB-2026-9001',
      birthDate: '2005-03-15',
      contact: '(11) 99887-6655',
      cpf: '123.456.789-00',
      classId: classId,
    },
  });
  if (studentRes.status !== 201) {
    throw new Error(`Create student failed: ${studentRes.status} ${JSON.stringify(studentRes.data)}`);
  }
  const studentId = studentRes.data.id;

  // Find the active enrollment created for student
  const enrollmentRow = await env.DB.prepare(
    `SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? LIMIT 1`,
  ).bind(studentId, classId).first<{ id: string }>();
  const enrollmentId = enrollmentRow?.id ?? 'enroll-1';

  return {
    env,
    rawDb,
    adminToken,
    financeToken,
    profToken,
    pedagogicToken,
    adminUser,
    financeUser,
    profUser,
    pedagogicUser,
    courseId,
    classId,
    studentId,
    enrollmentId,
  };
}

export function createApiClient(
  env: Env,
  userToken: string,
  userRole: Role = 'admin',
  userId = 'test-user-id',
): ApiClient {
  let session: UserSession | null = {
    id: userId,
    name: 'Test User',
    email: 'test@itbcursos.com',
    role: userRole,
    accessToken: userToken,
    refreshToken: 'mock-refresh-token',
  };

  const originalFetch = globalThis.fetch;

  // Intercept fetch for this ApiClient instance
  const mockFetch: typeof fetch = async (input, init) => {
    let urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Convert relative URL /api/... to full URL
    if (urlStr.startsWith('/')) {
      urlStr = `https://erp.itbcursos.com${urlStr}`;
    }

    const headers = new Headers(init?.headers);
    const method = init?.method || 'GET';
    const body = init?.body as string | undefined;

    const req = new Request(urlStr, {
      method,
      headers,
      body,
    });

    const res = await worker.fetch(req, env);
    return res;
  };

  // Temporarily replace fetch during ApiClient calls
  const client = new ApiClient(
    () => session,
    async (next) => {
      session = next;
    },
  );

  // Patch client request to use the mockFetch
  const originalRequest = client.request.bind(client);
  client.request = async (path, method = 'GET', body, refresh = true, options) => {
    const prev = globalThis.fetch;
    globalThis.fetch = mockFetch;
    try {
      return await originalRequest(path, method, body, refresh, options);
    } finally {
      globalThis.fetch = prev;
    }
  };

  return client;
}
