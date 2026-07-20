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
    expect(schema).toContain("status IN ('P', 'F', 'J', 'A')");
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS class_notes');
  });
});
