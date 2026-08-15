-- A student can keep historical enrollments, but only one can be current.
-- Production was checked for duplicates before this invariant was introduced.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_student_active
  ON enrollments(student_id)
  WHERE status = 'ativa' AND deleted_at IS NULL;
