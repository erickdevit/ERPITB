const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface CipherText { iv: Uint8Array; data: ArrayBuffer }

/** A browser-profile-bound key is generated only after an authenticated login.
 * CryptoKey is non-extractable and persisted by IndexedDB, allowing the saved
 * session to unlock this user's cache without storing a plaintext secret. */
export async function createAccountKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, value: unknown): Promise<CipherText> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, encoder.encode(JSON.stringify(value)));
  return { iv, data };
}

export async function decrypt<T>(key: CryptoKey, cipher: CipherText): Promise<T> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cipher.iv as unknown as BufferSource }, key, cipher.data);
  return JSON.parse(decoder.decode(data)) as T;
}
