import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { decryptText } from '../src/crypto';
import { dateInTimeZone } from '../src/rbac';
import type { Env } from '../src/types';

// Concrete D1 Mock wrapping Node.js 22 built-in SQLite engine
class D1PreparedStatementImpl {
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

class D1DatabaseImpl {
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
  const url = `https://frequencia.itbcursos.com${path}`;
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
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
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

describe('End-to-End Integration and Real Database Simulation', () => {
  it('executes full operational workflow: auth, RBAC, catalog, encrypted students, attendance, replacements, sync and conflict resolution', async () => {
    const { env, rawDb } = createTestEnvironment();

    // 1. Health and CORS
    const health = await request(env, '/health');
    expect(health.status).toBe(200);
    expect(health.data).toEqual({ status: 'ok', service: 'ERPITB API' });

    const optionsRes = await request(env, '/api/students', { method: 'OPTIONS' });
    expect(optionsRes.status).toBe(204);
    expect(optionsRes.headers.get('access-control-allow-methods')).toContain('GET,POST,PUT,PATCH,DELETE,OPTIONS');

    // 2. Initial Bootstrap
    const badBootstrap = await request(env, '/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'wrong-secret' },
      body: { name: 'Admin ITB', email: 'admin@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(badBootstrap.status).toBe(403);

    const bootstrap = await request(env, '/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'bootstrap-secret-local-32-bytes-min-key' },
      body: { name: 'Admin ITB', email: 'admin@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(bootstrap.status).toBe(201);
    expect(bootstrap.data.user).toMatchObject({ name: 'Admin ITB', email: 'admin@itb.org.br', role: 'admin' });
    expect(bootstrap.data.accessToken).toBeDefined();
    const adminToken = bootstrap.data.accessToken;

    // Second bootstrap must fail
    const secondBootstrap = await request(env, '/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'bootstrap-secret-local-32-bytes-min-key' },
      body: { name: 'Other Admin', email: 'other@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(secondBootstrap.status).toBe(409);

    // 3. User Management (Admin creates Pedagogico and Professor)
    const createPedag = await request(env, '/api/users', {
      token: adminToken,
      body: { name: 'Pedagógico Coordenador', email: 'pedagogico@itb.org.br', password: 'Senha Forte 123!', role: 'pedagogico' },
    });
    expect(createPedag.status).toBe(201);

    const createProf = await request(env, '/api/users', {
      token: adminToken,
      body: { name: 'Prof. Lucas Mendes', email: 'lucas@itb.org.br', password: 'Senha Forte 123!', role: 'professor' },
    });
    expect(createProf.status).toBe(201);
    const profId = createProf.data.id;

    // 4. Authenticate as Professor and verify tokens & refresh
    const profLogin = await request(env, '/auth/login', {
      body: { email: 'lucas@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(profLogin.status).toBe(200);
    expect(profLogin.data.user.role).toBe('professor');
    const profToken = profLogin.data.accessToken;
    const profRefreshToken = profLogin.data.refreshToken;

    const refreshed = await request(env, '/auth/refresh', {
      body: { refreshToken: profRefreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.data.accessToken).toBeDefined();

    // 5. Catalog Management (Admin / Pedagogico creates Course, Lab, Class, links Teacher)
    const createCourse = await request(env, '/api/courses', {
      token: adminToken,
      body: { name: 'Desenvolvimento Web', code: 'DEV-01' },
    });
    expect(createCourse.status).toBe(201);
    const courseId = createCourse.data.id;

    const createLab = await request(env, '/api/laboratories', {
      token: adminToken,
      body: { name: 'Laboratório de Informática 01' },
    });
    expect(createLab.status).toBe(201);
    const labId = createLab.data.id;

    const createClass = await request(env, '/api/classes', {
      token: adminToken,
      body: {
        courseId: courseId,
        name: 'Turma Noite 2026',
        shift: 'noite',
        laboratoryId: labId,
        weekDay: 'segunda',
        teacherId: profId,
      },
    });
    expect(createClass.status).toBe(201);
    const classId = createClass.data.id;

    // Professor forbidden from creating courses
    const profCreateCourse = await request(env, '/api/courses', {
      token: profToken,
      body: { name: 'Curso Proibido' },
    });
    expect(profCreateCourse.status).toBe(403);

    // 6. Student Creation and Encryption Verification in Database
    const studentRes = await request(env, '/api/students', {
      token: adminToken,
      body: {
        classId: classId,
        name: 'Mariana Duarte',
        cpf: '123.456.789-00',
        contact: '(11) 98765-4321',
        registrationNumber: 'MAT-2026-001',
        birthDate: '2005-04-15',
      },
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.data.id;

    // Verify raw SQLite database row has encrypted fields
    const rawStudent = rawDb.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
    expect(rawStudent).toBeDefined();
    expect(rawStudent.encrypted_name).toBeDefined();
    expect(rawStudent.encrypted_name).not.toBe('Mariana Duarte');
    expect(rawStudent.encrypted_name.startsWith('v1.')).toBe(true);

    // Decrypt directly from key to confirm fidelity
    const decryptedName = await decryptText(env, rawStudent.encrypted_name);
    expect(decryptedName).toBe('Mariana Duarte');

    // 7. Verify atomic enrollment created
    const rawEnrollment = rawDb.prepare('SELECT * FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, studentId) as any;
    expect(rawEnrollment).toBeDefined();
    expect(rawEnrollment.status).toBe('ativa');

    // 8. Attendance Recording by Assigned Professor via Batch
    const today = dateInTimeZone(new Date(), 'America/Sao_Paulo');
    const attDay = await request(env, '/api/attendance/batch', {
      method: 'PUT',
      token: profToken,
      body: {
        classId: classId,
        date: today,
        records: [
          {
            studentId: studentId,
            status: 'P',
            notes: 'Presente na aula regular',
          },
        ],
      },
    });
    expect(attDay.status).toBe(200);

    // Verify attendance records in raw DB
    const rawAttendance = rawDb.prepare('SELECT * FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?').get(classId, studentId, today) as any;
    expect(rawAttendance).toBeDefined();
    expect(rawAttendance.status).toBe('P');

    // 9. Sync Engine: Push & Pull
    const pushRes = await request(env, '/sync/push', {
      token: adminToken,
      body: {
        deviceId: 'device-test-01',
        operations: [
          {
            operationId: 'op-01',
            entity: 'class_notes',
            action: 'upsert',
            id: 'note-01',
            baseVersion: 0,
            updatedAt: '2026-08-15T10:00:00.000Z',
            data: { class_id: classId, date: '2026-08-15', notes: 'Conteúdo ministrado: Relacionamentos SQL' },
          },
        ],
      },
    });
    expect(pushRes.status).toBe(200);
    expect(pushRes.data.results[0].status).toBe('applied');

    // 9.1 Sync Engine: Push a new student without an enrollment in the same batch
    const studentSyncRes = await request(env, '/sync/push', {
      token: adminToken,
      body: {
        deviceId: 'device-test-01',
        operations: [
          {
            operationId: 'op-student-standalone',
            entity: 'students',
            action: 'upsert',
            id: 'student-sync-01',
            baseVersion: 0,
            updatedAt: '2026-08-15T10:05:00.000Z',
            data: {
              id: 'student-sync-01',
              name: 'Aluno Sync Isolado',
              registration_number: 'MAT-SYNC-01',
              active: 1,
            },
          },
        ],
      },
    });
    expect(studentSyncRes.status).toBe(200);
    expect(studentSyncRes.data.results[0].status).toBe('applied');

    const pullRes = await request(env, '/sync/pull?cursor=0', {
      token: adminToken,
    });
    expect(pullRes.status).toBe(200);
    expect(pullRes.data.changes).toBeDefined();
    expect(pullRes.data.nextCursor).toBeGreaterThan(0);

    // 10. Concurrency Conflict Detection and Resolution
    // Attempting to push with outdated baseVersion triggers conflict
    const conflictPush = await request(env, '/sync/push', {
      token: adminToken,
      body: {
        deviceId: 'device-test-02',
        operations: [
          {
            operationId: 'op-conflict-01',
            entity: 'attendance_records',
            action: 'upsert',
            id: rawAttendance.id,
            baseVersion: 0, // Stale base version (server is at version >= 1)
            updatedAt: '2026-08-15T11:00:00.000Z',
            data: {
              class_id: classId,
              student_id: studentId,
              date: today,
              status: 'F',
              notes: 'Conflito de status',
            },
          },
        ],
      },
    });
    expect(conflictPush.status).toBe(200);
    expect(conflictPush.data.results[0].status).toBe('conflict');

    // Verify conflict logged in sync_conflicts table
    const conflictsList = await request(env, '/api/conflicts', { token: adminToken });
    expect(conflictsList.status).toBe(200);
    expect(conflictsList.data.items.length).toBeGreaterThanOrEqual(1);
    const conflictId = conflictsList.data.items[0].id;

    // Resolve conflict
    const resolveRes = await request(env, `/api/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'remote', justification: 'Manter a versão canônica registrada pelo servidor' },
    });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.data.decision).toBe('remote');

    // 11. Dashboard Analytics Query
    const dashRes = await request(env, '/api/dashboard', { token: adminToken });
    expect(dashRes.status).toBe(200);
    expect(dashRes.data.globalAttendanceRate).toBeDefined();
    expect(dashRes.data.distribution).toBeDefined();

    // 12. Audit Trail
    const auditRes = await request(env, '/api/audit-logs', { token: adminToken });
    expect(auditRes.status).toBe(200);
    expect(auditRes.data.items.length).toBeGreaterThan(0);
  });

  it('enforces RBAC permissions and rejects unauthenticated requests', async () => {
    const { env } = createTestEnvironment();

    // Unauthenticated request to protected route
    const unauth = await request(env, '/api/users');
    expect(unauth.status).toBe(401);

    // Request with corrupted token
    const corrupted = await request(env, '/api/users', { token: 'invalid.bearer.token' });
    expect(corrupted.status).toBe(401);
  });

  it('handles token revocation on logout and rejects invalid refresh tokens', async () => {
    const { env } = createTestEnvironment();

    // Bootstrap Admin
    const bootstrap = await request(env, '/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'bootstrap-secret-local-32-bytes-min-key' },
      body: { name: 'Admin ITB', email: 'admin@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(bootstrap.status).toBe(201);
    const adminToken = bootstrap.data.accessToken;
    const refreshToken = bootstrap.data.refreshToken;

    // Refresh valid token
    const refreshRes = await request(env, '/auth/refresh', {
      body: { refreshToken },
    });
    expect(refreshRes.status).toBe(200);
    const newRefreshToken = refreshRes.data.refreshToken;

    // Logout
    const logoutRes = await request(env, '/auth/logout', {
      method: 'POST',
      token: adminToken,
      body: { refreshToken: newRefreshToken },
    });
    expect(logoutRes.status).toBe(200);

    // Attempt to use revoked refresh token
    const reuseRes = await request(env, '/auth/refresh', {
      body: { refreshToken: newRefreshToken },
    });
    expect(reuseRes.status).toBe(401);
  });

  it('queries attendance list with transparent field decryption and teacher scope constraints', async () => {
    const { env, rawDb } = createTestEnvironment();

    // Bootstrap Admin
    const bootstrap = await request(env, '/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': 'bootstrap-secret-local-32-bytes-min-key' },
      body: { name: 'Admin ITB', email: 'admin@itb.org.br', password: 'Senha Forte 123!' },
    });
    const adminToken = bootstrap.data.accessToken;

    // Create Professor, Course, Class, Student
    const profRes = await request(env, '/api/users', {
      token: adminToken,
      body: { name: 'Prof. Ana Silva', email: 'ana@itb.org.br', password: 'Senha Forte 123!', role: 'professor' },
    });
    const profId = profRes.data.id;

    const courseRes = await request(env, '/api/courses', {
      token: adminToken,
      body: { name: 'Design Gráfico' },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/classes', {
      token: adminToken,
      body: { courseId, name: 'Turma DG-01', shift: 'tarde', teacherId: profId },
    });
    const classId = classRes.data.id;

    const studentRes = await request(env, '/api/students', {
      token: adminToken,
      body: { classId, name: 'Lucas Gabriel', registrationNumber: 'MAT-9988' },
    });
    const studentId = studentRes.data.id;

    // Record attendance
    const today = dateInTimeZone(new Date(), 'America/Sao_Paulo');
    await request(env, '/api/attendance/batch', {
      method: 'PUT',
      token: adminToken,
      body: {
        classId,
        date: today,
        records: [{ studentId, status: 'P', notes: 'Presente' }],
      },
    });

    // Query attendance as Admin
    const attList = await request(env, `/api/attendance?classId=${classId}&date=${today}`, {
      token: adminToken,
    });
    expect(attList.status).toBe(200);
    expect(attList.data.items).toHaveLength(1);
    expect(attList.data.items[0].student_name).toBe('Lucas Gabriel');
    expect(attList.data.items[0].status).toBe('P');

    // 13. Public Student Portal (Unauthenticated access by registration number)
    const publicRes = await request(env, '/matricula/MAT-9988');
    expect(publicRes.status).toBe(200);
    expect(publicRes.data.student).toMatchObject({
      name: 'Lucas Gabriel',
      registrationNumber: 'MAT-9988',
      active: true,
    });
    expect(publicRes.data.metrics).toMatchObject({
      totalLessons: 1,
      present: 1,
      absent: 0,
      attendanceRate: 100,
    });
    expect(publicRes.data.classes).toHaveLength(1);
    expect(publicRes.data.classes[0]).toMatchObject({
      className: 'Turma DG-01',
      courseName: 'Design Gráfico',
      shift: 'tarde',
    });
    expect(publicRes.data.history).toHaveLength(1);
    expect(publicRes.data.history[0]).toMatchObject({
      date: today,
      status: 'P',
      statusLabel: 'Presente',
      className: 'Turma DG-01',
      courseName: 'Design Gráfico',
    });

    // Ensure zero sensitive data leakage (LGPD)
    expect(publicRes.data.student.cpf).toBeUndefined();
    expect(publicRes.data.student.encrypted_cpf).toBeUndefined();
    expect(publicRes.data.student.contact).toBeUndefined();
    expect(publicRes.data.student.encrypted_contact).toBeUndefined();

    // Query non-existent student returns 404
    const notFoundRes = await request(env, '/matricula/INVALID-CODE-999');
    expect(notFoundRes.status).toBe(404);

    // 14. User Edit and Sensitive Delete
    // 14.1 Edit unassigned or existing user
    const tempUserRes = await request(env, '/api/users', {
      token: adminToken,
      body: { name: 'Temp Colab', email: 'temp@itb.org.br', password: 'Senha 123456!', role: 'pedagogico' },
    });
    expect(tempUserRes.status).toBe(201);
    const tempUserId = tempUserRes.data.id;

    // Edit user name, active state and password
    const editRes = await request(env, `/api/users/${tempUserId}`, {
      method: 'PATCH',
      token: adminToken,
      body: { name: 'Temp Colab Renomeado', role: 'professor', active: 1, password: 'Nova Senha 654321!' },
    });
    expect(editRes.status).toBe(200);
    expect(editRes.data.name).toBe('Temp Colab Renomeado');
    expect(editRes.data.role).toBe('professor');
    expect(editRes.data.active).toBe(1);

    // Verify login with new password works
    const newLogin = await request(env, '/api/auth/login', {
      body: { email: 'temp@itb.org.br', password: 'Nova Senha 654321!' },
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.data.user.name).toBe('Temp Colab Renomeado');

    // 14.2 Try to delete assigned professor (profId is assigned to class DG-01) -> MUST FAIL (400)
    const delAssigned = await request(env, `/api/users/${profId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(delAssigned.status).toBe(400);
    expect(delAssigned.data.error.code).toBe('USER_ASSIGNED_TO_CLASS');

    // 14.3 Delete unassigned user -> MUST SUCCEED (200)
    const delUnassigned = await request(env, `/api/users/${tempUserId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(delUnassigned.status).toBe(200);
    expect(delUnassigned.data.ok).toBe(true);

    // 15. Professor Sync and Scoped Data Access
    const profLogin = await request(env, '/api/auth/login', {
      body: { email: 'ana@itb.org.br', password: 'Senha Forte 123!' },
    });
    expect(profLogin.status).toBe(200);
    const profToken = profLogin.data.accessToken;

    // 15.1 Professor pulls sync changes from cursor 0
    const profPull = await request(env, '/sync/pull?cursor=0&limit=200', {
      token: profToken,
    });
    expect(profPull.status).toBe(200);
    const pulledEntities = new Set(profPull.data.changes.map((c: { entity: string }) => c.entity));
    expect(pulledEntities.has('courses')).toBe(true);
    expect(pulledEntities.has('classes')).toBe(true);
    expect(pulledEntities.has('students')).toBe(true);
    expect(pulledEntities.has('enrollments')).toBe(true);

    // 15.2 Professor calls /api/students without classId -> returns assigned students
    const profStudents = await request(env, '/api/students', {
      token: profToken,
    });
    expect(profStudents.status).toBe(200);
    expect(profStudents.data.items).toHaveLength(1);
    expect(profStudents.data.items[0].name).toBe('Lucas Gabriel');

    // 15.3 Professor pushes grade_tables, grade_items, and student_grades and verifies Public Portal Boletim
    const gradePush = await request(env, '/api/sync/push', {
      token: profToken,
      body: {
        deviceId: 'prof-device-1',
        operations: [
          {
            operationId: 'op-gt-1',
            entity: 'grade_tables',
            action: 'upsert',
            id: 'gt-1',
            baseVersion: 0,
            updatedAt: '2026-08-20T10:00:00.000Z',
            data: {
              class_id: classId,
              name: '1º Módulo - Robótica',
              calculation_mode: 'weighted',
              passing_grade: 6.0,
              published: 1,
              sort_order: 1,
            },
          },
          {
            operationId: 'op-gi-1',
            entity: 'grade_items',
            action: 'upsert',
            id: 'gi-1',
            baseVersion: 0,
            updatedAt: '2026-08-20T10:01:00.000Z',
            data: {
              class_id: classId,
              grade_table_id: 'gt-1',
              name: 'Prova Teórica',
              category: 'Prova',
              max_score: 10,
              weight: 2,
              sort_order: 1,
            },
          },
          {
            operationId: 'op-gi-2',
            entity: 'grade_items',
            action: 'upsert',
            id: 'gi-2',
            baseVersion: 0,
            updatedAt: '2026-08-20T10:02:00.000Z',
            data: {
              class_id: classId,
              grade_table_id: 'gt-1',
              name: 'Montagem Arduino',
              category: 'Atividade Prática',
              max_score: 10,
              weight: 1,
              sort_order: 2,
            },
          },
          {
            operationId: 'op-sg-1',
            entity: 'student_grades',
            action: 'upsert',
            id: 'sg-1',
            baseVersion: 0,
            updatedAt: '2026-08-20T10:03:00.000Z',
            data: {
              class_id: classId,
              grade_table_id: 'gt-1',
              grade_item_id: 'gi-1',
              student_id: studentId,
              score: 9.0,
              remarks: 'Excelente desempenho na prova',
            },
          },
          {
            operationId: 'op-sg-2',
            entity: 'student_grades',
            action: 'upsert',
            id: 'sg-2',
            baseVersion: 0,
            updatedAt: '2026-08-20T10:04:00.000Z',
            data: {
              class_id: classId,
              grade_table_id: 'gt-1',
              grade_item_id: 'gi-2',
              student_id: studentId,
              score: 6.0,
              remarks: 'Circuito funcional',
            },
          },
        ],
      },
    });
    expect(gradePush.status).toBe(200);
    expect(gradePush.data.results.every((r: { status: string }) => r.status === 'applied')).toBe(true);

    // Public student portal returns complete reportCard with weighted average (9*2 + 6*1)/3 = 8.0
    const publicPortal = await request(env, `/api/matricula/${profStudents.data.items[0].registration_number}`);
    expect(publicPortal.status).toBe(200);
    expect(publicPortal.data.reportCard).toBeDefined();
    expect(publicPortal.data.reportCard.overallAverage).toBe(8.0);
    expect(publicPortal.data.reportCard.overallStatus).toBe('aprovado');
    expect(publicPortal.data.reportCard.tables).toHaveLength(1);
    expect(publicPortal.data.reportCard.tables[0].items).toHaveLength(2);
    expect(publicPortal.data.reportCard.byCategory).toHaveLength(2);

    // 15.3 Student transfer between classes: preserves attendance and grade history
    const class2Res = await request(env, '/api/classes', {
      token: adminToken,
      body: { courseId, name: 'Turma Destino Transfer', shift: 'manha' },
    });
    expect(class2Res.status).toBe(201);
    const class2Id = class2Res.data.id;

    // Student is currently active in classId (enrolled in step 6)
    const existingEnrollment = rawDb.prepare('SELECT id FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, studentId) as { id: string };
    expect(existingEnrollment).toBeDefined();

    // Move student to class2Id via sync push (conclude classId, activate class2Id)
    const transferPush = await request(env, '/sync/push', {
      token: adminToken,
      body: {
        deviceId: 'device-test-01',
        operations: [
          {
            operationId: 'op-transfer-conclude',
            entity: 'enrollments',
            action: 'upsert',
            id: existingEnrollment.id,
            baseVersion: 1,
            updatedAt: '2026-08-25T10:00:00.000Z',
            data: {
              id: existingEnrollment.id,
              class_id: classId,
              student_id: studentId,
              status: 'concluida',
            },
          },
          {
            operationId: 'op-transfer-activate',
            entity: 'enrollments',
            action: 'upsert',
            id: 'enr-target-new',
            baseVersion: 0,
            updatedAt: '2026-08-25T10:01:00.000Z',
            data: {
              id: 'enr-target-new',
              class_id: class2Id,
              student_id: studentId,
              status: 'ativa',
            },
          },
        ],
      },
    });
    expect(transferPush.status).toBe(200);
    expect(transferPush.data.results.every((r: { status: string }) => r.status === 'applied')).toBe(true);

    // Verify database state: both enrollments exist, origin is 'concluida' and not soft-deleted
    const rawOrigin = rawDb.prepare('SELECT * FROM enrollments WHERE id = ?').get(existingEnrollment.id) as any;
    expect(rawOrigin.status).toBe('concluida');
    expect(rawOrigin.deleted_at).toBeNull();

    const rawTarget = rawDb.prepare('SELECT * FROM enrollments WHERE id = ?').get('enr-target-new') as any;
    expect(rawTarget.status).toBe('ativa');
    expect(rawTarget.deleted_at).toBeNull();

    // Public portal after transfer returns both classes, historical attendance and report card
    const portalAfterTransfer = await request(env, `/api/matricula/${profStudents.data.items[0].registration_number}`);
    expect(portalAfterTransfer.status).toBe(200);
    expect(portalAfterTransfer.data.classes).toHaveLength(2);
    expect(portalAfterTransfer.data.classes.some((c: { className: string; status: string }) => c.className === 'Turma DG-01' && c.status === 'concluida')).toBe(true);
    expect(portalAfterTransfer.data.classes.some((c: { className: string; status: string }) => c.className === 'Turma Destino Transfer' && c.status === 'ativa')).toBe(true);
    expect(portalAfterTransfer.data.history.length).toBeGreaterThanOrEqual(1);
    expect(portalAfterTransfer.data.metrics.totalLessons).toBeGreaterThanOrEqual(1);
    expect(portalAfterTransfer.data.reportCard.overallAverage).toBe(8.0);

    // 16. Legacy password migration and trailing-slash route normalization
    const { argon2id } = await import('@noble/hashes/argon2');
    const { base64 } = await import('../src/crypto');
    const legacySalt = new Uint8Array(16).fill(11);
    const legacyHashBytes = argon2id(new TextEncoder().encode('Senha Legada 123!'), legacySalt, {
      m: 19 * 1024,
      t: 2,
      p: 1,
      dkLen: 32,
    });
    const legacyArgonHash = `$argon2id$v=19$m=19456,t=2,p=1$${base64.encode(legacySalt)}$${base64.encode(legacyHashBytes)}`;

    // Insert legacy user directly into SQLite
    rawDb.exec(`INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES ('legacy-user-1', 'Usuario Legado', 'legado@itbcursos.com', '${legacyArgonHash}', 'admin', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`);

    // Verify initial hash is argon2id
    const beforeRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id = 'legacy-user-1'`).get() as { password_hash: string };
    expect(beforeRow.password_hash).toContain('$argon2id$');

    // Login using trailing slash on /api/auth/login/
    const legacyLogin = await request(env, '/api/auth/login/', {
      body: { email: 'legado@itbcursos.com', password: 'Senha Legada 123!' },
    });
    expect(legacyLogin.status).toBe(200);
    expect(legacyLogin.data.user.email).toBe('legado@itbcursos.com');
    expect(legacyLogin.data.accessToken).toBeDefined();

    // Verify that the user's password_hash was automatically upgraded in SQLite to PBKDF2
    const afterRow = rawDb.prepare(`SELECT password_hash FROM users WHERE id = 'legacy-user-1'`).get() as { password_hash: string };
    expect(afterRow.password_hash).toContain('$pbkdf2-sha256$i=100000$');

    // Subsequent login works seamlessly using the updated PBKDF2 hash
    const secondLogin = await request(env, '/auth/login', {
      body: { email: 'legado@itbcursos.com', password: 'Senha Legada 123!' },
    });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.data.user.email).toBe('legado@itbcursos.com');
  });
});
