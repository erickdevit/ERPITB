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

  it('verifies legacy Argon2id fallback hash correctly', async () => {
    const { argon2id } = await import('@noble/hashes/argon2');
    const { base64 } = await import('../src/crypto');
    const salt = new Uint8Array(16).fill(3);
    const hash = argon2id(new TextEncoder().encode('Senha Legada 123!'), salt, {
      m: 19 * 1024,
      t: 2,
      p: 1,
      dkLen: 32,
    });
    const argonHash = `$argon2id$v=19$m=19456,t=2,p=1$${base64.encode(salt)}$${base64.encode(hash)}`;
    expect(await verifyPassword(argonHash, 'Senha Legada 123!')).toBe(true);
    expect(await verifyPassword(argonHash, 'Senha Incorreta')).toBe(false);
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

describe('login authentication error resilience', () => {
  it('returns 401 with consistent message for invalid email or password variations', async () => {
    const { login } = await import('../src/auth');
    const statement = {
      bind: () => statement,
      first: async () => null,
    };
    const env = { DB: { prepare: () => statement } } as unknown as Env;

    // Short password should not throw 400 validation error
    const reqShortPwd = new Request('https://example.invalid/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@itb.org.br', password: '123' }),
    });
    await expect(login(reqShortPwd, env)).rejects.toMatchObject({
      status: 401,
      message: 'E-mail ou senha inválidos.',
      code: 'INVALID_CREDENTIALS',
    });

    // Malformed email should return 401
    const reqBadEmail = new Request('https://example.invalid/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'Senha Forte 123!' }),
    });
    await expect(login(reqBadEmail, env)).rejects.toMatchObject({
      status: 401,
      message: 'E-mail ou senha inválidos.',
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('automatically upgrades legacy Argon2id password hash to PBKDF2 on successful login', async () => {
    const { login } = await import('../src/auth');
    const { argon2id } = await import('@noble/hashes/argon2');
    const { base64 } = await import('../src/crypto');
    const salt = new Uint8Array(16).fill(9);
    const hash = argon2id(new TextEncoder().encode('Senha Legada 123!'), salt, {
      m: 19 * 1024,
      t: 2,
      p: 1,
      dkLen: 32,
    });
    const legacyHash = `$argon2id$v=19$m=19456,t=2,p=1$${base64.encode(salt)}$${base64.encode(hash)}`;

    const executedSqls: { sql: string; binds: unknown[] }[] = [];
    const statement = (sql: string) => {
      let currentBinds: unknown[] = [];
      return {
        bind: (...binds: unknown[]) => {
          currentBinds = binds;
          executedSqls.push({ sql, binds });
          return statement(sql);
        },
        first: async () => {
          if (sql.includes('SELECT id, name, email')) {
            return {
              id: 'user-legacy-1',
              name: 'Marcos',
              email: 'marcos@itbcursos.com',
              password_hash: legacyHash,
              role: 'admin',
              active: 1,
            };
          }
          return null;
        },
        run: async () => ({ meta: { changes: 1 } }),
      };
    };

    const env = {
      JWT_SECRET: 'a-secret-with-at-least-thirty-two-characters',
      ACCESS_TOKEN_TTL_MINUTES: '15',
      REFRESH_TOKEN_TTL_DAYS: '30',
      DB: { prepare: (sql: string) => statement(sql) },
    } as unknown as Env;

    const req = new Request('https://example.invalid/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'marcos@itbcursos.com', password: 'Senha Legada 123!' }),
    });

    const result = (await login(req, env)) as { user: { email: string }; accessToken: string };
    expect(result.user.email).toBe('marcos@itbcursos.com');
    expect(result.accessToken).toBeDefined();

    // Verify that an UPDATE users SET password_hash = ? was executed with a new PBKDF2 hash
    const updateStmt = executedSqls.find((e) => e.sql.includes('UPDATE users SET password_hash = ?'));
    expect(updateStmt).toBeDefined();
    expect(String(updateStmt?.binds[0])).toContain('$pbkdf2-sha256$i=100000$');
    expect(updateStmt?.binds[2]).toBe('user-legacy-1');
  });

  it('rejects inactive user with 401 even if password is correct', async () => {
    const { login, hashPassword } = await import('../src/auth');
    const pwdHash = await hashPassword('Senha Forte 123!');
    const statement = {
      bind: () => statement,
      first: async () => ({
        id: 'user-inactive-1',
        name: 'Inativo',
        email: 'inativo@itbcursos.com',
        password_hash: pwdHash,
        role: 'professor',
        active: 0,
      }),
      run: async () => ({ meta: { changes: 0 } }),
    };
    const env = { DB: { prepare: () => statement } } as unknown as Env;

    const req = new Request('https://example.invalid/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'inativo@itbcursos.com', password: 'Senha Forte 123!' }),
    });

    await expect(login(req, env)).rejects.toMatchObject({
      status: 401,
      message: 'E-mail ou senha inválidos.',
      code: 'INVALID_CREDENTIALS',
    });
  });
});
