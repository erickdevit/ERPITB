const DEVICE_ID_KEY = 'erpitb-device-id';

function migrateKey(key: string, legacyKey?: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null || !legacyKey) return current;

  const legacy = localStorage.getItem(legacyKey);
  if (legacy === null) return null;

  localStorage.setItem(key, legacy);
  localStorage.removeItem(legacyKey);
  return legacy;
}

export function getMigratedLocalStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return migrateKey(key, legacyKey);
}

export function getDeviceId(): string {
  const existing = getMigratedLocalStorageItem(DEVICE_ID_KEY, 'frequencia-itb-device-id');
  if (existing) return existing;

  const deviceId = `web-${crypto.randomUUID()}`;
  if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
