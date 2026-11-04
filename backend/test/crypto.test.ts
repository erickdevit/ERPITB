import { describe, expect, it } from 'vitest';
import { decryptText, encryptText } from '../src/crypto';

const env = { DATA_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) };

describe('AES-256-GCM', () => {
  it('round-trips UTF-8 and uses a fresh IV', async () => {
    const first = await encryptText(env, 'João da Silva');
    const second = await encryptText(env, 'João da Silva');
    expect(first).not.toBe(second);
    await expect(decryptText(env, first)).resolves.toBe('João da Silva');
  });

  it('rejects tampering', async () => {
    const encrypted = await encryptText(env, 'segredo');
    await expect(decryptText(env, `${encrypted}x`)).rejects.toMatchObject({ code: 'DECRYPTION_FAILED' });
  });
});
