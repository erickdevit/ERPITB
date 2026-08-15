import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { authenticate, hashPassword, verifyPassword } from '../src/auth';
import type { Env } from '../src/types';

describe('PBKDF2 password verifier with Argon2id fallback', () => {
  it('accepts only the original password with PBKDF2', async () => {
    const encoded = await hashPassword('Senha Forte 123!');
    expect(encoded).toContain('$pbkdf2-sha256$');
    expect(await verifyPassword(encoded, 'Senha Forte 123!')).toBe(true);
    expect(await verifyPassword(encoded, 'Senha errada')).toBe(false);
  });
});

describe('request authentication', () => {
  it('uses the current database role instead of a stale role in the token', async () => {
    const secret = 'a-secret-with-at-least-thirty-two-characters';
    const token = await new SignJWT({ name: 'Marcos', email: 'marcos@example.invalid', role: 'admin', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    const statement = {
      bind: () => statement,
      first: async () => ({ id: 'user-1', name: 'Marcos', email: 'marcos@example.invalid', role: 'professor', active: 1 }),
    };
    const env = { JWT_SECRET: secret, DB: { prepare: () => statement } } as unknown as Env;

    await expect(authenticate(new Request('https://example.invalid/api', {
      headers: { authorization: `Bearer ${token}` },
    }), env)).resolves.toMatchObject({ id: 'user-1', role: 'professor' });
  });

  it('does not disguise a database failure as an invalid token', async () => {
    const secret = 'a-secret-with-at-least-thirty-two-characters';
    const token = await new SignJWT({ name: 'Marcos', email: 'marcos@example.invalid', role: 'admin', type: 'access' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setExpirationTime('5m')
      .sign(new TextEncoder().encode(secret));
    const statement = { bind: () => statement, first: async () => { throw new Error('D1 unavailable'); } };
    const env = { JWT_SECRET: secret, DB: { prepare: () => statement } } as unknown as Env;

    await expect(authenticate(new Request('https://example.invalid/api', {
      headers: { authorization: `Bearer ${token}` },
    }), env)).rejects.toThrow('D1 unavailable');
  });
});
