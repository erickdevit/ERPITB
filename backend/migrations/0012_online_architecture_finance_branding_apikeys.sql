-- Migration 0012: Online REST Architecture, Finance, Branding, Class Sessions & API Keys
-- Adds support for role 'financeiro', class sessions, financial management, API keys and branding.

-- 1. Recreate users table with role 'financeiro'
PRAGMA foreign_keys = OFF;
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'pedagogico', 'professor', 'financeiro')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO users_new SELECT id, name, email, password_hash, role, active, created_at, updated_at FROM users;
DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;
PRAGMA foreign_keys = ON;

-- 2. Class Sessions (distinct academic class sessions)
CREATE TABLE IF NOT EXISTS class_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(class_id, date)
);
CREATE INDEX IF NOT EXISTS idx_class_sessions_class_date ON class_sessions(class_id, date);

-- 3. Financial Fees (Mensalidades)
CREATE TABLE IF NOT EXISTS financial_fees (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  class_id TEXT REFERENCES classes(id),
  enrollment_id TEXT REFERENCES enrollments(id),
  competence_month INTEGER NOT NULL,
  competence_year INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_amount_cents INTEGER NOT NULL DEFAULT 0,
  installment_number INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'paga', 'parcial', 'atrasada', 'cancelada')),
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_fees_student ON financial_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_financial_fees_due ON financial_fees(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_fees_status ON financial_fees(status);
CREATE INDEX IF NOT EXISTS idx_financial_fees_competence ON financial_fees(competence_year, competence_month);
CREATE INDEX IF NOT EXISTS idx_financial_fees_class ON financial_fees(class_id);

-- 4. Financial Payments (Pagamentos)
CREATE TABLE IF NOT EXISTS financial_payments (
  id TEXT PRIMARY KEY,
  fee_id TEXT NOT NULL REFERENCES financial_fees(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  reference TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  cash_transaction_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_payments_fee ON financial_payments(fee_id);
CREATE INDEX IF NOT EXISTS idx_financial_payments_date ON financial_payments(payment_date);

-- 5. Cash Transactions (Livro Caixa)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  amount_cents INTEGER NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  reference TEXT,
  student_name TEXT,
  class_name TEXT,
  fee_payment_id TEXT REFERENCES financial_payments(id),
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  is_reversal INTEGER NOT NULL DEFAULT 0 CHECK (is_reversal IN (0, 1)),
  reversed_transaction_id TEXT REFERENCES cash_transactions(id),
  reversal_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_transactions(date);
CREATE INDEX IF NOT EXISTS idx_cash_type ON cash_transactions(type);
CREATE INDEX IF NOT EXISTS idx_cash_method ON cash_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_cash_category ON cash_transactions(category);

-- 6. Financial Contacts (Encrypted Responsible Contact)
CREATE TABLE IF NOT EXISTS financial_contacts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  encrypted_responsible_name TEXT NOT NULL,
  encrypted_responsible_phone TEXT,
  encrypted_responsible_cpf TEXT,
  encrypted_responsible_address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_contacts_student ON financial_contacts(student_id);

-- 7. API Keys for machine integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(revoked_at, expires_at);

-- 8. Branding Settings
CREATE TABLE IF NOT EXISTS branding_settings (
  id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'ERPITB',
  accent_color TEXT NOT NULL DEFAULT '#102A43',
  login_logo_url TEXT,
  login_bg_url TEXT,
  print_watermark_text TEXT DEFAULT 'ERPITB - Documento Oficial',
  show_header_logo_left INTEGER NOT NULL DEFAULT 1,
  show_header_logo_right INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);
