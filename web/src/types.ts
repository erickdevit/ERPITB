export type Role = 'admin' | 'pedagogico' | 'professor' | 'financeiro';

export type Entity =
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

export type Action = 'upsert' | 'delete';
export type AttendanceStatus = 'P' | 'F' | 'J' | 'A' | 'R' | 'RC';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  offline?: boolean;
}

export interface LocalRecord extends Record<string, unknown> {
  id: string;
  sync_version?: number;
  sync_status?: 'PENDING' | 'SYNCED' | 'CONFLICT' | 'REJECTED';
  sync_error_code?: string;
  sync_error_message?: string;
  deleted_at?: string | null;
  updated_at?: string;
}

export interface SyncOperation {
  operationId: string;
  entity: Entity;
  action: Action;
  id: string;
  baseVersion: number;
  updatedAt: string;
  data: LocalRecord;
}

export const entityLabels: Record<Entity, string> = {
  laboratories: 'Laboratórios',
  courses: 'Cursos',
  classes: 'Turmas',
  class_teachers: 'Professores',
  students: 'Alunos',
  enrollments: 'Matrículas',
  attendance_records: 'Frequências',
  class_notes: 'Observações',
  replacements: 'Reposições',
  grade_tables: 'Tabelas de Notas',
  grade_items: 'Avaliações',
  student_grades: 'Notas de Alunos',
};

export const roleLabel: Record<Role, string> = {
  admin: 'Administrador',
  pedagogico: 'Administrativo / Secretaria',
  professor: 'Professor',
  financeiro: 'Financeiro',
};

export const canManage = (role: Role) => role === 'admin' || role === 'pedagogico';
export const canManageFinance = (role: Role) => role === 'admin' || role === 'financeiro';

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
  printWatermarkGrayscale?: boolean;
  showHeaderLogoLeft: boolean;
  showHeaderLogoRight: boolean;
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
