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

CREATE INDEX IF NOT EXISTS idx_replacements_status ON replacements(completed_at, scheduled_date);
