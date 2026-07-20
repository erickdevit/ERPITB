import type { Env } from './types';
import { AppError } from './http';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new AppError(500, 'Chave de criptografia inválida.', 'INVALID_ENCRYPTION_KEY');
  }
}

async function importAesKey(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>): Promise<CryptoKey> {
  const raw = base64ToBytes(env.DATA_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) {
    throw new AppError(500, 'DATA_ENCRYPTION_KEY deve conter exatamente 32 bytes em Base64.', 'INVALID_ENCRYPTION_KEY');
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(env);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptText(env: Pick<Env, 'DATA_ENCRYPTION_KEY'>, payload: string): Promise<string> {
  const [version, ivPart, cipherPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !cipherPart) {
    throw new AppError(500, 'Payload criptografado inválido.', 'INVALID_CIPHERTEXT');
  }
  const key = await importAesKey(env);
  try {
    const clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(cipherPart),
    );
    return decoder.decode(clear);
  } catch {
    throw new AppError(500, 'Não foi possível descriptografar os dados.', 'DECRYPTION_FAILED');
  }
}

export async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function randomToken(byteLength = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(byteLength)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export const base64 = { encode: bytesToBase64, decode: base64ToBytes };
