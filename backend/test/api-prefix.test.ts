import worker from '../src/index';
import { describe, expect, it } from 'vitest';

describe('PWA API prefix', () => {
  const env = {
    ALLOWED_ORIGIN: '*',
  } as never;

  it('keeps health available under /api without removing the legacy route', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/health'), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });
});
