import { gcm } from '@noble/ciphers/aes.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface CipherText {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export type StoredKey =
  | CryptoKey
  | {
      type: 'secret';
      extractable: false;
      algorithm: { name: 'AES-GCM'; length: 256 };
      raw: Uint8Array;
    };

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

/** A browser-profile-bound key is generated only after an authenticated login.
 * CryptoKey is non-extractable and persisted by IndexedDB, allowing the saved
 * session to unlock this user's cache without storing a plaintext secret. */
export async function createAccountKey(): Promise<StoredKey> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle?.generateKey) {
    try {
      return await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    } catch {
      // Fallback below
    }
  }
  return {
    type: 'secret',
    extractable: false,
    algorithm: { name: 'AES-GCM', length: 256 },
    raw: getRandomBytes(32),
  };
}

export async function encrypt(key: StoredKey, value: unknown): Promise<CipherText> {
  const iv = getRandomBytes(12);
  const payload = encoder.encode(JSON.stringify(value));

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle?.encrypt && !('raw' in key)) {
    try {
      const data = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key as CryptoKey,
        payload,
      );
      return { iv, data };
    } catch {
      // Fallback
    }
  }

  const rawKey = 'raw' in key ? key.raw : new Uint8Array(32);
  const cipher = gcm(rawKey, iv);
  const encrypted = cipher.encrypt(payload);
  return { iv, data: encrypted.buffer };
}

export async function decrypt<T>(key: StoredKey, cipher: CipherText): Promise<T> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle?.decrypt && !('raw' in key)) {
    try {
      const data = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: cipher.iv as unknown as BufferSource },
        key as CryptoKey,
        cipher.data,
      );
      return JSON.parse(decoder.decode(data)) as T;
    } catch (error) {
      if (!('raw' in key)) throw error;
    }
  }

  const rawKey = 'raw' in key ? key.raw : new Uint8Array(32);
  const decipher = gcm(rawKey, cipher.iv);
  const decrypted = decipher.decrypt(new Uint8Array(cipher.data));
  return JSON.parse(decoder.decode(decrypted)) as T;
}
