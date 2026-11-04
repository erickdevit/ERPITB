CREATE TABLE IF NOT EXISTS grade_tables (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calculation_mode TEXT NOT NULL DEFAULT 'simple' CHECK (calculation_mode IN ('simple', 'weighted', 'sum')),
  passing_grade REAL NOT NULL DEFAULT 6.0,
  published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grade_items (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  grade_table_id TEXT NOT NULL REFERENCES grade_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  evaluation_date TEXT,
  max_score REAL NOT NULL DEFAULT 10.0,
  weight REAL NOT NULL DEFAULT 1.0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_grades (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  grade_table_id TEXT NOT NULL REFERENCES grade_tables(id) ON DELETE CASCADE,
  grade_item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score REAL,
  remarks TEXT,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(grade_item_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_grade_tables_class ON grade_tables(class_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_grade_items_table ON grade_items(grade_table_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_grade_items_class ON grade_items(class_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_table ON student_grades(grade_table_id, student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades(student_id, class_id);
