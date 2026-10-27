-- Migration 0018: Add start_date and end_date to classes
ALTER TABLE classes ADD COLUMN start_date TEXT;
ALTER TABLE classes ADD COLUMN end_date TEXT;
CREATE INDEX IF NOT EXISTS idx_classes_dates ON classes(start_date, end_date);
