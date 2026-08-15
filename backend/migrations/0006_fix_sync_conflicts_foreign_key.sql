-- Migration 0002 rebuilt attendance_records. SQLite rewrote this foreign key
-- to the temporary parent table, which prevents new conflict records.
CREATE TABLE sync_conflicts_v2 (
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

INSERT INTO sync_conflicts_v2 (
  id, attendance_record_id, operation_id, device_id, entity_name, entity_id,
  local_data_json, remote_data_json, status, resolved_by_user_id,
  resolution_justification, resolved_at, created_at
)
SELECT
  id, attendance_record_id, operation_id, device_id, entity_name, entity_id,
  local_data_json, remote_data_json, status, resolved_by_user_id,
  resolution_justification, resolved_at, created_at
FROM sync_conflicts;

DROP TABLE sync_conflicts;
ALTER TABLE sync_conflicts_v2 RENAME TO sync_conflicts;
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(status, created_at);
