import { describe, expect, it } from 'vitest';
import { convertSqlPlaceholders, sanitizeParam } from '../src/db/postgres-adapter';

describe('Postgres Adapter SQL placeholder and param conversion', () => {
  it('converts single and multiple ? to $1, $2, ...', () => {
    const input = 'SELECT * FROM users WHERE email = ? AND active = ?';
    const output = convertSqlPlaceholders(input);
    expect(output).toBe('SELECT * FROM users WHERE email = $1 AND active = $2');
  });

  it('ignores ? inside single-quoted string literals', () => {
    const input = "SELECT * FROM users WHERE name = 'Is this a question? Yes!' AND id = ?";
    const output = convertSqlPlaceholders(input);
    expect(output).toBe("SELECT * FROM users WHERE name = 'Is this a question? Yes!' AND id = $1");
  });

  it('handles escaped quotes inside single-quoted strings', () => {
    const input = "SELECT * FROM notes WHERE text = 'It''s fine? Really!' AND class_id = ? AND date = ?";
    const output = convertSqlPlaceholders(input);
    expect(output).toBe("SELECT * FROM notes WHERE text = 'It''s fine? Really!' AND class_id = $1 AND date = $2");
  });

  it('ignores ? inside double-quoted identifiers', () => {
    const input = 'SELECT "col?name" FROM table WHERE id = ?';
    const output = convertSqlPlaceholders(input);
    expect(output).toBe('SELECT "col?name" FROM table WHERE id = $1');
  });

  it('sanitizes undefined to null', () => {
    expect(sanitizeParam(undefined)).toBeNull();
    expect(sanitizeParam(null)).toBeNull();
    expect(sanitizeParam('abc')).toBe('abc');
    expect(sanitizeParam(123)).toBe(123);
    expect(sanitizeParam(0)).toBe(0);
    expect(sanitizeParam(false)).toBe(false);
  });
});
