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
      pending: async () => [operation], complete: async (operationId: string, version: number) => { completed.push([operationId, version]); }, conflict: async () => {},
      cursor: async () => 4, setCursor: async () => {}, putRemote: async (entity: string, record: LocalRecord) => { remote.push([entity, record]); },
    };
    const api = {
      post: async () => ({ results: [{ operationId: 'operation-1', status: 'applied', version: 2 }] }),
      get: async () => ({ changes: [{ entity: 'courses', operation: 'upsert', data: { id: 'course-1', name: 'Informática' } }], nextCursor: 5, hasMore: false }),
    };
    const result = await new Synchronizer(store as never, api as never).run();
    expect(result).toEqual({ synced: 1, offline: false });
    expect(completed).toEqual([['operation-1', 2]]);
    expect(remote).toEqual([['courses', { id: 'course-1', name: 'Informática' }]]);
  });
});
