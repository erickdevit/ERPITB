PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'pedagogico', 'professor')),
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
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_changes_seq ON sync_changes(seq);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
