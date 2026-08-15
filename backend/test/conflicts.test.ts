import { describe, expect, it } from 'vitest';
import { resolveConflict } from '../src/data';
import type { AuthUser, Env } from '../src/types';

describe('conflict resolution', () => {
  it('publishes and returns the canonical version accepted from the device', async () => {
    const captured: Array<{ sql: string; values: unknown[] }> = [];
    const conflict = {
      id: 'conflict-1', entity_name: 'attendance_records', entity_id: 'attendance-1', status: 'PENDING',
      local_data_json: JSON.stringify({ status: 'RC', notes: 'Reposição confirmada', completed_at: '2026-08-15T10:00:00.000Z' }),
    };
    const current = {
      id: 'attendance-1', class_id: 'class-1', student_id: 'student-1', date: '2026-08-10', status: 'R',
      notes: null, completed_at: null, recorded_by_user_id: 'teacher-1', sync_status: 'SYNCED', sync_version: 5,
      created_at: '2026-08-10T10:00:00.000Z', updated_at: '2026-08-10T10:00:00.000Z', deleted_at: null,
    };
    const database = {
      prepare: (sql: string) => {
        const statement = {
          values: [] as unknown[],
          bind(...values: unknown[]) { statement.values = values; captured.push({ sql, values }); return statement; },
          first: async () => sql.includes('FROM sync_conflicts') ? conflict : sql.includes('FROM attendance_records') ? current : null,
        };
        return statement;
      },
      batch: async () => [],
    };
    const env = { DB: database } as unknown as Env;
    const user: AuthUser = { id: 'admin-1', name: 'Admin', email: 'admin@example.invalid', role: 'admin' };
    const request = new Request('https://example.invalid/conflicts/conflict-1/resolve', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'local', justification: 'Conferido com a coordenação.' }),
    });

    const result = await resolveConflict(request, env, user, 'conflict-1');

    expect(result).toMatchObject({ ok: true, decision: 'local', entity: 'attendance_records', version: 6, record: { status: 'RC', sync_version: 6 } });
    const changeInsert = captured.find((item) => item.sql.includes('INSERT INTO sync_changes'));
    expect(JSON.parse(String(changeInsert?.values[3]))).toMatchObject({ id: 'attendance-1', status: 'RC', sync_version: 6 });
  });
});
