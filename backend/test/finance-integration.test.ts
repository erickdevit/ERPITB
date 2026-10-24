import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';

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
  const url = `https://erp.itbcursos.com${path}`;
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
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

describe('Financial Domain and API Integration', () => {
  it('manages fees, payments, cash entries, reversals, and contacts with least privilege', async () => {
    const { env } = createTestEnvironment();

    // 1. Bootstrap Admin
    const bootstrapRes = await request(env, '/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'x-bootstrap-secret': env.BOOTSTRAP_SECRET },
      body: { name: 'Admin Master', email: 'admin@itbcursos.com', password: 'StrongPassword123!' },
    });
    expect(bootstrapRes.status).toBe(201);
    const adminToken = bootstrapRes.data.accessToken;

    // 2. Create users: Professor and Financeiro
    const profRes = await request(env, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Prof Carlos', email: 'carlos@itbcursos.com', password: 'Password123!', role: 'professor' },
    });
    expect(profRes.status).toBe(201);

    const finUserRes = await request(env, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Fatima Financeiro', email: 'fatima@itbcursos.com', password: 'Password123!', role: 'financeiro' },
    });
    expect(finUserRes.status).toBe(201);

    // Login as financeiro
    const finLogin = await request(env, '/api/auth/login', {
      method: 'POST',
      body: { email: 'fatima@itbcursos.com', password: 'Password123!' },
    });
    expect(finLogin.status).toBe(200);
    const finToken = finLogin.data.accessToken;

    // Login as professor
    const profLogin = await request(env, '/api/auth/login', {
      method: 'POST',
      body: { email: 'carlos@itbcursos.com', password: 'Password123!' },
    });
    expect(profLogin.status).toBe(200);
    const profToken = profLogin.data.accessToken;

    // 3. Setup Course, Class and Student
    const courseRes = await request(env, '/api/courses', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Robótica Educacional', code: 'ROB-01' },
    });
    const courseId = courseRes.data.id;

    const classRes = await request(env, '/api/classes', {
      method: 'POST',
      token: adminToken,
      body: { courseId, name: 'Turma Alpha 2026', shift: 'manha' },
    });
    const classId = classRes.data.id;

    const studentRes = await request(env, '/api/students', {
      method: 'POST',
      token: adminToken,
      body: {
        classId,
        name: 'Lucas Pereira Silva',
        registrationNumber: 'ITB-2026-001',
        cpf: '12345678901',
        contact: '(11) 98765-4321',
      },
    });
    expect(studentRes.status).toBe(201);
    const studentId = studentRes.data.id;

    // 4. Test RBAC: Professor cannot access finance
    const profTryListFees = await request(env, '/api/v1/finance/fees', {
      method: 'GET',
      token: profToken,
    });
    expect(profTryListFees.status).toBe(403);

    const profTryCreateCash = await request(env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token: profToken,
      body: { type: 'entrada', amountCents: 5000, date: '2026-10-24', category: 'Doação', description: 'Teste', paymentMethod: 'PIX' },
    });
    expect(profTryCreateCash.status).toBe(403);

    // 5. Financeiro creates Monthly Fee (Mensalidade)
    const feeRes = await request(env, '/api/v1/finance/fees', {
      method: 'POST',
      token: finToken,
      body: {
        studentId,
        classId,
        competenceMonth: 10,
        competenceYear: 2026,
        dueDate: '2026-10-15',
        amountCents: 15000, // R$ 150,00
        installmentNumber: 1,
        notes: 'Mensalidade de Outubro',
      },
    });
    expect(feeRes.status).toBe(201);
    const feeId = feeRes.data.id;
    expect(feeRes.data.amountCents).toBe(15000);
    expect(feeRes.data.paidAmountCents).toBe(0);

    // 6. List fees and check delinquency KPIs
    const listFeesRes = await request(env, '/api/v1/finance/fees?month=10&year=2026', {
      method: 'GET',
      token: finToken,
    });
    expect(listFeesRes.status).toBe(200);
    expect(listFeesRes.data.items.length).toBe(1);
    expect(listFeesRes.data.summary.totalExpectedCents).toBe(15000);
    expect(listFeesRes.data.summary.totalPaidCents).toBe(0);
    expect(listFeesRes.data.items[0].studentName).toBe('Lucas Pereira Silva');

    // 7. Make a Partial Payment of R$ 50,00 via PIX
    const partialPayRes = await request(env, `/api/v1/finance/fees/${feeId}/payments`, {
      method: 'POST',
      token: finToken,
      headers: { 'x-idempotency-key': 'tx-pay-001' },
      body: {
        amountCents: 5000,
        paymentDate: '2026-10-20',
        paymentMethod: 'PIX',
        reference: 'tx-pay-001',
      },
    });
    expect(partialPayRes.status).toBe(201);
    expect(partialPayRes.data.fee.paidAmountCents).toBe(5000);
    expect(partialPayRes.data.fee.status).toBe('parcial');

    // Test Idempotency: Repeating same payment does not duplicate
    const repeatPayRes = await request(env, `/api/v1/finance/fees/${feeId}/payments`, {
      method: 'POST',
      token: finToken,
      headers: { 'x-idempotency-key': 'tx-pay-001' },
      body: {
        amountCents: 5000,
        paymentDate: '2026-10-20',
        paymentMethod: 'PIX',
        reference: 'tx-pay-001',
      },
    });
    expect(repeatPayRes.status).toBe(201);
    expect(repeatPayRes.data.duplicate).toBe(true);

    // 8. Verify cash book received the automatic entry atomically
    const cashListRes = await request(env, '/api/v1/finance/cash?from=2026-10-01&to=2026-10-31', {
      method: 'GET',
      token: finToken,
    });
    expect(cashListRes.status).toBe(200);
    expect(cashListRes.data.items.length).toBe(1);
    expect(cashListRes.data.items[0].amountCents).toBe(5000);
    expect(cashListRes.data.items[0].paymentMethod).toBe('PIX');
    expect(cashListRes.data.summary.totalInflowCents).toBe(5000);

    // 9. Make the second payment to complete (R$ 100,00 via dinheiro)
    const finalPayRes = await request(env, `/api/v1/finance/fees/${feeId}/payments`, {
      method: 'POST',
      token: finToken,
      body: {
        amountCents: 10000,
        paymentDate: '2026-10-22',
        paymentMethod: 'dinheiro',
        reference: 'recibo-102',
      },
    });
    expect(finalPayRes.status).toBe(201);
    expect(finalPayRes.data.fee.status).toBe('paga');
    expect(finalPayRes.data.fee.paidAmountCents).toBe(15000);

    // 10. Manual cash entry and Reversal (estorno)
    const manualCashRes = await request(env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token: finToken,
      body: {
        type: 'saida',
        amountCents: 3500,
        date: '2026-10-24',
        category: 'Material Didático',
        description: 'Compra de papel sulfite',
        paymentMethod: 'dinheiro',
      },
    });
    expect(manualCashRes.status).toBe(201);
    const manualCashId = manualCashRes.data.id;

    // Check cash balance
    const cashAfterExpense = await request(env, '/api/v1/finance/cash', {
      method: 'GET',
      token: finToken,
    });
    // Inflow: 5000 + 10000 = 15000, Outflow: 3500 => Closing: 11500
    expect(cashAfterExpense.data.summary.totalInflowCents).toBe(15000);
    expect(cashAfterExpense.data.summary.totalOutflowCents).toBe(3500);
    expect(cashAfterExpense.data.summary.closingBalanceCents).toBe(11500);

    // Reverse the expense (estorno)
    const reverseRes = await request(env, `/api/v1/finance/cash/entries/${manualCashId}/reversal`, {
      method: 'POST',
      token: finToken,
      body: { reason: 'Lançamento efetuado em duplicidade' },
    });
    expect(reverseRes.status).toBe(200);

    // 11. Financial Contact with AES-256-GCM encryption
    const saveContactRes = await request(env, `/api/v1/finance/contacts/${studentId}`, {
      method: 'PUT',
      token: finToken,
      body: {
        responsibleName: 'Maria de Lourdes Silva',
        responsiblePhone: '(11) 97777-8888',
        responsibleCpf: '98765432100',
        responsibleAddress: 'Rua das Flores, 123, São Paulo - SP',
      },
    });
    expect(saveContactRes.status).toBe(200);
    expect(saveContactRes.data.responsibleName).toBe('Maria de Lourdes Silva');

    const getContactRes = await request(env, `/api/v1/finance/contacts/${studentId}`, {
      method: 'GET',
      token: finToken,
    });
    expect(getContactRes.status).toBe(200);
    expect(getContactRes.data.responsibleName).toBe('Maria de Lourdes Silva');
    expect(getContactRes.data.responsiblePhone).toBe('(11) 97777-8888');
  });
});
