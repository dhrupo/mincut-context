import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { indexRepo, indexRepoAsync } from '../../src/index/builder.js';

describe('parallel parsing (workers)', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-par-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    // Generate 30 small files so the worker overhead is amortized.
    for (let i = 0; i < 30; i++) {
      await writeFile(
        path.join(root, `src/mod${i}.ts`),
        `export function fn${i}(x: number) { return x + ${i}; }\n` +
          `export function helper${i}() { return ${i}; }`,
      );
    }
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('indexRepoAsync produces the same graph as indexRepo', async () => {
    const sync = indexRepo(root);
    const para = await indexRepoAsync(root, { parallel: 4 });
    expect(para.graph.nodes().sort()).toEqual(sync.graph.nodes().sort());
    expect(para.graph.size()).toBe(sync.graph.size());
    expect(para.stats.files).toBe(sync.stats.files);
  });

  it('indexRepoAsync with parallel=0 falls back to sync path', async () => {
    const para = await indexRepoAsync(root, { parallel: 0 });
    expect(para.stats.files).toBe(30);
  });

  it('indexRepoAsync honors cache when combined with parallel', async () => {
    // First run populates cache.
    await indexRepoAsync(root, { parallel: 4, cache: true });
    const second = await indexRepoAsync(root, { parallel: 4, cache: true });
    expect(second.stats.cacheHits).toBeGreaterThan(0);
  });

  it('indexRepoAsync handles a broken file gracefully', async () => {
    await writeFile(path.join(root, 'src/broken.ts'), 'function {{{ broken');
    const para = await indexRepoAsync(root, { parallel: 2 });
    // Broken file produces empty parse result; other files still indexed.
    expect(para.stats.files).toBeGreaterThan(0);
  });
});
