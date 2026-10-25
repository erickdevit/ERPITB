export type Role = 'admin' | 'pedagogico' | 'professor' | 'financeiro' | 'machine';
export type AttendanceStatus = 'P' | 'F' | 'J' | 'A' | 'R' | 'RC';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export interface Env {
  DB: D1Database;
  ASSETS_BUCKET?: R2Bucket;
  JWT_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
  BOOTSTRAP_SECRET: string;
  ALLOWED_ORIGIN?: string;
  ACCESS_TOKEN_TTL_MINUTES?: string;
  REFRESH_TOKEN_TTL_DAYS?: string;
  INSTITUTION_TIMEZONE?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isApiKey?: boolean;
  scopes?: string[];
}

export interface TokenClaims extends JWTPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface JWTPayload {
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface SyncOperation {
  operationId: string;
  entity: SyncEntity;
  action: 'upsert' | 'delete';
  id: string;
  baseVersion: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

export type SyncEntity =
  | 'laboratories'
  | 'courses'
  | 'classes'
  | 'class_teachers'
  | 'students'
  | 'enrollments'
  | 'attendance_records'
  | 'class_notes'
  | 'replacements'
  | 'grade_tables'
  | 'grade_items'
  | 'student_grades';

export interface SyncPushBody {
  deviceId: string;
  operations: SyncOperation[];
}

export type FeeStatus = 'aberto' | 'paga' | 'parcial' | 'atrasada' | 'cancelada';
export type PaymentMethod = 'PIX' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'transferencia' | 'outro';
export type CashType = 'entrada' | 'saida';

export interface FinancialFee {
  id: string;
  studentId: string;
  classId?: string;
  enrollmentId?: string;
  competenceMonth: number;
  competenceYear: number;
  dueDate: string;
  amountCents: number;
  paidAmountCents: number;
  installmentNumber: number;
  status: FeeStatus;
  notes?: string;
  studentName?: string;
  className?: string;
  registrationNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialPayment {
  id: string;
  feeId: string;
  amountCents: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  reference?: string;
  recordedByUserId: string;
  cashTransactionId?: string;
  createdAt: string;
}

export interface CashTransaction {
  id: string;
  type: CashType;
  amountCents: number;
  date: string;
  category: string;
  description: string;
  paymentMethod: PaymentMethod;
  reference?: string;
  studentName?: string;
  className?: string;
  feePaymentId?: string;
  recordedByUserId: string;
  isReversal: boolean;
  reversedTransactionId?: string;
  reversalReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialContact {
  id: string;
  studentId: string;
  responsibleName: string;
  responsiblePhone?: string;
  responsibleCpf?: string;
  responsibleAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandingSettings {
  id: string;
  appName: string;
  accentColor: string;
  loginLogoUrl?: string;
  loginBgUrl?: string;
  printWatermarkText?: string;
  printWatermarkLogoUrl?: string;
  showHeaderLogoLeft: boolean;
  showHeaderLogoRight: boolean;
  documentHeaderAlign?: 'left' | 'center' | 'right' | 'split';
  syncVersion?: number;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdByUserId: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassSession {
  id: string;
  classId: string;
  date: string;
  recordedByUserId: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}
