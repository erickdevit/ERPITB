import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Synchronizer } from './sync';
import type { LocalRecord, SyncOperation } from '../types';

describe('Synchronizer', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  it('pushes queued data, marks it synced, and applies the remote cursor', async () => {
    const operation: SyncOperation = { operationId: 'operation-1', entity: 'students', action: 'upsert', id: 'student-1', baseVersion: 0, updatedAt: '2026-01-01T00:00:00.000Z', data: { id: 'student-1', name: 'Ana' } };
    const completed: Array<[string, number]> = []; const remote: Array<[string, LocalRecord]> = [];
    const store = {
      pending: async () => [operation], complete: async (operationId: string, version: number) => { completed.push([operationId, version]); }, conflict: async () => {}, reject: async () => {},
      cursor: async () => 4, setCursor: async () => {}, putRemote: async (entity: string, record: LocalRecord) => { remote.push([entity, record]); },
    };
    const api = {
      post: async () => ({ results: [{ operationId: 'operation-1', status: 'applied', version: 2 }] }),
      get: async () => ({ changes: [{ entity: 'courses', operation: 'upsert', data: { id: 'course-1', name: 'Informática' } }], nextCursor: 5, hasMore: false }),
    };
    const result = await new Synchronizer(store as never, api as never).run();
    expect(result).toEqual({ synced: 1, rejected: 0, offline: false });
    expect(completed).toEqual([['operation-1', 2]]);
    expect(remote).toEqual([['courses', { id: 'course-1', name: 'Informática' }]]);
  });

  it('preserves a rejected operation with the server reason', async () => {
    const rejected: Array<[string, string, string]> = [];
    const store = {
      pending: async () => [{ operationId: 'operation-2' }], complete: async () => {}, conflict: async () => {},
      reject: async (operationId: string, code: string, message: string) => { rejected.push([operationId, code, message]); },
      cursor: async () => 0, setCursor: async () => {}, putRemote: async () => {},
    };
    const api = {
      post: async () => ({ results: [{ operationId: 'operation-2', status: 'rejected', code: 'VALIDATION_ERROR', message: 'Turma inválida.' }] }),
      get: async () => ({ changes: [], nextCursor: 0, hasMore: false }),
    };

    await expect(new Synchronizer(store as never, api as never).run()).resolves.toEqual({ synced: 0, rejected: 1, offline: false });
    expect(rejected).toEqual([['operation-2', 'VALIDATION_ERROR', 'Turma inválida.']]);
  });

  it('splits a large queue into batches accepted by the Worker', async () => {
    const operations = Array.from({ length: 201 }, (_, index) => ({ operationId: `operation-${index}` }));
    const batchSizes: number[] = [];
    const store = {
      pending: async () => operations, complete: async () => {}, conflict: async () => {}, reject: async () => {},
      cursor: async () => 0, setCursor: async () => {}, putRemote: async () => {},
    };
    const api = {
      post: async (_path: string, body: { operations: Array<{ operationId: string }> }) => { batchSizes.push(body.operations.length); return { results: body.operations.map((item) => ({ operationId: item.operationId, status: 'applied', version: 1 })) }; },
      get: async () => ({ changes: [], nextCursor: 0, hasMore: false }),
    };

    await new Synchronizer(store as never, api as never).run();
    expect(batchSizes).toEqual([200, 1]);
  });
});
