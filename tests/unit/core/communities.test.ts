import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { detectCommunities } from '../../../src/core/communities.js';

describe('detectCommunities (Louvain)', () => {
  it('returns one community per node for an empty/isolated graph', () => {
    const g = new SymbolGraph();
    for (const id of ['a', 'b']) g.addNode(id, { tokens: 1, file: id, kind: 'function' });
    const c = detectCommunities(g);
    expect(c.size).toBe(2);
    expect(c.get('a')).not.toBe(c.get('b'));
  });

  it('puts strongly-connected nodes in the same community', () => {
    // Tight triangle a-b-c, weakly connected to a tight triangle d-e-f.
    const g = new SymbolGraph();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      g.addNode(id, { tokens: 1, file: id, kind: 'function' });
    }
    edge(g, 'a', 'b', 5);
    edge(g, 'b', 'c', 5);
    edge(g, 'a', 'c', 5);
    edge(g, 'd', 'e', 5);
    edge(g, 'e', 'f', 5);
    edge(g, 'd', 'f', 5);
    // single weak bridge
    edge(g, 'c', 'd', 0.1);

    const c = detectCommunities(g);
    expect(c.get('a')).toBe(c.get('b'));
    expect(c.get('a')).toBe(c.get('c'));
    expect(c.get('d')).toBe(c.get('e'));
    expect(c.get('d')).toBe(c.get('f'));
    expect(c.get('a')).not.toBe(c.get('d'));
  });

  it('treats edges as undirected for community detection (call → caller membership)', () => {
    // Directed star: a → b, a → c, a → d.  All four belong to one community.
    const g = new SymbolGraph();
    for (const id of ['a', 'b', 'c', 'd']) {
      g.addNode(id, { tokens: 1, file: id, kind: 'function' });
    }
    edge(g, 'a', 'b', 1);
    edge(g, 'a', 'c', 1);
    edge(g, 'a', 'd', 1);
    const c = detectCommunities(g);
    expect(c.get('a')).toBe(c.get('b'));
    expect(c.get('a')).toBe(c.get('c'));
    expect(c.get('a')).toBe(c.get('d'));
  });

  it('is deterministic for a given seed', () => {
    const g = new SymbolGraph();
    for (let i = 0; i < 10; i++) g.addNode(`n${i}`, { tokens: 1, file: '_', kind: 'function' });
    for (let i = 0; i < 9; i++) edge(g, `n${i}`, `n${i + 1}`, 1);
    const a = detectCommunities(g, { seed: 42 });
    const b = detectCommunities(g, { seed: 42 });
    for (const id of g.nodes()) expect(a.get(id)).toBe(b.get(id));
  });
});

function edge(g: SymbolGraph, s: string, t: string, w: number): void {
  g.addEdge(s, t, { weight: w, kind: 'call' });
}
