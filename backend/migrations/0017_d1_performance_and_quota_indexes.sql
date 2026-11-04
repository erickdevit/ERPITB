-- Migration 0017: D1 Quota Optimization & Critical Indexing
-- Prevents full-table scans, filesorts, and quota exhaustion on attendance, students, and enrollments.

CREATE INDEX IF NOT EXISTS idx_attendance_records_v1 ON attendance_records(class_id, date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_student_deleted ON attendance_records(student_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_date_deleted ON attendance_records(date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_deleted_date ON attendance_records(deleted_at, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance_records(recorded_by_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_deleted_reg ON students(deleted_at, registration_number);
CREATE INDEX IF NOT EXISTS idx_enrollments_deleted_created ON enrollments(deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_active ON enrollments(class_id, status) WHERE deleted_at IS NULL;
