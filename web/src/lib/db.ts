import Dexie, { type EntityTable } from 'dexie';
import { createAccountKey, decrypt, encrypt, type CipherText, type StoredKey } from './crypto';
import { planEnrollmentMove } from './enrollment';
import { classRevocationTargets, type EntitySnapshot } from './revocation';
import { emailLookupHash, passwordVerifier, verifierMatches } from './offline-auth';
import type { Action, Entity, LocalRecord, SyncOperation, UserSession } from '../types';

interface KeyRow { accountId: string; key: StoredKey }
interface CipherRow extends CipherText { id: string; accountId: string; entity: string; entityId: string; updatedAt: string }
interface QueueRow extends CipherText { operationId: string; accountId: string; updatedAt: string }
interface MetaRow { id: string; accountId: string; cursor: number }
interface VerifierRow extends CipherText { emailHash: string; accountId: string; salt: Uint8Array; verifier: ArrayBuffer; updatedAt: string }
export interface LocalMutation { entity: Entity; data: LocalRecord; action?: Action }

class FrequenciaDb extends Dexie {
  keys!: EntityTable<KeyRow, 'accountId'>;
  records!: EntityTable<CipherRow, 'id'>;
  sessions!: EntityTable<CipherRow, 'id'>;
  queue!: EntityTable<QueueRow, 'operationId'>;
  meta!: EntityTable<MetaRow, 'id'>;
  verifiers!: EntityTable<VerifierRow, 'emailHash'>;
  constructor() {
    super('frequencia-itb-pwa');
    this.version(1).stores({
      keys: 'accountId', records: 'id, [accountId+entity], [accountId+entityId]', sessions: 'id, accountId',
      queue: 'operationId, accountId', meta: 'id, accountId',
    });
    this.version(2).stores({
      keys: 'accountId', records: 'id, [accountId+entity], [accountId+entityId]', sessions: 'id, accountId',
      queue: 'operationId, accountId', meta: 'id, accountId', verifiers: 'emailHash, accountId',
    });
  }
}

const database = new FrequenciaDb();
const sessionId = (accountId: string) => `session:${accountId}`;
const recordId = (accountId: string, entity: string, id: string) => `${accountId}:${entity}:${id}`;
const metaId = (accountId: string) => `meta:${accountId}`;

export class LocalStore {
  private key?: StoredKey;
  private readonly locks = new Map<string, Promise<unknown>>();
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

  static async openOffline(email: string, password: string): Promise<{ store: LocalStore; session: UserSession } | null> {
    const row = await database.verifiers.get(await emailLookupHash(email));
    if (!row || !verifierMatches(row.verifier, await passwordVerifier(password, row.salt))) return null;
    const key = (await database.keys.get(row.accountId))?.key;
    if (!key) return null;
    const profile = await decrypt<Omit<UserSession, 'accessToken' | 'refreshToken' | 'offline'>>(key, row);
    const session: UserSession = { ...profile, accessToken: '', refreshToken: '', offline: true };
    const store = new LocalStore(row.accountId); store.key = key; await store.saveSession(session);
    return { store, session };
  }

  async saveOfflineVerifier(email: string, password: string, session: UserSession): Promise<void> {
    const emailHash = await emailLookupHash(email);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const profile = { id: session.id, name: session.name, email: session.email, role: session.role };
    const cipher = await encrypt(await this.cryptoKey(), profile);
    await database.verifiers.where('accountId').equals(this.accountId).delete();
    await database.verifiers.put({ ...cipher, emailHash, accountId: this.accountId, salt, verifier: await passwordVerifier(password, salt), updatedAt: new Date().toISOString() });
  }

  private async cryptoKey(): Promise<StoredKey> {
    if (!this.key) this.key = (await database.keys.get(this.accountId))?.key;
    if (!this.key) throw new Error('A chave local desta sessão não está disponível.');
    return this.key;
  }

  async saveSession(session: UserSession): Promise<void> {
    const cipher = await encrypt(await this.cryptoKey(), session);
    await database.sessions.put({ ...cipher, id: sessionId(this.accountId), accountId: this.accountId, entity: 'session', entityId: this.accountId, updatedAt: new Date().toISOString() });
  }

