-- Restore compatibility with the legacy desktop replacement lifecycle.
--
-- SQLite/D1 static migrations cannot conditionally reference a column: a
-- SELECT of `completed_at` fails at prepare time when the source database does
-- not have that column, and ALTER TABLE ADD COLUMN has no portable IF NOT
-- EXISTS form. To make this migration safe for both known source shapes, the
-- complete source table is retained as attendance_records_legacy_0007. Common
-- columns are copied into the canonical table below. A completion timestamp is
-- copied only from an already structured replacements row. When a legacy
-- source has completed_at but no structured replacement schedule, its exact
-- value remains losslessly available in the archive for an inspected follow-up
-- migration; no date or time is inferred.
--
-- Likewise, an R/RC attendance row alone is not enough to create a replacement
-- because replacements requires both scheduled_date and scheduled_time. This
-- migration deliberately does not invent either field and therefore does not
-- synthesize replacement rows from attendance notes or timestamps.

PRAGMA defer_foreign_keys = ON;

-- These names otherwise remain attached to the renamed legacy table and would
-- prevent the indexes from being recreated for the canonical table.
DROP INDEX IF EXISTS idx_attendance_class_date;
DROP INDEX IF EXISTS idx_attendance_student_date;

ALTER TABLE attendance_records RENAME TO attendance_records_legacy_0007;

CREATE TABLE attendance_records (
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

INSERT INTO attendance_records (
  id,
  class_id,
  student_id,
  date,
  status,
  notes,
  completed_at,
  recorded_by_user_id,
  sync_status,
  sync_version,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  legacy.id,
  legacy.class_id,
  legacy.student_id,
  legacy.date,
  legacy.status,
  legacy.notes,
  (
    SELECT replacement.completed_at
      FROM replacements replacement
     WHERE replacement.attendance_record_id = legacy.id
       AND replacement.deleted_at IS NULL
       AND replacement.completed_at IS NOT NULL
     LIMIT 1
  ),
  legacy.recorded_by_user_id,
  legacy.sync_status,
  legacy.sync_version,
  legacy.deleted_at,
  legacy.created_at,
  legacy.updated_at
FROM attendance_records_legacy_0007 legacy;

CREATE INDEX idx_attendance_class_date ON attendance_records(class_id, date);
CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, date);

-- ALTER TABLE RENAME rewrites foreign keys that referenced attendance_records
-- so that they point at the archived name. Rebuild the dependent conflict
-- table to keep its foreign key attached to the canonical table.
ALTER TABLE sync_conflicts RENAME TO sync_conflicts_legacy_0007;

CREATE TABLE sync_conflicts (
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

INSERT INTO sync_conflicts (
  id,
  attendance_record_id,
  operation_id,
  device_id,
  entity_name,
  entity_id,
  local_data_json,
  remote_data_json,
  status,
  resolved_by_user_id,
  resolution_justification,
  resolved_at,
  created_at
)
SELECT
  id,
  attendance_record_id,
  operation_id,
  device_id,
  entity_name,
  entity_id,
  local_data_json,
  remote_data_json,
  status,
  resolved_by_user_id,
  resolution_justification,
  resolved_at,
  created_at
FROM sync_conflicts_legacy_0007;

DROP TABLE sync_conflicts_legacy_0007;
CREATE INDEX idx_conflicts_status ON sync_conflicts(status, created_at);

PRAGMA defer_foreign_keys = OFF;
