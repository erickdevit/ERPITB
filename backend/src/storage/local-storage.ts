import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface LocalStorageMetadata {
  contentType?: string;
  cacheControl?: string;
  etag?: string;
  size?: number;
  updatedAt?: string;
}

export interface LocalStorageObject {
  key: string;
  body: ReadableStream<Uint8Array> | ArrayBuffer;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  httpEtag?: string;
  size: number;
}

export interface LocalStoragePutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
}

export class LocalStorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir || process.env.STORAGE_PATH || './storage');
    // Ensure base directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(key: string): { filePath: string; metaPath: string } {
    const cleanKey = key.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.baseDir, cleanKey);
    if (!fullPath.startsWith(this.baseDir)) {
      throw new Error('Access denied: directory traversal detected.');
    }
    return {
      filePath: fullPath,
      metaPath: `${fullPath}.meta.json`,
    };
  }

  async get(key: string): Promise<LocalStorageObject | null> {
    try {
      const { filePath, metaPath } = this.resolveSafePath(key);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) {
        return null;
      }

      let meta: LocalStorageMetadata = {};
      if (fs.existsSync(metaPath)) {
        try {
          const raw = await fsp.readFile(metaPath, 'utf8');
          meta = JSON.parse(raw);
        } catch {
          // fallback to inferred
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.gif': 'image/gif',
        '.pdf': 'application/pdf',
        '.json': 'application/json',
      };

      const contentType = meta.contentType || mimeMap[ext] || 'application/octet-stream';
      const fileBuffer = await fsp.readFile(filePath);
      const etag = meta.etag || `"${crypto.createHash('md5').update(fileBuffer).digest('hex')}"`;

      return {
        key,
        body: fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
        httpMetadata: {
          contentType,
          cacheControl: meta.cacheControl || 'public, max-age=31536000, immutable',
        },
        httpEtag: etag,
        size: stat.size,
      };
    } catch (err: any) {
      if (err?.message?.includes('traversal')) {
        throw err;
      }
      console.error(`LocalStorageProvider get error for key "${key}":`, err);
      return null;
    }
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream | string,
    options?: LocalStoragePutOptions,
  ): Promise<{ key: string }> {
    const { filePath, metaPath } = this.resolveSafePath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });

    let buffer: Buffer;
    if (value instanceof Uint8Array) {
      buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof ArrayBuffer) {
      buffer = Buffer.from(value);
    } else if (typeof value === 'string') {
      buffer = Buffer.from(value, 'utf8');
    } else if (value && typeof (value as ReadableStream).getReader === 'function') {
      const reader = (value as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        if (chunk) chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } else {
      buffer = Buffer.from(String(value));
    }

    await fsp.writeFile(filePath, buffer);

    const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
    const metadata: LocalStorageMetadata = {
      contentType: options?.httpMetadata?.contentType,
      cacheControl: options?.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
      etag,
      size: buffer.length,
      updatedAt: new Date().toISOString(),
    };

    await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    return { key };
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      try {
        const { filePath, metaPath } = this.resolveSafePath(key);
        if (fs.existsSync(filePath)) await fsp.unlink(filePath);
        if (fs.existsSync(metaPath)) await fsp.unlink(metaPath);
      } catch {
        // Safe ignore
      }
    }
  }

  async head(key: string): Promise<LocalStorageObject | null> {
    return this.get(key);
  }
}
