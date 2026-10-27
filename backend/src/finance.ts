import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission } from './rbac';
import { assertConcurrencyVersion, formatETag, parseIfMatchHeader } from './concurrency';
import { broadcastEvent } from './events-bus';
import { decryptText, encryptText } from './crypto';
import type { AuthUser, CashTransaction, CashType, Env, FeeStatus, FinancialContact, FinancialFee, FinancialPayment, PaymentMethod } from './types';

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  'PIX', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro',
];

export async function listFees(env: Env, user: AuthUser, url: URL): Promise<unknown> {
  requirePermission(user, 'finance:read');

  const studentId = url.searchParams.get('studentId');
  const classId = url.searchParams.get('classId');
  const status = url.searchParams.get('status');
  const month = url.searchParams.get('month') ? parseInt(url.searchParams.get('month')!, 10) : null;
  const year = url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!, 10) : null;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ['f.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (studentId) {
    conditions.push('f.student_id = ?');
    params.push(studentId);
  }
  if (classId) {
    conditions.push('f.class_id = ?');
    params.push(classId);
  }
  if (month && !Number.isNaN(month)) {
    conditions.push('f.competence_month = ?');
    params.push(month);
  }
  if (year && !Number.isNaN(year)) {
    conditions.push('f.competence_year = ?');
    params.push(year);
  }
  if (from) {
    conditions.push('f.due_date >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('f.due_date <= ?');
    params.push(to);
  }

  const whereClause = conditions.join(' AND ');

  // Fetch all matching fees for KPI aggregation and pagination
  const query = `
    SELECT f.id, f.student_id, f.class_id, f.enrollment_id,
           f.competence_month, f.competence_year, f.due_date,
           f.amount_cents, f.paid_amount_cents, f.installment_number,
           f.status, f.notes, f.created_at, f.updated_at,
           s.encrypted_name, s.registration_number,
           c.name AS class_name
      FROM financial_fees f
      JOIN students s ON s.id = f.student_id AND s.deleted_at IS NULL
      LEFT JOIN classes c ON c.id = f.class_id AND c.deleted_at IS NULL
     WHERE ${whereClause}
     ORDER BY f.due_date DESC, f.created_at DESC
  `;

  const rows = await env.DB.prepare(query).bind(...params).all<{
    id: string; student_id: string; class_id: string | null; enrollment_id: string | null;
    competence_month: number; competence_year: number; due_date: string;
    amount_cents: number; paid_amount_cents: number; installment_number: number;
    status: FeeStatus; notes: string | null; created_at: string; updated_at: string;
    encrypted_name: string; registration_number: string; class_name: string | null;
  }>();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Compute status adjustments and KPIs
  let totalFeesCount = 0;
  let totalExpectedCents = 0;
  let totalPaidCents = 0;
  let totalOpenCents = 0;
  let totalOverdueCents = 0;
  let overdueCount = 0;

  const decryptedItems: FinancialFee[] = [];

  for (const row of rows.results) {
    let currentStatus = row.status;
    // Check if status is open/parcial but past due date
    if (currentStatus !== 'paga' && currentStatus !== 'cancelada') {
      if (row.due_date < todayStr) {
        currentStatus = 'atrasada';
      }
    }

    if (status && status !== 'all' && currentStatus !== status) {
      continue;
    }

    totalFeesCount += 1;
    totalExpectedCents += row.amount_cents;
    totalPaidCents += row.paid_amount_cents;

    const remaining = Math.max(0, row.amount_cents - row.paid_amount_cents);
    if (currentStatus === 'atrasada') {
      totalOverdueCents += remaining;
      overdueCount += 1;
    } else if (currentStatus === 'aberto' || currentStatus === 'parcial') {
      totalOpenCents += remaining;
    }

    let studentName = `Aluno ${row.registration_number || ''}`;
    try {
      studentName = await decryptText(env, row.encrypted_name);
    } catch {
      // fallback
    }

    decryptedItems.push({
      id: row.id,
      studentId: row.student_id,
      classId: row.class_id ?? undefined,
      enrollmentId: row.enrollment_id ?? undefined,
      competenceMonth: row.competence_month,
      competenceYear: row.competence_year,
      dueDate: row.due_date,
      amountCents: row.amount_cents,
      paidAmountCents: row.paid_amount_cents,
      installmentNumber: row.installment_number,
      status: currentStatus,
      notes: row.notes ?? undefined,
      studentName,
      className: row.class_name ?? undefined,
      registrationNumber: row.registration_number,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  const paginated = decryptedItems.slice(offset, offset + pageSize);

  return {
    items: paginated,
    total: decryptedItems.length,
    page,
    pageSize,
    summary: {
      totalFeesCount,
      totalExpectedCents,
      totalPaidCents,
      totalOpenCents,
      totalOverdueCents,
      overdueCount,
      delinquencyRate: totalExpectedCents > 0
        ? Math.round((totalOverdueCents / totalExpectedCents) * 1000) / 10
        : 0,
    },
  };
}

export async function createFee(request: Request, env: Env, user: AuthUser): Promise<FinancialFee> {
  requirePermission(user, 'finance:write');
  const body = await readJson<Record<string, unknown>>(request);

  const studentId = requireString(body.studentId, 'studentId', { min: 1, max: 100 });
  const competenceMonth = Number(body.competenceMonth);
  const competenceYear = Number(body.competenceYear);
  const dueDate = requireString(body.dueDate, 'dueDate', { min: 10, max: 10 });
  const amountCents = Number(body.amountCents);
  const installmentNumber = body.installmentNumber ? Number(body.installmentNumber) : 1;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
  const classId = typeof body.classId === 'string' ? body.classId.trim() : null;

  if (!competenceMonth || competenceMonth < 1 || competenceMonth > 12) {
    throw new AppError(400, 'Mês de competência inválido (1-12).', 'VALIDATION_ERROR');
  }
  if (!competenceYear || competenceYear < 2000 || competenceYear > 2100) {
    throw new AppError(400, 'Ano de competência inválido.', 'VALIDATION_ERROR');
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'Valor previsto deve ser um número inteiro positivo em centavos.', 'VALIDATION_ERROR');
  }

  // Verify student exists
  const student = await env.DB.prepare(
    `SELECT id, encrypted_name, registration_number FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(studentId).first<{ id: string; encrypted_name: string; registration_number: string }>();

  if (!student) {
    throw new AppError(404, 'Aluno não encontrado.', 'NOT_FOUND');
  }

  // Find active enrollment if classId provided or find student's active enrollment
  let enrollmentId: string | null = null;
  let finalClassId = classId;
  const enrollment = await env.DB.prepare(
    `SELECT id, class_id FROM enrollments WHERE student_id = ? AND status = 'ativa' AND deleted_at IS NULL LIMIT 1`,
  ).bind(studentId).first<{ id: string; class_id: string }>();

  if (enrollment) {
    enrollmentId = enrollment.id;
    if (!finalClassId) finalClassId = enrollment.class_id;
  }

  const id = uuid();
  const timestamp = nowIso();
  const todayStr = timestamp.slice(0, 10);
  const initialStatus: FeeStatus = dueDate < todayStr ? 'atrasada' : 'aberto';

  await env.DB.prepare(`
    INSERT INTO financial_fees (
      id, student_id, class_id, enrollment_id,
      competence_month, competence_year, due_date,
      amount_cents, paid_amount_cents, installment_number,
      status, notes, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, studentId, finalClassId, enrollmentId,
    competenceMonth, competenceYear, dueDate,
    amountCents, installmentNumber,
    initialStatus, notes, user.id, timestamp, timestamp,
  ).run();

  let studentName = `Aluno ${student.registration_number || ''}`;
  try {
    studentName = await decryptText(env, student.encrypted_name);
  } catch {}

  broadcastEvent('entity_changed', {
    entity: 'financial_fees',
    operation: 'upsert',
    id,
    timestamp,
  }, { env });

  return {
    id,
    studentId,
    classId: finalClassId ?? undefined,
    enrollmentId: enrollmentId ?? undefined,
    competenceMonth,
    competenceYear,
    dueDate,
    amountCents,
    paidAmountCents: 0,
    installmentNumber,
    status: initialStatus,
    notes: notes ?? undefined,
    studentName,
    registrationNumber: student.registration_number,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function updateFee(request: Request, env: Env, user: AuthUser, id: string): Promise<Response> {
  requirePermission(user, 'finance:write');
  const existing = await env.DB.prepare(
    `SELECT f.*, s.encrypted_name, s.registration_number, c.name AS class_name
       FROM financial_fees f
       JOIN students s ON s.id = f.student_id
       LEFT JOIN classes c ON c.id = f.class_id
      WHERE f.id = ? AND f.deleted_at IS NULL LIMIT 1`,
  ).bind(id).first<{
    id: string; student_id: string; class_id: string | null; enrollment_id: string | null;
    competence_month: number; competence_year: number; due_date: string;
    amount_cents: number; paid_amount_cents: number; installment_number: number;
    status: FeeStatus; notes: string | null; sync_version: number; created_at: string; updated_at: string;
    encrypted_name: string; registration_number: string; class_name: string | null;
  }>();

  if (!existing) {
    throw new AppError(404, 'Mensalidade não encontrada.', 'NOT_FOUND');
  }

  const currentVersion = Number(existing.sync_version ?? 1);
  const ifMatch = parseIfMatchHeader(request);
  assertConcurrencyVersion(currentVersion, ifMatch);

  const body = await readJson<Record<string, unknown>>(request);
  const dueDate = typeof body.dueDate === 'string' ? body.dueDate.trim() : existing.due_date;
  const amountCents = body.amountCents !== undefined ? Number(body.amountCents) : existing.amount_cents;
  const notes = body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes.trim() : null) : existing.notes;
  let status = typeof body.status === 'string' ? (body.status as FeeStatus) : existing.status;

  if (body.status === 'cancelada') {
    status = 'cancelada';
  } else if (existing.paid_amount_cents >= amountCents) {
    status = 'paga';
  } else if (existing.paid_amount_cents > 0) {
    status = 'parcial';
  } else {
    const todayStr = new Date().toISOString().slice(0, 10);
    status = dueDate < todayStr ? 'atrasada' : 'aberto';
  }

  const timestamp = nowIso();
  const nextVersion = currentVersion + 1;

  const result = await env.DB.prepare(`
    UPDATE financial_fees
       SET due_date = ?, amount_cents = ?, notes = ?, status = ?, sync_version = ?, updated_at = ?
     WHERE id = ? AND sync_version = ? AND deleted_at IS NULL
  `).bind(dueDate, amountCents, notes, status, nextVersion, timestamp, id, currentVersion).run();

  if (result.meta.changes === 0) {
    const latest = await env.DB.prepare(`SELECT sync_version FROM financial_fees WHERE id = ?`).bind(id).first<{ sync_version: number }>();
    if (!latest) throw new AppError(404, 'Mensalidade não encontrada.', 'NOT_FOUND');
    throw new AppError(409, 'Mensalidade foi modificada concorrentemente por outro usuário.', 'CONCURRENCY_CONFLICT', { serverVersion: Number(latest.sync_version ?? 1) });
  }

  broadcastEvent('entity_changed', {
    entity: 'financial_fees',
    operation: 'upsert',
    id,
    timestamp,
  }, { env });

  let studentName = `Aluno ${existing.registration_number || ''}`;
  try {
    studentName = await decryptText(env, existing.encrypted_name);
  } catch {}

  const feeData = {
    id,
    studentId: existing.student_id,
    classId: existing.class_id ?? undefined,
    enrollmentId: existing.enrollment_id ?? undefined,
    competenceMonth: existing.competence_month,
    competenceYear: existing.competence_year,
    dueDate,
    amountCents,
    paidAmountCents: existing.paid_amount_cents,
    installmentNumber: existing.installment_number,
    status,
    notes: notes ?? undefined,
    studentName,
    className: existing.class_name ?? undefined,
    registrationNumber: existing.registration_number,
    syncVersion: nextVersion,
    createdAt: existing.created_at,
    updatedAt: timestamp,
  };

  return new Response(JSON.stringify(feeData), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'etag': formatETag(nextVersion),
    },
  });
}

export async function recordPayment(request: Request, env: Env, user: AuthUser, feeId: string): Promise<unknown> {
  requirePermission(user, 'finance:write');
  const body = await readJson<Record<string, unknown>>(request);

  const amountCents = Number(body.amountCents);
  const paymentDate = requireString(body.paymentDate, 'paymentDate', { min: 10, max: 10 });
  const paymentMethod = requireString(body.paymentMethod, 'paymentMethod') as PaymentMethod;
  const reference = typeof body.reference === 'string' ? body.reference.trim() : null;
  const idempotencyKey = request.headers.get('x-idempotency-key') || (typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null);

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'Valor pago deve ser maior que zero em centavos.', 'VALIDATION_ERROR');
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError(400, `Forma de pagamento inválida. Permitidas: ${VALID_PAYMENT_METHODS.join(', ')}`, 'VALIDATION_ERROR');
  }

  // Fetch fee
  const fee = await env.DB.prepare(`
    SELECT f.*, s.encrypted_name, s.registration_number, c.name AS class_name
      FROM financial_fees f
      JOIN students s ON s.id = f.student_id
      LEFT JOIN classes c ON c.id = f.class_id
     WHERE f.id = ? AND f.deleted_at IS NULL LIMIT 1
  `).bind(feeId).first<{
    id: string; student_id: string; class_id: string | null; enrollment_id: string | null;
    competence_month: number; competence_year: number; due_date: string;
    amount_cents: number; paid_amount_cents: number; installment_number: number;
    status: FeeStatus; notes: string | null;
    encrypted_name: string; registration_number: string; class_name: string | null;
  }>();

  if (!fee) {
    throw new AppError(404, 'Mensalidade não encontrada.', 'NOT_FOUND');
  }

  if (fee.status === 'cancelada') {
    throw new AppError(409, 'Esta mensalidade foi cancelada.', 'CONFLICT');
  }

  // Idempotency check: if reference or idempotencyKey was already recorded for this fee
  if (idempotencyKey || reference) {
    const existingPayment = await env.DB.prepare(`
      SELECT id FROM financial_payments
       WHERE fee_id = ? AND reference = ? LIMIT 1
    `).bind(feeId, idempotencyKey || reference).first<{ id: string }>();

    if (existingPayment) {
      return { ok: true, paymentId: existingPayment.id, duplicate: true, message: 'Pagamento já processado com esta referência.' };
    }
  }

  let studentName = `Aluno ${fee.registration_number || ''}`;
  try {
    studentName = await decryptText(env, fee.encrypted_name);
  } catch {}

  const paymentId = uuid();
  const cashTransactionId = uuid();
  const timestamp = nowIso();

  const newPaidAmountCents = fee.paid_amount_cents + amountCents;
  const newStatus: FeeStatus = newPaidAmountCents >= fee.amount_cents ? 'paga' : 'parcial';

  const competenceLabel = `${String(fee.competence_month).padStart(2, '0')}/${fee.competence_year}`;
  const cashDescription = `Mensalidade ${competenceLabel} - ${studentName}${fee.class_name ? ` (${fee.class_name})` : ''}`;

  await env.DB.batch([
    // 1. Insert Payment
    env.DB.prepare(`
      INSERT INTO financial_payments (
        id, fee_id, amount_cents, payment_date, payment_method,
        reference, recorded_by_user_id, cash_transaction_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      paymentId, feeId, amountCents, paymentDate, paymentMethod,
      idempotencyKey || reference, user.id, cashTransactionId, timestamp,
    ),
    // 2. Update Fee
    env.DB.prepare(`
      UPDATE financial_fees
         SET paid_amount_cents = ?, status = ?, updated_at = ?
       WHERE id = ?
    `).bind(newPaidAmountCents, newStatus, timestamp, feeId),
    // 3. Atomically record cash inflow
    env.DB.prepare(`
      INSERT INTO cash_transactions (
        id, type, amount_cents, date, category, description,
        payment_method, reference, student_name, class_name,
        fee_payment_id, recorded_by_user_id, is_reversal, created_at, updated_at
      ) VALUES (?, 'entrada', ?, ?, 'Mensalidade', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      cashTransactionId, amountCents, paymentDate, cashDescription,
      paymentMethod, idempotencyKey || reference, studentName, fee.class_name,
      paymentId, user.id, timestamp, timestamp,
    ),
  ]);

  broadcastEvent('entity_changed', {
    entity: 'financial_fees',
    operation: 'upsert',
    id: feeId,
    timestamp,
  }, { env });

  return {
    ok: true,
    payment: {
      id: paymentId,
      feeId,
      amountCents,
      paymentDate,
      paymentMethod,
      reference: idempotencyKey || reference,
      recordedByUserId: user.id,
      cashTransactionId,
      createdAt: timestamp,
    },
    fee: {
      id: fee.id,
      paidAmountCents: newPaidAmountCents,
      status: newStatus,
      updatedAt: timestamp,
    },
  };
}

export async function listCashTransactions(env: Env, user: AuthUser, url: URL): Promise<unknown> {
  requirePermission(user, 'finance:read');

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const date = url.searchParams.get('date');
  const type = url.searchParams.get('type') as CashType | null;
  const paymentMethod = url.searchParams.get('paymentMethod') as PaymentMethod | null;
  const category = url.searchParams.get('category');
  const month = url.searchParams.get('month'); // YYYY-MM
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));
  const offset = (page - 1) * pageSize;

  let effectiveFrom = from;
  let effectiveTo = to;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    effectiveFrom = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y!, m!, 0).getDate();
    effectiveTo = `${month}-${String(lastDay).padStart(2, '0')}`;
  } else if (date) {
    effectiveFrom = date;
    effectiveTo = date;
  }

  // 1. Calculate opening balance (all transactions before effectiveFrom)
  let openingBalanceCents = 0;
  if (effectiveFrom) {
    const priorQuery = await env.DB.prepare(`
      SELECT SUM(CASE WHEN type = 'entrada' THEN amount_cents ELSE -amount_cents END) AS balance
        FROM cash_transactions
       WHERE date < ?
    `).bind(effectiveFrom).first<{ balance: number | null }>();
    openingBalanceCents = priorQuery?.balance ?? 0;
  }

  // 2. Query transactions in range
  const conditions: string[] = ['1 = 1'];
  const params: unknown[] = [];

  if (effectiveFrom) {
    conditions.push('date >= ?');
    params.push(effectiveFrom);
  }
  if (effectiveTo) {
    conditions.push('date <= ?');
    params.push(effectiveTo);
  }
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (paymentMethod) {
    conditions.push('payment_method = ?');
    params.push(paymentMethod);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  const whereClause = conditions.join(' AND ');

  const allRows = await env.DB.prepare(`
    SELECT * FROM cash_transactions
     WHERE ${whereClause}
     ORDER BY date DESC, created_at DESC
  `).bind(...params).all<{
    id: string; type: CashType; amount_cents: number; date: string;
    category: string; description: string; payment_method: PaymentMethod;
    reference: string | null; student_name: string | null; class_name: string | null;
    fee_payment_id: string | null; recorded_by_user_id: string;
    is_reversal: number; reversed_transaction_id: string | null; reversal_reason: string | null;
    created_at: string; updated_at: string;
  }>();

  let totalInflowCents = 0;
  let totalOutflowCents = 0;
  const totalsByMethod: Record<string, { entrada: number; saida: number; total: number }> = {};

  for (const method of VALID_PAYMENT_METHODS) {
    totalsByMethod[method] = { entrada: 0, saida: 0, total: 0 };
  }

  const items: CashTransaction[] = allRows.results.map((r) => {
    if (r.type === 'entrada') {
      totalInflowCents += r.amount_cents;
      if (totalsByMethod[r.payment_method]) totalsByMethod[r.payment_method]!.entrada += r.amount_cents;
    } else {
      totalOutflowCents += r.amount_cents;
      if (totalsByMethod[r.payment_method]) totalsByMethod[r.payment_method]!.saida += r.amount_cents;
    }
    if (totalsByMethod[r.payment_method]) {
      totalsByMethod[r.payment_method]!.total = totalsByMethod[r.payment_method]!.entrada - totalsByMethod[r.payment_method]!.saida;
    }

    return {
      id: r.id,
      type: r.type,
      amountCents: r.amount_cents,
      date: r.date,
      category: r.category,
      description: r.description,
      paymentMethod: r.payment_method,
      reference: r.reference ?? undefined,
      studentName: r.student_name ?? undefined,
      className: r.class_name ?? undefined,
      feePaymentId: r.fee_payment_id ?? undefined,
      recordedByUserId: r.recorded_by_user_id,
      isReversal: Boolean(r.is_reversal),
      reversedTransactionId: r.reversed_transaction_id ?? undefined,
      reversalReason: r.reversal_reason ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  const currentClosingBalanceCents = openingBalanceCents + totalInflowCents - totalOutflowCents;
  const paginated = items.slice(offset, offset + pageSize);

  return {
    items: paginated,
    total: items.length,
    page,
    pageSize,
    summary: {
      openingBalanceCents,
      totalInflowCents,
      totalOutflowCents,
      netFlowCents: totalInflowCents - totalOutflowCents,
      closingBalanceCents: currentClosingBalanceCents,
      totalsByMethod,
    },
  };
}

export async function createCashEntry(request: Request, env: Env, user: AuthUser): Promise<CashTransaction> {
  requirePermission(user, 'finance:write');
  const body = await readJson<Record<string, unknown>>(request);

  const type = requireString(body.type, 'type') as CashType;
  if (type !== 'entrada' && type !== 'saida') {
    throw new AppError(400, 'Tipo inválido (deve ser entrada ou saida).', 'VALIDATION_ERROR');
  }
  const amountCents = Number(body.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new AppError(400, 'Valor deve ser um número inteiro positivo em centavos.', 'VALIDATION_ERROR');
  }
  const date = requireString(body.date, 'date', { min: 10, max: 10 });
  const category = requireString(body.category, 'category', { min: 1, max: 60 });
  const description = requireString(body.description, 'description', { min: 1, max: 200 });
  const paymentMethod = requireString(body.paymentMethod, 'paymentMethod') as PaymentMethod;
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new AppError(400, `Meio de pagamento inválido. Permitidos: ${VALID_PAYMENT_METHODS.join(', ')}`, 'VALIDATION_ERROR');
  }
  const reference = typeof body.reference === 'string' ? body.reference.trim() : null;
  const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : null;
  const className = typeof body.className === 'string' ? body.className.trim() : null;

  const id = uuid();
  const timestamp = nowIso();

  await env.DB.prepare(`
    INSERT INTO cash_transactions (
      id, type, amount_cents, date, category, description,
      payment_method, reference, student_name, class_name,
      fee_payment_id, recorded_by_user_id, is_reversal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)
  `).bind(
    id, type, amountCents, date, category, description,
    paymentMethod, reference, studentName, className,
    user.id, timestamp, timestamp,
  ).run();

  broadcastEvent('entity_changed', {
    entity: 'cash_transactions',
    operation: 'upsert',
    id,
    timestamp,
  }, { env });

  return {
    id,
    type,
    amountCents,
    date,
    category,
    description,
    paymentMethod,
    reference: reference ?? undefined,
    studentName: studentName ?? undefined,
    className: className ?? undefined,
    recordedByUserId: user.id,
    isReversal: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function reverseCashEntry(request: Request, env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'finance:write');
  const body = await readJson<Record<string, unknown>>(request);
  const reason = requireString(body.reason, 'reason', { min: 3, max: 250 });

  const existing = await env.DB.prepare(
    `SELECT * FROM cash_transactions WHERE id = ? LIMIT 1`,
  ).bind(id).first<{
    id: string; type: CashType; amount_cents: number; date: string;
    category: string; description: string; payment_method: PaymentMethod;
    reference: string | null; student_name: string | null; class_name: string | null;
    is_reversal: number;
  }>();

  if (!existing) {
    throw new AppError(404, 'Movimentação de caixa não encontrada.', 'NOT_FOUND');
  }

  if (existing.is_reversal) {
    throw new AppError(409, 'Esta movimentação já foi estornada ou é um estorno.', 'ALREADY_REVERSED');
  }

  const reversalId = uuid();
  const timestamp = nowIso();
  const todayStr = timestamp.slice(0, 10);
  const opposingType: CashType = existing.type === 'entrada' ? 'saida' : 'entrada';
  const reversalDescription = `[ESTORNO] ${existing.description} - Motivo: ${reason}`;

  await env.DB.batch([
    // 1. Mark original as reversed
    env.DB.prepare(`
      UPDATE cash_transactions
         SET is_reversal = 1, updated_at = ?
       WHERE id = ?
    `).bind(timestamp, id),
    // 2. Insert compensating reversal entry
    env.DB.prepare(`
      INSERT INTO cash_transactions (
        id, type, amount_cents, date, category, description,
        payment_method, reference, student_name, class_name,
        fee_payment_id, recorded_by_user_id, is_reversal, reversed_transaction_id,
        reversal_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?)
    `).bind(
      reversalId, opposingType, existing.amount_cents, todayStr,
      existing.category, reversalDescription, existing.payment_method,
      existing.reference, existing.student_name, existing.class_name,
      user.id, id, reason, timestamp, timestamp,
    ),
  ]);

  broadcastEvent('entity_changed', {
    entity: 'cash_transactions',
    operation: 'upsert',
    id: reversalId,
    timestamp,
  }, { env });

  return {
    ok: true,
    reversalId,
    message: 'Movimentação estornada com sucesso.',
  };
}

export async function getFinancialContact(env: Env, user: AuthUser, studentId: string): Promise<FinancialContact | null> {
  requirePermission(user, 'finance:read');

  const row = await env.DB.prepare(
    `SELECT * FROM financial_contacts WHERE student_id = ? LIMIT 1`,
  ).bind(studentId).first<{
    id: string; student_id: string;
    encrypted_responsible_name: string;
    encrypted_responsible_phone: string | null;
    encrypted_responsible_cpf: string | null;
    encrypted_responsible_address: string | null;
    created_at: string; updated_at: string;
  }>();

  if (!row) return null;

  let responsibleName = '';
  let responsiblePhone: string | undefined;
  let responsibleCpf: string | undefined;
  let responsibleAddress: string | undefined;

  try {
    responsibleName = await decryptText(env, row.encrypted_responsible_name);
    if (row.encrypted_responsible_phone) responsiblePhone = await decryptText(env, row.encrypted_responsible_phone);
    if (row.encrypted_responsible_cpf) responsibleCpf = await decryptText(env, row.encrypted_responsible_cpf);
    if (row.encrypted_responsible_address) responsibleAddress = await decryptText(env, row.encrypted_responsible_address);
  } catch {
    responsibleName = 'Dados protegidos';
  }

  return {
    id: row.id,
    studentId: row.student_id,
    responsibleName,
    responsiblePhone,
    responsibleCpf,
    responsibleAddress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveFinancialContact(request: Request, env: Env, user: AuthUser, studentId: string): Promise<FinancialContact> {
  requirePermission(user, 'finance:write');
  const body = await readJson<Record<string, unknown>>(request);

  const responsibleName = requireString(body.responsibleName, 'responsibleName', { min: 2, max: 120 });
  const responsiblePhone = typeof body.responsiblePhone === 'string' ? body.responsiblePhone.trim() : undefined;
  const responsibleCpf = typeof body.responsibleCpf === 'string' ? body.responsibleCpf.trim() : undefined;
  const responsibleAddress = typeof body.responsibleAddress === 'string' ? body.responsibleAddress.trim() : undefined;

  const encName = await encryptText(env, responsibleName);
  const encPhone = responsiblePhone ? await encryptText(env, responsiblePhone) : null;
  const encCpf = responsibleCpf ? await encryptText(env, responsibleCpf) : null;
  const encAddress = responsibleAddress ? await encryptText(env, responsibleAddress) : null;

  const existing = await env.DB.prepare(
    `SELECT id FROM financial_contacts WHERE student_id = ? LIMIT 1`,
  ).bind(studentId).first<{ id: string }>();

  const id = existing?.id || uuid();
  const timestamp = nowIso();

  if (existing) {
    await env.DB.prepare(`
      UPDATE financial_contacts
         SET encrypted_responsible_name = ?,
             encrypted_responsible_phone = ?,
             encrypted_responsible_cpf = ?,
             encrypted_responsible_address = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(encName, encPhone, encCpf, encAddress, timestamp, id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO financial_contacts (
        id, student_id, encrypted_responsible_name, encrypted_responsible_phone,
        encrypted_responsible_cpf, encrypted_responsible_address, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, studentId, encName, encPhone, encCpf, encAddress, timestamp, timestamp).run();
  }

  return {
    id,
    studentId,
    responsibleName,
    responsiblePhone,
    responsibleCpf,
    responsibleAddress,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
