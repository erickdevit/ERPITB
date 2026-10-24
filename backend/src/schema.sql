PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'pedagogico', 'professor', 'financeiro')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laboratories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('manha', 'tarde', 'noite', 'integral')),
  week_day TEXT,
  is_kids INTEGER NOT NULL DEFAULT 0 CHECK (is_kids IN (0, 1)),
  laboratory_id TEXT REFERENCES laboratories(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(course_id, name)
);

CREATE TABLE IF NOT EXISTS class_teachers (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(class_id, user_id)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  encrypted_name TEXT NOT NULL,
  encrypted_cpf TEXT,
  encrypted_contact TEXT,
  registration_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  birth_date TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('ativa', 'trancada', 'concluida')),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(class_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P', 'F', 'J', 'A', 'R', 'RC')),
  notes TEXT,
  completed_at TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_status TEXT NOT NULL DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'CONFLICT')),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(class_id, student_id, date)
);

CREATE TABLE IF NOT EXISTS class_notes (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  notes TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(class_id, date)
);

CREATE TABLE IF NOT EXISTS replacements (
  id TEXT PRIMARY KEY,
  attendance_record_id TEXT NOT NULL UNIQUE,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  attendance_date TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT NOT NULL,
  notes TEXT,
  completed_at TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grade_tables (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calculation_mode TEXT NOT NULL DEFAULT 'simple' CHECK (calculation_mode IN ('simple', 'weighted', 'sum')),
  passing_grade REAL NOT NULL DEFAULT 6.0,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grade_items (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  grade_table_id TEXT NOT NULL REFERENCES grade_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  evaluation_date TEXT,
  max_score REAL NOT NULL DEFAULT 10.0,
  weight REAL NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_grades (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  grade_table_id TEXT NOT NULL REFERENCES grade_tables(id) ON DELETE CASCADE,
  grade_item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score REAL,
  remarks TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(grade_item_id, student_id)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  attendance_record_id TEXT REFERENCES attendance_records(id),
  operation_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_data_json TEXT NOT NULL,
  remote_data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LOCAL_ACCEPTED', 'REMOTE_ACCEPTED')),
  resolved_by_user_id TEXT REFERENCES users(id),
  resolution_justification TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload_json TEXT NOT NULL,
  changed_by_user_id TEXT NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_user ON class_teachers(user_id, class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_student_active ON enrollments(student_id) WHERE status = 'ativa' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, date);
CREATE INDEX IF NOT EXISTS idx_class_notes_class_date ON class_notes(class_id, date);
CREATE INDEX IF NOT EXISTS idx_replacements_status ON replacements(completed_at, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_grade_tables_class ON grade_tables(class_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_grade_items_table ON grade_items(grade_table_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_grade_items_class ON grade_items(class_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_table ON student_grades(grade_table_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades(student_id, class_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_changes_seq ON sync_changes(seq);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- Class Sessions
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

-- Financial Fees (Mensalidades)
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
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_financial_fees_student ON financial_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_financial_fees_due ON financial_fees(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_fees_status ON financial_fees(status);
CREATE INDEX IF NOT EXISTS idx_financial_fees_competence ON financial_fees(competence_year, competence_month);
CREATE INDEX IF NOT EXISTS idx_financial_fees_class ON financial_fees(class_id);

-- Financial Payments (Pagamentos)
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

-- Cash Transactions (Livro Caixa)
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
  sync_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_transactions(date);
CREATE INDEX IF NOT EXISTS idx_cash_type ON cash_transactions(type);
CREATE INDEX IF NOT EXISTS idx_cash_method ON cash_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_cash_category ON cash_transactions(category);

-- Financial Contacts (Encrypted Responsible Contact)
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

-- API Keys for machine integrations
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

-- Branding Settings
CREATE TABLE IF NOT EXISTS branding_settings (
  id TEXT PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'ERPITB',
  accent_color TEXT NOT NULL DEFAULT '#102A43',
  login_logo_url TEXT,
  login_bg_url TEXT,
  print_watermark_text TEXT DEFAULT 'ERPITB - Documento Oficial',
  show_header_logo_left INTEGER NOT NULL DEFAULT 1,
  show_header_logo_right INTEGER NOT NULL DEFAULT 0,
  document_header_align TEXT DEFAULT 'left' CHECK (document_header_align IN ('left', 'center', 'right', 'split')),
  sync_version INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- Idempotency Keys (D1 Persistent Idempotency Engine - scoped per user)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- System Events (Real-Time SSE Broadcast & Event Replay Log)
CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_user_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_system_events_target ON system_events(target_user_id);

-- Optimization Indexes for v1 queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_v1 ON attendance_records(class_id, date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_notes_v1 ON class_notes(class_id, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_replacements_v1 ON replacements(class_id, student_id, attendance_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grade_tables_v1 ON grade_tables(class_id, published, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_grades_v1 ON student_grades(grade_item_id, student_id) WHERE deleted_at IS NULL;