  async clear(): Promise<void> {
    await database.transaction('rw', [database.keys, database.records, database.sessions, database.queue, database.meta, database.verifiers], async () => {
      await database.records.where('accountId').equals(this.accountId).delete();
      await database.queue.where('accountId').equals(this.accountId).delete();
      await database.sessions.delete(sessionId(this.accountId));
      await database.meta.delete(metaId(this.accountId));
      await database.keys.delete(this.accountId);
      await database.verifiers.where('accountId').equals(this.accountId).delete();
    });
  }

  async clearSession(): Promise<void> {
    await database.sessions.delete(sessionId(this.accountId));
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
    if (entity === 'class_teachers' && action === 'delete' && record.user_id === this.accountId && typeof record.class_id === 'string') {
      await this.purgeClassScope(record.class_id);
      return;
    }
    // A remote pull must never overwrite an unsent local mutation. The server
    // will decide it through the normal baseVersion conflict protocol first.
    if (await this.hasPending(entity, record.id)) return;
    if (action === 'delete') { await database.records.delete(recordId(this.accountId, entity, record.id)); return; }
    await this.writeRecord(entity, { ...record, sync_status: 'SYNCED' });
  }

  private async purgeClassScope(classId: string): Promise<void> {
    const entities: Entity[] = ['classes', 'class_teachers', 'students', 'enrollments', 'attendance_records', 'class_notes', 'replacements'];
    const snapshot: EntitySnapshot = {};
    for (const entity of entities) snapshot[entity] = await this.list(entity, true);
    const targets = classRevocationTargets(snapshot, this.accountId, classId);
    const targetKeys = new Set(targets.map((target) => `${target.entity}:${target.id}`));
    const key = await this.cryptoKey();
    const queued = await database.queue.where('accountId').equals(this.accountId).toArray();
    const queueIds: string[] = [];
    for (const row of queued) {
      const operation = await decrypt<SyncOperation>(key, row);
      if (targetKeys.has(`${operation.entity}:${operation.id}`)) queueIds.push(row.operationId);
    }
    await database.transaction('rw', database.records, database.queue, async () => {
      await database.records.bulkDelete(targets.map((target) => recordId(this.accountId, target.entity, target.id)));
      await database.queue.bulkDelete(queueIds);
    });
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
    await this.mutateBatch([{ entity, data, action }]);
  }

  /** Commits local records and their compacted sync operations atomically. */
  async mutateBatch(mutations: LocalMutation[]): Promise<void> {
    if (!mutations.length) return;
    const targets = new Set<string>();
    for (const mutation of mutations) {
      const target = `${mutation.entity}:${mutation.data.id}`;
      if (targets.has(target)) throw new Error(`O lote local contém mais de uma alteração para ${target}.`);
      targets.add(target);
    }
    await this.serial('queue', async () => {
      const key = await this.cryptoKey();
      const now = new Date().toISOString();
      const prepared = await Promise.all(mutations.map(async (mutation) => {
        const action = mutation.action ?? 'upsert';
        const previous = await this.get(mutation.entity, mutation.data.id);
        const record: LocalRecord = action === 'delete'
          ? { ...previous, ...mutation.data, id: mutation.data.id, deleted_at: now, updated_at: now, sync_status: 'PENDING' }
          : { ...previous, ...mutation.data, id: mutation.data.id, deleted_at: null, updated_at: now, created_at: previous?.created_at ?? now, sync_status: 'PENDING' };
        const operation: SyncOperation = {
          operationId: crypto.randomUUID(), entity: mutation.entity, action, id: record.id,
          baseVersion: Number(previous?.sync_version ?? 0), updatedAt: now, data: record,
        };
        const [recordCipher, operationCipher] = await Promise.all([encrypt(key, record), encrypt(key, operation)]);
        return {
          record: { ...recordCipher, id: recordId(this.accountId, mutation.entity, record.id), accountId: this.accountId, entity: mutation.entity, entityId: record.id, updatedAt: now } as CipherRow,
          queue: { ...operationCipher, operationId: operation.operationId, accountId: this.accountId, updatedAt: now } as QueueRow,
        };
      }));
      const existing = await database.queue.where('accountId').equals(this.accountId).toArray();
      const duplicates: string[] = [];
      for (const row of existing) {
        const queued = await decrypt<SyncOperation>(key, row);
        if (targets.has(`${queued.entity}:${queued.id}`)) duplicates.push(row.operationId);
      }
      await database.transaction('rw', database.records, database.queue, async () => {
        await database.records.bulkPut(prepared.map((item) => item.record));
        await database.queue.bulkDelete(duplicates);
        await database.queue.bulkPut(prepared.map((item) => item.queue));
      });
    });
  }

