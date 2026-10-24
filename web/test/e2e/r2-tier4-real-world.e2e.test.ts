import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  initFullTestContext,
  request,
  type TestContext,
} from './r2-test-harness';
import { drainLegacyClientStorage } from '../../src/lib/migration-drain';
import { calculateContrastRatioAgainstWhite } from '../../../backend/src/branding';
import { countDistinctClassLessons } from '../../../backend/src/sessions-service';

describe('Tier 4: Real-World Application Scenarios (End-to-End User Journeys)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    localStorage.clear();
    await Dexie.delete('erpitb-pwa');
    await Dexie.delete('frequencia-itb-pwa');
    ctx = await initFullTestContext();
  });

  // =========================================================================
  // SCENARIO 1: Full Student Financial & Academic Lifecycle
  // =========================================================================
  it('Scenario 1: Complete Student Financial & Academic Lifecycle (Enrollment -> 6 Fees -> Partial/Full Pay -> 10 Lessons -> Progress)', async () => {
    // Step 1: Student is enrolled in class (performed by ctx init)
    expect(ctx.studentId).toBeDefined();
    expect(ctx.classId).toBeDefined();

    // Step 2: Generate 6 monthly tuition fees (R$ 120,00 each = 12000 cents) for 2027
    const feeIds: string[] = [];
    for (let month = 1; month <= 6; month++) {
      const dueDate = `2027-${String(month).padStart(2, '0')}-10`;
      const res = await request(ctx.env, '/api/v1/finance/fees', {
        method: 'POST',
        token: ctx.financeToken,
        body: {
          studentId: ctx.studentId,
          competenceMonth: month,
          competenceYear: 2027,
          dueDate,
          amountCents: 12000,
          installmentNumber: month,
        },
      });
      expect(res.status).toBe(201);
      feeIds.push(res.data.id);
    }
    expect(feeIds.length).toBe(6);

    // Step 3: Partial payment of Month 1 (R$ 50,00 = 5000 cents via PIX)
    const month1Id = feeIds[0]!;
    const partPayRes = await request(ctx.env, `/api/v1/finance/fees/${month1Id}/payments`, {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        amountCents: 5000,
        paymentDate: '2026-10-24',
        paymentMethod: 'PIX',
      },
    });
    expect(partPayRes.status).toBe(201);
    expect(partPayRes.data.fee.status).toBe('parcial');
    expect(partPayRes.data.fee.paidAmountCents).toBe(5000);

    // Verify cash transaction was created
    const cashRes1 = await request(ctx.env, '/api/v1/finance/cash', { token: ctx.financeToken });
    const cash1 = cashRes1.data.items.find((item: any) => item.feePaymentId === partPayRes.data.payment.id);
    expect(cash1).toBeDefined();
    expect(cash1.amountCents).toBe(5000);
    expect(cash1.type).toBe('entrada');

    // Step 4: Full settlement of remainder for Month 1 (R$ 70,00 = 7000 cents via dinheiro)
    const fullPayRes = await request(ctx.env, `/api/v1/finance/fees/${month1Id}/payments`, {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        amountCents: 7000,
        paymentDate: '2026-10-24',
        paymentMethod: 'dinheiro',
      },
    });
    expect(fullPayRes.status).toBe(201);
    expect(fullPayRes.data.fee.status).toBe('paga');
    expect(fullPayRes.data.fee.paidAmountCents).toBe(12000);

    // Step 5: Log attendance across 10 distinct dates for this class
    const attendanceDates = [
      '2026-03-01', '2026-03-03', '2026-03-05', '2026-03-08', '2026-03-10',
      '2026-03-12', '2026-03-15', '2026-03-17', '2026-03-19', '2026-03-22',
    ];

    for (let i = 0; i < attendanceDates.length; i++) {
      const date = attendanceDates[i]!;
      const status = i === 2 ? 'F' : i === 5 ? 'J' : 'P';
      const attRes = await request(ctx.env, '/api/attendance/batch', {
        method: 'PUT',
        token: ctx.adminToken,
        body: {
          classId: ctx.classId,
          date,
          records: [{ studentId: ctx.studentId, status }],
        },
      });
      expect(attRes.status).toBe(200);
    }

    // Step 6: Session Counting verifies 10 canonical distinct lessons
    const sessionRes = await request(ctx.env, `/api/v1/classes/${ctx.classId}/sessions`, {
      token: ctx.adminToken,
    });
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.data.total).toBe(10);

    const distinctLessonCount = await countDistinctClassLessons(ctx.env, ctx.classId);
    expect(distinctLessonCount).toBe(10);

    // Step 7: Academic progress & report evaluation
    const studentAttRes = await request(ctx.env, `/api/attendance?classId=${ctx.classId}`, {
      token: ctx.adminToken,
    });
    expect(studentAttRes.status).toBe(200);
    expect(studentAttRes.data.items.length).toBe(10);

    // Step 8: Financial standing check: 1 fee paid, 5 fees pending
    const feesListRes = await request(ctx.env, `/api/v1/finance/fees?studentId=${ctx.studentId}`, {
      token: ctx.financeToken,
    });
    const paidFees = feesListRes.data.items.filter((f: any) => f.status === 'paga');
    const openFees = feesListRes.data.items.filter((f: any) => f.status === 'aberto');
    expect(paidFees.length).toBe(1);
    expect(openFees.length).toBe(5);
  });

  // =========================================================================
  // SCENARIO 2: Mid-Semester Enrollment Lock with Financial Debt & Attendance Exclusion
  // =========================================================================
  it('Scenario 2: Mid-Semester Lock preserves historical attendance, excludes from future rosters, and maintains overdue debt', async () => {
    // Step 1: Record 3 initial attendances before locking
    const preLockDates = ['2026-04-01', '2026-04-03', '2026-04-05'];
    for (const date of preLockDates) {
      const res = await request(ctx.env, '/api/attendance/batch', {
        method: 'PUT',
        token: ctx.adminToken,
        body: {
          classId: ctx.classId,
          date,
          records: [{ studentId: ctx.studentId, status: 'P' }],
        },
      });
      expect(res.status).toBe(200);
    }

    // Step 2: Create tuition fees: Month 1 paid, Month 2 overdue
    const fee1 = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 3,
        competenceYear: 2026,
        dueDate: '2026-03-10',
        amountCents: 15000,
      },
    });
    // Pay Fee 1
    await request(ctx.env, `/api/v1/finance/fees/${fee1.data.id}/payments`, {
      method: 'POST',
      token: ctx.financeToken,
      body: { amountCents: 15000, paymentDate: '2026-03-10', paymentMethod: 'PIX' },
    });

    // Create Fee 2 (unpaid & overdue)
    const fee2 = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 4,
        competenceYear: 2026,
        dueDate: '2026-04-10', // Past date -> 'atrasada'
        amountCents: 15000,
      },
    });
    expect(fee2.status).toBe(201);

    // Step 3: Mid-semester lock request
    const lockRes = await request(ctx.env, `/api/v1/students/${ctx.studentId}/lock`, {
      method: 'POST',
      token: ctx.adminToken,
      body: { reason: 'Mudança de cidade' },
    });
    expect(lockRes.status).toBe(200);
    expect(lockRes.data.ok).toBe(true);

    // Step 4: Verify student enrollment is marked 'trancada'
    const classRoster = await request(ctx.env, `/api/students?classId=${ctx.classId}`, {
      token: ctx.adminToken,
    });
    const lockedStudent = classRoster.data.items.find((s: any) => s.id === ctx.studentId);
    expect(lockedStudent?.enrollment_status).toBe('trancada');

    const activeStudents = classRoster.data.items.filter((s: any) => s.enrollment_status === 'ativa');
    expect(activeStudents.some((s: any) => s.id === ctx.studentId)).toBe(false);

    // Step 5: Verify pre-lock attendance is 100% PRESERVED
    const histAttendance = await request(ctx.env, `/api/attendance?classId=${ctx.classId}`, {
      token: ctx.adminToken,
    });
    expect(histAttendance.status).toBe(200);
    expect(histAttendance.data.items.length).toBe(3);

    // Step 6: Verify unpaid debt persists in financial BI reports
    const biFees = await request(ctx.env, '/api/v1/finance/fees', {
      token: ctx.financeToken,
    });
    const overdueRecord = biFees.data.items.find((f: any) => f.id === fee2.data.id);
    expect(overdueRecord).toBeDefined();
    expect(overdueRecord.status).toBe('atrasada');
    expect(overdueRecord.amountCents).toBe(15000);
    expect(overdueRecord.paidAmountCents).toBe(0);
    expect(biFees.data.summary.overdueCount).toBeGreaterThanOrEqual(1);
    expect(biFees.data.summary.totalOverdueCents).toBeGreaterThanOrEqual(15000);
  });

  // =========================================================================
  // SCENARIO 3: Legacy IndexedDB Drain -> REST Migration -> Concurrency Conflict Recovery
  // =========================================================================
  it('Scenario 3: Legacy IndexedDB queue drain + concurrency conflict recovery (If-Match)', async () => {
    // Step 1: Simulate legacy IndexedDB with 3 uncommitted operations
    const dbName = 'frequencia-itb-pwa';
    const legacyDb = new Dexie(dbName);
    legacyDb.version(1).stores({ queue: '++id, entity, action, payload' });
    await legacyDb.open();

    await legacyDb.table('queue').bulkAdd([
      { entity: 'attendance', action: 'create', payload: { id: 'leg-1', date: '2026-01-01' } },
      { entity: 'attendance', action: 'create', payload: { id: 'leg-2', date: '2026-01-02' } },
      { entity: 'attendance', action: 'create', payload: { id: 'leg-3', date: '2026-01-03' } },
    ]);
    expect(await legacyDb.table('queue').count()).toBe(3);
    legacyDb.close();

    // Step 2: Application drain process
    const mockApiClient = {
      post: async (path: string, body: any) => {
        const res = await request(ctx.env, path, {
          method: 'POST',
          token: ctx.adminToken,
          body,
        });
        return res.data;
      },
    };

    const drainResult = await drainLegacyClientStorage(mockApiClient as any);
    expect(drainResult.drained).toBe(true);
    expect(drainResult.count).toBe(3);
    expect(localStorage.getItem('erpitb_legacy_drained')).toBe('true');

    // Verify local queue was cleared
    const checkDb = new Dexie(dbName);
    checkDb.version(1).stores({ queue: '++id, entity, action, payload' });
    await checkDb.open();
    expect(await checkDb.table('queue').count()).toBe(0);
    checkDb.close();

    // Re-drain attempt must be no-op
    const reDrain = await drainLegacyClientStorage(mockApiClient as any);
    expect(reDrain.drained).toBe(false);
    expect(reDrain.count).toBe(0);

    // Step 3: Concurrency Conflict simulation
    // User A reads student (version 1)
    const studentRow = await ctx.env.DB.prepare(`SELECT sync_version FROM students WHERE id = ?`).bind(ctx.studentId).first<{ sync_version: number }>();
    const v1 = studentRow?.sync_version ?? 1;

    // User B updates student (moves to version 2)
    const updateB = await request(ctx.env, `/api/students/${ctx.studentId}`, {
      method: 'PATCH',
      token: ctx.adminToken,
      ifMatch: `W/"${v1}"`,
      body: { name: 'Gabriel Martins Modificado por B' },
    });
    expect(updateB.status).toBe(200);

    // User A attempts update with stale version 1 -> HTTP 409 CONCURRENCY_CONFLICT
    const staleUpdateA = await request(ctx.env, `/api/students/${ctx.studentId}`, {
      method: 'PATCH',
      token: ctx.adminToken,
      ifMatch: `W/"${v1}"`,
      body: { name: 'Gabriel Martins Modificado por A' },
    });
    expect(staleUpdateA.status).toBe(409);
    expect(staleUpdateA.data.code).toBe('CONCURRENCY_CONFLICT');
    expect(staleUpdateA.data.serverVersion).toBe(2);

    // User A recovers: fetches serverVersion (2), reapplies merge with If-Match: W/"2"
    const freshVersion = staleUpdateA.data.serverVersion;
    const resolvedUpdateA = await request(ctx.env, `/api/students/${ctx.studentId}`, {
      method: 'PATCH',
      token: ctx.adminToken,
      ifMatch: `W/"${freshVersion}"`,
      body: { name: 'Gabriel Martins Merged por A' },
    });
    expect(resolvedUpdateA.status).toBe(200);

    // Final verification: database holds merged version
    const finalRow = await ctx.env.DB.prepare(`SELECT sync_version FROM students WHERE id = ?`).bind(ctx.studentId).first<{ sync_version: number }>();
    expect(finalRow?.sync_version).toBe(3);
  });

  // =========================================================================
  // SCENARIO 4: Financial Cash Flow Audit & Reversal with Least Privilege
  // =========================================================================
  it('Scenario 4: Cash Flow creation, audit logging, reversal offset, and role least privilege enforcement', async () => {
    // Step 1: User financeiro logs baseline cash balance
    const baseCashRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    const baseBalance = baseCashRes.data.summary.closingBalanceCents;

    // Step 2: Record cash inflow of R$ 1.500,00 (150000 cents) for institutional sponsorship
    const entryRes = await request(ctx.env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        type: 'entrada',
        category: 'patrocinio',
        description: 'Patrocínio Corporativo Anual',
        amountCents: 150000,
        paymentMethod: 'PIX',
        date: '2026-10-24',
      },
    });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.data.id;

    // Balance increased by 150000
    const postEntryCash = await request(ctx.env, '/api/v1/finance/cash', { token: ctx.financeToken });
    expect(postEntryCash.data.summary.closingBalanceCents).toBe(baseBalance + 150000);

    // Step 3: Reversal executed with reason
    const reversalReason = 'Patrocínio creditado na conta bancária de outra filial por engano';
    const revRes = await request(ctx.env, `/api/v1/finance/cash/entries/${entryId}/reversal`, {
      method: 'POST',
      token: ctx.financeToken,
      body: { reason: reversalReason },
    });
    expect(revRes.status).toBe(200);
    expect(revRes.data.ok).toBe(true);

    // Step 4: Verify ledger balances back to baseBalance
    const postRevCash = await request(ctx.env, '/api/v1/finance/cash', { token: ctx.financeToken });
    expect(postRevCash.data.summary.closingBalanceCents).toBe(baseBalance);

    // Verify compensating counter-entry exists
    const counterEntry = postRevCash.data.items.find(
      (item: any) => item.description.includes('[ESTORNO]') && item.amountCents === 150000,
    );
    expect(counterEntry).toBeDefined();
    expect(counterEntry.type).toBe('saida');

    // Step 5: Audit logs verify both creation and reversal were audited
    const auditRes = await request(ctx.env, '/api/v1/audit', {
      token: ctx.adminToken,
    });
    expect(auditRes.status).toBe(200);
    const auditLogs = auditRes.data.items || auditRes.data;
    const createCashAudit = auditLogs.find((log: any) => log.action === 'CREATE_CASH_ENTRY' && log.entity_id === entryId);
    expect(createCashAudit).toBeDefined();

    // Step 6: Least privilege enforcement: user financeiro denied from academic writes
    const illegalCourseRes = await request(ctx.env, '/api/courses', {
      method: 'POST',
      token: ctx.financeToken,
      body: { name: 'Curso Proibido', code: 'PROIB' },
    });
    expect(illegalCourseRes.status).toBe(403);
    expect(illegalCourseRes.data.error.code).toBe('FORBIDDEN');
  });

  // =========================================================================
  // SCENARIO 5: Admin Custom Branding Rollout & M2M Partner Integration
  // =========================================================================
  it('Scenario 5: Branding rollout with contrast enforcement + M2M partner integration lifecycle', async () => {
    // Step 1: Admin configures accessible custom branding
    const targetAccent = '#0F766E'; // Deep teal
    const targetWatermark = 'INSTITUTO TRANSFORMA BRASIL - DOCUMENTO AUDITADO 2026';

    const brandingRes = await request(ctx.env, '/api/v1/admin/branding', {
      method: 'PUT',
      token: ctx.adminToken,
      body: {
        appName: 'ERPITB Oficial',
        accentColor: targetAccent,
        printWatermarkText: targetWatermark,
      },
    });
    expect(brandingRes.status).toBe(200);
    expect(brandingRes.data.accentColor).toBe(targetAccent);
    expect(brandingRes.data.printWatermarkText).toBe(targetWatermark);

    // Verify contrast ratio > 3.0 against pure white
    const contrastRatio = calculateContrastRatioAgainstWhite(targetAccent);
    expect(contrastRatio).toBeGreaterThanOrEqual(3.0);

    // Step 2: Create M2M API key for auditor partner (scoped to finance:read and students:read)
    const keyRes = await request(ctx.env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: ctx.adminToken,
      body: {
        name: 'Chave de Auditoria Contábil Externa',
        scopes: ['finance:read', 'students:read'],
      },
    });
    expect(keyRes.status).toBe(201);
    const apiKeyId = keyRes.data.key.id;
    const apiKeySecret = keyRes.data.secret;
    expect(apiKeySecret).toMatch(/^itb_live_/);

    // Step 3: Partner queries student directory with redacted LGPD PII
    const studentsRes = await request(ctx.env, '/api/students', {
      apiKey: apiKeySecret,
    });
    expect(studentsRes.status).toBe(200);
    const student = studentsRes.data.items.find((s: any) => s.id === ctx.studentId);
    expect(student).toBeDefined();
    expect(student.name).toBe('Gabriel Martins');
    expect(student.cpf).toBeNull(); // Redacted
    expect(student.contact).toBeNull(); // Redacted

    // Step 4: Partner queries financial summary report
    const financeRes = await request(ctx.env, '/api/v1/finance/fees', {
      apiKey: apiKeySecret,
    });
    expect(financeRes.status).toBe(200);
    expect(financeRes.data.summary).toBeDefined();

    // Step 5: Partner attempt to write attendance or fee is rejected with 403 Forbidden
    const illegalWrite = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      apiKey: apiKeySecret,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 12,
        competenceYear: 2027,
        dueDate: '2027-12-10',
        amountCents: 10000,
      },
    });
    expect(illegalWrite.status).toBe(403);
    expect(illegalWrite.data.error.code).toBe('FORBIDDEN');

    // Step 6: Admin revokes the partner API key
    const revokeRes = await request(ctx.env, `/api/v1/admin/api-keys/${apiKeyId}/revoke`, {
      method: 'POST',
      token: ctx.adminToken,
    });
    expect(revokeRes.status).toBe(200);

    // Step 7: Subsequent access with revoked key receives 401 Unauthorized
    const postRevokeRes = await request(ctx.env, '/api/v1/finance/fees', {
      apiKey: apiKeySecret,
    });
    expect(postRevokeRes.status).toBe(401);
    expect(postRevokeRes.data.error.code).toBe('INVALID_API_KEY');
  });
});
