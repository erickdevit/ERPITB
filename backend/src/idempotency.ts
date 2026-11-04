import { AppError, nowIso } from './http';
import { sha256Hex } from './crypto';
import type { AuthUser, Env } from './types';

/**
 * Checks if an idempotency key exists for (key, user_id).
 * If payload hash matches: returns cached Response with 'x-idempotency: replay'.
 * If payload hash differs: throws 422 Unprocessable Entity.
 * If key does not exist: returns null.
 */
export async function checkIdempotency(
  key: string,
  user: AuthUser,
  path: string,
  requestHash: string,
  env: Env
): Promise<Response | null> {
  const existing = await env.DB.prepare(
    `SELECT status_code, response_json, request_hash FROM idempotency_keys WHERE user_id = ? AND key = ? LIMIT 1`
  ).bind(user.id, key).first<{ status_code: number; response_json: string; request_hash: string }>();

  if (!existing) return null;

  if (existing.request_hash !== requestHash) {
    throw new AppError(
      422,
      'Esta chave de idempotência já foi utilizada com parâmetros diferentes.',
      'IDEMPOTENCY_PAYLOAD_MISMATCH'
    );
  }

  let responseBody = existing.response_json;
  try {
    const parsed = JSON.parse(existing.response_json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      responseBody = JSON.stringify({ ...parsed, duplicate: true });
    }
  } catch {}

  return new Response(responseBody, {
    status: existing.status_code,
    headers: {
      'content-type': 'application/json',
      'x-idempotency': 'replay',
    },
  });
}

/**
 * Saves response in idempotency_keys table.
 */
export async function saveIdempotency(
  key: string,
  user: AuthUser,
  path: string,
  requestHash: string,
  statusCode: number,
  responseJson: string,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO idempotency_keys (user_id, key, method, path, request_hash, status_code, response_json, created_at)
     VALUES (?, ?, 'POST', ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET
       method = excluded.method,
       path = excluded.path,
       request_hash = excluded.request_hash,
       status_code = excluded.status_code,
       response_json = excluded.response_json,
       created_at = excluded.created_at`
  ).bind(user.id, key, path, requestHash, statusCode, responseJson, nowIso()).run();
}
