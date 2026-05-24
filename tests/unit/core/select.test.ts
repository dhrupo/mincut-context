import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { greedySelect } from '../../../src/core/select.js';

describe('greedySelect (budget-constrained min-cut approximation)', () => {
  it('always includes the seeds', () => {
    const g = makeTriangle();
    const result = greedySelect(g, {
      seeds: new Set(['a']),
      ranks: uniformRanks(g),
      budget: 100,
    });
    expect(result.selected.has('a')).toBe(true);
  });

  it('throws when a seed alone exceeds the budget', () => {
    const g = new SymbolGraph();
    g.addNode('big', { tokens: 1000, file: 'big', kind: 'function' });
    expect(() =>
      greedySelect(g, { seeds: new Set(['big']), ranks: new Map([['big', 1]]), budget: 10 }),
    ).toThrow(/budget/i);
  });

  it('respects the token budget', () => {
    const g = makeChain(5, 30); // 5 nodes × 30 tokens each = 150 total
    const result = greedySelect(g, {
      seeds: new Set(['n0']),
      ranks: uniformRanks(g),
      budget: 75,
    });
    expect(result.tokens).toBeLessThanOrEqual(75);
    // Should fit exactly 2 nodes (60) — not 3 (90 > 75)
    expect(result.selected.size).toBe(2);
  });

  it('prefers high-rank nodes when budget is tight', () => {
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('rich', { tokens: 10, file: 'r', kind: 'function' });
    g.addNode('poor', { tokens: 10, file: 'p', kind: 'function' });
    g.addEdge('seed', 'rich', { weight: 1, kind: 'call' });
    g.addEdge('seed', 'poor', { weight: 1, kind: 'call' });

    const result = greedySelect(g, {
      seeds: new Set(['seed']),
      ranks: new Map([
        ['seed', 0.5],
        ['rich', 0.4],
        ['poor', 0.1],
      ]),
      budget: 25, // room for exactly 2 nodes after the seed
    });
    expect(result.selected.has('rich')).toBe(true);
    expect(result.selected.has('poor')).toBe(false);
  });

  it('prefers attached nodes (lower boundary cut) over disconnected ones at equal rank', () => {
    //   seed — attached
    //   floater (isolated)
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('attached', { tokens: 10, file: 'a', kind: 'function' });
    g.addNode('floater', { tokens: 10, file: 'f', kind: 'function' });
    g.addEdge('seed', 'attached', { weight: 5, kind: 'call' });

    const result = greedySelect(g, {
      seeds: new Set(['seed']),
      ranks: new Map([
        ['seed', 0.5],
        ['attached', 0.25],
        ['floater', 0.25],
      ]),
      budget: 25, // room for 1 more after seed
    });
    expect(result.selected.has('attached')).toBe(true);
    expect(result.selected.has('floater')).toBe(false);
  });

  it('reports cut cost — sum of edges crossing T → V\\T', () => {
    // a → b → c, seed=a, budget allows {a, b}.  Cut is just b→c.
    const g = makeChain(3, 10);
    const result = greedySelect(g, {
      seeds: new Set(['n0']),
      ranks: new Map([
        ['n0', 0.5],
        ['n1', 0.3],
        ['n2', 0.2],
      ]),
      budget: 25,
    });
    expect(result.selected.size).toBe(2);
    expect(result.cutCost).toBe(1); // single n1 → n2 edge of weight 1
  });

  it('returns explanation entries for each selected node', () => {
    const g = makeChain(3, 10);
    const result = greedySelect(g, {
      seeds: new Set(['n0']),
      ranks: new Map([
        ['n0', 0.5],
        ['n1', 0.3],
        ['n2', 0.2],
      ]),
      budget: 100,
    });
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].reason).toMatch(/seed/i);
    expect(result.entries[1].reason).toMatch(/attached|rank/i);
  });

  it('halts when no remaining node fits in the budget', () => {
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 's', kind: 'function' });
    g.addNode('big', { tokens: 100, file: 'b', kind: 'function' });
    g.addEdge('seed', 'big', { weight: 1, kind: 'call' });

    const result = greedySelect(g, {
      seeds: new Set(['seed']),
      ranks: new Map([
        ['seed', 0.6],
        ['big', 0.4],
      ]),
      budget: 50,
    });
    expect(result.selected.size).toBe(1);
    expect(result.selected.has('seed')).toBe(true);
  });
});

function makeTriangle(): SymbolGraph {
  const g = new SymbolGraph();
  for (const id of ['a', 'b', 'c']) {
    g.addNode(id, { tokens: 10, file: id, kind: 'function' });
  }
  g.addEdge('a', 'b', { weight: 1, kind: 'call' });
  g.addEdge('b', 'c', { weight: 1, kind: 'call' });
  g.addEdge('a', 'c', { weight: 1, kind: 'call' });
  return g;
}

function makeChain(n: number, tokens: number): SymbolGraph {
  const g = new SymbolGraph();
  for (let i = 0; i < n; i++) {
    g.addNode(`n${i}`, { tokens, file: `n${i}`, kind: 'function' });
  }
  for (let i = 0; i < n - 1; i++) {
    g.addEdge(`n${i}`, `n${i + 1}`, { weight: 1, kind: 'call' });
  }
  return g;
}

function uniformRanks(g: SymbolGraph): Map<string, number> {
  const n = g.order();
  const r = new Map<string, number>();
  for (const id of g.nodes()) r.set(id, 1 / n);
  return r;
}
