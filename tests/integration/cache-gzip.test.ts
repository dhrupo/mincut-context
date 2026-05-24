import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { indexRepo } from '../../src/index/builder.js';

describe('parse cache is gzip-compressed', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-gz-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    // Make the file content sizeable so gzip yields measurable savings.
    const fat = Array.from({ length: 50 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n');
    await writeFile(path.join(root, 'src/big.ts'), fat);
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('writes .json.gz files (not .json)', async () => {
    indexRepo(root, { cache: true });
    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const entries = await readdir(cacheDir);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.endsWith('.json.gz'))).toBe(true);
  });

  it('compressed entry is meaningfully smaller than the uncompressed payload', async () => {
    indexRepo(root, { cache: true });
    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const entries = await readdir(cacheDir);
    const file = path.join(cacheDir, entries[0]);
    const sz = (await stat(file)).size;
    // For our 50-statement TS file the raw cache entry is ~3-5 KB JSON;
    // gzip should comfortably fit under 2 KB.
    expect(sz).toBeLessThan(2048);
  });

  it('round-trips: warm cache hit produces the same graph as a fresh parse', async () => {
    const fresh = indexRepo(root);                  // no cache
    indexRepo(root, { cache: true });                // populate
    const warm = indexRepo(root, { cache: true });   // read
    expect(warm.graph.nodes().sort()).toEqual(fresh.graph.nodes().sort());
    expect(warm.graph.size()).toBe(fresh.graph.size());
    expect(warm.stats.cacheHits).toBeGreaterThan(0);
  });

  it('tolerates a legacy uncompressed .json entry and treats it as a miss', async () => {
    // Populate a normal cache first.
    indexRepo(root, { cache: true });
    const cacheDir = path.join(root, '.mincut-cache', 'v1');
    const entries = await readdir(cacheDir);
    const gzFile = path.join(cacheDir, entries[0]);
    // Replace .json.gz with a plain .json simulating a v1.4-era cache.
    const buf = await readFile(gzFile);
    void buf;
    const jsonFile = gzFile.replace(/\.gz$/, '');
    await writeFile(jsonFile, '{"version":"v1","path":"src/big.ts","mtimeMs":0,"size":0,"result":{"symbols":[],"imports":[],"calls":[]}}');
    await rm(gzFile);

    // Subsequent run shouldn't crash; it should treat the legacy entry as
    // a miss and re-parse + re-write as .json.gz.
    const r = indexRepo(root, { cache: true });
    expect(r.stats.cacheMisses).toBeGreaterThan(0);
  });
});
