import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import pg from 'pg';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import worker, { setSchemaEnsured } from './index';
import { PostgresD1Database } from './db/postgres-adapter';
import { runPostgresMigrations } from './db/migrator';
import { LocalStorageProvider } from './storage/local-storage';
import type { Env } from './types';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgres://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'opschool'}`;

const STORAGE_PATH = path.resolve(process.env.STORAGE_PATH || './storage');
const STATIC_DIR = path.resolve(
  process.env.STATIC_DIR || path.join(__dirname, '../../web/dist')
);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
};

async function createServer() {
  console.log(`[opschool Server] Connecting to PostgreSQL at ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}...`);
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection & run migrations
  try {
    const client = await pool.connect();
    client.release();
    console.log('[opschool Server] Connected to PostgreSQL successfully.');
  } catch (err) {
    console.error('[opschool Server] Failed to connect to PostgreSQL:', err);
    throw err;
  }

  await runPostgresMigrations(pool);
  setSchemaEnsured(true);

  const postgresDb = new PostgresD1Database(pool);
  const localStorage = new LocalStorageProvider(STORAGE_PATH);

  const env: Env = {
    DB: postgresDb as any,
    ASSETS_BUCKET: localStorage as any,
    JWT_SECRET: process.env.JWT_SECRET || 'a-very-secure-jwt-secret-with-at-least-thirty-two-chars',
    DATA_ENCRYPTION_KEY:
      process.env.DATA_ENCRYPTION_KEY ||
      'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
    BOOTSTRAP_SECRET: process.env.BOOTSTRAP_SECRET || 'troque-este-segredo',
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
    ACCESS_TOKEN_TTL_MINUTES: process.env.ACCESS_TOKEN_TTL_MINUTES || '60',
    REFRESH_TOKEN_TTL_DAYS: process.env.REFRESH_TOKEN_TTL_DAYS || '30',
    INSTITUTION_TIMEZONE: process.env.INSTITUTION_TIMEZONE || 'America/Sao_Paulo',
  };

  const hasStaticDir = fs.existsSync(STATIC_DIR);
  if (hasStaticDir) {
    console.log(`[opschool Server] Serving client SPA from: ${STATIC_DIR}`);
  } else {
    console.warn(`[opschool Server] Static directory not found at: ${STATIC_DIR} (API mode only)`);
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const reqUrl = req.url || '/';
    const parsedUrl = new URL(reqUrl, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // Check if this is an API route (respecting HTML content negotiation for public SPA routes)
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    const isPublicSpaRoute =
      pathname.startsWith('/matricula') ||
      pathname.startsWith('/portal') ||
      pathname.startsWith('/aluno') ||
      pathname.startsWith('/boletim') ||
      pathname.startsWith('/public/student') ||
      pathname.startsWith('/public/matricula');

    const isApiRoute =
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/health' ||
      pathname.startsWith('/v1/') ||
      pathname.startsWith('/auth/') ||
      pathname.startsWith('/sync/') ||
      pathname.startsWith('/public/students/') ||
      (!acceptsHtml && isPublicSpaRoute);

    if (isApiRoute) {
      try {
        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (val === undefined) continue;
          if (Array.isArray(val)) {
            for (const item of val) headers.append(key, item);
          } else {
            headers.set(key, val);
          }
        }

        let body: Buffer | undefined = undefined;
        if (!['GET', 'HEAD'].includes(method)) {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          if (chunks.length > 0) {
            body = Buffer.concat(chunks);
          }
        }

        const webRequest = new Request(parsedUrl.toString(), {
          method,
          headers,
          body,
        } as RequestInit);

        const webResponse = await worker.fetch(webRequest, env);

        const resHeaders: Record<string, string | string[]> = {};
        webResponse.headers.forEach((val, key) => {
          if (key.toLowerCase() === 'set-cookie') {
            const existing = resHeaders['set-cookie'];
            if (Array.isArray(existing)) {
              existing.push(val);
            } else if (existing) {
              resHeaders['set-cookie'] = [existing as string, val];
            } else {
              resHeaders['set-cookie'] = val;
            }
          } else {
            resHeaders[key] = val;
          }
        });

        res.writeHead(webResponse.status, resHeaders);

        const contentType = webResponse.headers.get('content-type') || '';
        if (webResponse.body) {
          if (contentType.includes('text/event-stream')) {
            Readable.fromWeb(webResponse.body as any).pipe(res);
          } else {
            const arrayBuf = await webResponse.arrayBuffer();
            res.end(Buffer.from(arrayBuf));
          }
        } else {
          res.end();
        }
      } catch (err: any) {
        console.error(`[opschool Server] Error processing ${method} ${pathname}:`, err);
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error', message: String(err) }));
        }
      }
      return;
    }

    // Static asset or SPA fallback
    if (!hasStaticDir) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
      return;
    }

    let safeRelative = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    if (safeRelative.startsWith('/') || safeRelative.startsWith('\\')) {
      safeRelative = safeRelative.slice(1);
    }
    let filePath = path.join(STATIC_DIR, safeRelative);

    let isFile = false;
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) isFile = true;
      }
    } catch {
      isFile = false;
    }

    // If direct file found, serve it with proper Cache-Control
    if (isFile) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const isServiceWorker =
        pathname === '/sw.js' ||
        pathname === '/registerSW.js' ||
        pathname.startsWith('/workbox-') ||
        safeRelative.startsWith('workbox-');
      const isHtml = ext === '.html';
      const isManifest = ext === '.webmanifest' || pathname === '/manifest.webmanifest';
      const isHashedAsset = pathname.startsWith('/assets/');

      let cacheControl: string;
      if (isServiceWorker || isHtml || isManifest) {
        // Never cache HTML, Service Worker, or Web Manifest - guarantees instant updates
        cacheControl = 'no-cache, no-store, must-revalidate, max-age=0';
      } else if (isHashedAsset) {
        // Hashed assets (e.g. /assets/index-DozSBvGC.js) are immutable
        cacheControl = 'public, max-age=31536000, immutable';
      } else {
        cacheControl = 'public, max-age=3600, must-revalidate';
      }

      res.writeHead(200, {
        'content-type': contentType,
        'cache-control': cacheControl,
        ...(isServiceWorker || isHtml ? { 'pragma': 'no-cache', 'expires': '0' } : {}),
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback: index.html (Strict no-cache to guarantee latest JS bundle hash is always served)
    const indexPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate, max-age=0',
        'pragma': 'no-cache',
        'expires': '0',
      });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(PORT, HOST, () => {
    console.log(`[opschool Server] opschool application running at http://${HOST}:${PORT}`);
  });

  const shutdown = async () => {
    console.log('[opschool Server] Shutting down gracefully...');
    server.close(() => {
      pool.end(() => {
        console.log('[opschool Server] Database pool closed. Goodbye!');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  createServer().catch((err) => {
    console.error('[opschool Server] Fatal startup error:', err);
    process.exit(1);
  });
}

export { createServer };
