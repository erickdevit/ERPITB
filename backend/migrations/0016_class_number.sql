-- 0016_class_number.sql
-- Add class_number numeric ERP identifier column to classes and index for ascending order
ALTER TABLE classes ADD COLUMN class_number INTEGER;
CREATE INDEX IF NOT EXISTS idx_classes_class_number ON classes(class_number);
