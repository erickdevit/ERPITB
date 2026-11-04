import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const encoder = new TextEncoder();
const ITERATIONS = 310_000;

export async function emailLookupHash(email: string): Promise<string> {
  const normalized = email.trim().toLocaleLowerCase('pt-BR');
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle?.digest) {
    try {
      const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(normalized)));
      return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback
    }
  }
  const digest = sha256(encoder.encode(normalized));
  return bytesToHex(digest);
}

export async function passwordVerifier(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle?.importKey && globalThis.crypto.subtle?.deriveBits) {
    try {
      const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      return await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: salt as BufferSource },
        key,
        256,
      );
    } catch {
      // Fallback
    }
  }
  const derived = pbkdf2(sha256, password, salt, { c: ITERATIONS, dkLen: 32 });
  return derived.buffer as ArrayBuffer;
}

export function verifierMatches(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const first = new Uint8Array(left);
  const second = new Uint8Array(right);
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index]! ^ second[index]!;
  return difference === 0;
}
