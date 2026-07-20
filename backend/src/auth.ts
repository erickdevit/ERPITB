import { argon2id } from '@noble/hashes/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { base64, randomToken, sha256Base64 } from './crypto';
import { AppError, normalizeEmail, nowIso, readJson, requireString, uuid } from './http';
import type { AuthUser, Env, Role, TokenClaims } from './types';

const encoder = new TextEncoder();
const ARGON_MEMORY_KIB = 19 * 1024;
const ARGON_ITERATIONS = 2;
const ARGON_PARALLELISM = 1;

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left[i]! ^ right[i]!;
  return result === 0;
}

export function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): string {
  const hash = argon2id(encoder.encode(password), salt, {
    m: ARGON_MEMORY_KIB,
    t: ARGON_ITERATIONS,
    p: ARGON_PARALLELISM,
    dkLen: 32,
  });
  return `$argon2id$v=19$m=${ARGON_MEMORY_KIB},t=${ARGON_ITERATIONS},p=${ARGON_PARALLELISM}$${base64.encode(salt)}$${base64.encode(hash)}`;
}

export function verifyPassword(encoded: string, password: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[1] !== 'argon2id' || parts[2] !== 'v=19') return false;
  const parameters = Object.fromEntries(parts[3]!.split(',').map((item) => item.split('=')));
  const memory = Number(parameters.m);
  const iterations = Number(parameters.t);
  const parallelism = Number(parameters.p);
  if (![memory, iterations, parallelism].every(Number.isSafeInteger)) return false;
  if (memory <= 0 || memory > 64 * 1024 || iterations <= 0 || iterations > 10 || parallelism <= 0 || parallelism > 8) return false;
  try {
    const salt = base64.decode(parts[4]!);
    const expected = base64.decode(parts[5]!);
    const actual = argon2id(encoder.encode(password), salt, {
      m: memory,
      t: iterations,
      p: parallelism,
      dkLen: expected.length,
    });
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

function jwtSecret(env: Pick<Env, 'JWT_SECRET'>): Uint8Array {
  if (env.JWT_SECRET.length < 32) throw new AppError(500, 'JWT_SECRET precisa ter ao menos 32 caracteres.', 'INVALID_JWT_SECRET');
  return encoder.encode(env.JWT_SECRET);
}

async function issueAccessToken(env: Env, user: AuthUser): Promise<string> {
  const minutes = Number(env.ACCESS_TOKEN_TTL_MINUTES ?? 15);
  return new SignJWT({ name: user.name, email: user.email, role: user.role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${Number.isFinite(minutes) ? minutes : 15}m`)
    .sign(jwtSecret(env));
}

async function issueSession(env: Env, user: AuthUser): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const refreshToken = randomToken(48);
  const days = Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  const safeDays = Number.isFinite(days) ? days : 30;
  const expiresAt = new Date(Date.now() + safeDays * 86_400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(uuid(), user.id, await sha256Base64(refreshToken), expiresAt, nowIso()).run();
  return { accessToken: await issueAccessToken(env, user), refreshToken, expiresIn: Number(env.ACCESS_TOKEN_TTL_MINUTES ?? 15) * 60 };
}

interface UserRow extends AuthUser { password_hash: string; active: number }

export async function login(request: Request, env: Env): Promise<unknown> {
  const body = await readJson<Record<string, unknown>>(request);
  const email = normalizeEmail(body.email);
  const password = requireString(body.password, 'senha', { min: 8, max: 200 });
  const row = await env.DB.prepare(
    `SELECT id, name, email, password_hash, role, active FROM users WHERE email = ? LIMIT 1`,
  ).bind(email).first<UserRow>();
  if (!row || row.active !== 1 || !verifyPassword(row.password_hash, password)) {
    throw new AppError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
  }
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
  const session = await issueSession(env, user);
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'LOGIN', 'users', ?, '{}', ?)`,
  ).bind(uuid(), user.id, user.id, nowIso()).run();
  return { user, ...session };
}

export async function refresh(request: Request, env: Env): Promise<unknown> {
  const body = await readJson<Record<string, unknown>>(request);
  const supplied = requireString(body.refreshToken, 'refreshToken', { min: 32, max: 256 });
  const tokenHash = await sha256Base64(supplied);
  const row = await env.DB.prepare(
    `SELECT rt.id AS token_id, u.id, u.name, u.email, u.role
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = ? AND rt.revoked_at IS NULL AND rt.expires_at > ? AND u.active = 1 LIMIT 1`,
  ).bind(tokenHash, nowIso()).first<AuthUser & { token_id: string }>();
  if (!row) throw new AppError(401, 'Sessão expirada.', 'INVALID_REFRESH_TOKEN');
  await env.DB.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).bind(nowIso(), row.token_id).run();
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
  return { user, ...(await issueSession(env, user)) };
}

export async function bootstrap(request: Request, env: Env): Promise<unknown> {
  const supplied = request.headers.get('x-bootstrap-secret') ?? '';
  if (!env.BOOTSTRAP_SECRET || !supplied || await sha256Base64(supplied) !== await sha256Base64(env.BOOTSTRAP_SECRET)) {
    throw new AppError(403, 'Bootstrap não autorizado.', 'FORBIDDEN');
  }
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users`).first<{ total: number }>();
  if ((count?.total ?? 0) > 0) throw new AppError(409, 'O bootstrap já foi concluído.', 'BOOTSTRAP_CLOSED');
  const body = await readJson<Record<string, unknown>>(request);
  const password = requireString(body.password, 'senha', { min: 12, max: 200 });
  const user: AuthUser = {
    id: uuid(),
    name: requireString(body.name, 'nome', { min: 2, max: 120 }),
    email: normalizeEmail(body.email),
    role: 'admin',
  };
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`,
    ).bind(user.id, user.name, user.email, hashPassword(password), timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'BOOTSTRAP', 'users', ?, '{}', ?)`,
    ).bind(uuid(), user.id, user.id, timestamp),
  ]);
  return { user, ...(await issueSession(env, user)) };
}

export async function authenticate(request: Request, env: Env): Promise<AuthUser> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Autenticação necessária.', 'UNAUTHENTICATED');
  try {
    const verified = await jwtVerify(header.slice(7), jwtSecret(env), { algorithms: ['HS256'] });
    const claims = verified.payload as unknown as TokenClaims;
    if (!claims.sub || claims.type !== 'access' || !['admin', 'pedagogico', 'professor'].includes(claims.role)) {
      throw new Error('invalid claims');
    }
    const active = await env.DB.prepare(`SELECT active FROM users WHERE id = ?`).bind(claims.sub).first<{ active: number }>();
    if (active?.active !== 1) throw new Error('inactive');
    return { id: claims.sub, name: claims.name, email: claims.email, role: claims.role };
  } catch {
    throw new AppError(401, 'Token inválido ou expirado.', 'INVALID_TOKEN');
  }
}

export async function logout(request: Request, env: Env, user: AuthUser): Promise<unknown> {
  const body = await readJson<Record<string, unknown>>(request);
  const supplied = requireString(body.refreshToken, 'refreshToken', { min: 32, max: 256 });
  await env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL`,
  ).bind(nowIso(), user.id, await sha256Base64(supplied)).run();
  return { ok: true };
}

export function assertRole(value: unknown): Role {
  if (value === 'admin' || value === 'pedagogico' || value === 'professor') return value;
  throw new AppError(400, 'Perfil inválido.', 'VALIDATION_ERROR');
}

