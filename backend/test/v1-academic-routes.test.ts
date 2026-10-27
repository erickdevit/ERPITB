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

describe('Unified REST Router: Versioned Academic Endpoints (/api/v1/*)', () => {
  it('performs full CRUD lifecycle on laboratories, courses, classes, enrollments, grades, and replacements', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap Admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
    });
    const token = bootRes.data.accessToken;

    // 2. Laboratories CRUD
    const createLabRes = await request(env, '/api/v1/laboratories', {
      method: 'POST',
      token,
      body: { name: 'Laboratório de Informática 1', active: 1 },
    });
    expect(createLabRes.status).toBe(201);
    const labId = createLabRes.data.id;

    const getLabRes = await request(env, `/api/v1/laboratories/${labId}`, {
      method: 'GET',
      token,
    });
    expect(getLabRes.status).toBe(200);
    expect(getLabRes.data.name).toBe('Laboratório de Informática 1');

    const patchLabRes = await request(env, `/api/v1/laboratories/${labId}`, {
      method: 'PATCH',
      token,
      body: { name: 'Lab Info 1 - Renovado' },
    });
    expect(patchLabRes.status).toBe(200);

    const listLabsRes = await request(env, '/api/v1/laboratories', { method: 'GET', token });
    expect(listLabsRes.status).toBe(200);
    expect(listLabsRes.data.items.length).toBe(1);

    // 3. Courses CRUD
    const createCourseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token,
      body: { name: 'Desenvolvimento Fullstack', workloadHours: 160 },
    });
    expect(createCourseRes.status).toBe(201);
    const courseId = createCourseRes.data.id;

    const getCourseRes = await request(env, `/api/v1/courses/${courseId}`, { method: 'GET', token });
    expect(getCourseRes.status).toBe(200);
    expect(getCourseRes.headers.get('etag')).toBe('W/"1"');

    // 4. Classes CRUD
    const createClassRes = await request(env, '/api/v1/classes', {
      method: 'POST',
      token,
      body: {
        courseId,
        laboratoryId: labId,
        name: 'Turma Fullstack 2026',
        shift: 'noite',
      },
    });
    expect(createClassRes.status).toBe(201);
    const classId = createClassRes.data.id;

    // 5. Users: Create Professor
    const createProfRes = await request(env, '/api/v1/users', {
      method: 'POST',
      token,
      body: {
        name: 'Professor Fernando',
        email: 'fernando.prof@itbcursos.com',
        role: 'professor',
        password: 'Password@123',
      },
    });
    expect(createProfRes.status).toBe(201);
    const profId = createProfRes.data.id;

    // Assign Professor to Class
    const assignProfRes = await request(env, `/api/v1/classes/${classId}/teachers`, {
      method: 'POST',
      token,
      body: { userId: profId },
    });
    expect(assignProfRes.status).toBe(201);

    const listTeachersRes = await request(env, `/api/v1/classes/${classId}/teachers`, { method: 'GET', token });
    expect(listTeachersRes.status).toBe(200);
    expect(listTeachersRes.data.items.length).toBe(1);

    // 6. Students & Enrollments
    const createStudentRes = await request(env, '/api/v1/students', {
      method: 'POST',
      token,
      body: {
        name: 'Camila Duarte',
        registrationNumber: 'ITB-2026-909',
        classId,
        cpf: '999.888.777-66',
        contact: '(11) 98888-7777',
      },
    });
    expect(createStudentRes.status).toBe(201);
    const studentId = createStudentRes.data.id;

    const listEnrollmentsRes = await request(env, `/api/v1/enrollments?classId=${classId}`, { method: 'GET', token });
    expect(listEnrollmentsRes.status).toBe(200);
    expect(listEnrollmentsRes.data.items.length).toBe(1);
    const enrollmentId = listEnrollmentsRes.data.items[0].id;

    // 7. Attendance Logging (Batch)
    const today = new Date().toISOString().slice(0, 10);
    const attRes = await request(env, '/api/v1/attendance', {
      method: 'POST',
      token,
      body: {
        classId,
        date: today,
        records: [{ studentId, status: 'F', notes: 'Falta na primeira aula' }],
        generalNotes: 'Introdução ao módulo',
      },
    });
    expect(attRes.status).toBe(201);
    expect(attRes.data.items.length).toBe(1);
    const attendanceRecordId = attRes.data.items[0].id;
    expect(attRes.data.items[0].status).toBe('F');

    // 8. Grade Tables & Items CRUD
    const gradeTableRes = await request(env, '/api/v1/grade-tables', {
      method: 'POST',
      token,
      body: {
        classId,
        name: 'Avaliação Contínua',
        calculationMode: 'simple',
        passingGrade: 6.0,
      },
    });
    expect(gradeTableRes.status).toBe(201);
    const gradeTableId = gradeTableRes.data.id;

    const gradeItemRes = await request(env, '/api/v1/grade-items', {
      method: 'POST',
      token,
      body: {
        classId,
        gradeTableId,
        name: 'Prova Teórica 1',
        category: 'Prova',
        maxScore: 10.0,
        weight: 1.0,
      },
    });
    expect(gradeItemRes.status).toBe(201);
    const gradeItemId = gradeItemRes.data.id;

    // 9. Student Grades (Batch Upsert)
    const saveGradesRes = await request(env, '/api/v1/student-grades', {
      method: 'POST',
      token,
      body: {
        grades: [
          {
            gradeItemId,
            studentId,
            score: 8.5,
            remarks: 'Excelente raciocínio lógico',
          },
        ],
      },
    });
    expect(saveGradesRes.status).toBe(200);

    const listGradesRes = await request(env, `/api/v1/student-grades?classId=${classId}`, { method: 'GET', token });
    expect(listGradesRes.status).toBe(200);
    expect(listGradesRes.data.items.length).toBe(1);
    expect(listGradesRes.data.items[0].score).toBe(8.5);

    // 10. Replacements: Schedule and Complete
    const createReplRes = await request(env, '/api/v1/replacements', {
      method: 'POST',
      token,
      body: {
        attendanceRecordId,
        classId,
        studentId,
        attendanceDate: today,
        scheduledDate: today,
        scheduledTime: '14:00',
        notes: 'Reposição de conteúdo prático',
      },
    });
    expect(createReplRes.status).toBe(201);
    const replacementId = createReplRes.data.id;

    // Complete Replacement -> Verifies atomic update of attendance record to 'RC'
    const completeReplRes = await request(env, `/api/v1/replacements/${replacementId}/complete`, {
      method: 'POST',
      token,
      body: { completedAt: new Date().toISOString() },
    });
    expect(completeReplRes.status).toBe(200);
    expect(completeReplRes.data.completed_at).toBeDefined();

    // Verify Attendance Record status changed to 'RC' (Reposição Concluída)
    const verifyAttRes = await request(env, `/api/v1/attendance?classId=${classId}&date=${today}`, {
      method: 'GET',
      token,
    });
    expect(verifyAttRes.status).toBe(200);
    const updatedAtt = verifyAttRes.data.items.find((a: any) => a.id === attendanceRecordId);
    expect(updatedAtt.status).toBe('RC');
  });

  it('assigns class_number automatically and preserves it across sync push/pull', async () => {
    const { env } = createTestEnvironment();

    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'Password@123' },
    });
    const token = bootRes.data.accessToken;

    const courseRes = await request(env, '/api/v1/courses', {
      method: 'POST',
      token,
      body: { code: 'ROB', name: 'Robótica' },
    });
    const courseId = courseRes.data.id;

    // Create class with name "Turma 05 - Robótica Avançada" and cleanName: true
    const class1Res = await request(env, '/api/classes', {
      method: 'POST',
      token,
      body: { courseId, name: 'Turma 05 - Robótica Avançada', shift: 'manha', cleanName: true },
    });
    expect(class1Res.status).toBe(201);
    expect(class1Res.data.class_number).toBe(5);
    expect(class1Res.data.name).toBe('Robótica Avançada');

    // Create another class via sync push without explicit number
    const classId2 = crypto.randomUUID();
    const pushRes = await request(env, '/api/sync/push', {
      method: 'POST',
      token,
      body: {
        deviceId: 'dev-1',
        operations: [
          {
            operationId: 'op-class-2',
            entity: 'classes',
            action: 'upsert',
            id: classId2,
            baseVersion: 0,
            updatedAt: new Date().toISOString(),
            data: {
              id: classId2,
              course_id: courseId,
              name: 'Turma 06 - Automação',
              shift: 'tarde',
              active: 1,
            },
          },
        ],
      },
    });
    expect(pushRes.status).toBe(200);

    // List classes and verify numeric sorting
    const listRes = await request(env, '/api/classes', {
      method: 'GET',
      token,
    });
    expect(listRes.status).toBe(200);
    const c1 = listRes.data.items.find((c: any) => c.id === class1Res.data.id);
    const c2 = listRes.data.items.find((c: any) => c.id === classId2);
    expect(c1.class_number).toBe(5);
    expect(c2.class_number).toBe(6);
    expect(listRes.data.items[0].class_number).toBeLessThanOrEqual(listRes.data.items[1].class_number);
  });

  it('enforces class start_date and end_date limits on attendance recording', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap Admin
    const bootRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Master', email: 'admin-dates@itbcursos.com', password: 'Password@123' },
    });
    const token = bootRes.data.accessToken;

    // 2. Create Course
    const courseRes = await request(env, '/api/courses', {
      method: 'POST',
      token,
      body: { code: 'ADM', name: 'Administração' },
    });
    const courseId = courseRes.data.id;

    // 3. Reject invalid class where endDate < startDate
    const invalidClassRes = await request(env, '/api/classes', {
      method: 'POST',
      token,
      body: {
        courseId,
        name: 'Turma Inválida',
        shift: 'manha',
        startDate: '2026-06-01',
        endDate: '2026-05-01',
      },
    });
    expect(invalidClassRes.status).toBe(400);
    expect(invalidClassRes.data.error.message).toContain('previsão de encerramento');

    // 4. Create class with valid start_date and end_date (2026-03-01 to 2026-10-31)
    const classRes = await request(env, '/api/classes', {
      method: 'POST',
      token,
      body: {
        courseId,
        name: 'Turma ADM 2026',
        shift: 'manha',
        startDate: '2026-03-01',
        endDate: '2026-10-31',
      },
    });
    expect(classRes.status).toBe(201);
    expect(classRes.data.start_date).toBe('2026-03-01');
    expect(classRes.data.end_date).toBe('2026-10-31');
    const classId = classRes.data.id;

    // 5. Create student and enroll in class
    const studentRes = await request(env, '/api/students', {
      method: 'POST',
      token,
      body: { name: 'Aluno Datas Teste', registrationNumber: '2026999', classId },
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.data.id;

    // 6. Attempt attendance BEFORE class start date (e.g. 2026-02-20)
    const beforeStartRes = await request(env, '/api/attendance/batch', {
      method: 'PUT',
      token,
      body: {
        classId,
        date: '2026-02-20',
        records: [{ studentId, status: 'P' }],
        justification: 'Tentativa de chamada antes do início da turma',
      },
    });
    expect(beforeStartRes.status).toBe(400);
    expect(beforeStartRes.data.error.code).toBe('ATTENDANCE_BEFORE_CLASS_START');
    expect(beforeStartRes.data.error.message).toContain('anterior à data de início da turma');

    // 7. Attempt attendance AFTER class end date (e.g. 2026-11-05)
    const afterEndRes = await request(env, '/api/attendance/batch', {
      method: 'PUT',
      token,
      body: {
        classId,
        date: '2026-11-05',
        records: [{ studentId, status: 'P' }],
        justification: 'Tentativa de chamada após encerramento da turma',
      },
    });
    expect(afterEndRes.status).toBe(400);
    expect(afterEndRes.data.error.code).toBe('ATTENDANCE_AFTER_CLASS_END');
    expect(afterEndRes.data.error.message).toContain('posterior à data de encerramento da turma');

    // 8. Attempt attendance WITHIN range (e.g. 2026-03-15)
    const validAttendanceRes = await request(env, '/api/attendance/batch', {
      method: 'PUT',
      token,
      body: {
        classId,
        date: '2026-03-15',
        records: [{ studentId, status: 'P' }],
        justification: 'Chamada válida dentro do período da turma',
      },
    });
    expect(validAttendanceRes.status).toBe(200);
    expect(validAttendanceRes.data.items).toHaveLength(1);
    expect(validAttendanceRes.data.items[0].date).toBe('2026-03-15');
  });
});
