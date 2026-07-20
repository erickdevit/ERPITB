ALTER TABLE students ADD COLUMN birth_date TEXT;

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

CREATE INDEX IF NOT EXISTS idx_class_notes_class_date ON class_notes(class_id, date);

PRAGMA foreign_keys = OFF;
CREATE TABLE attendance_records_v2 (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P', 'F', 'J', 'A')),
  notes TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_status TEXT NOT NULL DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'CONFLICT')),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(class_id, student_id, date)
);
INSERT INTO attendance_records_v2 SELECT * FROM attendance_records;
DROP TABLE attendance_records;
ALTER TABLE attendance_records_v2 RENAME TO attendance_records;
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, date);
PRAGMA foreign_keys = ON;
