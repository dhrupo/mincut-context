import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';
import type { Embedder } from '../../src/seeds/embedding.js';

/**
 * Deterministic embedder that maps each token to a fixed basis vector and
 * normalizes — same trick as the unit test fake.  Verifies that pack()
 * correctly threads an injected embedder all the way through the pipeline.
 */
function fakeEmbedder(dim = 32): Embedder {
  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => embedText(t, dim));
    },
  };
}

function embedText(text: string, dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)) {
    const idx = hash(word) % dim;
    v[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

describe('pack() with embedder injected', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-embed-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src/login.ts'),
      `
        export function login(u: string) { return u; }
        export function authenticate(u: string) { return u; }
      `,
    );
    await writeFile(
      path.join(root, 'src/unrelated.ts'),
      `export function totallyUnrelatedFunctionXyzqq() { return 1; }`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('threads the embedder through pack() and still respects budget', async () => {
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 500,
      embedder: fakeEmbedder(),
      embedWeight: 0.5,
    });
    expect(result.tokens).toBeLessThanOrEqual(500);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('falls back to keyword-only when embedder throws', async () => {
    const broken: Embedder = {
      async embed() {
        throw new Error('boom');
      },
    };
    const result = await pack({
      task: 'login',
      repo: root,
      budget: 500,
      embedder: broken,
      embedWeight: 0.7,
    });
    // Must not throw; must return something keyword-matched.
    expect(result.files.length).toBeGreaterThan(0);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('src/login.ts');
  });

  it('embedWeight=0 with embedder behaves like keyword-only', async () => {
    const a = await pack({
      task: 'login',
      repo: root,
      budget: 500,
      embedder: fakeEmbedder(),
      embedWeight: 0,
    });
    const b = await pack({ task: 'login', repo: root, budget: 500 });
    expect(a.files.map((f) => f.path).sort()).toEqual(b.files.map((f) => f.path).sort());
  });
});
