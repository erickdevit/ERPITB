import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSyncBatches, Synchronizer } from './sync';
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
      accountId: 'user-1',
      pending: async () => [operation], complete: async (operationId: string, version: number) => { completed.push([operationId, version]); }, conflict: async () => {}, reject: async () => {},
      cursor: async () => 4, setCursor: async () => {}, putRemote: async (entity: string, record: LocalRecord) => { remote.push([entity, record]); },
      list: async () => [],
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

  it('keeps a new student and enrollment together at a batch boundary', () => {
    const unrelated = Array.from({ length: 199 }, (_, index): SyncOperation => ({
      operationId: `operation-${index}`, entity: 'courses', action: 'upsert', id: `course-${index}`,
      baseVersion: 0, updatedAt: '2026-08-15T12:00:00.000Z', data: { id: `course-${index}`, code: `${index}`, name: `${index}`, active: 1 },
    }));
    const student: SyncOperation = { operationId: 'student-operation', entity: 'students', action: 'upsert', id: 'student-1', baseVersion: 0, updatedAt: '2026-08-15T12:01:00.000Z', data: { id: 'student-1', name: 'Ana', registration_number: '1', active: 1 } };
    const enrollment: SyncOperation = { operationId: 'enrollment-operation', entity: 'enrollments', action: 'upsert', id: 'enrollment-1', baseVersion: 0, updatedAt: '2026-08-15T12:01:01.000Z', data: { id: 'enrollment-1', student_id: 'student-1', class_id: 'class-1', status: 'ativa' } };

    const batches = buildSyncBatches([...unrelated, student, enrollment]);

    expect(batches.map((batch) => batch.length)).toEqual([199, 2]);
    expect(batches[1]?.map((operation) => operation.operationId)).toEqual(['student-operation', 'enrollment-operation']);
  });

  it('orders enrollment removals before the target enrollment upsert', () => {
    const upsert: SyncOperation = { operationId: 'target', entity: 'enrollments', action: 'upsert', id: 'target', baseVersion: 1, updatedAt: '2026-08-15T12:00:00.000Z', data: { id: 'target', student_id: 'student-1', class_id: 'class-b', status: 'ativa' } };
    const remove: SyncOperation = { operationId: 'previous', entity: 'enrollments', action: 'delete', id: 'previous', baseVersion: 1, updatedAt: '2026-08-15T12:00:01.000Z', data: { id: 'previous', student_id: 'student-1', class_id: 'class-a', status: 'ativa' } };

    expect(buildSyncBatches([upsert, remove])[0]?.map((operation) => operation.operationId)).toEqual(['previous', 'target']);
  });

  it('triggers catchup sync from cursor 0 when local store is missing an assigned class', async () => {
    let currentCursor = 10;
    const remote: Array<[string, LocalRecord]> = [];
    const store = {
      accountId: 'prof-1',
      pending: async () => [],
      cursor: async () => currentCursor,
      setCursor: async (c: number) => { currentCursor = c; },
      putRemote: async (entity: string, record: LocalRecord) => { remote.push([entity, record]); },
      list: async (entity: string) => {
        if (entity === 'class_teachers') return [{ id: 'ct-1', user_id: 'prof-1', class_id: 'class-new', deleted_at: null }];
        if (entity === 'classes') return []; // Missing class-new!
        return [];
      },
    };

    let callCount = 0;
    const api = {
      post: async () => ({ results: [] }),
      get: async (url: string) => {
        callCount++;
        if (url.includes('cursor=10')) {
          return {
            changes: [{ entity: 'class_teachers', operation: 'upsert', data: { id: 'ct-1', user_id: 'prof-1', class_id: 'class-new' } }],
            nextCursor: 11,
            hasMore: false,
          };
        }
        // Catchup from cursor=0
        return {
          changes: [{ entity: 'classes', operation: 'upsert', data: { id: 'class-new', name: 'Turma Nova' } }],
          nextCursor: 11,
          hasMore: false,
        };
      },
    };

    const result = await new Synchronizer(store as never, api as never).run();
    expect(result.synced).toBe(0);
    expect(callCount).toBe(2); // Normal sync + catchup sync
    expect(remote).toEqual([
      ['class_teachers', { id: 'ct-1', user_id: 'prof-1', class_id: 'class-new' }],
      ['classes', { id: 'class-new', name: 'Turma Nova' }],
    ]);
  });
});
