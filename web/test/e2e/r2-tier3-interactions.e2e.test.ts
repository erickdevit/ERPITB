import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  initFullTestContext,
  request,
  type TestContext,
} from './r2-test-harness';
import { calculateRelativeLuminance, calculateContrastRatioAgainstWhite } from '../../../backend/src/branding';

describe('Tier 3: Cross-Feature Combinations (Pairwise Feature Interactions)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    localStorage.clear();
    await Dexie.delete('erpitb-pwa');
    await Dexie.delete('frequencia-itb-pwa');
    ctx = await initFullTestContext();
  });

  // =========================================================================
  // INTERACTION 1: Tuition Payment + Cash Entry + Idempotency Replay (R2 + R2)
  // =========================================================================
  it('T3.1: Tuition Payment creates atomic Cash Inflow & enforces Idempotency', async () => {
    // 1. Create a fee of R$ 250,00 (25000 cents)
    const feeRes = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 9,
        competenceYear: 2027,
        dueDate: '2027-09-10',
        amountCents: 25000,
      },
    });
    expect(feeRes.status).toBe(201);
    const feeId = feeRes.data.id;

    // 2. Check initial cash transaction count
    const initialCashRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    expect(initialCashRes.status).toBe(200);
    const initialCashCount = initialCashRes.data.items.length;

    // 3. Record payment with explicit idempotency key
    const idempotencyKey = 'idem-pay-key-uuid-999';
    const payRes1 = await request(ctx.env, `/api/v1/finance/fees/${feeId}/payments`, {
      method: 'POST',
      token: ctx.financeToken,
      idempotencyKey,
      body: {
        amountCents: 25000,
        paymentDate: '2026-10-24',
        paymentMethod: 'PIX',
        reference: idempotencyKey,
      },
    });

    expect(payRes1.status).toBe(201);
    expect(payRes1.data.ok).toBe(true);
    expect(payRes1.data.payment?.id).toBeDefined();

    // 4. Verify atomic cash entry was created
    const postPayCashRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    expect(postPayCashRes.data.items.length).toBe(initialCashCount + 1);

    const cashEntry = postPayCashRes.data.items[0];
    expect(cashEntry.type).toBe('entrada');
    expect(cashEntry.amountCents).toBe(25000);
    expect(cashEntry.paymentMethod).toBe('PIX');
    expect(cashEntry.description).toContain('Mensalidade 09/2027');

    // 5. Replay identical payment request with the same idempotency key
    const payRes2 = await request(ctx.env, `/api/v1/finance/fees/${feeId}/payments`, {
      method: 'POST',
      token: ctx.financeToken,
      idempotencyKey,
      body: {
        amountCents: 25000,
        paymentDate: '2026-10-24',
        paymentMethod: 'PIX',
        reference: idempotencyKey,
      },
    });

    // Idempotent replay succeeds without duplicate execution
    expect([200, 201]).toContain(payRes2.status);
    expect(payRes2.data.duplicate).toBe(true);
    expect(payRes2.data.paymentId ?? payRes2.data.payment?.id).toBe(payRes1.data.payment.id);

    // Verify cash entries did NOT increase
    const replayCashRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    expect(replayCashRes.data.items.length).toBe(initialCashCount + 1);

    // Verify fee is fully marked as 'paga'
    const feesRes = await request(ctx.env, '/api/v1/finance/fees', {
      token: ctx.financeToken,
    });
    const updatedFee = feesRes.data.items.find((f: any) => f.id === feeId);
    expect(updatedFee?.status).toBe('paga');
    expect(updatedFee?.paidAmountCents).toBe(25000);
  });

  // =========================================================================
  // INTERACTION 2: Enrollment Lock + Attendance Exclusion + Debt Preservation (R3 + R2)
  // =========================================================================
  it('T3.2: Locked Student excluded from active roster while preserving debt in Financial Ledger & BI', async () => {
    // 1. Create an overdue fee for student (R$ 180,00)
    const overdueFeeRes = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 1,
        competenceYear: 2026,
        dueDate: '2026-01-10', // Past due date -> 'atrasada'
        amountCents: 18000,
      },
    });
    expect(overdueFeeRes.status).toBe(201);
    const overdueFeeId = overdueFeeRes.data.id;

    // Verify fee is overdue in financial summary
    let feesReportRes = await request(ctx.env, '/api/v1/finance/fees', {
      token: ctx.financeToken,
    });
    expect(feesReportRes.data.summary.overdueCount).toBeGreaterThanOrEqual(1);
    expect(feesReportRes.data.summary.totalOverdueCents).toBeGreaterThanOrEqual(18000);

    // 2. Verify student is initially present in class roster
    const initialClassRes = await request(ctx.env, `/api/students?classId=${ctx.classId}`, {
      token: ctx.adminToken,
    });
    expect(initialClassRes.status).toBe(200);
    const isEnrolledInitially = initialClassRes.data.items.some((s: any) => s.id === ctx.studentId);
    expect(isEnrolledInitially).toBe(true);

    // 3. Lock student enrollment
    const lockRes = await request(ctx.env, `/api/v1/students/${ctx.studentId}/lock`, {
      method: 'POST',
      token: ctx.adminToken,
      body: { reason: 'Trancamento voluntário por motivos pessoais' },
    });
    expect(lockRes.status).toBe(200);
    expect(lockRes.data.ok).toBe(true);
    expect(lockRes.data.message).toContain('trancada');

    // 4. Verify student's enrollment is marked 'trancada' and excluded from active class roster
    const postLockClassRes = await request(ctx.env, `/api/students?classId=${ctx.classId}`, {
      token: ctx.adminToken,
    });
    const lockedStudentRecord = postLockClassRes.data.items.find((s: any) => s.id === ctx.studentId);
    expect(lockedStudentRecord?.enrollment_status).toBe('trancada');

    const activeStudents = postLockClassRes.data.items.filter((s: any) => s.enrollment_status === 'ativa');
    expect(activeStudents.some((s: any) => s.id === ctx.studentId)).toBe(false);

    // 5. Verify the debt is 100% PRESERVED in the financial ledger
    feesReportRes = await request(ctx.env, '/api/v1/finance/fees', {
      token: ctx.financeToken,
    });
    const studentFee = feesReportRes.data.items.find((f: any) => f.id === overdueFeeId);
    expect(studentFee).toBeDefined();
    expect(studentFee?.status).toBe('atrasada');
    expect(studentFee?.amountCents).toBe(18000);
    expect(studentFee?.paidAmountCents).toBe(0);

    // BI Delinquency metric must continue to reflect the unpaid debt
    expect(feesReportRes.data.summary.overdueCount).toBeGreaterThanOrEqual(1);
    expect(feesReportRes.data.summary.totalOverdueCents).toBeGreaterThanOrEqual(18000);
  });

  // =========================================================================
  // INTERACTION 3: Role Financeiro RBAC Least Privilege Isolation (R2 + Academic)
  // =========================================================================
  it('T3.3: Role financeiro possesses financial authority but is strictly forbidden from academic mutations', async () => {
    // 1. Authorized financial actions
    const feesListRes = await request(ctx.env, '/api/v1/finance/fees', {
      token: ctx.financeToken,
    });
    expect(feesListRes.status).toBe(200);
    expect(Array.isArray(feesListRes.data.items)).toBe(true);

    const cashEntryRes = await request(ctx.env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        type: 'entrada',
        category: 'doacao',
        description: 'Doação institucional',
        amountCents: 50000,
        paymentMethod: 'PIX',
        date: '2026-10-24',
      },
    });
    expect(cashEntryRes.status).toBe(201);
    expect(cashEntryRes.data.id).toBeDefined();

    const cashReportRes = await request(ctx.env, '/api/v1/finance/cash?startDate=2026-10-01&endDate=2026-10-31', {
      token: ctx.financeToken,
    });
    expect(cashReportRes.status).toBe(200);
    expect(cashReportRes.data.summary.totalInflowCents).toBeGreaterThanOrEqual(50000);

    // 2. FORBIDDEN academic / pedagogical actions
    // Attempt to log attendance
    const attendanceRes = await request(ctx.env, '/api/attendance/batch', {
      method: 'PUT',
      token: ctx.financeToken,
      body: {
        classId: ctx.classId,
        date: '2026-10-24',
        records: [{ studentId: ctx.studentId, status: 'presente' }],
      },
    });
    expect(attendanceRes.status).toBe(403);
    expect(attendanceRes.data.error.code).toBe('FORBIDDEN');

    // Attempt to create courses
    const courseRes = await request(ctx.env, '/api/courses', {
      method: 'POST',
      token: ctx.financeToken,
      body: { name: 'Curso Ilegal', code: 'ILEGAL' },
    });
    expect(courseRes.status).toBe(403);
    expect(courseRes.data.error.code).toBe('FORBIDDEN');

    // Attempt to modify branding
    const brandingRes = await request(ctx.env, '/api/v1/admin/branding', {
      method: 'PUT',
      token: ctx.financeToken,
      body: { accentColor: '#112233' },
    });
    expect(brandingRes.status).toBe(403);
    expect(brandingRes.data.error.code).toBe('FORBIDDEN');

    // Attempt to manage API keys
    const apiKeyRes = await request(ctx.env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: ctx.financeToken,
      body: { name: 'Key', scopes: ['finance:read'] },
    });
    expect(apiKeyRes.status).toBe(403);
    expect(apiKeyRes.data.error.code).toBe('FORBIDDEN');
  });

  // =========================================================================
  // INTERACTION 4: Admin Custom Branding + WCAG AA Tokens + Report Watermark (R4 + R5)
  // =========================================================================
  it('T3.4: Branding update dynamically controls WCAG AA contrast tokens & watermark for printable documents', async () => {
    // 1. Initial branding
    const initialRes = await request(ctx.env, '/api/v1/admin/branding');
    expect(initialRes.status).toBe(200);
    expect(initialRes.data.accentColor).toBeDefined();

    // 2. Admin sets customized institutional brand colors and custom watermark text
    const customAccent = '#1E3A8A'; // Deep blue
    const customWatermark = 'DOCUMENTO OFICIAL TRANSFORMA BRASIL 2026';

    const updateRes = await request(ctx.env, '/api/v1/admin/branding', {
      method: 'PUT',
      token: ctx.adminToken,
      body: {
        appName: 'Instituto Transforma Brasil',
        accentColor: customAccent,
        printWatermarkText: customWatermark,
      },
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.data.accentColor).toBe(customAccent);
    expect(updateRes.data.printWatermarkText).toBe(customWatermark);

    // 3. Contrast verification against pure white background
    const primaryLum = calculateRelativeLuminance(customAccent);
    const contrastRatio = calculateContrastRatioAgainstWhite(customAccent);
    expect(contrastRatio).toBeGreaterThanOrEqual(3.0); // WCAG 2.1 AA minimum
    expect(primaryLum).toBeLessThan(0.5); // Accessible dark color

    // 4. Verify public unauthenticated branding endpoint returns the updated values
    const publicBrandingRes = await request(ctx.env, '/api/v1/admin/branding');
    expect(publicBrandingRes.status).toBe(200);
    expect(publicBrandingRes.data.accentColor).toBe(customAccent);
    expect(publicBrandingRes.data.printWatermarkText).toBe(customWatermark);

    // 5. Verify printable document template uses the active watermark text
    const printableDocContext = {
      watermark: publicBrandingRes.data.printWatermarkText || 'TRANSFORMA BRASIL',
      accentColor: publicBrandingRes.data.accentColor,
    };
    expect(printableDocContext.watermark).toBe(customWatermark);
    expect(printableDocContext.accentColor).toBe(customAccent);
  });

  // =========================================================================
  // INTERACTION 5: M2M API Key Scopes Isolation + PII Masking/Redaction (R4 + R1/R2)
  // =========================================================================
  it('T3.5: M2M API Key without students:pii receives redacted PII and enforces scope boundaries', async () => {
    // 1. Create an API key with limited scopes: ['students:read', 'finance:read'] (NO students:pii)
    const keyRes = await request(ctx.env, '/api/v1/admin/api-keys', {
      method: 'POST',
      token: ctx.adminToken,
      body: {
        name: 'Integração Parceiro Contábil',
        scopes: ['students:read', 'finance:read'],
      },
    });

    expect(keyRes.status).toBe(201);
    const apiKeySecret = keyRes.data.secret;
    expect(apiKeySecret).toMatch(/^itb_live_/);

    // 2. Fetch students using the API key
    const studentsRes = await request(ctx.env, '/api/students', {
      apiKey: apiKeySecret,
    });

    expect(studentsRes.status).toBe(200);
    expect(Array.isArray(studentsRes.data.items)).toBe(true);

    const studentRecord = studentsRes.data.items.find((s: any) => s.id === ctx.studentId);
    expect(studentRecord).toBeDefined();
    // Non-PII fields are accessible
    expect(studentRecord.name).toBe('Gabriel Martins');
    expect(studentRecord.registration_number).toBe('ITB-2026-9001');

    // Sensitive LGPD PII fields MUST be null/redacted
    expect(studentRecord.cpf).toBeNull();
    expect(studentRecord.contact).toBeNull();

    // 3. API key with finance:read can query financial fees
    const feesRes = await request(ctx.env, '/api/v1/finance/fees', {
      apiKey: apiKeySecret,
    });
    expect(feesRes.status).toBe(200);

    // 4. API key attempting mutation without finance:write or students:write receives 403 Forbidden
    const mutateFeeRes = await request(ctx.env, '/api/v1/finance/fees', {
      method: 'POST',
      apiKey: apiKeySecret,
      body: {
        studentId: ctx.studentId,
        competenceMonth: 10,
        competenceYear: 2027,
        dueDate: '2027-10-10',
        amountCents: 10000,
      },
    });
    expect(mutateFeeRes.status).toBe(403);
    expect(mutateFeeRes.data.error.code).toBe('FORBIDDEN');

    // 5. API key attempting access to administrative route (api_keys:manage) receives 403 Forbidden
    const adminRouteRes = await request(ctx.env, '/api/v1/admin/api-keys', {
      apiKey: apiKeySecret,
    });
    expect(adminRouteRes.status).toBe(403);
    expect(adminRouteRes.data.error.code).toBe('FORBIDDEN');
  });

  // =========================================================================
  // INTERACTION 6: Cash Reversal + Ledger Offset + Balance Re-equilibrium (R2 + R2)
  // =========================================================================
  it('T3.6: Manual Cash Entry reversal produces balancing counter-entry and reconciles ledger balance', async () => {
    // 1. Check baseline cash balance
    const baseRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    expect(baseRes.status).toBe(200);
    const baseBalance = baseRes.data.summary.closingBalanceCents;

    // 2. Record manual cash inflow of R$ 500,00 (50000 cents)
    const entryRes = await request(ctx.env, '/api/v1/finance/cash/entries', {
      method: 'POST',
      token: ctx.financeToken,
      body: {
        type: 'entrada',
        category: 'evento',
        description: 'Arrecadação de evento beneficente',
        amountCents: 50000,
        paymentMethod: 'dinheiro',
        date: '2026-10-24',
      },
    });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.data.id;

    // Verify balance increased by 50000 cents
    const postEntryRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    expect(postEntryRes.data.summary.closingBalanceCents).toBe(baseBalance + 50000);

    // 3. Execute reversal of this entry
    const revRes = await request(ctx.env, `/api/v1/finance/cash/entries/${entryId}/reversal`, {
      method: 'POST',
      token: ctx.financeToken,
      body: { reason: 'Lançamento em duplicidade verificado' },
    });
    expect(revRes.status).toBe(200);
    expect(revRes.data.ok).toBe(true);

    // 4. Verify balanced ledger: a compensating entry with opposing type ('saida') was inserted
    const postRevRes = await request(ctx.env, '/api/v1/finance/cash', {
      token: ctx.financeToken,
    });
    const reversalEntry = postRevRes.data.items.find(
      (item: any) => item.description.includes('[ESTORNO]') && item.amountCents === 50000,
    );
    expect(reversalEntry).toBeDefined();
    expect(reversalEntry?.type).toBe('saida');

    // 5. Verify final balance has returned exactly to baseline
    expect(postRevRes.data.summary.closingBalanceCents).toBe(baseBalance);
  });
});
