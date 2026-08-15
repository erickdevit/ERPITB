import { describe, expect, it, vi } from 'vitest';
import { push } from '../src/sync';
import type { AuthUser, Env } from '../src/types';

describe('sync resilience', () => {
  it('rejects only the failing operation when D1 raises an unexpected error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const statement = { bind: () => statement, first: async () => { throw new Error('simulated D1 failure'); } };
    const env = { DB: { prepare: () => statement } } as unknown as Env;
    const user: AuthUser = { id: 'admin-1', name: 'Admin', email: 'admin@example.invalid', role: 'admin' };
    const request = new Request('https://example.invalid/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'test-device',
        operations: [{
          operationId: 'operation-1', entity: 'courses', action: 'upsert', id: 'course-1', baseVersion: 0,
          updatedAt: '2026-08-15T12:00:00.000Z', data: { id: 'course-1', code: 'INFO', name: 'Informática', active: 1 },
        }],
      }),
    });

    await expect(push(request, env, user)).resolves.toEqual({
      results: [{
        operationId: 'operation-1', status: 'rejected', code: 'SYNC_INTERNAL_ERROR',
        message: 'Não foi possível processar esta alteração. Ela foi preservada para revisão.',
      }],
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sync_operation_failed'));
  });
});
