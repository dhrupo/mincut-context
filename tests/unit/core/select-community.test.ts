import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { greedySelect } from '../../../src/core/select.js';

describe('greedySelect with community boost', () => {
  /**
   * Two equally attached candidates, but one shares a community with the
   * seed.  With communityBoost > 0, the same-community candidate must win.
   */
  it('breaks ties in favor of the same-community candidate', () => {
    const g = new SymbolGraph();
    g.addNode('seed', { tokens: 10, file: 'a', kind: 'function' });
    g.addNode('sameCommunity', { tokens: 10, file: 'a', kind: 'function' });
    g.addNode('otherCommunity', { tokens: 10, file: 'b', kind: 'function' });
    g.addEdge('seed', 'sameCommunity', { weight: 1, kind: 'call' });
    g.addEdge('seed', 'otherCommunity', { weight: 1, kind: 'call' });

    const communities = new Map([
      ['seed', 0],
      ['sameCommunity', 0],
      ['otherCommunity', 1],
    ]);

    const noBoost = greedySelect(g, {
      seeds: new Set(['seed']),
      ranks: new Map([
        ['seed', 0.5],
        ['sameCommunity', 0.25],
        ['otherCommunity', 0.25],
      ]),
      budget: 25,
      communities,
      communityBoost: 0,
    });
    // No boost: either candidate could win (deterministic by ranking).
    expect(noBoost.selected.size).toBe(2);

    const withBoost = greedySelect(g, {
      seeds: new Set(['seed']),
      ranks: new Map([
        ['seed', 0.5],
        ['sameCommunity', 0.25],
        ['otherCommunity', 0.25],
      ]),
      budget: 25,
      communities,
      communityBoost: 1.0,
    });
    expect(withBoost.selected.has('sameCommunity')).toBe(true);
    expect(withBoost.selected.has('otherCommunity')).toBe(false);
  });

  it('reports community label on each selected entry', () => {
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 10, file: '_', kind: 'function' });
    g.addNode('b', { tokens: 10, file: '_', kind: 'function' });
    g.addEdge('a', 'b', { weight: 1, kind: 'call' });

    const result = greedySelect(g, {
      seeds: new Set(['a']),
      ranks: new Map([['a', 1], ['b', 0.5]]),
      budget: 50,
      communities: new Map([['a', 7], ['b', 7]]),
    });
    for (const entry of result.entries) {
      expect(entry.community).toBe(7);
    }
  });

  it('works with no communities passed (legacy behavior preserved)', () => {
    const g = new SymbolGraph();
    g.addNode('a', { tokens: 10, file: '_', kind: 'function' });
    g.addNode('b', { tokens: 10, file: '_', kind: 'function' });
    g.addEdge('a', 'b', { weight: 1, kind: 'call' });

    const result = greedySelect(g, {
      seeds: new Set(['a']),
      ranks: new Map([['a', 1], ['b', 0.5]]),
      budget: 50,
    });
    expect(result.selected.size).toBe(2);
    expect(result.entries[0].community).toBeUndefined();
  });
});
