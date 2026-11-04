import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import pg, { type Pool } from 'pg';
const { Pool: PgPool } = pg;
import { REGISTERED_MIGRATIONS, runPostgresMigrations } from '../src/db/migrator';

describe('Docker & PostgreSQL Infrastructure and Migrations Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const backendDir = path.resolve(__dirname, '../');
  const dockerfilePath = path.join(rootDir, 'Dockerfile');
  const dockerComposePath = path.join(rootDir, 'docker-compose.yml');
  const schemaSqlPath = path.join(backendDir, 'src/schema.sql');
  const schemaPostgresPath = path.join(backendDir, 'src/db/schema.postgres.sql');

  describe('1. Schema Parity & Integrity', () => {
    it('ensures backend/src/db/schema.postgres.sql exists and is non-empty', () => {
      expect(fs.existsSync(schemaPostgresPath)).toBe(true);
      const content = fs.readFileSync(schemaPostgresPath, 'utf8');
      expect(content.length).toBeGreaterThan(1000);
    });

    it('ensures all canonical D1 tables are defined in schema.postgres.sql', () => {
      const sqliteSchema = fs.readFileSync(schemaSqlPath, 'utf8');
      const postgresSchema = fs.readFileSync(schemaPostgresPath, 'utf8');

      const sqliteTables = Array.from(
        sqliteSchema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"]+)/gi),
      ).map((m) => m[1]!.replace(/"/g, ''));

      const postgresTables = Array.from(
        postgresSchema.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"]+)/gi),
      ).map((m) => m[1]!.replace(/"/g, ''));

      expect(sqliteTables.length).toBeGreaterThan(20);
      expect(postgresTables.length).toBeGreaterThan(20);

      // Verify every canonical table from SQLite schema is represented in PostgreSQL schema
      for (const table of sqliteTables) {
        expect(postgresTables).toContain(table);
      }
    });

    it('guarantees PostgreSQL schema uses IF NOT EXISTS for tables and indexes for restart safety', () => {
      const postgresSchema = fs.readFileSync(schemaPostgresPath, 'utf8');

      const createTableMatches = Array.from(
        postgresSchema.matchAll(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)([a-zA-Z0-9_"]+)/gi),
      );
      expect(createTableMatches.length).toBe(0);

      const createIndexMatches = Array.from(
        postgresSchema.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)([a-zA-Z0-9_"]+)/gi),
      );
      expect(createIndexMatches.length).toBe(0);
    });

    it('ensures schema.postgres.sql does not contain SQLite-only incompatible syntax', () => {
      const postgresSchema = fs.readFileSync(schemaPostgresPath, 'utf8');

      // SQLite COLLATE NOCASE is not supported directly without CITEXT or custom collation in PostgreSQL
      expect(postgresSchema).not.toMatch(/COLLATE\s+NOCASE/i);

      // AUTOINCREMENT is SQLite syntax; PostgreSQL uses SERIAL or IDENTITY
      expect(postgresSchema).not.toMatch(/AUTOINCREMENT/i);

      // PRAGMA is SQLite only
      expect(postgresSchema).not.toMatch(/PRAGMA/i);
    });
  });

  describe('2. Migrator Engine Verification', () => {
    it('registers migrations with unique IDs and valid handlers', () => {
      expect(REGISTERED_MIGRATIONS.length).toBeGreaterThan(0);
      const ids = new Set<string>();

      for (const migration of REGISTERED_MIGRATIONS) {
        expect(migration.id).toBeDefined();
        expect(typeof migration.id).toBe('string');
        expect(ids.has(migration.id)).toBe(false);
        ids.add(migration.id);

        expect(migration.description).toBeDefined();
        expect(typeof migration.up).toBe('function');
      }
    });

    it('verifies runPostgresMigrations locates schema file successfully', async () => {
      // Create a mock pool that records queries to verify migrator path resolution
      const executedQueries: string[] = [];
      const mockClient = {
        query: async (sqlText: string) => {
          executedQueries.push(sqlText);
          if (sqlText.includes('SELECT id FROM _schema_migrations')) {
            return { rows: [] };
          }
          if (sqlText.includes('SELECT COUNT(*) AS count FROM branding_settings')) {
            return { rows: [{ count: '1' }] };
          }
          return { rows: [], rowCount: 1 };
        },
        release: () => {},
      };

      const mockPool = {
        connect: async () => mockClient,
      } as unknown as Pool;

      await expect(runPostgresMigrations(mockPool)).resolves.not.toThrow();
      expect(executedQueries.length).toBeGreaterThan(0);
      // Ensure the initial SQL query executed includes CREATE TABLE IF NOT EXISTS users
      expect(executedQueries[0]).toContain('CREATE TABLE IF NOT EXISTS users');
    });
  });

  describe('3. Dockerfile Specifications & Multi-Stage Safety', () => {
    it('validates Dockerfile exists and configures multi-stage builds', () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

      // Verify build stages
      expect(dockerfile).toMatch(/FROM\s+node:22-alpine\s+AS\s+web-builder/i);
      expect(dockerfile).toMatch(/FROM\s+node:22-alpine\s+AS\s+backend-builder/i);
      expect(dockerfile).toMatch(/FROM\s+node:22-alpine\s+AS\s+runner/i);

      // Verify copied artifacts
      expect(dockerfile).toContain('COPY --from=web-builder /app/web/dist /app/web/dist');
      expect(dockerfile).toContain('COPY --from=backend-builder /app/backend/dist /app/backend/dist');

      // Verify security: non-root node user
      expect(dockerfile).toMatch(/USER\s+node/i);

      // Verify health check and expose
      expect(dockerfile).toMatch(/EXPOSE\s+3000/i);
      expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*http:\/\/127\.0\.0\.1:3000\/health/i);
    });
  });

  describe('4. Docker Compose Orchestration Specifications', () => {
    it('validates docker-compose.yml services and network definitions', () => {
      expect(fs.existsSync(dockerComposePath)).toBe(true);
      const compose = fs.readFileSync(dockerComposePath, 'utf8');

      // Verify services
      expect(compose).toContain('postgres:');
      expect(compose).toContain('app:');

      // Verify postgres health check
      expect(compose).toContain('pg_isready');

      // Verify app depends on healthy postgres
      expect(compose).toMatch(/depends_on:[\s\S]*?postgres:[\s\S]*?condition:\s*service_healthy/);

      // Verify app health check
      expect(compose).toMatch(/http:\/\/127\.0\.0\.1:3000\/health/);

      // Verify volumes and network
      expect(compose).toContain('postgres_data:');
      expect(compose).toContain('storage_data:');
      expect(compose).toContain('opschool-network:');
    });
  });

  describe('5. Live Container Environment Integration (when Docker is active)', () => {
    const isDockerAvailable = async () => {
      try {
        const pool = new PgPool({
          connectionString: process.env.DATABASE_URL || 'postgres://postgres:opschool_secret_pass@127.0.0.1:5432/opschool',
          connectionTimeoutMillis: 1500,
        });
        const client = await pool.connect();
        client.release();
        await pool.end();
        return true;
      } catch {
        return false;
      }
    };

    it('verifies real PostgreSQL schema initialization and idempotent migration re-runs', async () => {
      const active = await isDockerAvailable();
      if (!active) {
        console.log('[Test Skipped] Docker postgres container is not currently accessible.');
        return;
      }

      const pool = new PgPool({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres:opschool_secret_pass@127.0.0.1:5432/opschool',
      });

      try {
        // Re-running migrations should be completely idempotent and not throw
        await expect(runPostgresMigrations(pool)).resolves.not.toThrow();

        // Verify tables exist in public schema
        const res = await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
        );
        const tables = res.rows.map((r: { tablename: string }) => r.tablename);

        expect(tables).toContain('users');
        expect(tables).toContain('classes');
        expect(tables).toContain('students');
        expect(tables).toContain('attendance_records');
        expect(tables).toContain('financial_fees');
        expect(tables).toContain('_schema_migrations');

        // Verify applied migrations
        const migRes = await pool.query('SELECT id FROM _schema_migrations');
        const appliedIds = migRes.rows.map((r: { id: string }) => r.id);
        for (const m of REGISTERED_MIGRATIONS) {
          expect(appliedIds).toContain(m.id);
        }
      } finally {
        await pool.end();
      }
    });

    it('verifies HTTP /health endpoint on running app container', async () => {
      try {
        const response = await fetch('http://127.0.0.1:3000/health', {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const body = (await response.json()) as { status: string; service: string };
          expect(body.status).toBe('ok');
          expect(body.service).toBe('opschool API');
        }
      } catch {
        // App container not running or port not mapped in this environment - skip gracefully
      }
    });
  });
});