  private async writeRecord(entity: Entity, record: LocalRecord): Promise<void> {
    const cipher = await encrypt(await this.cryptoKey(), record);
    await database.records.put({ ...cipher, id: recordId(this.accountId, entity, record.id), accountId: this.accountId, entity, entityId: record.id, updatedAt: record.updated_at ?? new Date().toISOString() });
  }

  async pending(): Promise<SyncOperation[]> {
    const key = await this.cryptoKey();
    const operations = await Promise.all((await database.queue.where('accountId').equals(this.accountId).toArray()).map((row) => decrypt<SyncOperation>(key, row)));
    return operations.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  private async serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    this.locks.set(key, current);
    try { return await current; } finally { if (this.locks.get(key) === current) this.locks.delete(key); }
  }

  async findAttendance(classId: string, studentId: string, date: string, includeDeleted = false): Promise<LocalRecord | undefined> {
    const matches = (await this.list('attendance_records', true)).filter((record) => record.class_id === classId && record.student_id === studentId && record.date === date && (includeDeleted || !record.deleted_at));
    return matches.sort((left, right) => asTimestamp(right) - asTimestamp(left))[0];
  }

  async setAttendance(data: Omit<LocalRecord, 'id'> & { class_id: string; student_id: string; date: string }): Promise<LocalRecord> {
    const key = `attendance:${data.class_id}:${data.student_id}:${data.date}`;
    return this.serial(key, async () => {
      const previous = await this.findAttendance(data.class_id, data.student_id, data.date, true);
      const record: LocalRecord = { ...previous, ...data, id: previous?.id ?? crypto.randomUUID() };
      await this.mutate('attendance_records', record);
      return record;
    });
  }

  async clearAttendance(classId: string, studentId: string, date: string): Promise<void> {
    const key = `attendance:${classId}:${studentId}:${date}`;
    await this.serial(key, async () => {
      const previous = await this.findAttendance(classId, studentId, date, true);
      if (previous && !previous.deleted_at) await this.mutate('attendance_records', previous, 'delete');
    });
  }

  async deduplicateAttendance(): Promise<number> {
    const records = await this.list('attendance_records', true); const groups = new Map<string, LocalRecord[]>();
    for (const record of records) { const key = `${record.class_id}:${record.student_id}:${record.date}`; groups.set(key, [...(groups.get(key) ?? []), record]); }
    let removed = 0;
    for (const group of groups.values()) {
      const active = group.filter((record) => !record.deleted_at).sort((left, right) => asTimestamp(right) - asTimestamp(left));
      for (const duplicate of active.slice(1)) { await this.mutate('attendance_records', duplicate, 'delete'); removed += 1; }
    }
    return removed;
  }

  async moveStudent(studentId: string, classId: string): Promise<void> {
    await this.serial(`enrollment:${studentId}`, async () => {
      const plan = planEnrollmentMove(await this.list('enrollments', true), studentId, classId);
      if (plan.unchanged) return;
      for (const enrollment of plan.remove) await this.mutate('enrollments', enrollment, 'delete');
      await this.mutate('enrollments', {
        ...plan.target,
        id: plan.target?.id ?? crypto.randomUUID(),
        student_id: studentId,
        class_id: classId,
        status: 'ativa',
      });
    });
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
  async reject(operationId: string, code: string, message: string): Promise<void> {
    const row = await database.queue.get(operationId); if (!row) return;
    const operation = await decrypt<SyncOperation>(await this.cryptoKey(), row);
    const record = await this.get(operation.entity, operation.id);
    if (record) await this.writeRecord(operation.entity, { ...record, sync_status: 'REJECTED', sync_error_code: code, sync_error_message: message });
    await database.queue.delete(operationId);
  }
  async cursor(): Promise<number> { return (await database.meta.get(metaId(this.accountId)))?.cursor ?? 0; }
  async setCursor(cursor: number): Promise<void> { await database.meta.put({ id: metaId(this.accountId), accountId: this.accountId, cursor }); }
}

const asTimestamp = (record: LocalRecord) => Date.parse(String(record.updated_at ?? record.created_at ?? '')) || 0;
