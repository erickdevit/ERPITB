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
});
