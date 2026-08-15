import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../migrations/0007_restore_legacy_replacements.sql', import.meta.url),
  'utf8',
);

function sourceDatabase(withCompletedAt: boolean): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  const legacyStatuses = withCompletedAt
    ? "'P', 'F', 'J', 'A', 'R', 'RC'"
    : "'P', 'F', 'J', 'A', 'R'";
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE classes (id TEXT PRIMARY KEY);
    CREATE TABLE students (id TEXT PRIMARY KEY);
    CREATE TABLE attendance_records (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (${legacyStatuses})),
      notes TEXT,
      ${withCompletedAt ? 'completed_at TEXT,' : ''}
      recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
      sync_status TEXT NOT NULL DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'CONFLICT')),
      sync_version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(class_id, student_id, date)
    );
    CREATE INDEX idx_attendance_class_date ON attendance_records(class_id, date);
    CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, date);
    CREATE TABLE replacements (
      id TEXT PRIMARY KEY,
      attendance_record_id TEXT NOT NULL UNIQUE,
      class_id TEXT NOT NULL REFERENCES classes(id),
      student_id TEXT NOT NULL REFERENCES students(id),
      attendance_date TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      notes TEXT,
      completed_at TEXT,
      recorded_by_user_id TEXT NOT NULL REFERENCES users(id),
      sync_version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE sync_conflicts (
      id TEXT PRIMARY KEY,
      attendance_record_id TEXT REFERENCES attendance_records(id),
      operation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_data_json TEXT NOT NULL,
      remote_data_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      resolved_by_user_id TEXT REFERENCES users(id),
      resolution_justification TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_conflicts_status ON sync_conflicts(status, created_at);
    INSERT INTO users VALUES ('user-1', 'Admin', 'admin@example.test', 'hash', 'admin', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    INSERT INTO classes VALUES ('class-1');
    INSERT INTO students VALUES ('student-1');
  `);
  return db;
}

function insertAttendance(
  db: DatabaseSync,
  withCompletedAt: boolean,
  status: 'R' | 'RC',
  completedAt: string | null,
): void {
  const completedColumn = withCompletedAt ? ', completed_at' : '';
  const completedValue = withCompletedAt ? ', ?' : '';
  db.prepare(`
    INSERT INTO attendance_records (
      id, class_id, student_id, date, status, notes${completedColumn},
      recorded_by_user_id, sync_status, sync_version, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?${completedValue}, ?, ?, ?, ?, ?, ?)
  `).run(
    'attendance-1',
    'class-1',
    'student-1',
    '2026-07-10',
    status,
    'observação preservada',
    ...(withCompletedAt ? [completedAt] : []),
    'user-1',
    'SYNCED',
    7,
    null,
    '2026-07-10T12:00:00Z',
    '2026-07-11T12:00:00Z',
  );
  db.prepare(`
    INSERT INTO sync_conflicts (
      id, attendance_record_id, operation_id, device_id, entity_name, entity_id,
      local_data_json, remote_data_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'conflict-1',
    'attendance-1',
    'operation-1',
    'device-1',
    'attendance_records',
    'attendance-1',
    '{}',
    '{}',
    'PENDING',
    '2026-07-11T12:00:00Z',
  );
}

function rows(db: DatabaseSync, sql: string): Array<Record<string, unknown>> {
  return db.prepare(sql).all() as Array<Record<string, unknown>>;
}

describe('migration 0007 legacy replacements', () => {
  it('rebuilds a source without completed_at and preserves IDs, data, indexes, and foreign keys', () => {
    const db = sourceDatabase(false);
    insertAttendance(db, false, 'R', null);
    db.exec(migration);

    expect(rows(db, `PRAGMA table_info('attendance_records')`).map((row) => row.name)).toContain('completed_at');
    expect(rows(db, `SELECT id, status, notes, sync_version FROM attendance_records`)).toEqual([
      { id: 'attendance-1', status: 'R', notes: 'observação preservada', sync_version: 7 },
    ]);
    expect(rows(db, `SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'idx_attendance_class_date'`)).toEqual([
      { tbl_name: 'attendance_records' },
    ]);
    expect(rows(db, `PRAGMA foreign_key_list('sync_conflicts')`).some((row) => row.table === 'attendance_records')).toBe(true);
    expect(rows(db, `SELECT id, attendance_record_id FROM sync_conflicts`)).toEqual([
      { id: 'conflict-1', attendance_record_id: 'attendance-1' },
    ]);
    expect(rows(db, 'PRAGMA foreign_key_check')).toEqual([]);

    expect(() => db.exec(`
      INSERT INTO attendance_records (
        id, class_id, student_id, date, status, recorded_by_user_id,
        sync_status, sync_version, created_at, updated_at
      ) VALUES (
        'attendance-rc', 'class-1', 'student-1', '2026-07-12', 'RC',
        'user-1', 'SYNCED', 1, '2026-07-12T12:00:00Z', '2026-07-12T12:00:00Z'
      );
    `)).not.toThrow();
    db.close();
  });

  it('uses only an existing structured replacement to backfill completion metadata', () => {
    const db = sourceDatabase(false);
    insertAttendance(db, false, 'R', null);
    db.exec(`
      INSERT INTO replacements (
        id, attendance_record_id, class_id, student_id, attendance_date,
        scheduled_date, scheduled_time, notes, completed_at,
        recorded_by_user_id, sync_version, created_at, updated_at
      ) VALUES (
        'replacement-1', 'attendance-1', 'class-1', 'student-1', '2026-07-10',
        '2026-07-20', '14:30', 'agenda estruturada', '2026-07-20T17:30:00Z',
        'user-1', 3, '2026-07-11T12:00:00Z', '2026-07-20T17:30:00Z'
      );
    `);
    db.exec(migration);

    expect(rows(db, `SELECT completed_at FROM attendance_records WHERE id = 'attendance-1'`)).toEqual([
      { completed_at: '2026-07-20T17:30:00Z' },
    ]);
    expect(rows(db, `SELECT scheduled_date, scheduled_time FROM replacements`)).toEqual([
      { scheduled_date: '2026-07-20', scheduled_time: '14:30' },
    ]);
    expect(rows(db, 'PRAGMA foreign_key_check')).toEqual([]);
    db.close();
  });

  it('runs against a source that already has completed_at without inventing schedule data', () => {
    const db = sourceDatabase(true);
    insertAttendance(db, true, 'RC', '2026-07-15T18:00:00Z');
    db.exec(migration);

    expect(rows(db, `SELECT id, status, notes FROM attendance_records`)).toEqual([
      { id: 'attendance-1', status: 'RC', notes: 'observação preservada' },
    ]);
    expect(rows(db, `SELECT completed_at FROM attendance_records_legacy_0007 WHERE id = 'attendance-1'`)).toEqual([
      { completed_at: '2026-07-15T18:00:00Z' },
    ]);
    expect(rows(db, 'SELECT * FROM replacements')).toEqual([]);
    expect(rows(db, 'PRAGMA foreign_key_check')).toEqual([]);
    db.close();
  });
});
