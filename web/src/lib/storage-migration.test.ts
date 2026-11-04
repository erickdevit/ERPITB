import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDeviceId, getMigratedLocalStorageItem } from './storage';

const legacyDatabaseName = 'frequencia-itb-pwa';
const storageValues = new Map<string, string>();
const mockStorage: Storage = {
  get length() { return storageValues.size; },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => { storageValues.delete(key); },
  setItem: (key, value) => { storageValues.set(key, String(value)); },
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mockStorage });
  mockStorage.clear();
});

class LegacyDb extends Dexie {
  keys!: Dexie.Table<{ accountId: string; key: unknown }, string>;
  records!: Dexie.Table<{ id: string; accountId: string; entity: string; entityId: string; updatedAt: string }, string>;
  sessions!: Dexie.Table<{ id: string; accountId: string; entity: string; entityId: string; updatedAt: string }, string>;
  queue!: Dexie.Table<{ operationId: string; accountId: string; updatedAt: string }, string>;
  meta!: Dexie.Table<{ id: string; accountId: string; cursor: number }, string>;
  verifiers!: Dexie.Table<{ emailHash: string; accountId: string; salt: Uint8Array; verifier: ArrayBuffer; updatedAt: string }, string>;

  constructor() {
    super(legacyDatabaseName);
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

describe('opschool local storage migration', () => {
  it('moves the existing device ID to the opschool key', () => {
    localStorage.setItem('erpitb-device-id', 'web-existing-device');

    expect(getDeviceId()).toBe('web-existing-device');
    expect(localStorage.getItem('opschool-device-id')).toBe('web-existing-device');
    expect(localStorage.getItem('erpitb-device-id')).toBeNull();
  });

  it('moves a legacy preference once and removes its old key', () => {
    localStorage.setItem('erpitb-menu-collapsed', 'true');

    expect(getMigratedLocalStorageItem('opschool-menu-collapsed', 'erpitb-menu-collapsed')).toBe('true');
    expect(localStorage.getItem('opschool-menu-collapsed')).toBe('true');
    expect(localStorage.getItem('erpitb-menu-collapsed')).toBeNull();
  });

  it('copies existing Dexie rows before removing the legacy database', async () => {
    const legacy = new LegacyDb();
    await legacy.open();
    await legacy.keys.put({ accountId: 'account-migration', key: 'kept-key' });
    await legacy.records.put({
      id: 'account-migration:students:student-1', accountId: 'account-migration',
      entity: 'students', entityId: 'student-1', updatedAt: '2026-10-24T00:00:00.000Z',
    });
    legacy.close();

    await import('./db');

    expect(await Dexie.exists(legacyDatabaseName)).toBe(false);
    const migrated = new Dexie('opschool-pwa');
    migrated.version(2).stores({
      keys: 'accountId', records: 'id, [accountId+entity], [accountId+entityId]', sessions: 'id, accountId',
      queue: 'operationId, accountId', meta: 'id, accountId', verifiers: 'emailHash, accountId',
    });
    await migrated.open();
    await expect(migrated.table('keys').get('account-migration')).resolves.toEqual({ accountId: 'account-migration', key: 'kept-key' });
    await expect(migrated.table('records').get('account-migration:students:student-1')).resolves.toMatchObject({ entityId: 'student-1' });
    migrated.close();
  });
});
