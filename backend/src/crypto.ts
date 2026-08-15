import type { Env } from './types';
import { AppError } from './http';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const base64 = {
  encode(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  },
  decode(value: string): Uint8Array<ArrayBuffer> {
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      throw new AppError(500, 'Chave de criptografia inválida.', 'INVALID_ENCRYPTION_KEY');
    }
  },
};

function parseEncryptionKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const bytes = base64.decode(value);
    if (bytes.byteLength === 32) return bytes;
  } catch {
    // not valid base64
  }
  const utf8 = encoder.encode(value);
  if (utf8.byteLength === 32) {
    const bytes = new Uint8Array(32);
    bytes.set(utf8);
    return bytes;
  }
  throw new AppError(500, 'DATA_ENCRYPTION_KEY deve conter exatamente 32 bytes em Base64.', 'INVALID_ENCRYPTION_KEY');
}

async function importAesKey(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>): Promise<CryptoKey> {
  const raw = parseEncryptionKeyBytes(env.DATA_ENCRYPTION_KEY);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(env);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return `v1.${base64.encode(iv)}.${base64.encode(new Uint8Array(encrypted))}`;
}

export async function decryptText(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>, payload: string): Promise<string> {
  const [version, ivPart, cipherPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !cipherPart) {
    throw new AppError(500, 'Payload criptografado inválido.', 'INVALID_CIPHERTEXT');
  }
  const key = await importAesKey(env);
  try {
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64.decode(ivPart) },
      key,
      base64.decode(cipherPart),
    );
    return decoder.decode(clear);
  } catch {
    throw new AppError(500, 'Não foi possível descriptografar os dados.', 'DECRYPTION_FAILED');
  }
}

export async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64.encode(new Uint8Array(digest));
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64.encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
