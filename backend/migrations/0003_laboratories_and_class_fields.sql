CREATE TABLE IF NOT EXISTS laboratories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE classes ADD COLUMN week_day TEXT;
ALTER TABLE classes ADD COLUMN is_kids INTEGER NOT NULL DEFAULT 0 CHECK (is_kids IN (0, 1));
ALTER TABLE classes ADD COLUMN laboratory_id TEXT REFERENCES laboratories(id);
