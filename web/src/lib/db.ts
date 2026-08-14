import Dexie, { type EntityTable } from 'dexie';
import { createAccountKey, decrypt, encrypt, type CipherText } from './crypto';
import type { Action, Entity, LocalRecord, SyncOperation, UserSession } from '../types';

interface KeyRow { accountId: string; key: CryptoKey }
interface CipherRow extends CipherText { id: string; accountId: string; entity: string; entityId: string; updatedAt: string }
interface QueueRow extends CipherText { operationId: string; accountId: string; updatedAt: string }
interface MetaRow { id: string; accountId: string; cursor: number }

class FrequenciaDb extends Dexie {
  keys!: EntityTable<KeyRow, 'accountId'>;
  records!: EntityTable<CipherRow, 'id'>;
  sessions!: EntityTable<CipherRow, 'id'>;
  queue!: EntityTable<QueueRow, 'operationId'>;
  meta!: EntityTable<MetaRow, 'id'>;
  constructor() {
    super('frequencia-itb-pwa');
    this.version(1).stores({
      keys: 'accountId', records: 'id, [accountId+entity], [accountId+entityId]', sessions: 'id, accountId',
      queue: 'operationId, accountId', meta: 'id, accountId',
    });
  }
}

const database = new FrequenciaDb();
const sessionId = (accountId: string) => `session:${accountId}`;
const recordId = (accountId: string, entity: string, id: string) => `${accountId}:${entity}:${id}`;
const metaId = (accountId: string) => `meta:${accountId}`;

export class LocalStore {
  private key?: CryptoKey;
  constructor(readonly accountId: string) {}

  static async restore(): Promise<{ store: LocalStore; session: UserSession } | null> {
    const sessions = await database.sessions.toArray();
    for (const encrypted of sessions) {
      const key = (await database.keys.get(encrypted.accountId))?.key;
      if (!key) continue;
      try {
        const session = await decrypt<UserSession>(key, encrypted);
        const store = new LocalStore(encrypted.accountId); store.key = key;
        return { store, session };
      } catch { await database.sessions.delete(encrypted.id); }
    }
    return null;
  }

  static async open(session: UserSession): Promise<LocalStore> {
    const store = new LocalStore(session.id);
    store.key = (await database.keys.get(session.id))?.key ?? await createAccountKey();
    await database.keys.put({ accountId: session.id, key: store.key });
    await store.saveSession(session);
    return store;
  }

  private async cryptoKey(): Promise<CryptoKey> {
    if (!this.key) this.key = (await database.keys.get(this.accountId))?.key;
    if (!this.key) throw new Error('A chave local desta sessão não está disponível.');
    return this.key;
  }

  async saveSession(session: UserSession): Promise<void> {
    const cipher = await encrypt(await this.cryptoKey(), session);
    await database.sessions.put({ ...cipher, id: sessionId(this.accountId), accountId: this.accountId, entity: 'session', entityId: this.accountId, updatedAt: new Date().toISOString() });
  }

  async clear(): Promise<void> {
    await database.transaction('rw', database.keys, database.records, database.sessions, database.queue, database.meta, async () => {
      await database.records.where('accountId').equals(this.accountId).delete();
      await database.queue.where('accountId').equals(this.accountId).delete();
      await database.sessions.delete(sessionId(this.accountId));
      await database.meta.delete(metaId(this.accountId));
      await database.keys.delete(this.accountId);
    });
  }

  async list(entity: Entity, includeDeleted = false): Promise<LocalRecord[]> {
    const key = await this.cryptoKey();
    const rows = await database.records.where('[accountId+entity]').equals([this.accountId, entity]).toArray();
    const values = await Promise.all(rows.map((row) => decrypt<LocalRecord>(key, row)));
    return values.filter((row) => includeDeleted || !row.deleted_at);
  }

  async get(entity: Entity, id: string): Promise<LocalRecord | undefined> {
    const row = await database.records.get(recordId(this.accountId, entity, id));
    return row ? decrypt<LocalRecord>(await this.cryptoKey(), row) : undefined;
  }

