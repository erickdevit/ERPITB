import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MigrationStep {
  id: string;
  description: string;
  up: (client: PoolClient) => Promise<void>;
}

export const REGISTERED_MIGRATIONS: MigrationStep[] = [
  {
    id: '20261027_0001_branding_settings_watermark_columns',
    description: 'Ensure watermark logo and grayscale columns exist in branding_settings',
    up: async (client) => {
      await client.query(`
        ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS print_watermark_logo_url TEXT;
        ALTER TABLE branding_settings ADD COLUMN IF NOT EXISTS print_watermark_grayscale INTEGER NOT NULL DEFAULT 1;
      `);
    },
  },
  {
    id: '20261027_0002_classes_number_and_dates',
    description: 'Ensure class_number, start_date and end_date columns exist in classes',
    up: async (client) => {
      await client.query(`
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS class_number INTEGER;
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_date TEXT;
        ALTER TABLE classes ADD COLUMN IF NOT EXISTS end_date TEXT;
        CREATE INDEX IF NOT EXISTS idx_classes_class_number ON classes(class_number);
        CREATE INDEX IF NOT EXISTS idx_classes_dates ON classes(start_date, end_date);
      `);
    },
  },
  {
    id: '20261027_0003_performance_and_lookup_indexes',
    description: 'Ensure essential performance indexes exist for attendance, enrollments and grades',
    up: async (client) => {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, date);
        CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_id, date);
        CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
        CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades(student_id);
        CREATE INDEX IF NOT EXISTS idx_student_grades_table ON student_grades(grade_table_id);
      `);
    },
  },
];

export async function runPostgresMigrations(pool: Pool, schemaFilePath?: string): Promise<void> {
  let sql = '';
  let resolvedSource = '';

  if (schemaFilePath && fs.existsSync(schemaFilePath)) {
    sql = fs.readFileSync(schemaFilePath, 'utf8');
    resolvedSource = schemaFilePath;
  } else {
    const candidates = [
      path.resolve(__dirname, 'schema.postgres.sql'),
      path.resolve(__dirname, 'db/schema.postgres.sql'),
      path.resolve(__dirname, '../src/db/schema.postgres.sql'),
      path.resolve(process.cwd(), 'src/db/schema.postgres.sql'),
      path.resolve(process.cwd(), 'schema.postgres.sql'),
      path.resolve('/app/backend/dist/schema.postgres.sql'),
      path.resolve('/app/backend/src/db/schema.postgres.sql'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        sql = fs.readFileSync(cand, 'utf8');
        resolvedSource = cand;
        break;
      }
    }
  }

  if (!sql) {
    throw new Error(`Postgres schema file not found. Checked default paths and none existed.`);
  }

  console.log(`[ERPITB DB] Initializing PostgreSQL schema from ${resolvedSource}...`);

  const client = await pool.connect();
  try {
    // 1. Run base schema script (tables, types, baseline indexes)
    await client.query(sql);

    // 2. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        description TEXT,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Query existing applied migrations
    const { rows: appliedRows } = await client.query('SELECT id FROM _schema_migrations');
    const appliedSet = new Set(appliedRows.map((r: { id: string }) => r.id));

    // 4. Run any pending incremental migrations in a transaction
    for (const migration of REGISTERED_MIGRATIONS) {
      if (!appliedSet.has(migration.id)) {
        console.log(`[ERPITB DB] Applying migration ${migration.id}: ${migration.description}...`);
        await client.query('BEGIN');
        try {
          await migration.up(client);
          await client.query(
            'INSERT INTO _schema_migrations (id, description, applied_at) VALUES ($1, $2, NOW())',
            [migration.id, migration.description],
          );
          await client.query('COMMIT');
          console.log(`[ERPITB DB] Migration ${migration.id} applied successfully.`);
        } catch (migErr) {
          await client.query('ROLLBACK');
          console.error(`[ERPITB DB] Migration ${migration.id} failed:`, migErr);
          throw migErr;
        }
      }
    }

    console.log('[ERPITB DB] PostgreSQL schema and migrations successfully synchronized.');

    // 5. Ensure default branding settings exist if table is empty
    const brandingCount = await client.query('SELECT COUNT(*) AS count FROM branding_settings');
    if (parseInt(brandingCount.rows[0]?.count || '0', 10) === 0) {
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO branding_settings (
          id, app_name, accent_color, print_watermark_text, print_watermark_grayscale,
          show_header_logo_left, show_header_logo_right, document_header_align, sync_version, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          'default-branding',
          'ERPITB',
          '#102A43',
          'ERPITB - Documento Oficial',
          1,
          1,
          0,
          'left',
          1,
          now,
        ],
      );
      console.log('[ERPITB DB] Seeded default branding settings.');
    }
  } finally {
    client.release();
  }
}
