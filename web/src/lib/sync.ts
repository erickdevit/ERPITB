import { ApiClient, OfflineError } from './api';
import { LocalStore } from './db';
import type { LocalRecord } from '../types';

export class Synchronizer {
  constructor(private store: LocalStore, private api: ApiClient) {}
  async run(): Promise<{ synced: number; offline: boolean }> {
    try {
      const operations = await this.store.pending(); let synced = 0;
      if (operations.length) {
        const result = await this.api.post<{ results: Array<{ operationId: string; status: string; version?: number }> }>('/sync/push', { deviceId: this.deviceId(), operations });
        for (const item of result.results) {
          if (item.status === 'applied') { await this.store.complete(item.operationId, item.version ?? 1); synced++; }
          else await this.store.conflict(item.operationId);
        }
      }
      let more = true;
      while (more) {
        const result = await this.api.get<{ changes: Array<{ entity: Parameters<LocalStore['putRemote']>[0]; operation: 'upsert' | 'delete'; data: LocalRecord }>; nextCursor: number; hasMore: boolean }>(`/sync/pull?cursor=${await this.store.cursor()}&limit=200`);
        for (const change of result.changes) await this.store.putRemote(change.entity, change.data, change.operation);
        await this.store.setCursor(result.nextCursor); more = result.hasMore;
      }
      return { synced, offline: false };
    } catch (error) { if (error instanceof OfflineError) return { synced: 0, offline: true }; throw error; }
  }
  private deviceId(): string {
    const key = 'frequencia-itb-device-id'; const existing = localStorage.getItem(key);
    if (existing) return existing; const value = `web-${crypto.randomUUID()}`; localStorage.setItem(key, value); return value;
  }
}
