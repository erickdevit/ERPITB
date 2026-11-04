import type { Pool, PoolClient, QueryResult } from 'pg';

export function convertSqlPlaceholders(sql: string): string {
  let paramIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inSingleQuote) {
      result += char;
      if (char === "'") {
        if (i + 1 < sql.length && sql[i + 1] === "'") {
          result += "'";
          i++;
        } else {
          inSingleQuote = false;
        }
      }
    } else if (inDoubleQuote) {
      result += char;
      if (char === '"') {
        if (i + 1 < sql.length && sql[i + 1] === '"') {
          result += '"';
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
    } else {
      if (char === "'") {
        inSingleQuote = true;
        result += char;
      } else if (char === '"') {
        inDoubleQuote = true;
        result += char;
      } else if (char === '?') {
        result += '$' + paramIndex++;
      } else {
        result += char;
      }
    }
  }

  return result;
}

export function sanitizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  return value;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export class PostgresPreparedStatement {
  private boundParams: unknown[] = [];
  private pgSql: string;

  constructor(
    private pool: Pool,
    private rawSql: string,
    private clientOverride?: PoolClient,
  ) {
    this.pgSql = convertSqlPlaceholders(rawSql);
  }

  bind(...values: unknown[]): PostgresPreparedStatement {
    const next = new PostgresPreparedStatement(this.pool, this.rawSql, this.clientOverride);
    next.boundParams = values.map(sanitizeParam);
    return next;
  }

  private async executeQuery(): Promise<QueryResult<any>> {
    const queryable = this.clientOverride || this.pool;
    try {
      return await queryable.query(this.pgSql, this.boundParams);
    } catch (err: any) {
      if (err?.code === '23505') {
        const detail = err.detail || err.message;
        const enhancedError = new Error(`UNIQUE constraint failed: ${detail}`);
        (enhancedError as any).code = '23505';
        (enhancedError as any).detail = detail;
        (enhancedError as any).originalError = err;
        throw enhancedError;
      }
      throw err;
    }
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const res = await this.executeQuery();
    const row = res.rows[0];
    if (!row) return null;
    if (colName) return (row[colName] ?? null) as T;
    return row as T;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const res = await this.executeQuery();
    return {
      results: res.rows as T[],
      success: true,
      meta: {
        changes: res.rowCount ?? 0,
        last_row_id: 0,
      },
    };
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const res = await this.executeQuery();
    return {
      results: (res.rows || []) as T[],
      success: true,
      meta: {
        changes: res.rowCount ?? 0,
        last_row_id: 0,
      },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const res = await this.executeQuery();
    return res.rows as T[];
  }

  getSql(): string {
    return this.pgSql;
  }

  getParams(): unknown[] {
    return this.boundParams;
  }
}

export class PostgresD1Database {
  constructor(public pool: Pool) {}

  prepare(sql: string): PostgresPreparedStatement {
    return new PostgresPreparedStatement(this.pool, sql);
  }

  async batch<T = unknown>(statements: PostgresPreparedStatement[]): Promise<D1Result<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        const sql = stmt.getSql();
        const params = stmt.getParams();
        let res: QueryResult<any>;
        try {
          res = await client.query(sql, params);
        } catch (err: any) {
          if (err?.code === '23505') {
            const detail = err.detail || err.message;
            const enhancedError = new Error(`UNIQUE constraint failed: ${detail}`);
            (enhancedError as any).code = '23505';
            (enhancedError as any).detail = detail;
            (enhancedError as any).originalError = err;
            throw enhancedError;
          }
          throw err;
        }
        results.push({
          results: res.rows as T[],
          success: true,
          meta: {
            changes: res.rowCount ?? 0,
            last_row_id: 0,
          },
        });
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async exec(sql: string): Promise<D1ExecResult> {
    const start = Date.now();
    const res = await this.pool.query(sql);
    return {
      count: res.rowCount ?? 0,
      duration: Date.now() - start,
    };
  }
}
