import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';

describe('ApiClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves the Worker request id on unexpected server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro interno.' },
      requestId: 'request-123',
    }), { status: 500, headers: { 'content-type': 'application/json', 'x-request-id': 'request-123' } })));
    const client = new ApiClient(() => null, async () => undefined);

    const error = await client.get('/sync/pull').catch((cause) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', requestId: 'request-123' });
    expect((error as Error).message).toContain('Referência: request-123');
  });

  it('prevents infinite recursion and does not attempt refresh on auth endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/logout')) {
        return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Token inválido' } }), { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onUnauthorized = vi.fn();
    const session = { id: 'u1', name: 'User', email: 'u@test.com', role: 'admin' as const, accessToken: 'acc-1', refreshToken: 'ref-1' };
    const client = new ApiClient(() => session, async () => undefined);
    client.setOnUnauthorized(onUnauthorized);

    await client.logout('ref-1');

    // Should only have called logout once, no refresh calls, no onUnauthorized recursion
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent refresh calls and only fires onUnauthorized once', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Sessão expirada' } }), { status: 401 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onUnauthorized = vi.fn();
    const session = { id: 'u1', name: 'User', email: 'u@test.com', role: 'admin' as const, accessToken: 'expired-acc', refreshToken: 'expired-ref' };
    const client = new ApiClient(() => session, async () => undefined);
    client.setOnUnauthorized(onUnauthorized);

    // Run 3 concurrent requests that all get 401
    await Promise.allSettled([
      client.get('/v1/classes'),
      client.get('/v1/courses'),
      client.get('/v1/students'),
    ]);

    // Refresh should only be called once because it was deduplicated
    expect(refreshCalls).toBe(1);
    // onUnauthorized should only be notified once, preventing cascaded logout loops
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
