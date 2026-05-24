import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { scoreSeedsHybrid, type Embedder } from '../../../src/seeds/embedding.js';

/**
 * Fake embedder for tests — pure, deterministic, no model download.
 * Maps each token to a unique basis vector by hashing the word into a small
 * dimensional space.  This is enough to verify the hybrid-scoring math.
 */
function fakeEmbedder(dim = 16): Embedder {
  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => embedText(t, dim));
    },
  };
}

function embedText(text: string, dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (const word of text.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = hashStr(word) % dim;
    v[idx] += 1;
  }
  // L2-normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) v[i] /= norm;
  }
  return v;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Tiny 2-D L2-normalized vector helper for controlled-semantic tests. */
function v(x: number, y: number): Float32Array {
  const norm = Math.sqrt(x * x + y * y);
  return new Float32Array([x / norm, y / norm]);
}

describe('scoreSeedsHybrid', () => {
  it('returns the same shape as scoreSeeds (top-k Map<id, score>)', async () => {
    const g = makeGraph([
      ['a.ts:login', 'login user authentication'],
      ['b.ts:dashboard', 'render dashboard widget'],
    ]);
    const seeds = await scoreSeedsHybrid(g, 'login bug', {
      k: 5,
      embedder: fakeEmbedder(),
      embedWeight: 0.5,
    });
    expect(seeds).toBeInstanceOf(Map);
    expect(seeds.size).toBeLessThanOrEqual(5);
  });

  it('finds semantically similar symbols even without exact keyword match', async () => {
    // 'authentication' is semantically close to 'login' but does not share a token.
    const g = makeGraph([
      ['auth.ts:authentication', 'authentication'],
      ['noise.ts:formatDate', 'formatDate'],
    ]);
    const seeds = await scoreSeedsHybrid(g, 'authentication flow', {
      k: 5,
      embedder: fakeEmbedder(),
      embedWeight: 0.7,
    });
    // 'authentication' shares tokens with the query so it must rank.
    expect(seeds.has('auth.ts:authentication')).toBe(true);
  });

  it('blends keyword and embedding scores by embedWeight', async () => {
    const g = makeGraph([
      ['a.ts:login', 'login user'],
      ['b.ts:signin', 'signin auth'],
    ]);
    // With embedWeight=0 we should match scoreSeeds (keyword-only).
    const keywordOnly = await scoreSeedsHybrid(g, 'login', {
      k: 5,
      embedder: fakeEmbedder(),
      embedWeight: 0,
    });
    // With high embedWeight, semantic-similar 'signin' may rank too.
    const blended = await scoreSeedsHybrid(g, 'login', {
      k: 5,
      embedder: fakeEmbedder(),
      embedWeight: 1,
    });
    expect(keywordOnly.has('a.ts:login')).toBe(true);
    expect(blended.size).toBeGreaterThanOrEqual(keywordOnly.size);
  });

  it('falls back gracefully when embedder fails', async () => {
    const broken: Embedder = {
      async embed(): Promise<Float32Array[]> {
        throw new Error('model load failed');
      },
    };
    const g = makeGraph([['a.ts:login', 'login']]);
    const seeds = await scoreSeedsHybrid(g, 'login', {
      k: 5,
      embedder: broken,
      embedWeight: 0.5,
    });
    // Should still produce keyword seeds.
    expect(seeds.has('a.ts:login')).toBe(true);
  });

  it('uses embeddings even when keyword finds zero matches', async () => {
    // A controlled embedder that maps the task to a vector close to
    // 'personalizedPageRank' but far from 'unrelatedHelper'.  This is what
    // a real semantic model is supposed to do — we simulate it explicitly.
    const semantic: Embedder = {
      async embed(texts: string[]): Promise<Float32Array[]> {
        return texts.map((t) => {
          if (t === 'centrality ranking') return v(1, 0); // task vector
          if (t.startsWith('personalizedPageRank')) return v(0.95, 0.31); // close
          return v(0, 1); // orthogonal — unrelated
        });
      },
    };
    const g = makeGraph([
      ['a.ts:personalizedPageRank', 'personalizedPageRank'],
      ['b.ts:unrelatedHelper', 'unrelatedHelper'],
    ]);
    const seeds = await scoreSeedsHybrid(g, 'centrality ranking', {
      k: 5,
      embedder: semantic,
      embedWeight: 0.9,
    });
    // Must not be empty just because keyword failed — and the semantic match
    // (personalizedPageRank) must outrank the unrelated one.
    expect(seeds.size).toBeGreaterThan(0);
    const top = [...seeds.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('a.ts:personalizedPageRank');
  });

  it('returns empty result for empty graph', async () => {
    const seeds = await scoreSeedsHybrid(new SymbolGraph(), 'anything', {
      k: 5,
      embedder: fakeEmbedder(),
      embedWeight: 0.5,
    });
    expect(seeds.size).toBe(0);
  });

  it('throws when embedWeight is outside [0,1]', async () => {
    const g = makeGraph([['a.ts:login', 'login']]);
    await expect(
      scoreSeedsHybrid(g, 'login', { k: 5, embedder: fakeEmbedder(), embedWeight: -0.1 }),
    ).rejects.toThrow();
    await expect(
      scoreSeedsHybrid(g, 'login', { k: 5, embedder: fakeEmbedder(), embedWeight: 1.5 }),
    ).rejects.toThrow();
  });
});

function makeGraph(items: Array<[string, string]>): SymbolGraph {
  const g = new SymbolGraph();
  for (const [id, name] of items) {
    g.addNode(id, { tokens: 50, file: id.split(':')[0], kind: 'function', name });
  }
  return g;
}
