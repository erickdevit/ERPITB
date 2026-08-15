import { ApiClient, OfflineError } from './api';
import { LocalStore } from './db';
import type { LocalRecord } from '../types';
import type { SyncOperation } from '../types';

export function buildSyncBatches(operations: SyncOperation[], maximum = 200): SyncOperation[][] {
  const groups = new Map<string, { first: number; operations: SyncOperation[] }>();
  operations.forEach((operation, index) => {
    const studentId = operation.entity === 'students'
      ? operation.id
      : operation.entity === 'enrollments' && typeof operation.data.student_id === 'string'
        ? operation.data.student_id
        : undefined;
    const key = studentId ? `student:${studentId}` : `single:${index}`;
    const group = groups.get(key) ?? { first: index, operations: [] };
    group.operations.push(operation); groups.set(key, group);
  });
  const orderedGroups = [...groups.values()].sort((left, right) => left.first - right.first).map((group) => ({
    ...group,
    operations: group.operations.map((operation, index) => ({ operation, index })).sort((left, right) => {
      const rank = (item: SyncOperation) => item.entity === 'students'
        ? item.action === 'delete' ? 3 : 0
        : item.entity === 'enrollments' ? item.action === 'delete' ? 1 : 2 : 2;
      return rank(left.operation) - rank(right.operation) || left.index - right.index;
    }).map(({ operation }) => operation),
  }));
  const batches: SyncOperation[][] = [];
  let batch: SyncOperation[] = [];
  for (const group of orderedGroups) {
    for (let offset = 0; offset < group.operations.length; offset += maximum) {
      const chunk = group.operations.slice(offset, offset + maximum);
      if (batch.length && batch.length + chunk.length > maximum) { batches.push(batch); batch = []; }
      batch.push(...chunk);
      if (batch.length === maximum) { batches.push(batch); batch = []; }
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export class Synchronizer {
  constructor(private store: LocalStore, private api: ApiClient) {}
  async run(): Promise<{ synced: number; rejected: number; offline: boolean }> {
    try {
      const operations = await this.store.pending(); let synced = 0; let rejected = 0;
      for (const batch of buildSyncBatches(operations)) {
        const result = await this.api.post<{ results: Array<{ operationId: string; status: string; version?: number; code?: string; message?: string }> }>('/sync/push', { deviceId: this.deviceId(), operations: batch });
        for (const item of result.results) {
          if (item.status === 'applied') { await this.store.complete(item.operationId, item.version ?? 1); synced++; }
          else if (item.status === 'conflict') await this.store.conflict(item.operationId);
          else { await this.store.reject(item.operationId, item.code ?? 'SYNC_REJECTED', item.message ?? 'O servidor não aceitou esta alteração.'); rejected++; }
        }
      }
      let more = true;
      while (more) {
        const result = await this.api.get<{ changes: Array<{ entity: Parameters<LocalStore['putRemote']>[0]; operation: 'upsert' | 'delete'; data: LocalRecord }>; nextCursor: number; hasMore: boolean }>(`/sync/pull?cursor=${await this.store.cursor()}&limit=200`);
        for (const change of result.changes) await this.store.putRemote(change.entity, change.data, change.operation);
        await this.store.setCursor(result.nextCursor); more = result.hasMore;
      }
      return { synced, rejected, offline: false };
    } catch (error) { if (error instanceof OfflineError) return { synced: 0, rejected: 0, offline: true }; throw error; }
  }
  private deviceId(): string {
    const key = 'frequencia-itb-device-id'; const existing = localStorage.getItem(key);
    if (existing) return existing; const value = `web-${crypto.randomUUID()}`; localStorage.setItem(key, value); return value;
  }
}