  async putRemote(entity: Entity, record: LocalRecord, action: Action = 'upsert'): Promise<void> {
    // A remote pull must never overwrite an unsent local mutation. The server
    // will decide it through the normal baseVersion conflict protocol first.
    if (await this.hasPending(entity, record.id)) return;
    if (action === 'delete') { await database.records.delete(recordId(this.accountId, entity, record.id)); return; }
    await this.writeRecord(entity, { ...record, sync_status: 'SYNCED' });
  }

  private async hasPending(entity: Entity, entityId: string): Promise<boolean> {
    const key = await this.cryptoKey();
    const rows = await database.queue.where('accountId').equals(this.accountId).toArray();
    for (const row of rows) {
      const operation = await decrypt<SyncOperation>(key, row);
      if (operation.entity === entity && operation.id === entityId) return true;
    }
    return false;
  }

  async mutate(entity: Entity, data: LocalRecord, action: Action = 'upsert'): Promise<void> {
    const previous = await this.get(entity, data.id);
    const now = new Date().toISOString();
    const record: LocalRecord = action === 'delete'
      ? { ...previous, ...data, id: data.id, deleted_at: now, updated_at: now, sync_status: 'PENDING' }
      : { ...previous, ...data, id: data.id, updated_at: now, created_at: previous?.created_at ?? now, sync_status: 'PENDING' };
    await this.writeRecord(entity, record);
    const operation: SyncOperation = { operationId: crypto.randomUUID(), entity, action, id: record.id, baseVersion: Number(previous?.sync_version ?? 0), updatedAt: now, data: record };
    const cipher = await encrypt(await this.cryptoKey(), operation);
    await database.transaction('rw', database.queue, async () => {
      const existing = await database.queue.where('accountId').equals(this.accountId).toArray();
      for (const row of existing) {
        const queued = await decrypt<SyncOperation>(await this.cryptoKey(), row);
        if (queued.entity === entity && queued.id === record.id) await database.queue.delete(row.operationId);
      }
      await database.queue.put({ ...cipher, operationId: operation.operationId, accountId: this.accountId, updatedAt: now });
    });
  }

  private async writeRecord(entity: Entity, record: LocalRecord): Promise<void> {
    const cipher = await encrypt(await this.cryptoKey(), record);
    await database.records.put({ ...cipher, id: recordId(this.accountId, entity, record.id), accountId: this.accountId, entity, entityId: record.id, updatedAt: record.updated_at ?? new Date().toISOString() });
  }

  async pending(): Promise<SyncOperation[]> {
    const key = await this.cryptoKey();
    return Promise.all((await database.queue.where('accountId').equals(this.accountId).toArray()).map((row) => decrypt<SyncOperation>(key, row)));
  }
  async complete(operationId: string, version: number): Promise<void> {
    const row = await database.queue.get(operationId); if (!row) return;
    const operation = await decrypt<SyncOperation>(await this.cryptoKey(), row);
    const record = await this.get(operation.entity, operation.id);
    if (record) await this.writeRecord(operation.entity, { ...record, sync_version: version, sync_status: 'SYNCED' });
    await database.queue.delete(operationId);
  }
  async conflict(operationId: string): Promise<void> {
    const row = await database.queue.get(operationId); if (!row) return;
    const operation = await decrypt<SyncOperation>(await this.cryptoKey(), row);
    const record = await this.get(operation.entity, operation.id);
    if (record) await this.writeRecord(operation.entity, { ...record, sync_status: 'CONFLICT' });
    await database.queue.delete(operationId);
  }
  async cursor(): Promise<number> { return (await database.meta.get(metaId(this.accountId)))?.cursor ?? 0; }
  async setCursor(cursor: number): Promise<void> { await database.meta.put({ id: metaId(this.accountId), accountId: this.accountId, cursor }); }
}
