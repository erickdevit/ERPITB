import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../src/storage/local-storage';

describe('LocalStorageProvider', () => {
  const testDir = path.resolve(__dirname, '../.tmp-test-storage');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('stores and retrieves binary files with content type and etag', async () => {
    const storage = new LocalStorageProvider(testDir);
    const content = Buffer.from('image payload test');
    const key = 'branding/test-logo.png';

    const putRes = await storage.put(key, content, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    expect(putRes.key).toBe(key);

    const getRes = await storage.get(key);
    expect(getRes).not.toBeNull();
    expect(getRes?.key).toBe(key);
    expect(getRes?.httpMetadata?.contentType).toBe('image/png');
    expect(getRes?.httpEtag).toBeDefined();

    const readBuf = Buffer.from(getRes!.body as ArrayBuffer);
    expect(readBuf.toString('utf8')).toBe('image payload test');
  });

  it('deletes stored files and their metadata', async () => {
    const storage = new LocalStorageProvider(testDir);
    await storage.put('docs/file.txt', 'hello world');

    expect(await storage.get('docs/file.txt')).not.toBeNull();
    await storage.delete('docs/file.txt');
    expect(await storage.get('docs/file.txt')).toBeNull();
  });

  it('prevents path traversal attempts', async () => {
    const storage = new LocalStorageProvider(testDir);
    await expect(storage.get('../secret.txt')).rejects.toThrow(/traversal/i);
  });
});
