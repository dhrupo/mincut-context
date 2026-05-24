import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';

describe('SymbolGraph', () => {
  describe('node operations', () => {
    it('adds a node and retrieves its data', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 100, file: 'a.ts', kind: 'function' });
      expect(g.hasNode('a')).toBe(true);
      expect(g.getNode('a')).toEqual({ tokens: 100, file: 'a.ts', kind: 'function' });
    });

    it('returns undefined for missing node', () => {
      const g = new SymbolGraph();
      expect(g.getNode('missing')).toBeUndefined();
      expect(g.hasNode('missing')).toBe(false);
    });

    it('throws when adding duplicate node', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      expect(() => g.addNode('a', { tokens: 2, file: 'a.ts', kind: 'function' })).toThrow();
    });

    it('lists all node ids', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      g.addNode('b', { tokens: 1, file: 'b.ts', kind: 'function' });
      expect(g.nodes().sort()).toEqual(['a', 'b']);
    });
  });

  describe('edge operations', () => {
    it('adds a directed weighted edge', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      g.addNode('b', { tokens: 1, file: 'b.ts', kind: 'function' });
      g.addEdge('a', 'b', { weight: 2.5, kind: 'call' });
      expect(g.hasEdge('a', 'b')).toBe(true);
      expect(g.hasEdge('b', 'a')).toBe(false);
      expect(g.getEdge('a', 'b')?.weight).toBe(2.5);
    });

    it('accumulates weight on duplicate edges', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      g.addNode('b', { tokens: 1, file: 'b.ts', kind: 'function' });
      g.addEdge('a', 'b', { weight: 1, kind: 'call' });
      g.addEdge('a', 'b', { weight: 2, kind: 'call' });
      expect(g.getEdge('a', 'b')?.weight).toBe(3);
    });

    it('throws when edge endpoint is missing', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      expect(() => g.addEdge('a', 'missing', { weight: 1, kind: 'call' })).toThrow();
    });
  });

  describe('adjacency', () => {
    it('returns outgoing neighbors', () => {
      const g = makeTriangle();
      expect(g.outNeighbors('a').sort()).toEqual(['b', 'c']);
    });

    it('returns incoming neighbors', () => {
      const g = makeTriangle();
      expect(g.inNeighbors('c').sort()).toEqual(['a', 'b']);
    });

    it('treats undirected neighbors as union', () => {
      const g = makeTriangle();
      expect(g.neighbors('b').sort()).toEqual(['a', 'c']);
    });

    it('iterates outgoing edges with data', () => {
      const g = makeTriangle();
      const edges = [...g.outEdges('a')];
      expect(edges).toHaveLength(2);
      expect(edges.map((e) => e.target).sort()).toEqual(['b', 'c']);
    });
  });

  describe('boundary cut cost', () => {
    it('counts edges crossing the cut', () => {
      const g = makeTriangle();
      // T = {a, b}, V\T = {c}.  Edges a→c and b→c both cross.
      expect(g.cutCost(new Set(['a', 'b']))).toBeCloseTo(2 * 1.0);
    });

    it('returns zero when T = V', () => {
      const g = makeTriangle();
      expect(g.cutCost(new Set(['a', 'b', 'c']))).toBe(0);
    });

    it('returns zero when T is empty', () => {
      const g = makeTriangle();
      expect(g.cutCost(new Set())).toBe(0);
    });

    it('weights edges by their weight', () => {
      const g = new SymbolGraph();
      g.addNode('a', { tokens: 1, file: 'a.ts', kind: 'function' });
      g.addNode('b', { tokens: 1, file: 'b.ts', kind: 'function' });
      g.addEdge('a', 'b', { weight: 7, kind: 'call' });
      expect(g.cutCost(new Set(['a']))).toBe(7);
    });
  });

  describe('order/size', () => {
    it('reports order (nodes) and size (edges)', () => {
      const g = makeTriangle();
      expect(g.order()).toBe(3);
      expect(g.size()).toBe(3);
    });
  });
});

function makeTriangle(): SymbolGraph {
  // a → b, b → c, a → c   (weights all 1)
  const g = new SymbolGraph();
  for (const id of ['a', 'b', 'c']) {
    g.addNode(id, { tokens: 1, file: `${id}.ts`, kind: 'function' });
  }
  g.addEdge('a', 'b', { weight: 1, kind: 'call' });
  g.addEdge('b', 'c', { weight: 1, kind: 'call' });
  g.addEdge('a', 'c', { weight: 1, kind: 'call' });
  return g;
}
