import { argon2id } from '@noble/hashes/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { base64, randomToken, sha256Base64, sha256Hex } from './crypto';
import { AppError, normalizeEmail, nowIso, readJson, requireString, uuid } from './http';
import { broadcastEvent } from './events-bus';
import type { AuthUser, Env, Role, TokenClaims } from './types';

const encoder = new TextEncoder();
const ARGON_MEMORY_KIB = 19 * 1024;
const ARGON_ITERATIONS = 2;
const ARGON_PARALLELISM = 1;

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 32;

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left[i]! ^ right[i]!;
  return result === 0;
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const passKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passKey,
    KEY_LEN * 8,
  );
  const hash = new Uint8Array(derivedBits);
  return `$pbkdf2-sha256$i=${PBKDF2_ITERATIONS}$${base64.encode(salt)}$${base64.encode(hash)}`;
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length === 6 && parts[1] === 'argon2id' && parts[2] === 'v=19') {
    try {
      const salt = base64.decode(parts[4]!);
      const expected = base64.decode(parts[5]!);
      const actual = argon2id(encoder.encode(password), salt, {
        m: 19 * 1024,
        t: 2,
        p: 1,
        dkLen: expected.length,
      });
      return safeEqual(actual, expected);
    } catch {
      return false;
    }
  }
  if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[2]!.replace('i=', ''));
  if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > 500000) return false;
  try {
    const salt = base64.decode(parts[3]!);
    const expected = base64.decode(parts[4]!);
    const passKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      passKey,
      expected.length * 8,
    );
    const actual = new Uint8Array(derivedBits);
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
  let email = '';
  try {
    email = normalizeEmail(body.email);
  } catch {
    throw new AppError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    throw new AppError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
  }
  const row = await env.DB.prepare(
    `SELECT id, name, email, password_hash, role, active FROM users WHERE email = ? LIMIT 1`,
  ).bind(email).first<UserRow>();
  if (!row || row.active !== 1 || !(await verifyPassword(row.password_hash, password))) {
    throw new AppError(401, 'E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
  }
  // Automatically upgrade legacy Argon2id or outdated PBKDF2 hashes to current PBKDF2 format
  if (row.password_hash.startsWith('$argon2id$') || !row.password_hash.startsWith(`$pbkdf2-sha256$i=${PBKDF2_ITERATIONS}$`)) {
    try {
      const newHash = await hashPassword(password);
      await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).bind(newHash, nowIso(), row.id).run();
    } catch {
      // Non-fatal hash upgrade
    }
  }
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
  const session = await issueSession(env, user);
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'LOGIN', 'users', ?, '{}', ?)`,
  ).bind(uuid(), user.id, user.id, nowIso()).run();
  return { user, ...session };
}

export async function refresh(request: Request, env: Env): Promise<unknown> {
  let supplied = '';
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.refreshToken === 'string') supplied = body.refreshToken.trim();
  } catch {
    // maybe in cookie
  }
  if (!supplied) {
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/erpitb_refresh_token=([^;]+)/);
    if (match && match[1]) supplied = decodeURIComponent(match[1].trim());
  }
  if (!supplied || supplied.length < 32 || supplied.length > 256) {
    throw new AppError(401, 'Sessão expirada.', 'INVALID_REFRESH_TOKEN');
  }
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
  const password = requireString(body.password, 'senha', { min: 6, max: 200 });
  const user: AuthUser = {
    id: uuid(),
    name: requireString(body.name, 'nome', { min: 2, max: 120 }),
    email: normalizeEmail(body.email),
    role: 'admin',
  };
  const timestamp = nowIso();
  const passwordHash = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`,
    ).bind(user.id, user.name, user.email, passwordHash, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details_json, created_at) VALUES (?, ?, 'BOOTSTRAP', 'users', ?, '{}', ?)`,
    ).bind(uuid(), user.id, user.id, timestamp),
  ]);
  return { user, ...(await issueSession(env, user)) };
}

interface CachedUser {
  user: AuthUser;
  active: number;
  cachedAt: number;
}
const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 60_000;

export function invalidateUserCache(userId?: string): void {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

export async function authenticate(request: Request, env: Env): Promise<AuthUser> {
  const apiKeyHeader = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  const apiToken = apiKeyHeader || (authHeader?.startsWith('Bearer itb_') ? authHeader.slice(7) : null);

  if (apiToken) {
    const keyHash = await sha256Hex(apiToken);
    const now = nowIso();
    const keyRow = await env.DB.prepare(
      `SELECT id, name, scopes_json, created_by_user_id, expires_at, revoked_at
         FROM api_keys
        WHERE key_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1`,
    ).bind(keyHash, now).first<{ id: string; name: string; scopes_json: string; created_by_user_id: string; expires_at: string | null; revoked_at: string | null }>();

    if (!keyRow) {
      throw new AppError(401, 'Chave de API inválida ou revogada.', 'INVALID_API_KEY');
    }

    try {
      await env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).bind(now, keyRow.id).run();
    } catch {
      // non-fatal
    }

    let scopes: string[] = [];
    try {
      scopes = JSON.parse(keyRow.scopes_json);
    } catch {
      scopes = [];
    }

    return {
      id: keyRow.id,
      name: keyRow.name,
      email: 'machine@apikey',
      role: 'machine',
      isApiKey: true,
      scopes,
    };
  }

  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (tokenParam || null);

  if (!bearerToken) throw new AppError(401, 'Autenticação necessária.', 'UNAUTHENTICATED');
  let claims: TokenClaims;
  try {
    const verified = await jwtVerify(bearerToken, jwtSecret(env), { algorithms: ['HS256'] });
    claims = verified.payload as unknown as TokenClaims;
    if (!claims.sub || claims.type !== 'access' || !['admin', 'pedagogico', 'professor', 'financeiro'].includes(claims.role)) {
      throw new Error('invalid claims');
    }
  } catch {
    throw new AppError(401, 'Token inválido ou expirado.', 'INVALID_TOKEN');
  }
  const now = Date.now();
  const cached = userCache.get(claims.sub);
  if (cached && (now - cached.cachedAt) < USER_CACHE_TTL_MS) {
    if (cached.active !== 1 || !['admin', 'pedagogico', 'professor', 'financeiro'].includes(cached.user.role)) {
      throw new AppError(401, 'Usuário inativo ou sessão inválida.', 'INVALID_TOKEN');
    }
    return cached.user;
  }

  let current: (AuthUser & { active: number }) | null = null;
  try {
    current = await env.DB.prepare(
      `SELECT id, name, email, role, active FROM users WHERE id = ? LIMIT 1`,
    ).bind(claims.sub).first<AuthUser & { active: number }>();
  } catch (err) {
    const isD1QuotaError = String(err).includes('7500') ||
      String(err).toLowerCase().includes('daily row read limit');
    if (isD1QuotaError && claims.sub && claims.role) {
      return {
        id: claims.sub,
        name: claims.name || 'Usuário',
        email: claims.email || '',
        role: claims.role,
      };
    }
    throw err;
  }

  if (!current || current.active !== 1 || !['admin', 'pedagogico', 'professor', 'financeiro'].includes(current.role)) {
    throw new AppError(401, 'Usuário inativo ou sessão inválida.', 'INVALID_TOKEN');
  }
  const user: AuthUser = { id: current.id, name: current.name, email: current.email, role: current.role };
  userCache.set(user.id, { user, active: current.active, cachedAt: now });
  return user;
}

export async function logout(request: Request, env: Env, user?: AuthUser): Promise<unknown> {
  let supplied = '';
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.refreshToken === 'string') supplied = body.refreshToken.trim();
  } catch {
    // maybe in cookie or empty
  }
  if (!supplied) {
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/erpitb_refresh_token=([^;]+)/);
    if (match && match[1]) supplied = decodeURIComponent(match[1].trim());
  }

  let activeUser = user;
  if (!activeUser) {
    try {
      activeUser = await authenticate(request, env);
    } catch {
      // Access token may be expired or missing
    }
  }

  const timestamp = nowIso();
  let targetUserId = activeUser?.id;

  if (supplied && supplied.length >= 32 && supplied.length <= 256) {
    const tokenHash = await sha256Base64(supplied);
    if (!targetUserId) {
      try {
        const row = await env.DB.prepare(
          `SELECT user_id FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
        ).bind(tokenHash).first<{ user_id: string }>();
        if (row?.user_id) targetUserId = row.user_id;
      } catch {
        // DB non-fatal
      }
    }
    try {
      await env.DB.prepare(
        `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
      ).bind(timestamp, tokenHash).run();
    } catch {
      // DB non-fatal
    }
  }

  if (targetUserId) {
    try {
      broadcastEvent('session_revoked', {
        userId: targetUserId,
        reason: 'LOGOUT',
        timestamp,
      }, { targetUserId, env });
    } catch {
      // Broadcast non-fatal
    }
    if (targetUserId) {
      invalidateUserCache(targetUserId);
    }
  }

  return { ok: true };
}

export function assertRole(value: unknown): Role {
  if (value === 'admin' || value === 'pedagogico' || value === 'professor' || value === 'financeiro') return value;
  throw new AppError(400, 'Perfil inválido.', 'VALIDATION_ERROR');
}
