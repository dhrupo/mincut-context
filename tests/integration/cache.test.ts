import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { indexRepo } from '../../src/index/builder.js';

describe('persistent JSON parse cache', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-cache-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/a.ts'),
      `import { b } from './b';\nexport function a() { return b(); }`,
    );
    await writeFile(
      path.join(root, 'src/b.ts'),
      `export function b() { return 42; }`,
    );
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('first run writes cache entries to .mincut-cache/v1/', async () => {
    const { stats } = indexRepo(root, { cache: true });
    expect(stats.files).toBe(2);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(2);

    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const entries = await readdir(cacheDir);
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.endsWith('.json.gz'))).toBe(true);
  });

  it('second run hits cache for unchanged files (zero parses)', async () => {
    indexRepo(root, { cache: true });
    const second = indexRepo(root, { cache: true });
    expect(second.stats.cacheHits).toBe(2);
    expect(second.stats.cacheMisses).toBe(0);
  });

  it('produces identical graph from cache vs from fresh parse', async () => {
    const fresh = indexRepo(root, { cache: false });
    const cachedRun = (() => {
      indexRepo(root, { cache: true }); // populate
      return indexRepo(root, { cache: true });
    })();
    expect(cachedRun.graph.nodes().sort()).toEqual(fresh.graph.nodes().sort());
    expect(cachedRun.graph.size()).toBe(fresh.graph.size());
  });

  it('invalidates a single file when its mtime changes', async () => {
    indexRepo(root, { cache: true });

    // Modify one file — bump mtime forward to avoid filesystem mtime granularity.
    const aPath = path.join(root, 'src/a.ts');
    await writeFile(aPath, `export function a() { return 999; }`);
    const now = new Date();
    const future = new Date(now.getTime() + 5000);
    const { utimes } = await import('node:fs/promises');
    await utimes(aPath, future, future);

    const second = indexRepo(root, { cache: true });
    expect(second.stats.cacheMisses).toBe(1); // only a.ts re-parsed
    expect(second.stats.cacheHits).toBe(1);   // b.ts came from cache
  });

  it('cache: false bypasses both reading AND writing the cache', async () => {
    indexRepo(root, { cache: true }); // seed
    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const entriesBefore = (await readdir(cacheDir)).length;

    const run = indexRepo(root, { cache: false });
    expect(run.stats.cacheHits).toBe(0);
    expect(run.stats.cacheMisses).toBe(0);

    // Cache directory contents must be unchanged.
    const entriesAfter = (await readdir(cacheDir)).length;
    expect(entriesAfter).toBe(entriesBefore);
  });

  it('cache survives even if a file is deleted from the repo', async () => {
    indexRepo(root, { cache: true });
    await rm(path.join(root, 'src/b.ts'));
    const second = indexRepo(root, { cache: true });
    // Only a.ts visible now; b.ts entry in cache is stale and just unused.
    expect(second.stats.files).toBe(1);
    expect(second.graph.nodes().some((id) => id.startsWith('src/b.ts:'))).toBe(false);
  });

  it('skips cache entries with wrong schema version', async () => {
    indexRepo(root, { cache: true });

    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const files = await readdir(cacheDir);
    const target = path.join(cacheDir, files[0]);
    const { readFile, writeFile: w } = await import('node:fs/promises');
    const { gzipSync, gunzipSync } = await import('node:zlib');
    const raw = JSON.parse(gunzipSync(await readFile(target)).toString('utf8'));
    raw.version = 'v0-bogus';
    await w(target, gzipSync(Buffer.from(JSON.stringify(raw))));

    const second = indexRepo(root, { cache: true });
    expect(second.stats.cacheMisses).toBeGreaterThanOrEqual(1);
  });

  it('honors a custom cacheDir absolute path', async () => {
    const custom = await mkdtemp(path.join(tmpdir(), 'mcx-cachedir-'));
    try {
      indexRepo(root, { cache: true, cacheDir: custom });
      const entries = await readdir(path.join(custom, 'v1'));
      expect(entries.length).toBe(2);
      // Default cacheDir should NOT have been used.
      const defaultDir = path.join(root, '.mincut-cache');
      let defaultExists = false;
      try {
        await stat(defaultDir);
        defaultExists = true;
      } catch {
        defaultExists = false;
      }
      expect(defaultExists).toBe(false);
    } finally {
      await rm(custom, { recursive: true, force: true });
    }
  });
});
