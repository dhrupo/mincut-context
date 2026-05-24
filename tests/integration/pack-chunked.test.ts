import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';

describe('pack() with chunking enabled', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-chunk-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    // One huge function (~1000 tokens) and one small helper.
    const fat = Array.from({ length: 40 }, (_, i) => `  console.log('step ${i}', a += ${i});`).join('\n');
    await writeFile(
      path.join(root, 'src/runner.ts'),
      `import { helper } from './helper';
export function bigRunner() {
  let a = 0;
${fat}
  helper();
  return a;
}`,
    );
    await writeFile(
      path.join(root, 'src/helper.ts'),
      `export function helper() { return 42; }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('pack with chunking selects multiple sub-symbols from a large function', async () => {
    const r = await pack({
      task: 'big runner',
      repo: root,
      budget: 4000,
      chunk: { enabled: true, maxTokens: 100 },
    });
    const sym = r.files.find((f) => f.path === 'src/runner.ts')!;
    expect(sym).toBeDefined();
    // multiple chunks of bigRunner picked → multiple `reasons` recorded.
    expect(sym.reasons.length).toBeGreaterThan(0);
    // graph.selected counts symbols (chunks count individually).
    expect(r.graph.selected).toBeGreaterThan(2);
  });

  it('chunked symbol count exceeds non-chunked symbol count for the same file', async () => {
    const off = await pack({ task: 'big runner', repo: root, budget: 4000 });
    const on = await pack({
      task: 'big runner',
      repo: root,
      budget: 4000,
      chunk: { enabled: true, maxTokens: 100 },
    });
    expect(on.graph.totalSymbols).toBeGreaterThan(off.graph.totalSymbols);
  });

  it('respects budget — chunking does not bypass token limits', async () => {
    const r = await pack({
      task: 'big runner',
      repo: root,
      budget: 300,
      chunk: { enabled: true, maxTokens: 80 },
    });
    expect(r.tokens).toBeLessThanOrEqual(300);
  });
});
