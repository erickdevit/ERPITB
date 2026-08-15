import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('sync contract', () => {
  it('documents an idempotent operation envelope', () => {
    const operation = {
      operationId: crypto.randomUUID(),
      entity: 'attendance_records',
      action: 'upsert',
      id: crypto.randomUUID(),
      baseVersion: 0,
      updatedAt: new Date().toISOString(),
      data: { status: 'P' },
    } as const;
    expect(operation.operationId).toHaveLength(36);
    expect(operation.baseVersion).toBe(0);
  });

  it('keeps the mandatory management and attendance fields in the schema', () => {
    const schema = readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8');
    expect(schema).toContain('birth_date TEXT');
    expect(schema).toContain("status IN ('P', 'F', 'J', 'A', 'R')");
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS class_notes');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS replacements');
    expect(schema).toContain('attendance_record_id TEXT NOT NULL UNIQUE');
    expect(schema).toContain('UNIQUE(class_id, student_id, date)');
  });

  it('repairs the conflict table foreign key after rebuilding attendance records', () => {
    const migration = readFileSync(new URL('../migrations/0006_fix_sync_conflicts_foreign_key.sql', import.meta.url), 'utf8');
    expect(migration).toContain('attendance_record_id TEXT REFERENCES attendance_records(id)');
    expect(migration).toContain('INSERT INTO sync_conflicts_v2');
    expect(migration).not.toContain('attendance_records_old');
  });
});
