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

  it('normalizes trailing slashes on all API routes gracefully', async () => {
    const res1 = await worker.fetch(new Request('https://example.test/health/'), env);
    expect(res1.status).toBe(200);
    await expect(res1.json()).resolves.toMatchObject({ status: 'ok' });

    const res2 = await worker.fetch(new Request('https://example.test/api/health/'), env);
    expect(res2.status).toBe(200);
    await expect(res2.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('reflects request Origin header in CORS response when ALLOWED_ORIGIN is wildcard or specific', async () => {
    const reqWithOrigin = new Request('https://example.test/health', {
      headers: { origin: 'https://erp.itbcursos.com' },
    });
    const res = await worker.fetch(reqWithOrigin, env);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://erp.itbcursos.com');

    const specificEnv = { ALLOWED_ORIGIN: 'https://erp.itbcursos.com' } as never;
    const resSpecific = await worker.fetch(reqWithOrigin, specificEnv);
    expect(resSpecific.headers.get('access-control-allow-origin')).toBe('https://erp.itbcursos.com');
  });

  it('enforces defensive security headers (clickjacking and content protection)', async () => {
    const res = await worker.fetch(new Request('https://example.test/health'), env);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-xss-protection')).toBe('0');

    // Also verify preflight OPTIONS response includes defensive headers
    const optionsRes = await worker.fetch(new Request('https://example.test/health', { method: 'OPTIONS' }), env);
    expect(optionsRes.headers.get('x-frame-options')).toBe('DENY');
    expect(optionsRes.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });
});
