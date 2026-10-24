import { authenticate, bootstrap, login, logout, refresh } from './auth';
import { getPublicStudentData, handleDataRoute } from './data';
import { AppError, json } from './http';
import { pull, push } from './sync';
import type { Env } from './types';

function corsHeaders(env: Env, request: Request): HeadersInit {
  const allowed = env.ALLOWED_ORIGIN ?? '*';
  const origin = request.headers.get('origin');
  const selected = allowed === '*' ? (origin ?? '*') : origin === allowed ? origin : allowed;
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-bootstrap-secret',
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
      if (url.pathname === '/health' && request.method === 'GET') {
        return withHeaders(json({ status: 'ok', service: 'ERPITB API' }), commonHeaders, requestId);
      }
      if (url.pathname === '/auth/bootstrap' && request.method === 'POST') {
        return withHeaders(json(await bootstrap(request, env), 201), commonHeaders, requestId);
      }
      if (url.pathname === '/auth/login' && request.method === 'POST') {
        return withHeaders(json(await login(request, env)), commonHeaders, requestId);
      }
      if (url.pathname === '/auth/refresh' && request.method === 'POST') {
        return withHeaders(json(await refresh(request, env)), commonHeaders, requestId);
      }
      const publicStudent = url.pathname.match(/^\/(?:public\/students|portal|matricula|aluno)\/([^/]+)$/);
      if (publicStudent && request.method === 'GET') {
        return withHeaders(json(await getPublicStudentData(env, decodeURIComponent(publicStudent[1]!))), commonHeaders, requestId);
      }
      const user = await authenticate(request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        return withHeaders(json(await logout(request, env, user)), commonHeaders, requestId);
      }
      if (url.pathname === '/sync/push' && request.method === 'POST') {
        return withHeaders(json(await push(request, env, user)), commonHeaders, requestId);
      }
      if (url.pathname === '/sync/pull' && request.method === 'GET') {
        return withHeaders(json(await pull(url, env, user)), commonHeaders, requestId);
      }
      const result = await handleDataRoute(request, env, user, url);
      if (result !== undefined) {
        const status = request.method === 'POST' && !url.pathname.endsWith('/resolve') ? 201 : 200;
        return withHeaders(json(result, status), commonHeaders, requestId);
      }
      throw new AppError(404, 'Rota não encontrada.', 'NOT_FOUND');
    } catch (error) {
      const known = error instanceof AppError;
      const isDuplicate = String(error).includes('UNIQUE constraint failed');
      const message = known
        ? error.message
        : isDuplicate
        ? 'Já existe um registro com estes dados no sistema.'
        : 'Ocorreu um erro interno no servidor.';
      const status = known ? error.status : isDuplicate ? 409 : 500;
      const code = known ? error.code : isDuplicate ? 'DUPLICATE_RECORD' : 'INTERNAL_ERROR';
      if (!known) console.error(JSON.stringify({ requestId, error: error instanceof Error ? error.stack : String(error) }));
      return withHeaders(json({ error: { code, message, details: known ? error.details : undefined }, requestId }, status), commonHeaders, requestId);
    }
  },
} satisfies ExportedHandler<Env>;
