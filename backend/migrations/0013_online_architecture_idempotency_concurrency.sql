-- Migration 0013: Concurrency Control, Idempotency & Schema Normalization
-- ERPITB - Instituto Transforma Brasil
PRAGMA foreign_keys = ON;

-- 1. Dedicated Idempotency Table (Scoped per user)
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

-- 1.1 System Events (SSE Broadcast & Event Replay Log)
CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_user_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at);
CREATE INDEX IF NOT EXISTS idx_system_events_target ON system_events(target_user_id);

-- 2. Concurrency versioning for financial and branding tables
ALTER TABLE financial_fees ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cash_transactions ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branding_settings ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE branding_settings ADD COLUMN document_header_align TEXT DEFAULT 'left' CHECK (document_header_align IN ('left', 'center', 'right', 'split'));

-- 3. Optimization Indexes for v1 queries
CREATE INDEX IF NOT EXISTS idx_attendance_records_v1 ON attendance_records(class_id, date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_notes_v1 ON class_notes(class_id, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_replacements_v1 ON replacements(class_id, student_id, attendance_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grade_tables_v1 ON grade_tables(class_id, published, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_grades_v1 ON student_grades(grade_item_id, student_id) WHERE deleted_at IS NULL;
