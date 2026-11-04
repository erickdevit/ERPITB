import { describe, expect, it } from 'vitest';
import { createAccountKey, decrypt, encrypt } from './crypto';

describe('local encryption', () => {
  it('encrypts data with a non-extractable AES-GCM key and restores it', async () => {
    const key = await createAccountKey();
    expect(key.extractable).toBe(false);
    const cipher = await encrypt(key, { student: 'Ana', birthDate: '2008-05-14' });
    expect(cipher.data.byteLength).toBeGreaterThan(10);
    await expect(decrypt(key, cipher)).resolves.toEqual({ student: 'Ana', birthDate: '2008-05-14' });
  });

  it('rejects a cipher when an unrelated account key is used', async () => {
    const cipher = await encrypt(await createAccountKey(), { protected: true });
    await expect(decrypt(await createAccountKey(), cipher)).rejects.toBeDefined();
  });
});
