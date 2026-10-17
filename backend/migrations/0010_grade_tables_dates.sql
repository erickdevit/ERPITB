-- Migration 0010: Add start_date and end_date to grade_tables
ALTER TABLE grade_tables ADD COLUMN start_date TEXT;
ALTER TABLE grade_tables ADD COLUMN end_date TEXT;
