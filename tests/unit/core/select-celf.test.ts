import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { greedySelect } from '../../../src/core/select.js';
import { celfSelect } from '../../../src/core/select-celf.js';

/**
 * CELF must produce a *functionally equivalent* selection to greedy.
 *
 * "Equivalent" here = same selected set + same total tokens.  Tie-breaking
 * order can differ (greedy picks the first-scanned max, CELF picks whichever
 * the heap surfaces first), so we don't compare entries ordering.
 */
describe('celfSelect', () => {
  it('returns the same selected set as greedy on a tight chain', () => {
    const g = chain(5, 30);
    const ranks = new Map([
      ['n0', 0.5],
      ['n1', 0.4],
      ['n2', 0.3],
      ['n3', 0.2],
      ['n4', 0.1],
    ]);
    const g1 = greedySelect(g, { seeds: new Set(['n0']), ranks, budget: 75 });
    const c1 = celfSelect(g, { seeds: new Set(['n0']), ranks, budget: 75 });
    expect([...c1.selected].sort()).toEqual([...g1.selected].sort());
    expect(c1.tokens).toBe(g1.tokens);
  });

  it('produces the same cut cost as greedy', () => {
    const g = triangle();
    const ranks = new Map([
      ['a', 0.5],
      ['b', 0.3],
      ['c', 0.2],
    ]);
    const g1 = greedySelect(g, { seeds: new Set(['a']), ranks, budget: 25 });
    const c1 = celfSelect(g, { seeds: new Set(['a']), ranks, budget: 25 });
    expect(c1.cutCost).toBe(g1.cutCost);
  });

  it('honors the no-isolated-nodes constraint', () => {
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('attached', { tokens: 10, file: 'a', kind: 'function' });
    g.addNode('isolated', { tokens: 10, file: 'i', kind: 'function' });
    g.addEdge('seed', 'attached', { weight: 1, kind: 'call' });
    const ranks = new Map([
      ['seed', 0.5],
      ['attached', 0.3],
      ['isolated', 0.3],
    ]);
    const c = celfSelect(g, { seeds: new Set(['seed']), ranks, budget: 100 });
    expect(c.selected.has('attached')).toBe(true);
    expect(c.selected.has('isolated')).toBe(false);
  });

  it('throws when seed exceeds budget', () => {
    const g = new SymbolGraph();
    g.addNode('big', { tokens: 1000, file: 'b', kind: 'function' });
    expect(() =>
      celfSelect(g, { seeds: new Set(['big']), ranks: new Map([['big', 1]]), budget: 10 }),
    ).toThrow(/budget/i);
  });

  it('respects community boost (same as greedy)', () => {
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('same', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('other', { tokens: 10, file: 'o', kind: 'function' });
    g.addEdge('seed', 'same', { weight: 1, kind: 'call' });
    g.addEdge('seed', 'other', { weight: 1, kind: 'call' });
    const ranks = new Map([
      ['seed', 0.5],
      ['same', 0.25],
      ['other', 0.25],
    ]);
    const communities = new Map([
      ['seed', 0],
      ['same', 0],
      ['other', 1],
    ]);
    const r = celfSelect(g, {
      seeds: new Set(['seed']),
      ranks,
      budget: 25,
      communities,
      communityBoost: 1.0,
    });
    expect(r.selected.has('same')).toBe(true);
    expect(r.selected.has('other')).toBe(false);
  });
});

function triangle(): SymbolGraph {
  const g = new SymbolGraph();
  for (const id of ['a', 'b', 'c']) {
    g.addNode(id, { tokens: 10, file: id, kind: 'function' });
  }
  g.addEdge('a', 'b', { weight: 1, kind: 'call' });
  g.addEdge('b', 'c', { weight: 1, kind: 'call' });
  g.addEdge('a', 'c', { weight: 1, kind: 'call' });
  return g;
}

function chain(n: number, tokens: number): SymbolGraph {
  const g = new SymbolGraph();
  for (let i = 0; i < n; i++) {
    g.addNode(`n${i}`, { tokens, file: `n${i}`, kind: 'function' });
  }
  for (let i = 0; i < n - 1; i++) {
    g.addEdge(`n${i}`, `n${i + 1}`, { weight: 1, kind: 'call' });
  }
  return g;
}
