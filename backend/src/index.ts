import { authenticate, bootstrap, login, logout, refresh } from './auth';
import { getPublicStudentData, handleDataRoute } from './data';
import { AppError, json } from './http';
import { pull, push } from './sync';
import { getBranding } from './branding';
import { formatETag } from './concurrency';
import { handleV1Route } from './v1-router';
import type { Env } from './types';

function corsHeaders(env: Env, request: Request): HeadersInit {
  const allowed = env.ALLOWED_ORIGIN ?? '*';
  const origin = request.headers.get('origin');
  const selected = allowed === '*' ? (origin ?? '*') : origin === allowed ? origin : allowed;
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-bootstrap-secret,x-api-key,x-idempotency-key,if-match,idempotency-key',
    'access-control-expose-headers': 'etag, x-idempotency, x-request-id',
    'access-control-max-age': '86400',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

function withHeaders(response: Response, headers: HeadersInit, requestId: string): Response {
  const next = new Headers(response.headers);
  new Headers(headers).forEach((value, key) => next.set(key, value));
  next.set('x-request-id', requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: next });
}

function buildRefreshCookieHeader(refreshToken: string, env: Env): string {
  const days = Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  const maxAge = (Number.isFinite(days) && days > 0 ? days : 30) * 86400;
  return `erpitb_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearRefreshCookieHeader(): string {
  return 'erpitb_refresh_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

function validateOriginCsrf(request: Request, env: Env): void {
  const allowed = env.ALLOWED_ORIGIN;
  if (!allowed || allowed === '*') return;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== allowed) {
    throw new AppError(403, 'Origem da requisição não autorizada (proteção CSRF).', 'CSRF_ORIGIN_MISMATCH');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const commonHeaders = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return withHeaders(new Response(null, { status: 204 }), commonHeaders, requestId);
    try {
      const incomingUrl = new URL(request.url);
      // The Web PWA uses a namespaced /api prefix to cleanly separate API calls
      // from client-side SPA routes and static assets.
      const url = new URL(incomingUrl);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        url.pathname = url.pathname === '/api' ? '/' : url.pathname.slice(4);
      }
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.slice(0, -1);
      }
      validateOriginCsrf(request, env);
      if (url.pathname === '/health' && request.method === 'GET') {
        return withHeaders(json({ status: 'ok', service: 'ERPITB API' }), commonHeaders, requestId);
      }
      if (url.pathname.startsWith('/v1/assets/') && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.slice('/v1/assets/'.length));
        if (!env.ASSETS_BUCKET) {
          throw new AppError(503, 'Armazenamento de assets (R2) não configurado.', 'STORAGE_UNAVAILABLE');
        }
        const object = await env.ASSETS_BUCKET.get(key);
        if (!object) {
          return withHeaders(new Response('Asset not found', { status: 404 }), commonHeaders, requestId);
        }
        const headers = new Headers(commonHeaders);
        headers.set('content-type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('cache-control', object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable');
        if (object.httpEtag) headers.set('etag', object.httpEtag);
        return new Response(object.body, { status: 200, headers });
      }
      if ((url.pathname === '/v1/openapi.json' || url.pathname === '/openapi.json') && request.method === 'GET') {
        const { openApiSpec } = await import('./openapi');
        return withHeaders(json(openApiSpec), commonHeaders, requestId);
      }
      if ((url.pathname === '/v1/admin/branding' || url.pathname === '/admin/branding') && request.method === 'GET') {
        const branding = await getBranding(env);
        return withHeaders(
          new Response(JSON.stringify(branding), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'etag': formatETag(branding.syncVersion ?? 1),
            },
          }),
          commonHeaders,
          requestId,
        );
      }
      if (url.pathname === '/auth/bootstrap' && request.method === 'POST') {
        const resData = (await bootstrap(request, env)) as Record<string, unknown>;
        const headers = { ...commonHeaders } as Record<string, string>;
        if (typeof resData?.refreshToken === 'string') {
          headers['set-cookie'] = buildRefreshCookieHeader(resData.refreshToken, env);
        }
        return withHeaders(json(resData, 201), headers, requestId);
      }
      if (url.pathname === '/auth/login' && request.method === 'POST') {
        const resData = (await login(request, env)) as Record<string, unknown>;
        const headers = { ...commonHeaders } as Record<string, string>;
        if (typeof resData?.refreshToken === 'string') {
          headers['set-cookie'] = buildRefreshCookieHeader(resData.refreshToken, env);
        }
        return withHeaders(json(resData), headers, requestId);
      }
      if (url.pathname === '/auth/refresh' && request.method === 'POST') {
        const resData = (await refresh(request, env)) as Record<string, unknown>;
        const headers = { ...commonHeaders } as Record<string, string>;
        if (typeof resData?.refreshToken === 'string') {
          headers['set-cookie'] = buildRefreshCookieHeader(resData.refreshToken, env);
        }
        return withHeaders(json(resData), headers, requestId);
      }
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        const resData = await logout(request, env);
        const headers = { ...commonHeaders, 'set-cookie': clearRefreshCookieHeader() };
        return withHeaders(json(resData), headers, requestId);
      }
      const publicStudent = url.pathname.match(/^\/(?:public\/students|portal|matricula|aluno)\/([^/]+)$/);
      if (publicStudent && request.method === 'GET') {
        return withHeaders(json(await getPublicStudentData(env, decodeURIComponent(publicStudent[1]!))), commonHeaders, requestId);
      }
      const user = await authenticate(request, env);
      if (url.pathname === '/sync/push' && request.method === 'POST') {
        return withHeaders(json(await push(request, env, user)), commonHeaders, requestId);
      }
      if (url.pathname === '/sync/pull' && request.method === 'GET') {
        return withHeaders(json(await pull(url, env, user)), commonHeaders, requestId);
      }
      const v1Result = await handleV1Route(request, env, user, url);
      if (v1Result !== undefined) {
        if (v1Result instanceof Response) {
          return withHeaders(v1Result, commonHeaders, requestId);
        }
        const isPost = request.method === 'POST';
        const isAction = url.pathname.endsWith('/resolve') || url.pathname.endsWith('/lock') || url.pathname.endsWith('/drain') || url.pathname.endsWith('/revoke') || url.pathname.endsWith('/reset') || url.pathname.endsWith('/rotate') || url.pathname.endsWith('/reversal');
        const status = isPost && !isAction ? 201 : 200;
        return withHeaders(json(v1Result, status), commonHeaders, requestId);
      }
      const result = await handleDataRoute(request, env, user, url);
      if (result !== undefined) {
        if (result instanceof Response) {
          return withHeaders(result, commonHeaders, requestId);
        }
        const status = request.method === 'POST' && !url.pathname.endsWith('/resolve') ? 201 : 200;
        return withHeaders(json(result, status), commonHeaders, requestId);
      }
      throw new AppError(404, 'Rota não encontrada.', 'NOT_FOUND');
    } catch (error) {
      const known = error instanceof AppError;
      if (known && error.code === 'CONCURRENCY_CONFLICT') {
        const details = (error.details || {}) as Record<string, unknown>;
        const serverVersion = details.serverVersion ?? details.currentVersion;
        return withHeaders(
          new Response(JSON.stringify({
            ok: false,
            error: error.message,
            code: 'CONCURRENCY_CONFLICT',
            serverVersion,
          }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
          commonHeaders,
          requestId
        );
      }
      const isDuplicate = String(error).includes('UNIQUE constraint failed');
      const isD1Quota = String(error).includes('7500') ||
        String(error).toLowerCase().includes('daily row read limit') ||
        String(error).toLowerCase().includes('exceeded d1');
      const message = known
        ? error.message
        : isDuplicate
        ? 'Já existe um registro com estes dados no sistema.'
        : isD1Quota
        ? 'Limite diário de leitura do banco de dados (Cloudflare D1 Free Tier) excedido. O limite será restabelecido automaticamente à 00:00 UTC (ou após upgrade para Workers Paid).'
        : 'Ocorreu um erro interno no servidor.';
      const status = known ? error.status : isDuplicate ? 409 : isD1Quota ? 503 : 500;
      const code = known ? error.code : isDuplicate ? 'DUPLICATE_RECORD' : isD1Quota ? 'DATABASE_QUOTA_EXCEEDED' : 'INTERNAL_ERROR';
      if (!known) console.error(JSON.stringify({ requestId, error: error instanceof Error ? error.stack : String(error) }));
      return withHeaders(json({ error: { code, message, details: known ? error.details : undefined }, requestId }, status), commonHeaders, requestId);
    }
  },
} satisfies ExportedHandler<Env>;
