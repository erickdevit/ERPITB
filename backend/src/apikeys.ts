import { AppError, nowIso, readJson, requireString, uuid } from './http';
import { requirePermission } from './rbac';
import { randomToken, sha256Hex } from './crypto';
import type { ApiKeyRecord, AuthUser, Env } from './types';

const ALLOWED_SCOPES = [
  '*',
  'students:read',
  'students:write',
  'students:pii',
  'classes:read',
  'classes:write',
  'courses:read',
  'courses:write',
  'laboratories:read',
  'laboratories:write',
  'attendance:read',
  'attendance:write',
  'grades:read',
  'grades:write',
  'finance:read',
  'finance:write',
  'reports:read',
  'reports:finance',
  'analytics:read',
];

export async function listApiKeys(env: Env, user: AuthUser): Promise<{ items: ApiKeyRecord[] }> {
  requirePermission(user, 'api_keys:manage');

  const rows = await env.DB.prepare(`
    SELECT id, name, key_prefix, scopes_json, created_by_user_id,
           expires_at, last_used_at, revoked_at, created_at, updated_at
      FROM api_keys
     ORDER BY created_at DESC
  `).all<{
    id: string; name: string; key_prefix: string; scopes_json: string;
    created_by_user_id: string; expires_at: string | null; last_used_at: string | null;
    revoked_at: string | null; created_at: string; updated_at: string;
  }>();

  const items: ApiKeyRecord[] = rows.results.map((r) => {
    let scopes: string[] = [];
    try {
      scopes = JSON.parse(r.scopes_json);
    } catch {}
    return {
      id: r.id,
      name: r.name,
      keyPrefix: r.key_prefix,
      scopes,
      createdByUserId: r.created_by_user_id,
      expiresAt: r.expires_at ?? undefined,
      lastUsedAt: r.last_used_at ?? undefined,
      revokedAt: r.revoked_at ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  return { items };
}

export async function createApiKey(request: Request, env: Env, user: AuthUser): Promise<{ key: ApiKeyRecord; secret: string }> {
  requirePermission(user, 'api_keys:manage');
  const body = await readJson<Record<string, unknown>>(request);

  const name = requireString(body.name, 'name', { min: 2, max: 100 });
  const rawScopes = Array.isArray(body.scopes) ? body.scopes : ['*'];
  const scopes = rawScopes.filter((s): s is string => typeof s === 'string' && ALLOWED_SCOPES.includes(s));

  if (scopes.length === 0) {
    throw new AppError(400, 'Selecione ao menos um escopo válido para a chave de API.', 'VALIDATION_ERROR');
  }

  const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : null;

  // Generate strong entropy key
  const randomPart = randomToken(36);
  const secret = `itb_live_${randomPart}`;
  const keyPrefix = secret.slice(0, 16);
  const keyHash = await sha256Hex(secret);

  const id = uuid();
  const timestamp = nowIso();
  const scopesJson = JSON.stringify(scopes);

  await env.DB.prepare(`
    INSERT INTO api_keys (
      id, name, key_prefix, key_hash, scopes_json,
      created_by_user_id, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, name, keyPrefix, keyHash, scopesJson, user.id, expiresAt, timestamp, timestamp).run();

  return {
    key: {
      id,
      name,
      keyPrefix,
      scopes,
      createdByUserId: user.id,
      expiresAt: expiresAt ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    secret,
  };
}

export async function revokeApiKey(env: Env, user: AuthUser, id: string): Promise<unknown> {
  requirePermission(user, 'api_keys:manage');
  const timestamp = nowIso();

  const existing = await env.DB.prepare(`SELECT id, name FROM api_keys WHERE id = ? LIMIT 1`).bind(id).first<{ id: string; name: string }>();
  if (!existing) {
    throw new AppError(404, 'Chave de API não encontrada.', 'NOT_FOUND');
  }

  await env.DB.prepare(`UPDATE api_keys SET revoked_at = ?, updated_at = ? WHERE id = ?`).bind(timestamp, timestamp, id).run();

  return { ok: true, message: 'Chave de API revogada com sucesso.' };
}

export async function rotateApiKey(env: Env, user: AuthUser, id: string): Promise<{ key: ApiKeyRecord; secret: string }> {
  requirePermission(user, 'api_keys:manage');

  const existing = await env.DB.prepare(
    `SELECT * FROM api_keys WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; name: string; scopes_json: string; expires_at: string | null }>();

  if (!existing) {
    throw new AppError(404, 'Chave de API não encontrada.', 'NOT_FOUND');
  }

  const timestamp = nowIso();

  // Generate new secret
  const randomPart = randomToken(36);
  const newSecret = `itb_live_${randomPart}`;
  const newKeyPrefix = newSecret.slice(0, 16);
  const newKeyHash = await sha256Hex(newSecret);
  const newId = uuid();

  await env.DB.batch([
    // Revoke old
    env.DB.prepare(`UPDATE api_keys SET revoked_at = ?, updated_at = ? WHERE id = ?`).bind(timestamp, timestamp, id),
    // Create new
    env.DB.prepare(`
      INSERT INTO api_keys (
        id, name, key_prefix, key_hash, scopes_json,
        created_by_user_id, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(newId, existing.name, newKeyPrefix, newKeyHash, existing.scopes_json, user.id, existing.expires_at, timestamp, timestamp),
  ]);

  let scopes: string[] = [];
  try {
    scopes = JSON.parse(existing.scopes_json);
  } catch {}

  return {
    key: {
      id: newId,
      name: existing.name,
      keyPrefix: newKeyPrefix,
      scopes,
      createdByUserId: user.id,
      expiresAt: existing.expires_at ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    secret: newSecret,
  };
}
