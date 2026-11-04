-- 0016_class_number.sql
-- Add class_number numeric ERP identifier column to classes and index for ascending order
ALTER TABLE classes ADD COLUMN class_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_classes_class_number ON classes(class_number);

-- Assign sequential class numbers for any legacy classes that have NULL class_number
UPDATE classes
SET class_number = (
  SELECT COUNT(*)
  FROM classes AS c2
  WHERE c2.rowid <= classes.rowid
)
WHERE class_number IS NULL;
