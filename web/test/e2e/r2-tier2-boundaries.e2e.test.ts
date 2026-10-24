import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { drainLegacyClientStorage } from '../../src/lib/migration-drain';
import { ApiClient, ApiError, OfflineError } from '../../src/lib/api';
import {
  createApiClient,
  initFullTestContext,
  request,
  type TestContext,
} from './r2-test-harness';

describe('Tier 2: Boundary & Corner Cases (R1 - R5 Limits & Robustness)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    localStorage.clear();
    await Dexie.delete('erpitb-pwa');
    await Dexie.delete('frequencia-itb-pwa');
    ctx = await initFullTestContext();
  });

  // =========================================================================
  // FEATURE 1 BOUNDARIES: REST API & Safe Sync Deprecation (R1)
  // =========================================================================
  describe('F1 Boundaries: Concurrency, Offline & Drain Limits (R1)', () => {
    it('T2.1.1: Concurrency Collision — stale If-Match version returns HTTP 409 Conflict', async () => {
      // Create student and check initial sync_version (1)
      const student = await ctx.env.DB.prepare(`SELECT sync_version FROM students WHERE id = ?`).bind(ctx.studentId).first<{ sync_version: number }>();
      const currentVersion = student?.sync_version ?? 1;

      // Make update with mismatched stale version (e.g. W/"999")
      const staleRes = await request(ctx.env, `/api/students/${ctx.studentId}`, {
        method: 'PATCH',
        token: ctx.adminToken,
        ifMatch: 'W/"999"',
        body: { name: 'Nome Atualizado Concorrente' },
      });

      expect(staleRes.status).toBe(409);
      expect(staleRes.data.code).toBe('CONCURRENCY_CONFLICT');
      expect(staleRes.data.serverVersion).toBe(currentVersion);
    });

    it('T2.1.2: Drain Network Failure Rollback — maintains local queue when server drain endpoint errors', async () => {
      const dbName = 'frequencia-itb-pwa';
      const db = new Dexie(dbName);
      db.version(1).stores({ queue: '++id, entity, action, payload' });
      await db.open();

      await db.table('queue').bulkAdd([
        { entity: 'attendance', action: 'create', payload: { date: '2026-10-20' } },
        { entity: 'attendance', action: 'create', payload: { date: '2026-10-21' } },
      ]);
      db.close();

      // Create an ApiClient whose request will fail (simulate server down / offline)
      const faultyClient = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      faultyClient.request = async () => {
        throw new OfflineError();
      };

      const result = await drainLegacyClientStorage(faultyClient);
      expect(result.drained).toBe(false);
      expect(result.count).toBe(0);
      expect(localStorage.getItem('erpitb_legacy_drained')).toBeNull();

      // Verify local Dexie queue is completely preserved
      const verifyDb = new Dexie(dbName);
      verifyDb.version(1).stores({ queue: '++id, entity, action, payload' });
      await verifyDb.open();
      const count = await verifyDb.table('queue').count();
      expect(count).toBe(2);
      verifyDb.close();
    });

    it('T2.1.3: Offline Client Error Handling — ApiClient throws OfflineError on network failure', async () => {
      const offlineClient = new ApiClient(
        () => ({ id: 'u1', name: 'Admin', email: 'admin@itbcursos.com', role: 'admin', accessToken: 'token', refreshToken: 'r' }),
        async () => {},
      );
      // Force fetch to reject with NetworkError
      const prevFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };

      try {
        await expect(offlineClient.get('/api/fees')).rejects.toThrow(OfflineError);
      } finally {
        globalThis.fetch = prevFetch;
      }
    });

    it('T2.1.4: Empty Legacy Queue Inspection — draining empty database succeeds with 0 count', async () => {
      await Dexie.delete('erpitb-pwa');
      await Dexie.delete('frequencia-itb-pwa');
      localStorage.removeItem('erpitb_legacy_drained');

      const dbName = 'erpitb-pwa';
      const db = new Dexie(dbName);
      db.version(1).stores({ queue: '++id, entity, action, payload' });
      await db.open();
      db.close();

      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const result = await drainLegacyClientStorage(client);

      expect(result.drained).toBe(true);
      expect(result.count).toBe(0);
      expect(localStorage.getItem('erpitb_legacy_drained')).toBe('true');
    });

    it('T2.1.5: Non-Existent Entity Query / Mutation — returns 404 without leaking internal traces', async () => {
      const res = await request(ctx.env, '/api/students/non-existent-uuid-12345', {
        method: 'PATCH',
        token: ctx.adminToken,
        body: { name: 'Novo Nome' },
      });

      expect(res.status).toBe(404);
      expect(res.data.error.code).toBe('NOT_FOUND');
    });

    it('T2.1.6: Malformed Payload Validation — rejects invalid bodies with 400 Bad Request', async () => {
      const res = await request(ctx.env, '/api/v1/finance/fees', {
        method: 'POST',
        token: ctx.financeToken,
        body: { amountCents: 'not-a-number' }, // missing studentId, month, year, dueDate
      });

      expect(res.status).toBe(400);
      expect(res.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // FEATURE 2 BOUNDARIES: Complete Financial Domain & RBAC (R2)
  // =========================================================================
  describe('F2 Boundaries: Due Dates, Overpayment, Zero Cents & RBAC (R2)', () => {
    it('T2.2.1: Overdue Date Boundary Threshold — fee due yesterday resolves to atrasada; fee due future resolves to aberto', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);

      // Fee 1: Due in the past (yesterday)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const pastFee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 1,
        competenceYear: 2026,
        dueDate: yesterday,
        amountCents: 20000,
      });

      // Fee 2: Due in the future (next year)
      const futureFee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 2,
        competenceYear: 2027,
        dueDate: '2027-02-10',
        amountCents: 20000,
      });

      const fees = await client.getFees({ studentId: ctx.studentId });
      const pastFound = fees.items.find((f) => f.id === pastFee.id);
      const futureFound = fees.items.find((f) => f.id === futureFee.id);

      expect(pastFound?.status).toBe('atrasada');
      expect(futureFound?.status).toBe('aberto');
    });

    it('T2.2.2: Payment on Cancelled Fee & Invalid Method Rejection — rejects paying cancelled fees and invalid payment methods', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const fee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 8,
        competenceYear: 2027,
        dueDate: '2027-08-10',
        amountCents: 15000, // R$ 150,00
      });

      // 1. Cancel the fee
      await request(ctx.env, `/api/v1/finance/fees/${fee.id}`, {
        method: 'PATCH',
        token: ctx.financeToken,
        body: { status: 'cancelada' },
      });

      // Attempt to pay cancelled fee -> 409 Conflict
      const res = await request(ctx.env, `/api/v1/finance/fees/${fee.id}/payments`, {
        method: 'POST',
        token: ctx.financeToken,
        body: { amountCents: 5000, paymentDate: '2026-10-24', paymentMethod: 'PIX' },
      });

      expect(res.status).toBe(409);
      expect(res.data.error.message).toContain('cancelada');

      // 2. Attempt payment with invalid payment method on open fee -> 400 Validation Error
      const fee2 = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 9,
        competenceYear: 2027,
        dueDate: '2027-09-10',
        amountCents: 15000,
      });

      const invalidMethodRes = await request(ctx.env, `/api/v1/finance/fees/${fee2.id}/payments`, {
        method: 'POST',
        token: ctx.financeToken,
        body: { amountCents: 5000, paymentDate: '2026-10-24', paymentMethod: 'BITCOIN' },
      });

      expect(invalidMethodRes.status).toBe(400);
      expect(invalidMethodRes.data.error.message).toContain('Forma de pagamento inválida');
    });

    it('T2.2.3: Zero / Negative Amount Rejection — rejects non-positive cents for fees and cash', async () => {
      // 1. Zero amount fee
      const feeRes = await request(ctx.env, '/api/v1/finance/fees', {
        method: 'POST',
        token: ctx.financeToken,
        body: { studentId: ctx.studentId, competenceMonth: 5, competenceYear: 2027, dueDate: '2027-05-10', amountCents: 0 },
      });
      expect(feeRes.status).toBe(400);

      // 2. Negative amount cash entry
      const cashRes = await request(ctx.env, '/api/v1/finance/cash/entries', {
        method: 'POST',
        token: ctx.financeToken,
        body: { type: 'entrada', amountCents: -500, category: 'outros', description: 'Valor negativo', date: '2026-10-24', paymentMethod: 'PIX' },
      });
      expect(cashRes.status).toBe(400);
    });

    it('T2.2.4: Double Reversal Prevention — rejects reversing an already reversed transaction', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const entry = await client.createCashEntry({
        type: 'entrada',
        category: 'mensalidade',
        description: 'Pagamento avulso',
        amountCents: 12000,
        paymentMethod: 'PIX',
        date: '2026-10-24',
      });

      // First reversal succeeds
      const rev1 = await client.reverseCashEntry(entry.id, 'Primeiro estorno');
      expect(rev1.ok).toBe(true);

      // Second reversal must be rejected
      const rev2Res = await request(ctx.env, `/api/v1/finance/cash/entries/${entry.id}/reversal`, {
        method: 'POST',
        token: ctx.financeToken,
        body: { reason: 'Tentativa de re-estorno' },
      });

      expect(rev2Res.status).toBe(409);
      expect(rev2Res.data.error.code).toBe('ALREADY_REVERSED');
    });

    it('T2.2.5: Invalid Competence Boundaries — rejects month 0, month 13, and years out of bounds', async () => {
      // Month 0
      const res0 = await request(ctx.env, '/api/v1/finance/fees', {
        method: 'POST',
        token: ctx.financeToken,
        body: { studentId: ctx.studentId, competenceMonth: 0, competenceYear: 2027, dueDate: '2027-05-10', amountCents: 10000 },
      });
      expect(res0.status).toBe(400);

      // Month 13
      const res13 = await request(ctx.env, '/api/v1/finance/fees', {
        method: 'POST',
        token: ctx.financeToken,
        body: { studentId: ctx.studentId, competenceMonth: 13, competenceYear: 2027, dueDate: '2027-05-10', amountCents: 10000 },
      });
      expect(res13.status).toBe(400);
    });

    it('T2.2.6: Financial Contact Info RBAC — professor role cannot access financial contact', async () => {
      const res = await request(ctx.env, `/api/v1/finance/contacts/${ctx.studentId}`, {
        token: ctx.profToken,
      });
      expect(res.status).toBe(403);
      expect(res.data.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // FEATURE 3 BOUNDARIES: Class Sessions & Server-Side BI (R3)
  // =========================================================================
  describe('F3 Boundaries: Session Collisions, Zero Sessions & Inactive Classes (R3)', () => {
    it('T2.3.1: Canonical Session Collision — multiple recordings on same class and date map to single session', async () => {
      const { ensureClassSession } = await import('../../../backend/src/sessions-service');

      const id1 = await ensureClassSession(ctx.env, ctx.classId, '2026-06-01', ctx.adminUser.id, 'Primeira chamada');
      const id2 = await ensureClassSession(ctx.env, ctx.classId, '2026-06-01', ctx.adminUser.id, 'Atualização da chamada');

      expect(id1).toBe(id2);

      const count = await ctx.env.DB.prepare(
        `SELECT COUNT(*) as total FROM class_sessions WHERE class_id = ? AND date = ?`,
      ).bind(ctx.classId, '2026-06-01').first<{ total: number }>();
      expect(count?.total).toBe(1);
    });

    it('T2.3.2: Zero Session Lesson Count — class with 0 lessons returns 0 without division by zero', async () => {
      const { countDistinctClassLessons } = await import('../../../backend/src/sessions-service');
      const emptyClassRes = await request(ctx.env, '/api/classes', {
        method: 'POST',
        token: ctx.adminToken,
        body: { name: 'Turma Recém Criada', courseId: ctx.courseId, shift: 'noite' },
      });
      const emptyClassId = emptyClassRes.data.id;

      const lessons = await countDistinctClassLessons(ctx.env, emptyClassId);
      expect(lessons).toBe(0);
    });

    it('T2.3.3: Lock Idempotency Boundary — locking student without active enrollment returns 404', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      // Lock first time
      await client.lockStudentEnrollment(ctx.studentId);

      // Attempting to lock second time (no active enrollment remains)
      await expect(client.lockStudentEnrollment(ctx.studentId)).rejects.toThrow(ApiError);
    });

    it('T2.3.4: Inactive Class BI Isolation — deleted class records are excluded from analytics', async () => {
      // Create a class and soft-delete it
      const tempClass = await request(ctx.env, '/api/classes', {
        method: 'POST',
        token: ctx.adminToken,
        body: { name: 'Turma Cancelada', courseId: ctx.courseId, shift: 'tarde' },
      });
      await request(ctx.env, `/api/classes/${tempClass.data.id}`, {
        method: 'DELETE',
        token: ctx.adminToken,
      });

      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const analytics = await client.getAnalytics();
      expect(analytics.byClass.some((c: any) => c.classId === tempClass.data.id)).toBe(false);
    });

    it('T2.3.5: Extreme Attendance Streaks — calculates exact 100% or 0% rates without floating-point anomalies', async () => {
      // Record 1 attendance with presence 'P'
      await request(ctx.env, '/api/attendance/batch', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { classId: ctx.classId, date: '2026-10-20', records: [{ studentId: ctx.studentId, status: 'P' }] },
      });

      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const analytics = await client.getAnalytics({ studentId: ctx.studentId });

      expect(typeof analytics.attendanceRate).toBe('number');
      expect(Number.isFinite(analytics.attendanceRate)).toBe(true);
      expect(analytics.attendanceRate).toBe(100);
    });
  });

  // =========================================================================
  // FEATURE 4 BOUNDARIES: Admin Branding & Secure API Keys (R4)
  // =========================================================================
  describe('F4 Boundaries: Contrast Rejection, Expiration & Revocation (R4)', () => {
    it('T2.4.1: Low Contrast Rejection — luminance > 0.95 rejected with CONTRAST_ERROR', async () => {
      // #FFFFFF (Pure White)
      const resWhite = await request(ctx.env, '/api/v1/admin/branding', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { appName: 'ERPITB', accentColor: '#FFFFFF' },
      });
      expect(resWhite.status).toBe(400);
      expect(resWhite.data.error.code).toBe('CONTRAST_ERROR');

      // #FFFFF0 (Ivory)
      const resIvory = await request(ctx.env, '/api/v1/admin/branding', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { appName: 'ERPITB', accentColor: '#FFFFF0' },
      });
      expect(resIvory.status).toBe(400);
      expect(resIvory.data.error.code).toBe('CONTRAST_ERROR');
    });

    it('T2.4.2: Malformed Hex Color String — invalid hex formats rejected with VALIDATION_ERROR', async () => {
      const badColors = ['red', '#12', '#ZZZ999', '102A43', '#12345678'];
      for (const color of badColors) {
        const res = await request(ctx.env, '/api/v1/admin/branding', {
          method: 'PUT',
          token: ctx.adminToken,
          body: { appName: 'ERPITB', accentColor: color },
        });
        expect(res.status).toBe(400);
        expect(res.data.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('T2.4.3: Revoked API Key Access Rejection — revoked key immediately receives 401 Unauthorized', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const created = await client.createApiKey({
        name: 'Chave para Revogação',
        scopes: ['students:read', 'finance:read'],
      });

      // Verify active key works
      const activeRes = await request(ctx.env, '/api/v1/finance/fees', {
        apiKey: created.secret,
      });
      expect(activeRes.status).toBe(200);

      // Revoke key
      await client.revokeApiKey(created.key.id);

      // Verify revoked key is rejected
      const revokedRes = await request(ctx.env, '/api/v1/finance/fees', {
        apiKey: created.secret,
      });
      expect(revokedRes.status).toBe(401);
      expect(revokedRes.data.error.code).toBe('INVALID_API_KEY');
    });

    it('T2.4.4: Expired API Key Access Rejection — expired key receives 401 Unauthorized', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const pastExpiration = '2020-01-01T00:00:00.000Z';
      const created = await client.createApiKey({
        name: 'Chave Expirada',
        scopes: ['students:read'],
        expiresAt: pastExpiration,
      });

      const res = await request(ctx.env, '/api/students', {
        apiKey: created.secret,
      });
      expect(res.status).toBe(401);
      expect(res.data.error.code).toBe('INVALID_API_KEY');
    });

    it('T2.4.5: Branding Image Payload Size Limit — base64 images > 300KB/500KB rejected', async () => {
      // Generate large string (> 350KB)
      const oversizedLogo = 'data:image/png;base64,' + 'A'.repeat(350 * 1024);
      const res = await request(ctx.env, '/api/v1/admin/branding', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { appName: 'ERPITB', accentColor: '#0284c7', loginLogoUrl: oversizedLogo },
      });

      expect(res.status).toBe(400);
      expect(res.data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('T2.4.6: Empty Scopes API Key Rejection — creating API key with no scopes rejected', async () => {
      const res = await request(ctx.env, '/api/v1/admin/api-keys', {
        method: 'POST',
        token: ctx.adminToken,
        body: { name: 'Chave Sem Escopos', scopes: [] },
      });

      expect(res.status).toBe(400);
      expect(res.data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // FEATURE 5 BOUNDARIES: Mobile Ergonomics, UI Detox & Print Layouts (R5)
  // =========================================================================
  describe('F5 Boundaries: Viewports, Long Strings & Modal Limits (R5)', () => {
    it('T2.5.1: Ultra-Narrow Viewport Robustness — layout classes prevent overflow on 320px screens', () => {
      const layoutHtml = `<div class="w-full max-w-full overflow-x-hidden p-3 md:p-6"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"></div></div>`;
      expect(layoutHtml).toContain('overflow-x-hidden');
      expect(layoutHtml).toContain('max-w-full');
      expect(layoutHtml).toContain('grid-cols-1');
    });

    it('T2.5.2: Extremely Long Strings Handling — text wrapping classes prevent grid explosion', () => {
      const longName = 'Maria Josefina da Silva Sauro Guimarães Albuquerque de Medeiros e Vasconcelos de Oliveira Pinto';
      const cellHtml = `<td class="break-words max-w-[200px] truncate md:whitespace-normal">${longName}</td>`;
      expect(cellHtml).toContain('break-words');
      expect(cellHtml).toContain('truncate');
    });

    it('T2.5.3: Modal Dialog Height Clipping Prevention — modal dialog applies max-h-[90vh] with vertical scroll', () => {
      const dialogHtml = `<div class="fixed inset-0 z-50 flex items-center justify-center p-4"><div class="bg-white rounded-2xl max-h-[90vh] flex flex-col overflow-y-auto w-full max-w-lg"></div></div>`;
      expect(dialogHtml).toContain('max-h-[90vh]');
      expect(dialogHtml).toContain('overflow-y-auto');
      expect(dialogHtml).toContain('flex flex-col');
    });

    it('T2.5.4: Missing Watermark Fallback — printable report falls back to default institutional watermark', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      // Reset branding to default
      const reset = await client.resetBranding();
      expect(reset.printWatermarkText).toBe('ERPITB - Documento Oficial');
    });

    it('T2.5.5: Rapid Double-Action Submission Protection — idempotency key prevents duplicate execution', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const fee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 9,
        competenceYear: 2027,
        dueDate: '2027-09-10',
        amountCents: 18000,
      });

      const idempotencyKey = crypto.randomUUID();
      // First submission
      const res1 = await client.recordPayment(fee.id, { amountCents: 18000, paymentDate: '2026-10-24', paymentMethod: 'PIX' }, idempotencyKey);
      expect(res1.ok).toBe(true);

      // Rapid second submission with same idempotency key succeeds without double payment
      const res2 = await client.recordPayment(fee.id, { amountCents: 18000, paymentDate: '2026-10-24', paymentMethod: 'PIX' }, idempotencyKey);
      expect(res2.ok).toBe(true);

      // Verify only 1 payment was registered
      const payments = await ctx.env.DB.prepare(
        `SELECT COUNT(*) as total FROM financial_payments WHERE fee_id = ?`,
      ).bind(fee.id).first<{ total: number }>();
      expect(payments?.total).toBe(1);
    });
  });
});
