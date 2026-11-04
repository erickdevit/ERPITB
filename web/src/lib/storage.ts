const DEVICE_ID_KEY = 'opschool-device-id';

function migrateKey(key: string, ...legacyKeys: string[]): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;

  for (const legacyKey of legacyKeys) {
    if (!legacyKey) continue;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(legacyKey);
      return legacy;
    }
  }
  return null;
}

export function getMigratedLocalStorageItem(key: string, ...legacyKeys: string[]): string | null {
  if (typeof localStorage === 'undefined') return null;
  return migrateKey(key, ...legacyKeys);
}

export function getDeviceId(): string {
  const existing = getMigratedLocalStorageItem(DEVICE_ID_KEY, 'erpitb-device-id', 'frequencia-itb-device-id');
  if (existing) return existing;

  const deviceId = `web-${crypto.randomUUID()}`;
  if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
