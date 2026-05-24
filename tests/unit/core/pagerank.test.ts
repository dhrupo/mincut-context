import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { personalizedPageRank } from '../../../src/core/pagerank.js';

describe('personalizedPageRank', () => {
  it('returns a uniform-ish distribution over isolated nodes (no edges)', () => {
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 1, file: 'a', kind: 'function' });
    g.addNode('b', { tokens: 1, file: 'b', kind: 'function' });

    const r = personalizedPageRank(g, { seeds: new Map([['a', 1]]) });
    // With α=0.85 and no edges, seed gets the personalization mass, dangling-redistribution
    // shares the rest. Seed should still be ≥ non-seed.
    expect(r.get('a')!).toBeGreaterThanOrEqual(r.get('b')!);
    expect(approxSumToOne(r)).toBe(true);
  });

  it('biases mass toward the seed node', () => {
    const g = makeChain(5);
    const seeded = personalizedPageRank(g, { seeds: new Map([['n0', 1]]) });
    const uniform = personalizedPageRank(g, {
      seeds: new Map([
        ['n0', 0.2],
        ['n1', 0.2],
        ['n2', 0.2],
        ['n3', 0.2],
        ['n4', 0.2],
      ]),
    });
    // n0 should rank higher under personalization than under uniform restart.
    expect(seeded.get('n0')!).toBeGreaterThan(uniform.get('n0')!);
  });

  it('propagates rank along edges from seed', () => {
    // a → b → c   with seed at a.  Expect a > b > c (mass flows away from seed).
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 1, file: 'a', kind: 'function' });
    g.addNode('b', { tokens: 1, file: 'b', kind: 'function' });
    g.addNode('c', { tokens: 1, file: 'c', kind: 'function' });
    g.addEdge('a', 'b', { weight: 1, kind: 'call' });
    g.addEdge('b', 'c', { weight: 1, kind: 'call' });

    const r = personalizedPageRank(g, { seeds: new Map([['a', 1]]) });
    expect(r.get('a')!).toBeGreaterThan(r.get('b')!);
    expect(r.get('b')!).toBeGreaterThan(r.get('c')!);
  });

  it('respects edge weights (heavier edge = more rank flow)', () => {
    // a → b (weight 1)
    // a → c (weight 10)
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 1, file: 'a', kind: 'function' });
    g.addNode('b', { tokens: 1, file: 'b', kind: 'function' });
    g.addNode('c', { tokens: 1, file: 'c', kind: 'function' });
    g.addEdge('a', 'b', { weight: 1, kind: 'call' });
    g.addEdge('a', 'c', { weight: 10, kind: 'call' });

    const r = personalizedPageRank(g, { seeds: new Map([['a', 1]]) });
    expect(r.get('c')!).toBeGreaterThan(r.get('b')!);
  });

  it('normalizes seeds that do not sum to 1', () => {
    const g = makeChain(3);
    const r1 = personalizedPageRank(g, { seeds: new Map([['n0', 1]]) });
    const r2 = personalizedPageRank(g, { seeds: new Map([['n0', 42]]) });
    for (const id of ['n0', 'n1', 'n2']) {
      expect(r1.get(id)!).toBeCloseTo(r2.get(id)!, 8);
    }
  });

  it('converges (stable across extra iterations)', () => {
    const g = makeChain(10);
    const r1 = personalizedPageRank(g, {
      seeds: new Map([['n0', 1]]),
      maxIterations: 200,
      tolerance: 1e-10,
    });
    const r2 = personalizedPageRank(g, {
      seeds: new Map([['n0', 1]]),
      maxIterations: 500,
      tolerance: 1e-10,
    });
    for (const id of g.nodes()) {
      expect(r1.get(id)!).toBeCloseTo(r2.get(id)!, 8);
    }
  });

  it('throws when a seed node is not in the graph', () => {
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 1, file: 'a', kind: 'function' });
    expect(() => personalizedPageRank(g, { seeds: new Map([['missing', 1]]) })).toThrow();
  });

  it('throws when no seeds are provided (degenerates to regular PageRank — explicit error)', () => {
    const g = makeChain(3);
    expect(() => personalizedPageRank(g, { seeds: new Map() })).toThrow();
  });
});

function makeChain(n: number): SymbolGraph {
  const g = new SymbolGraph();
  for (let i = 0; i < n; i++) {
    g.addNode(`n${i}`, { tokens: 1, file: `n${i}`, kind: 'function' });
  }
  for (let i = 0; i < n - 1; i++) {
    g.addEdge(`n${i}`, `n${i + 1}`, { weight: 1, kind: 'call' });
  }
  return g;
}

function approxSumToOne(r: ReadonlyMap<string, number>): boolean {
  let sum = 0;
  for (const v of r.values()) sum += v;
  return Math.abs(sum - 1) < 1e-6;
}
