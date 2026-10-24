import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import {
  calculateContrastRatioAgainstWhite,
  calculateRelativeLuminance,
  validateWcagAaContrast,
} from '../src/branding';
import { AppError } from '../src/http';
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
  if (data && typeof data === 'object') {
    const obj = data as Record<string, any>;
    if (obj.error && typeof obj.error === 'object') {
      if (!obj.code && obj.error.code) obj.code = obj.error.code;
      if (!obj.details && obj.error.details) obj.details = obj.error.details;
    }
  }
  return { status: res.status, data, headers: res.headers };
}

describe('Challenger 2 Empirical Verification: Milestone 1 Core & Security', () => {
  // =========================================================================
  // SECTION 1: M2M API Keys, LGPD PII Redaction & Scope Privilege Escalation
  // =========================================================================
  describe('1. M2M API Keys & LGPD PII Redaction & Privilege Escalation', () => {
    it('enforces strict PII redaction with students:read only and prevents privilege escalation', async () => {
      const { env, rawDb } = createTestEnvironment();

      // Bootstrap Admin
      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      expect(bootRes.status).toBe(201);
      const adminToken = bootRes.data.accessToken;

      // Create Course, Class, and Student with sensitive PII (CPF & Contact)
      const courseRes = await request(env, '/api/v1/courses', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Desenvolvimento Web', workloadHours: 120 },
      });
      const courseId = courseRes.data.id;

      const classRes = await request(env, '/api/v1/classes', {
        method: 'POST',
        token: adminToken,
        body: { courseId, name: 'Turma DEV-2026', shift: 'noite' },
      });
      const classId = classRes.data.id;

      const studentRes = await request(env, '/api/v1/students', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Mariana Silva Souza',
          registrationNumber: 'ITB-2026-001',
          classId,
          cpf: '123.456.789-00',
          contact: '(11) 98765-4321',
        },
      });
      expect(studentRes.status).toBe(201);
      const studentId = studentRes.data.id;

      // 1.1 Create API Key with ONLY students:read
      const keyReadOnlyRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Integration Read-Only Key',
          scopes: ['students:read'],
        },
      });
      expect(keyReadOnlyRes.status).toBe(201);
      const readOnlySecret = keyReadOnlyRes.data.secret;
      const readOnlyKeyId = keyReadOnlyRes.data.key.id;

      // 1.2 Query /api/v1/students list: verify CPF and contact are strictly null/redacted
      const listRes = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(listRes.status).toBe(200);
      expect(listRes.data.items.length).toBe(1);
      const sItem = listRes.data.items[0];
      expect(sItem.name).toBe('Mariana Silva Souza');
      expect(sItem.cpf).toBeNull();
      expect(sItem.contact).toBeNull();

      // 1.3 Query single /api/v1/students/:id: verify CPF and contact are strictly null/redacted
      const getRes = await request(env, `/api/v1/students/${studentId}`, {
        method: 'GET',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(getRes.status).toBe(200);
      expect(getRes.data.name).toBe('Mariana Silva Souza');
      expect(getRes.data.cpf).toBeNull();
      expect(getRes.data.contact).toBeNull();

      // 1.4 Attempt mutations with read-only key (Privilege Escalation Attacks):
      // Attack A: Create student
      const createAttack = await request(env, '/api/v1/students', {
        method: 'POST',
        headers: { 'x-api-key': readOnlySecret },
        body: { name: 'Hacker Student', registrationNumber: 'HACK-001', classId },
      });
      expect(createAttack.status).toBe(403);
      expect(createAttack.data.code).toBe('FORBIDDEN');

      // Attack B: Update student
      const updateAttack = await request(env, `/api/v1/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'x-api-key': readOnlySecret, 'if-match': 'W/"1"' },
        body: { name: 'Tampered Name' },
      });
      expect(updateAttack.status).toBe(403);
      expect(updateAttack.data.code).toBe('FORBIDDEN');

      // Attack C: Delete student
      const deleteAttack = await request(env, `/api/v1/students/${studentId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(deleteAttack.status).toBe(403);
      expect(deleteAttack.data.code).toBe('FORBIDDEN');

      // Attack D: Lock student enrollment
      const lockAttack = await request(env, `/api/v1/students/${studentId}/lock`, {
        method: 'POST',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(lockAttack.status).toBe(403);
      expect(lockAttack.data.code).toBe('FORBIDDEN');

      // Attack E: Manage API keys
      const listKeysAttack = await request(env, '/api/v1/admin/api-keys', {
        method: 'GET',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(listKeysAttack.status).toBe(403);
      expect(listKeysAttack.data.code).toBe('FORBIDDEN');

      // Attack F: Modify Branding
      const brandingAttack = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        headers: { 'x-api-key': readOnlySecret },
        body: { appName: 'Hacked ERP' },
      });
      expect(brandingAttack.status).toBe(403);
      expect(brandingAttack.data.code).toBe('FORBIDDEN');

      // Attack G: Create Cash Entry
      const cashAttack = await request(env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        headers: { 'x-api-key': readOnlySecret },
        body: { amountCents: 10000, type: 'entrada', category: 'Mensalidade', description: 'Fraude', paymentMethod: 'PIX', date: '2026-10-24' },
      });
      expect(cashAttack.status).toBe(403);
      expect(cashAttack.data.code).toBe('FORBIDDEN');

      // Attack H: Create Grade Table
      const gradesAttack = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        headers: { 'x-api-key': readOnlySecret },
        body: { classId, name: 'Tabela Proibida' },
      });
      expect(gradesAttack.status).toBe(403);
      expect(gradesAttack.data.code).toBe('FORBIDDEN');

      // 1.5 Create API Key WITH students:pii scope
      const keyWithPiiRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Integration PII Authorized Key',
          scopes: ['students:read', 'students:pii'],
        },
      });
      expect(keyWithPiiRes.status).toBe(201);
      const withPiiSecret = keyWithPiiRes.data.secret;

      // Query with students:pii key: verify CPF and contact are unmasked!
      const piiListRes = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': withPiiSecret },
      });
      expect(piiListRes.status).toBe(200);
      const piiStudent = piiListRes.data.items[0];
      expect(piiStudent.name).toBe('Mariana Silva Souza');
      expect(piiStudent.cpf).toBe('123.456.789-00');
      expect(piiStudent.contact).toBe('(11) 98765-4321');

      const piiGetRes = await request(env, `/api/v1/students/${studentId}`, {
        method: 'GET',
        headers: { 'x-api-key': withPiiSecret },
      });
      expect(piiGetRes.status).toBe(200);
      expect(piiGetRes.data.cpf).toBe('123.456.789-00');
      expect(piiGetRes.data.contact).toBe('(11) 98765-4321');

      // 1.6 Revoke API Key: Test that revoked keys immediately fail with 401
      const revokeRes = await request(env, `/api/v1/admin/api-keys/${readOnlyKeyId}/revoke`, {
        method: 'POST',
        token: adminToken,
      });
      expect(revokeRes.status).toBe(200);

      const revokedAttempt = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': readOnlySecret },
      });
      expect(revokedAttempt.status).toBe(401);
      expect(revokedAttempt.data.code).toBe('INVALID_API_KEY');

      // 1.7 Expired API Key: create key with expired timestamp
      const expiredKeyRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Already Expired Key',
          scopes: ['students:read'],
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      });
      expect(expiredKeyRes.status).toBe(201);
      const expiredSecret = expiredKeyRes.data.secret;

      const expiredAttempt = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': expiredSecret },
      });
      expect(expiredAttempt.status).toBe(401);
      expect(expiredAttempt.data.code).toBe('INVALID_API_KEY');

      // 1.8 Rotated API Key: old key revoked, new key valid
      const piiKeyId = keyWithPiiRes.data.key.id;
      const rotateRes = await request(env, `/api/v1/admin/api-keys/${piiKeyId}/rotate`, {
        method: 'POST',
        token: adminToken,
      });
      expect(rotateRes.status).toBe(200);
      const rotatedNewSecret = rotateRes.data.secret;

      // Old secret should now be 401
      const oldRotateAttempt = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': withPiiSecret },
      });
      expect(oldRotateAttempt.status).toBe(401);
      expect(oldRotateAttempt.data.code).toBe('INVALID_API_KEY');

      // New secret should succeed with 200
      const newRotateAttempt = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': rotatedNewSecret },
      });
      expect(newRotateAttempt.status).toBe(200);

      // 1.9 Invalid or bogus API key tokens
      const bogusAttempt = await request(env, '/api/v1/students', {
        method: 'GET',
        headers: { 'x-api-key': 'itb_live_nonexistenttoken123456789' },
      });
      expect(bogusAttempt.status).toBe(401);
      expect(bogusAttempt.data.code).toBe('INVALID_API_KEY');
    });

    it('rejects API key creation with empty or invalid scopes', async () => {
      const { env } = createTestEnvironment();
      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      const token = bootRes.data.accessToken;

      // Empty scopes array
      const emptyRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token,
        body: { name: 'Empty Scopes', scopes: [] },
      });
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.data.code).toBe('VALIDATION_ERROR');

      // Invalid scopes only
      const invalidRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token,
        body: { name: 'Invalid Scopes', scopes: ['super_admin', 'root'] },
      });
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.data.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // SECTION 2: WCAG 2.1 AA Contrast Calculation & Edge Cases
  // =========================================================================
  describe('2. WCAG 2.1 AA Contrast Calculation & Edge Cases', () => {
    it('accurately calculates contrast ratio and rejects low-contrast edge cases', () => {
      // 2.1 Edge Case: #FFFFFF (White against white) -> 1.00:1 -> MUST FAIL
      expect(calculateContrastRatioAgainstWhite('#FFFFFF')).toBeCloseTo(1.0, 2);
      expect(() => validateWcagAaContrast('#FFFFFF')).toThrowError(AppError);

      // 2.2 Edge Case: #FFF (3-char shorthand white) -> 1.00:1 -> MUST FAIL
      expect(calculateContrastRatioAgainstWhite('#FFF')).toBeCloseTo(1.0, 2);
      expect(() => validateWcagAaContrast('#FFF')).toThrowError(AppError);

      // 2.3 Edge Case: #FFFF00 (Pure yellow against white) -> ~1.07:1 -> MUST FAIL
      const yellowRatio = calculateContrastRatioAgainstWhite('#FFFF00');
      expect(yellowRatio).toBeLessThan(1.2);
      expect(() => validateWcagAaContrast('#FFFF00')).toThrowError(AppError);

      // 2.4 Edge Case: #E0E0E0 (Light gray) -> ~1.32:1 -> MUST FAIL
      const lightGrayRatio = calculateContrastRatioAgainstWhite('#E0E0E0');
      expect(lightGrayRatio).toBeLessThan(2.0);
      expect(() => validateWcagAaContrast('#E0E0E0')).toThrowError(AppError);

      // 2.5 Edge Case: #000000 (Black against white) -> 21.00:1 -> MUST PASS
      expect(calculateContrastRatioAgainstWhite('#000000')).toBeCloseTo(21.0, 1);
      expect(() => validateWcagAaContrast('#000000')).not.toThrow();

      // 2.6 Edge Case: #000 (3-char shorthand black) -> 21.00:1 -> MUST PASS
      expect(calculateContrastRatioAgainstWhite('#000')).toBeCloseTo(21.0, 1);
      expect(() => validateWcagAaContrast('#000')).not.toThrow();

      // 2.7 Edge Case: #767676 (Classic WCAG 4.5:1 boundary gray) -> ~4.54:1 -> MUST PASS (>= 3.0:1)
      const mediumGrayRatio = calculateContrastRatioAgainstWhite('#767676');
      expect(mediumGrayRatio).toBeGreaterThanOrEqual(4.5);
      expect(() => validateWcagAaContrast('#767676')).not.toThrow();

      // 2.8 Critical 3.0:1 boundary test:
      // #949494 has ratio ~ 3.02:1 -> MUST PASS
      const r94 = calculateContrastRatioAgainstWhite('#949494');
      expect(r94).toBeGreaterThanOrEqual(3.0);
      expect(() => validateWcagAaContrast('#949494')).not.toThrow();

      // #969696 has ratio ~ 2.93:1 -> MUST FAIL (< 3.0:1)
      const r96 = calculateContrastRatioAgainstWhite('#969696');
      expect(r96).toBeLessThan(3.0);
      expect(() => validateWcagAaContrast('#969696')).toThrowError(AppError);
    });

    it('enforces WCAG AA contrast rules through the branding REST API (PUT /api/v1/admin/branding)', async () => {
      const { env } = createTestEnvironment();
      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      const token = bootRes.data.accessToken;

      // 1. Submit #FFFF00 (Yellow) -> Must fail with 400 and CONTRAST_ERROR
      const yellowRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#FFFF00' },
      });
      expect(yellowRes.status).toBe(400);
      expect(yellowRes.data.code).toBe('CONTRAST_ERROR');
      expect(yellowRes.data.details.requiredMinimum).toBe(3.0);
      expect(yellowRes.data.details.contrastRatio).toBeLessThan(3.0);

      // 2. Submit #FFFFFF (White) -> Must fail with 400 and CONTRAST_ERROR
      const whiteRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#FFFFFF' },
      });
      expect(whiteRes.status).toBe(400);
      expect(whiteRes.data.code).toBe('CONTRAST_ERROR');

      // 3. Submit #E0E0E0 (Light gray) -> Must fail with 400 and CONTRAST_ERROR
      const grayRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#E0E0E0' },
      });
      expect(grayRes.status).toBe(400);
      expect(grayRes.data.code).toBe('CONTRAST_ERROR');

      // 4. Submit 3-char #FFF -> Must fail with 400 and CONTRAST_ERROR
      const shortWhiteRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#FFF' },
      });
      expect(shortWhiteRes.status).toBe(400);
      expect(shortWhiteRes.data.code).toBe('CONTRAST_ERROR');

      // 5. Submit #767676 -> Must succeed with 200
      const validGrayRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#767676' },
      });
      expect(validGrayRes.status).toBe(200);
      expect(validGrayRes.data.accentColor).toBe('#767676');

      // 6. Submit 3-char #000 -> Must succeed with 200
      const shortBlackRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#000' },
      });
      expect(shortBlackRes.status).toBe(200);
      expect(shortBlackRes.data.accentColor).toBe('#000');

      // 7. Submit Official ITB Navy #102A43 -> Must succeed with 200
      const navyRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB Transforma', accentColor: '#102A43' },
      });
      expect(navyRes.status).toBe(200);
      expect(navyRes.data.accentColor).toBe('#102A43');
      expect(navyRes.data.appName).toBe('ERPITB Transforma');

      // 8. Submit invalid color string -> Must fail with VALIDATION_ERROR
      const invalidHexRes = await request(env, '/api/v1/admin/branding', {
        method: 'PUT',
        token,
        body: { appName: 'ERPITB', accentColor: '#12345' },
      });
      expect(invalidHexRes.status).toBe(400);
      expect(invalidHexRes.data.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // SECTION 3: Versioned REST Endpoints for Grades and Replacements
  // =========================================================================
  describe('3. Versioned REST Endpoints for Grades and Replacements', () => {
    it('manages complete lifecycle of grade tables, items, student grades, and atomic replacement completion', async () => {
      const { env } = createTestEnvironment();

      // Bootstrap Admin
      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      const token = bootRes.data.accessToken;

      // Create Financeiro User
      const finRes = await request(env, '/api/v1/users', {
        method: 'POST',
        token,
        body: { name: 'Financeiro Staff', email: 'fin@itbcursos.com', role: 'financeiro', password: 'Password@123' },
      });
      const finId = finRes.data.id;

      // Login Financeiro to obtain token
      const finLogin = await request(env, '/api/auth/login', {
        method: 'POST',
        body: { email: 'fin@itbcursos.com', password: 'Password@123' },
      });
      const finToken = finLogin.data.accessToken;

      // Create Academic Foundation: Course, Class, Student
      const course = await request(env, '/api/v1/courses', {
        method: 'POST',
        token,
        body: { name: 'Análise de Sistemas', workloadHours: 80 },
      });
      const courseId = course.data.id;

      const cls = await request(env, '/api/v1/classes', {
        method: 'POST',
        token,
        body: { courseId, name: 'ADS-101', shift: 'manha' },
      });
      const classId = cls.data.id;

      const student = await request(env, '/api/v1/students', {
        method: 'POST',
        token,
        body: {
          name: 'Lucas Ferreira',
          registrationNumber: 'ITB-2026-777',
          classId,
          cpf: '444.555.666-77',
          contact: '(11) 97777-6666',
        },
      });
      const studentId = student.data.id;

      // 3.1 Grade Table Lifecycle
      const createTableRes = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        token,
        body: {
          classId,
          name: 'Notas do 1º Semestre',
          calculationMode: 'simple',
          passingGrade: 7.0,
        },
      });
      expect(createTableRes.status).toBe(201);
      expect(createTableRes.headers.get('etag')).toBe('W/"1"');
      const tableId = createTableRes.data.id;
      expect(createTableRes.data.name).toBe('Notas do 1º Semestre');
      expect(createTableRes.data.passing_grade).toBe(7.0);

      // GET grade table by ID
      const getTableRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
        method: 'GET',
        token,
      });
      expect(getTableRes.status).toBe(200);
      expect(getTableRes.headers.get('etag')).toBe('W/"1"');
      expect(getTableRes.data.name).toBe('Notas do 1º Semestre');

      // GET grade tables list with classId query
      const listTablesRes = await request(env, `/api/v1/grade-tables?classId=${classId}`, {
        method: 'GET',
        token,
      });
      expect(listTablesRes.status).toBe(200);
      expect(listTablesRes.data.items.length).toBe(1);

      // Concurrency check: Update Grade Table with matching If-Match: W/"1"
      const updateTableRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
        method: 'PATCH',
        token,
        headers: { 'if-match': 'W/"1"' },
        body: { name: 'Notas do 1º Semestre - Revisadas' },
      });
      expect(updateTableRes.status).toBe(200);
      expect(updateTableRes.headers.get('etag')).toBe('W/"2"');
      expect(updateTableRes.data.name).toBe('Notas do 1º Semestre - Revisadas');

      // Concurrency conflict: Update with stale If-Match: W/"1" -> Expect 409 CONCURRENCY_CONFLICT
      const conflictTableRes = await request(env, `/api/v1/grade-tables/${tableId}`, {
        method: 'PATCH',
        token,
        headers: { 'if-match': 'W/"1"' },
        body: { name: 'Tentativa Concorrente' },
      });
      expect(conflictTableRes.status).toBe(409);
      expect(conflictTableRes.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(conflictTableRes.data.serverVersion).toBe(2);

      // 3.2 Grade Items Lifecycle
      const createItemRes = await request(env, '/api/v1/grade-items', {
        method: 'POST',
        token,
        body: {
          classId,
          gradeTableId: tableId,
          name: 'Avaliação Prática 1',
          category: 'Trabalho',
          maxScore: 10.0,
          weight: 2.0,
        },
      });
      expect(createItemRes.status).toBe(201);
      expect(createItemRes.headers.get('etag')).toBe('W/"1"');
      const itemId = createItemRes.data.id;

      // GET grade item
      const getItemRes = await request(env, `/api/v1/grade-items/${itemId}`, { method: 'GET', token });
      expect(getItemRes.status).toBe(200);
      expect(getItemRes.data.name).toBe('Avaliação Prática 1');

      // Update grade item with matching If-Match: W/"1"
      const updateItemRes = await request(env, `/api/v1/grade-items/${itemId}`, {
        method: 'PATCH',
        token,
        headers: { 'if-match': 'W/"1"' },
        body: { name: 'Avaliação Prática 1 - Final' },
      });
      expect(updateItemRes.status).toBe(200);
      expect(updateItemRes.headers.get('etag')).toBe('W/"2"');

      // Concurrency conflict on grade item
      const conflictItemRes = await request(env, `/api/v1/grade-items/${itemId}`, {
        method: 'PATCH',
        token,
        headers: { 'if-match': 'W/"1"' },
        body: { name: 'Conflict Item' },
      });
      expect(conflictItemRes.status).toBe(409);
      expect(conflictItemRes.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(conflictItemRes.data.serverVersion).toBe(2);

      // 3.3 Student Grades Batch Upsert
      const saveGradeRes = await request(env, '/api/v1/student-grades', {
        method: 'POST',
        token,
        body: {
          grades: [
            {
              gradeItemId: itemId,
              studentId,
              score: 9.5,
              remarks: 'Desempenho excelente',
            },
          ],
        },
      });
      expect(saveGradeRes.status).toBe(200);

      // Verify retrieval by classId, studentId, gradeItemId
      const gradesByClass = await request(env, `/api/v1/student-grades?classId=${classId}`, { method: 'GET', token });
      expect(gradesByClass.status).toBe(200);
      expect(gradesByClass.data.items.length).toBe(1);
      expect(gradesByClass.data.items[0].score).toBe(9.5);

      const gradesByStudent = await request(env, `/api/v1/student-grades?studentId=${studentId}`, { method: 'GET', token });
      expect(gradesByStudent.status).toBe(200);
      expect(gradesByStudent.data.items[0].score).toBe(9.5);

      // Upsert update grade to 10.0
      const updateGradeRes = await request(env, '/api/v1/student-grades', {
        method: 'POST',
        token,
        body: {
          grades: [{ gradeItemId: itemId, studentId, score: 10.0, remarks: 'Nota máxima corrigida' }],
        },
      });
      expect(updateGradeRes.status).toBe(200);

      const gradesAfterUpdate = await request(env, `/api/v1/student-grades?studentId=${studentId}`, { method: 'GET', token });
      expect(gradesAfterUpdate.data.items[0].score).toBe(10.0);
      expect(gradesAfterUpdate.data.items[0].sync_version).toBe(2);

      // 3.4 Replacements & Atomic Attendance Update ('RC')
      // Create attendance record with status 'F' (Falta)
      const date = '2026-10-24';
      const attRes = await request(env, '/api/v1/attendance', {
        method: 'POST',
        token,
        body: {
          classId,
          date,
          records: [{ studentId, status: 'F', notes: 'Falta justificável' }],
        },
      });
      expect(attRes.status).toBe(201);
      const attRecordId = attRes.data.items[0].id;
      expect(attRes.data.items[0].status).toBe('F');

      // Schedule Replacement
      const replRes = await request(env, '/api/v1/replacements', {
        method: 'POST',
        token,
        body: {
          attendanceRecordId: attRecordId,
          classId,
          studentId,
          attendanceDate: date,
          scheduledDate: '2026-10-28',
          scheduledTime: '15:00',
          notes: 'Reposição de aula de laboratório',
        },
      });
      expect(replRes.status).toBe(201);
      const replId = replRes.data.id;
      expect(replRes.data.completed_at).toBeNull();

      // Verify pending filter
      const pendingList = await request(env, `/api/v1/replacements?classId=${classId}&pending=true`, { method: 'GET', token });
      expect(pendingList.status).toBe(200);
      expect(pendingList.data.items.length).toBe(1);
      expect(pendingList.data.items[0].id).toBe(replId);

      const nonPendingList = await request(env, `/api/v1/replacements?classId=${classId}&pending=false`, { method: 'GET', token });
      expect(nonPendingList.status).toBe(200);
      expect(nonPendingList.data.items.length).toBe(0);

      // Complete Replacement via dedicated /complete endpoint
      const completeRes = await request(env, `/api/v1/replacements/${replId}/complete`, {
        method: 'POST',
        token,
        body: { completedAt: '2026-10-28T16:00:00.000Z' },
      });
      expect(completeRes.status).toBe(200);
      expect(completeRes.data.completed_at).toBe('2026-10-28T16:00:00.000Z');

      // VERIFY ATOMIC UPDATE of attendance record to status 'RC' (Reposição Concluída)
      const verifyAtt = await request(env, `/api/v1/attendance?classId=${classId}&date=${date}`, { method: 'GET', token });
      expect(verifyAtt.status).toBe(200);
      const updatedRecord = verifyAtt.data.items.find((a: any) => a.id === attRecordId);
      expect(updatedRecord.status).toBe('RC');

      // Verify pending filter now returns 0 and completed returns 1
      const pendingAfter = await request(env, `/api/v1/replacements?classId=${classId}&pending=true`, { method: 'GET', token });
      expect(pendingAfter.data.items.length).toBe(0);

      const completedAfter = await request(env, `/api/v1/replacements?classId=${classId}&pending=false`, { method: 'GET', token });
      expect(completedAfter.data.items.length).toBe(1);

      // 3.5 RBAC Strict Isolation: role 'financeiro' must be FORBIDDEN from all grade and replacement endpoints
      const finGradeTables = await request(env, '/api/v1/grade-tables', { method: 'GET', token: finToken });
      expect(finGradeTables.status).toBe(403);
      expect(finGradeTables.data.code).toBe('FORBIDDEN');

      const finCreateGradeTable = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        token: finToken,
        body: { classId, name: 'Hacked Table' },
      });
      expect(finCreateGradeTable.status).toBe(403);
      expect(finCreateGradeTable.data.code).toBe('FORBIDDEN');

      const finGradeItems = await request(env, `/api/v1/grade-items?classId=${classId}`, { method: 'GET', token: finToken });
      expect(finGradeItems.status).toBe(403);
      expect(finGradeItems.data.code).toBe('FORBIDDEN');

      const finGrades = await request(env, `/api/v1/student-grades?classId=${classId}`, { method: 'GET', token: finToken });
      expect(finGrades.status).toBe(403);
      expect(finGrades.data.code).toBe('FORBIDDEN');

      const finReplacements = await request(env, `/api/v1/replacements?classId=${classId}`, { method: 'GET', token: finToken });
      expect(finReplacements.status).toBe(403);
      expect(finReplacements.data.code).toBe('FORBIDDEN');
    });

    it('adversarially tests teacher class boundaries and concurrency on deletions', async () => {
      const { env } = createTestEnvironment();

      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      const adminToken = bootRes.data.accessToken;

      // Create two classes: Turma Alpha and Turma Beta
      const course = await request(env, '/api/v1/courses', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Robótica Educacional', workloadHours: 60 },
      });
      const courseId = course.data.id;

      const classA = await request(env, '/api/v1/classes', {
        method: 'POST',
        token: adminToken,
        body: { courseId, name: 'Turma Alpha', shift: 'manha' },
      });
      const classAId = classA.data.id;

      const classB = await request(env, '/api/v1/classes', {
        method: 'POST',
        token: adminToken,
        body: { courseId, name: 'Turma Beta', shift: 'tarde' },
      });
      const classBId = classB.data.id;

      // Create Professor and assign ONLY to Turma Alpha
      const profRes = await request(env, '/api/v1/users', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Professor Carlos', email: 'carlos@itbcursos.com', role: 'professor', password: 'Password@123' },
      });
      const profId = profRes.data.id;

      await request(env, `/api/v1/classes/${classAId}/teachers`, {
        method: 'POST',
        token: adminToken,
        body: { userId: profId },
      });

      // Login Professor
      const profLogin = await request(env, '/api/auth/login', {
        method: 'POST',
        body: { email: 'carlos@itbcursos.com', password: 'Password@123' },
      });
      const profToken = profLogin.data.accessToken;

      // Professor can create grade table for Turma Alpha
      const tableAlpha = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        token: profToken,
        body: { classId: classAId, name: 'Provas Alpha' },
      });
      expect(tableAlpha.status).toBe(201);
      const tableAlphaId = tableAlpha.data.id;

      // Professor CANNOT create grade table for Turma Beta (unassigned class) -> Expect 403
      const tableBetaAttack = await request(env, '/api/v1/grade-tables', {
        method: 'POST',
        token: profToken,
        body: { classId: classBId, name: 'Provas Beta' },
      });
      expect(tableBetaAttack.status).toBe(403);
      expect(tableBetaAttack.data.code).toBe('FORBIDDEN');

      // Professor CANNOT list grade tables for Turma Beta
      const listBetaAttack = await request(env, `/api/v1/grade-tables?classId=${classBId}`, {
        method: 'GET',
        token: profToken,
      });
      expect(listBetaAttack.status).toBe(403);
      expect(listBetaAttack.data.code).toBe('FORBIDDEN');

      // Concurrency on Grade Table Deletion:
      // Delete tableAlpha with stale If-Match -> Expect 409 CONCURRENCY_CONFLICT
      const deleteConflict = await request(env, `/api/v1/grade-tables/${tableAlphaId}`, {
        method: 'DELETE',
        token: profToken,
        headers: { 'if-match': 'W/"999"' },
      });
      expect(deleteConflict.status).toBe(409);
      expect(deleteConflict.data.code).toBe('CONCURRENCY_CONFLICT');

      // Delete with valid If-Match
      const deleteOk = await request(env, `/api/v1/grade-tables/${tableAlphaId}`, {
        method: 'DELETE',
        token: profToken,
        headers: { 'if-match': 'W/"1"' },
      });
      expect(deleteOk.status).toBe(200);

      // Verify table is no longer accessible
      const verifyDeleted = await request(env, `/api/v1/grade-tables/${tableAlphaId}`, {
        method: 'GET',
        token: profToken,
      });
      expect(verifyDeleted.status).toBe(404);
    });
  });

  // =========================================================================
  // SECTION 4: Advanced M2M Key Protocols & Chromatic Spectrum Stress
  // =========================================================================
  describe('4. Advanced M2M Key Protocols & Chromatic Spectrum Stress', () => {
    it('verifies Bearer itb_ token header, wildcard privilege barriers, and corrupted scopes recovery', async () => {
      const { env, rawDb } = createTestEnvironment();

      const bootRes = await request(env, '/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
        body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
      });
      const adminToken = bootRes.data.accessToken;

      // Create API key with wildcard '*'
      const starKeyRes = await request(env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Super Machine Key', scopes: ['*'] },
      });
      expect(starKeyRes.status).toBe(201);
      const starSecret = starKeyRes.data.secret;
      const starKeyId = starKeyRes.data.key.id;

      // 1. Authenticate using "Authorization: Bearer itb_live_..." instead of x-api-key
      const authBearerRes = await request(env, '/api/v1/courses', {
        method: 'GET',
        headers: { authorization: `Bearer ${starSecret}` },
      });
      expect(authBearerRes.status).toBe(200);

      // 2. Privilege Barrier: Even with '*' scope, M2M role is 'machine', so admin-only routes must reject
      const userCreateAttack = await request(env, '/api/v1/users', {
        method: 'POST',
        headers: { 'x-api-key': starSecret },
        body: { name: 'Escalated Admin', email: 'escalated@itbcursos.com', role: 'admin', password: 'Password@123' },
      });
      expect(userCreateAttack.status).toBe(403);
      expect(userCreateAttack.data.code).toBe('FORBIDDEN');

      // 3. Corrupt scopes_json in D1 table -> verify system fails securely with empty scopes
      rawDb.prepare(`UPDATE api_keys SET scopes_json = 'INVALID_JSON_CORRUPTED{' WHERE id = ?`).run(starKeyId);

      const corruptedAttempt = await request(env, '/api/v1/students', {
        method: 'POST',
        headers: { 'x-api-key': starSecret },
        body: { name: 'Blocked Student', registrationNumber: 'BLOCK-01', classId: 'dummy' },
      });
      expect(corruptedAttempt.status).toBe(403);
      expect(corruptedAttempt.data.code).toBe('FORBIDDEN');
    });

    it('empirically verifies chromatic spectrum primaries, secondaries, and alpha rejection', () => {
      // Primaries against white:
      // Red #FF0000 -> Lum ~0.2126 -> ratio ~ 3.998:1 >= 3.0 -> PASS
      expect(calculateContrastRatioAgainstWhite('#FF0000')).toBeGreaterThan(3.5);
      expect(() => validateWcagAaContrast('#FF0000')).not.toThrow();

      // Green #00FF00 -> Lum ~0.7152 -> ratio ~ 1.372:1 < 3.0 -> FAIL
      expect(calculateContrastRatioAgainstWhite('#00FF00')).toBeLessThan(2.0);
      expect(() => validateWcagAaContrast('#00FF00')).toThrowError(AppError);

      // Blue #0000FF -> Lum ~0.0722 -> ratio ~ 8.59:1 >= 3.0 -> PASS
      expect(calculateContrastRatioAgainstWhite('#0000FF')).toBeGreaterThan(8.0);
      expect(() => validateWcagAaContrast('#0000FF')).not.toThrow();

      // Secondaries against white:
      // Cyan #00FFFF -> Lum ~0.7874 -> ratio ~ 1.25:1 < 3.0 -> FAIL
      expect(calculateContrastRatioAgainstWhite('#00FFFF')).toBeLessThan(2.0);
      expect(() => validateWcagAaContrast('#00FFFF')).toThrowError(AppError);

      // Magenta #FF00FF -> Lum ~0.2848 -> ratio ~ 3.136:1 >= 3.0 -> PASS
      expect(calculateContrastRatioAgainstWhite('#FF00FF')).toBeGreaterThan(3.0);
      expect(() => validateWcagAaContrast('#FF00FF')).not.toThrow();
    });
  });
});

