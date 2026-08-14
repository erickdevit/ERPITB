import { describe, expect, it } from 'vitest';
import { formatDate, parseBrazilDate } from './date';

describe('Brazilian date input', () => {
  it('normalizes a manually typed date without timezone conversion', () => {
    expect(parseBrazilDate('29/02/2024')).toBe('2024-02-29');
    expect(formatDate('1940-01-02')).toBe('02/01/1940');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => parseBrazilDate('31/02/2024')).toThrow('não existe');
    expect(() => parseBrazilDate('2024-01-01')).toThrow('dd/mm/aaaa');
  });
});
