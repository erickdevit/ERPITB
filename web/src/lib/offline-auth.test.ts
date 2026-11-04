import { describe, expect, it } from 'vitest';
import { emailLookupHash, passwordVerifier, verifierMatches } from './offline-auth';

describe('offline authentication primitives', () => {
  it('normalizes the email lookup without storing the email as an index', async () => {
    expect(await emailLookupHash('  ADMIN@OPSCHOOL.EXAMPLE ')).toBe(await emailLookupHash('admin@opschool.example'));
    expect(await emailLookupHash('admin@opschool.example')).not.toContain('admin');
  });

  it('accepts only the password used to create the verifier', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const expected = await passwordVerifier('Senha segura 123!', salt);
    expect(verifierMatches(expected, await passwordVerifier('Senha segura 123!', salt))).toBe(true);
    expect(verifierMatches(expected, await passwordVerifier('Senha incorreta', salt))).toBe(false);
  });
});
