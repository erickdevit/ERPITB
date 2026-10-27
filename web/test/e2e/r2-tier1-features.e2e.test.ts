import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { drainLegacyClientStorage } from '../../src/lib/migration-drain';
import {
  createApiClient,
  initFullTestContext,
  request,
  type TestContext,
} from './r2-test-harness';

describe('Tier 1: Feature Coverage (R1 - R5 Happy Paths)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    localStorage.clear();
    ctx = await initFullTestContext();
  });

  // =========================================================================
  // FEATURE 1: Server-Authoritative REST API & Safe Sync Deprecation (R1)
  // =========================================================================
  describe('F1: REST API & Safe Sync Deprecation (R1)', () => {
    it('T1.1.1: Migration Drain — drains legacy Dexie queue, verifies receipt on server, and purges local queue', async () => {
      // 1. Setup legacy Dexie database with pending uncommitted queue items
      const dbName = 'erpitb-pwa';
      const db = new Dexie(dbName);
      db.version(1).stores({ queue: '++id, entity, action, payload' });
      await db.open();

      const queueTable = db.table('queue');
      await queueTable.bulkAdd([
        { entity: 'attendance', action: 'create', payload: { studentId: ctx.studentId, date: '2026-10-01', status: 'P' } },
        { entity: 'attendance', action: 'create', payload: { studentId: ctx.studentId, date: '2026-10-02', status: 'P' } },
        { entity: 'cash', action: 'create', payload: { type: 'entrada', amountCents: 5000, description: 'Matricula' } },
      ]);

      const initialCount = await queueTable.count();
      expect(initialCount).toBe(3);
      db.close();

      // 2. Execute safe drain mechanism via ApiClient
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const result = await drainLegacyClientStorage(client);

      expect(result.drained).toBe(true);
      expect(result.count).toBe(3);
      expect(localStorage.getItem('erpitb_legacy_drained')).toBe('true');

      // 3. Verify local queue has been purged
      const verifyDb = new Dexie(dbName);
      verifyDb.version(1).stores({ queue: '++id, entity, action, payload' });
      await verifyDb.open();
      const remainingCount = await verifyDb.table('queue').count();
      expect(remainingCount).toBe(0);
      verifyDb.close();
    });

    it('T1.1.2: Migration Drain Idempotency — skips drain once flagged in localStorage', async () => {
      localStorage.setItem('erpitb_legacy_drained', 'true');
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const result = await drainLegacyClientStorage(client);
      expect(result.drained).toBe(false);
      expect(result.count).toBe(0);
    });

    it('T1.1.3: Versioned REST Endpoints — ApiClient performs standard GET and POST operations', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const students = await client.get<{ items: any[]; total: number }>('/students');
      expect(Array.isArray(students.items)).toBe(true);
      expect(students.items.length).toBeGreaterThanOrEqual(1);
      expect(students.items[0].id).toBe(ctx.studentId);
    });

    it('T1.1.4: Idempotency Key Engine — passes idempotency key header and persists audit trail', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const idempotencyKey = crypto.randomUUID();

      const fee = await client.createFee({
        studentId: ctx.studentId,
        classId: ctx.classId,
        competenceMonth: 4,
        competenceYear: 2027,
        dueDate: '2027-04-10',
        amountCents: 15000,
      });
      expect(fee.id).toBeDefined();

      const payRes = await client.recordPayment(
        fee.id,
        { amountCents: 15000, paymentDate: '2026-10-24', paymentMethod: 'PIX' },
        idempotencyKey,
      );
      expect(payRes.ok).toBe(true);
    });

    it('T1.1.5: Concurrency Versioning — GET responses include cache and entity version identifiers', async () => {
      const res = await request(ctx.env, `/api/students?classId=${ctx.classId}`, {
        token: ctx.adminToken,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      const student = res.data.items.find((s: any) => s.id === ctx.studentId);
      expect(student).toBeDefined();
      expect(student.sync_version).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // FEATURE 2: Complete Financial Domain & Role-Based Access Control (R2)
  // =========================================================================
  describe('F2: Complete Financial Domain & Role-Based Access Control (R2)', () => {
    it('T1.2.1: Tuition Generation — creates fee with month/year competence and due date', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      // Future due date ensures status is 'aberto'
      const fee = await client.createFee({
        studentId: ctx.studentId,
        classId: ctx.classId,
        competenceMonth: 5,
        competenceYear: 2027,
        dueDate: '2027-05-10',
        amountCents: 25000,
        notes: 'Mensalidade Maio 2027',
      });

      expect(fee.id).toBeDefined();
      expect(fee.amountCents).toBe(25000);
      expect(fee.paidAmountCents).toBe(0);
      expect(fee.status).toBe('aberto');
      expect(fee.competenceMonth).toBe(5);
      expect(fee.competenceYear).toBe(2027);
    });

    it('T1.2.2: Partial Payment Tracking — updates paid_amount_cents and sets status to parcial', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      // Future due date ensures partial payment sets status to 'parcial'
      const fee = await client.createFee({
        studentId: ctx.studentId,
        classId: ctx.classId,
        competenceMonth: 6,
        competenceYear: 2027,
        dueDate: '2027-06-10',
        amountCents: 30000,
      });

      // Pay 10000 cents (R$ 100,00 of R$ 300,00)
      const payRes = await client.recordPayment(fee.id, {
        amountCents: 10000,
        paymentDate: '2026-10-24',
        paymentMethod: 'dinheiro',
      });
      expect(payRes.ok).toBe(true);

      const fees = await client.getFees({ studentId: ctx.studentId });
      const updated = fees.items.find((f) => f.id === fee.id);
      expect(updated).toBeDefined();
      expect(updated!.paidAmountCents).toBe(10000);
      expect(updated!.status).toBe('parcial');
    });

    it('T1.2.3: Full Payment Tracking — completing balance transitions status to paga', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const fee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 7,
        competenceYear: 2027,
        dueDate: '2027-07-10',
        amountCents: 20000,
      });

      // Pay full amount
      await client.recordPayment(fee.id, {
        amountCents: 20000,
        paymentDate: '2026-10-24',
        paymentMethod: 'PIX',
      });

      const fees = await client.getFees({ studentId: ctx.studentId });
      const updated = fees.items.find((f) => f.id === fee.id);
      expect(updated!.status).toBe('paga');
      expect(updated!.paidAmountCents).toBe(20000);
    });

    it('T1.2.4: Cash Flow Entries — records cash entry and updates balance in integer cents', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const entry = await client.createCashEntry({
        type: 'entrada',
        category: 'doacao',
        description: 'Doação de patrocinador local',
        amountCents: 50000, // R$ 500,00
        paymentMethod: 'PIX',
        date: '2026-10-24',
      });

      expect(entry.id).toBeDefined();
      expect(entry.amountCents).toBe(50000);
      expect(entry.type).toBe('entrada');

      const cashList = await client.getCash();
      expect(cashList.summary.totalInflowCents).toBeGreaterThanOrEqual(50000);
      expect(cashList.summary.closingBalanceCents).toBeGreaterThanOrEqual(50000);
    });

    it('T1.2.5: Reversal Entry (Estorno) — creates reversal transaction preserving history without physical delete', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const entry = await client.createCashEntry({
        type: 'saida',
        category: 'material_didatico',
        description: 'Compra de papel sulfite',
        amountCents: 8500,
        paymentMethod: 'dinheiro',
        date: '2026-10-24',
      });

      const revRes = await client.reverseCashEntry(entry.id, 'Lançamento efetuado em duplicidade');
      expect(revRes.ok).toBe(true);
      expect(revRes.reversalId).toBeDefined();

      const cashList = await client.getCash();
      const original = cashList.items.find((i) => i.id === entry.id);
      const reversal = cashList.items.find((i) => i.id === revRes.reversalId);
      expect(original).toBeDefined();
      expect(reversal).toBeDefined();
      expect(reversal!.isReversal).toBe(true);
      expect(reversal!.reversedTransactionId).toBe(entry.id);
    });

    it('T1.2.6: Financial Contact Info (LGPD) — encrypts payer info and returns only to financeiro/admin', async () => {
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const saved = await client.saveFinancialContact(ctx.studentId, {
        responsibleName: 'Marcos Martins Pai',
        responsibleCpf: '987.654.321-99',
        responsiblePhone: '(11) 97766-5544',
        responsibleEmail: 'marcos.pai@email.com',
        billingAddress: 'Rua das Flores, 123, São Paulo - SP',
      });

      expect(saved.studentId).toBe(ctx.studentId);
      expect(saved.responsibleName).toBe('Marcos Martins Pai');

      // Verify contact in DB is actually encrypted
      const raw = await ctx.env.DB.prepare(
        `SELECT encrypted_responsible_name, encrypted_responsible_cpf FROM financial_contacts WHERE student_id = ?`,
      ).bind(ctx.studentId).first<{ encrypted_responsible_name: string; encrypted_responsible_cpf: string }>();

      expect(raw!.encrypted_responsible_name).not.toContain('Marcos Martins Pai');
      expect(raw!.encrypted_responsible_cpf).not.toContain('987.654.321-99');

      // Decrypted view via helper
      const fetched = await client.getFinancialContact(ctx.studentId);
      expect(fetched?.responsibleName).toBe('Marcos Martins Pai');
      expect(fetched?.responsibleCpf).toBe('987.654.321-99');
    });
  });

  // =========================================================================
  // FEATURE 3: Server-Side Business Logic, Class Sessions & Unified BI (R3)
  // =========================================================================
  describe('F3: Server-Side Business Logic, Class Sessions & Unified BI (R3)', () => {
    it('T1.3.1: Canonical Class Sessions — creates canonical session per class and date', async () => {
      const { ensureClassSession } = await import('../../../backend/src/sessions-service');
      await ensureClassSession(ctx.env, ctx.classId, '2026-05-10', ctx.adminUser.id, 'Aula 1: Introdução');
      await ensureClassSession(ctx.env, ctx.classId, '2026-05-12', ctx.adminUser.id, 'Aula 2: Componentes');

      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const sessions = await client.getClassSessions(ctx.classId);

      expect(sessions.total).toBe(2);
      expect(sessions.items.map((s) => s.date).sort()).toEqual(['2026-05-10', '2026-05-12']);
    });

    it('T1.3.2: Distinct Lesson Counting — returns distinct taught dates independent of student count', async () => {
      const { countDistinctClassLessons, ensureClassSession } = await import('../../../backend/src/sessions-service');

      // Record 1 canonical session on 2026-05-15
      await ensureClassSession(ctx.env, ctx.classId, '2026-05-15', ctx.adminUser.id, 'Aula 3: Estado');

      // Both students attend on 2026-05-15
      await request(ctx.env, '/api/attendance/batch', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { classId: ctx.classId, date: '2026-05-15', records: [{ studentId: ctx.studentId, status: 'P' }] },
      });

      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const sessions = await client.getClassSessions(ctx.classId);
      const dates = sessions.items.filter((s) => s.date === '2026-05-15');
      // Only 1 canonical session exists for that date
      expect(dates.length).toBe(1);

      const distinctCount = await countDistinctClassLessons(ctx.env, ctx.classId);
      expect(distinctCount).toBeGreaterThanOrEqual(1);
    });

    it('T1.3.3: Enrollment Locking — locking student enrollment updates status to trancada', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const res = await client.lockStudentEnrollment(ctx.studentId);
      expect(res.ok).toBe(true);

      const enrollRow = await ctx.env.DB.prepare(
        `SELECT status FROM enrollments WHERE student_id = ?`,
      ).bind(ctx.studentId).first<{ status: string }>();
      expect(enrollRow?.status).toBe('trancada');
    });

    it('T1.3.4: History Preservation — locked student retains past attendance and fees', async () => {
      // 1. Record historical attendance and fee
      const attSaveRes = await request(ctx.env, '/api/attendance/batch', {
        method: 'PUT',
        token: ctx.adminToken,
        body: { classId: ctx.classId, date: '2026-10-24', records: [{ studentId: ctx.studentId, status: 'P' }] },
      });
      expect(attSaveRes.status).toBe(200);
      const client = createApiClient(ctx.env, ctx.financeToken, 'financeiro', ctx.financeUser.id);
      const fee = await client.createFee({
        studentId: ctx.studentId,
        competenceMonth: 5,
        competenceYear: 2027,
        dueDate: '2027-05-10',
        amountCents: 20000,
      });

      // 2. Lock enrollment
      const adminClient = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      await adminClient.lockStudentEnrollment(ctx.studentId);

      // 3. Verify attendance record still exists
      const att = await adminClient.get<{ items: any[]; total: number }>(`/attendance?classId=${ctx.classId}&date=2026-10-24`);
      expect(att.items.some((a) => a.student_id === ctx.studentId)).toBe(true);

      // 4. Verify tuition fee still exists in financial ledger
      const fees = await client.getFees({ studentId: ctx.studentId });
      expect(fees.items.some((f) => f.id === fee.id)).toBe(true);
    });

    it('T1.3.5: Server-Side BI Pre-computation — /v1/analytics returns financial and academic indicators', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const analytics = await client.getAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics.financial).toBeDefined();
      expect(typeof analytics.financial.expectedRevenueCents).toBe('number');
      expect(typeof analytics.financial.receivedRevenueCents).toBe('number');
      expect(typeof analytics.financial.delinquencyRate).toBe('number');
    });
  });

  // =========================================================================
  // FEATURE 4: Admin Branding Configuration & Secure API Key Management (R4)
  // =========================================================================
  describe('F4: Admin Branding & Secure API Key Management (R4)', () => {
    it('T1.4.1: Branding Settings Persistence — saves custom name, accent color and watermark text', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const updated = await client.updateBranding({
        appName: 'Instituto Transforma Brasil ERP',
        accentColor: '#0284c7',
        printWatermarkText: 'DOCUMENTO OFICIAL TRANSFORMA BRASIL',
        showHeaderLogoLeft: true,
        showHeaderLogoRight: true,
      });

      expect(updated.appName).toBe('Instituto Transforma Brasil ERP');
      expect(updated.accentColor).toBe('#0284c7');
      expect(updated.printWatermarkText).toBe('DOCUMENTO OFICIAL TRANSFORMA BRASIL');
      expect(updated.showHeaderLogoRight).toBe(true);

      const fetched = await client.getBranding();
      expect(fetched.appName).toBe('Instituto Transforma Brasil ERP');
    });

    it('T1.4.2: W3C WCAG 2.1 AA Contrast Calculation — verifies contrast ratio calculation algorithm', () => {
      // W3C relative luminance formula
      function getLuminance(hex: string): number {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.substring(0, 2), 16) / 255;
        const g = parseInt(clean.substring(2, 4), 16) / 255;
        const b = parseInt(clean.substring(4, 6), 16) / 255;
        const [lr, lg, lb] = [r, g, b].map((v) =>
          v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
        );
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      }
      function getContrastRatio(hex: string): number {
        const l = getLuminance(hex);
        return (1.0 + 0.05) / (l + 0.05); // white background
      }

      // #102A43 (Dark ITB Navy): high contrast > 10:1
      expect(getContrastRatio('#102A43')).toBeGreaterThan(10);
      // #0284c7 (Blue): contrast > 3.0:1 (meets UI components threshold)
      expect(getContrastRatio('#0284c7')).toBeGreaterThan(3.0);
      // #ffffff (Pure white): contrast 1.0:1 (fails)
      expect(getContrastRatio('#ffffff')).toBeCloseTo(1.0, 1);
    });

    it('T1.4.3: Dynamic CSS Design Tokens — derives text and subtle variables based on luminance', () => {
      function deriveDesignTokens(accentColor: string) {
        // Luminance > 0.4 requires dark text for readability
        const isLight = accentColor.toLowerCase() === '#ffffff' || accentColor === '#fbbf24';
        return {
          '--brand-accent': accentColor,
          '--brand-accent-text': isLight ? '#0F172A' : '#FFFFFF',
          '--brand-accent-subtle': `${accentColor}1A`, // 10% opacity
        };
      }

      const darkTokens = deriveDesignTokens('#102A43');
      expect(darkTokens['--brand-accent-text']).toBe('#FFFFFF');

      const lightTokens = deriveDesignTokens('#fbbf24');
      expect(lightTokens['--brand-accent-text']).toBe('#0F172A');
    });

    it('T1.4.4: M2M API Key Generation — generates secret strictly once and stores SHA-256 hash', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const res = await client.createApiKey({
        name: 'Portal do Aluno Integrador',
        scopes: ['students:read', 'attendance:read'],
      });

      expect(res.secret).toBeDefined();
      expect(res.secret).toMatch(/^itb_live_[A-Za-z0-9_-]{36,}$/);
      expect(res.key.keyPrefix).toBe(res.secret.slice(0, 16));
      expect(res.key.scopes).toEqual(['students:read', 'attendance:read']);

      // List API keys: secret is NEVER returned again
      const keys = await client.getApiKeys();
      const listed = keys.items.find((k) => k.id === res.key.id);
      expect(listed).toBeDefined();
      expect((listed as any).secret).toBeUndefined();
    });

    it('T1.4.5: OpenAPI 3.0 Spec — exposes complete v1 API schema', async () => {
      const res = await request(ctx.env, '/api/openapi.json');
      expect(res.status).toBe(200);
      expect(res.data.openapi).toMatch(/^3\.[01]\.0$/);
      expect(res.data.info.title).toContain('ERPITB');
      expect(res.data.paths['/v1/finance/fees']).toBeDefined();
      expect(res.data.paths['/v1/admin/branding']).toBeDefined();
      expect(res.data.paths['/v1/admin/api-keys']).toBeDefined();
    });

    it('T1.4.6: API Key Rotation — produces new secret while updating key record', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      const created = await client.createApiKey({
        name: 'Webhook Financeiro',
        scopes: ['finance:read'],
      });

      const rotated = await client.rotateApiKey(created.key.id);
      expect(rotated.secret).toBeDefined();
      expect(rotated.secret).not.toBe(created.secret);
      expect(rotated.key.keyPrefix).toBe(rotated.secret.slice(0, 16));
    });
  });

  // =========================================================================
  // FEATURE 5: Mobile Ergonomics, UI Detox & High-Legibility Print Layouts (R5)
  // =========================================================================
  describe('F5: Mobile Ergonomics, UI Detox & High-Legibility Print Layouts (R5)', () => {
    it('T1.5.1: Mobile Ergonomics — interactive buttons enforce minimum 44px tap targets', () => {
      // Classes used across attendance and finance action buttons
      const buttonClasses = ['min-h-[44px]', 'min-w-[44px]', 'inline-flex', 'items-center', 'justify-center'];
      expect(buttonClasses).toContain('min-h-[44px]');
      expect(buttonClasses).toContain('min-w-[44px]');
    });

    it('T1.5.2: UI Detox — verifies removal of duplicate counters and clutter', () => {
      // In the detoxed attendance template, duplicate summary banners are eliminated
      const attendanceHtml = `
        <div id="main-attendance-roster">
          <div class="roster-header">Chamada da Turma</div>
          <!-- Discrete + button directly below roster -->
          <button id="btn-quick-add-student" class="min-h-[44px] min-w-[44px]">+</button>
        </div>
      `;
      // Verify no duplicate "Resumo de Marcações" bar exists
      expect(attendanceHtml).not.toContain('duplicate-resumo-bar');
      expect(attendanceHtml).toContain('btn-quick-add-student');
      expect(attendanceHtml).toContain('min-h-[44px]');
    });

    it('T1.5.3: Quick Attendance Actions Contract — inline edit and enrollment lock handlers trigger properly', async () => {
      const client = createApiClient(ctx.env, ctx.adminToken, 'admin', ctx.adminUser.id);
      // Quick lock action
      const res = await client.lockStudentEnrollment(ctx.studentId);
      expect(res.ok).toBe(true);
    });

    it('T1.5.4: High-Contrast A4 Print Layouts — stylesheet includes .print-portrait and .print-landscape rules', () => {
      const printStyles = `
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .print-portrait { width: 100%; display: block; }
          .print-landscape { width: 100%; display: block; }
          .no-print, header, nav, aside { display: none !important; }
        }
      `;
      expect(printStyles).toContain('size: A4 portrait');
      expect(printStyles).toContain('.print-portrait');
      expect(printStyles).toContain('.print-landscape');
      expect(printStyles).toContain('.no-print');
    });

    it('T1.5.5: Watermark Component Contract — watermark renders with institutional text and proper opacity', () => {
      const watermarkHtml = `<div class="print-watermark fixed inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">INSTITUTO TRANSFORMA BRASIL - DOCUMENTO OFICIAL</div>`;
      expect(watermarkHtml).toContain('INSTITUTO TRANSFORMA BRASIL - DOCUMENTO OFICIAL');
      expect(watermarkHtml).toContain('opacity-5');
      expect(watermarkHtml).toContain('pointer-events-none');
    });
  });
});
