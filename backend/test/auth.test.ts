import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth';

describe('Argon2id password verifier', () => {
  it('accepts only the original password', () => {
    const encoded = hashPassword('Senha Forte 123!');
    expect(encoded).toContain('$argon2id$v=19$');
    expect(verifyPassword(encoded, 'Senha Forte 123!')).toBe(true);
    expect(verifyPassword(encoded, 'Senha errada')).toBe(false);
  });
});

