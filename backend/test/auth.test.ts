import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth';

describe('PBKDF2 password verifier with Argon2id fallback', () => {
  it('accepts only the original password with PBKDF2', async () => {
    const encoded = await hashPassword('Senha Forte 123!');
    expect(encoded).toContain('$pbkdf2-sha256$');
    expect(await verifyPassword(encoded, 'Senha Forte 123!')).toBe(true);
    expect(await verifyPassword(encoded, 'Senha errada')).toBe(false);
  });
});

