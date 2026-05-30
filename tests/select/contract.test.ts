import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../src/core/graph.js';
import type { NodeKind } from '../../src/core/graph.js';
import { buildFrontier } from '../../src/select/contract.js';

function g(): SymbolGraph {
  const graph = new SymbolGraph();
  const n = (id: string, kind: NodeKind) =>
    graph.addNode(id, { tokens: 10, file: id.split(':')[0], kind });
  n('a.ts:foo', 'function');     // selected
  n('a.ts:bar', 'function');     // selected
  n('b.ts:dep', 'function');     // frontier (called by foo)
  n('b.ts:Type', 'interface');   // frontier (referenced by bar)
  n('c.ts:caller', 'function');  // inbound — must NOT appear
  n('a.ts', 'file');             // contains target — must NOT appear
  graph.addEdge('a.ts:foo', 'b.ts:dep', { weight: 1, kind: 'call' });
  graph.addEdge('a.ts:bar', 'b.ts:Type', { weight: 1, kind: 'reference' });
  graph.addEdge('c.ts:caller', 'a.ts:foo', { weight: 1, kind: 'call' });
  graph.addEdge('a.ts', 'a.ts:foo', { weight: 1, kind: 'contains' });
  return graph;
}

describe('buildFrontier', () => {
  const selected = new Set(['a.ts:foo', 'a.ts:bar']);

  it('includes outbound call/reference targets, with via attribution', () => {
    const f = buildFrontier(g(), selected);
    const ids = f.map((x) => x.id);
    expect(ids).toEqual(['b.ts:dep', 'b.ts:Type']);
    expect(f.find((x) => x.id === 'b.ts:dep')!.via).toEqual(['a.ts:foo']);
  });

  it('excludes inbound callers and contains targets', () => {
    const ids = buildFrontier(g(), selected).map((x) => x.id);
    expect(ids).not.toContain('c.ts:caller');
    expect(ids).not.toContain('a.ts');
  });

  it('excludes already-selected nodes', () => {
    const sel = new Set(['a.ts:foo', 'a.ts:bar', 'b.ts:dep']);
    const ids = buildFrontier(g(), sel).map((x) => x.id);
    expect(ids).not.toContain('b.ts:dep');
  });

  it('merges via attribution when two selected sources reference the same frontier node', () => {
    const graph = new SymbolGraph();
    const add = (id: string, kind: NodeKind) =>
      graph.addNode(id, { tokens: 10, file: id.split(':')[0], kind });
    add('a.ts:foo', 'function');
    add('a.ts:bar', 'function');
    add('b.ts:shared', 'function');
    graph.addEdge('a.ts:foo', 'b.ts:shared', { weight: 1, kind: 'call' });
    graph.addEdge('a.ts:bar', 'b.ts:shared', { weight: 1, kind: 'call' });
    const f = buildFrontier(graph, new Set(['a.ts:foo', 'a.ts:bar']));
    const shared = f.find((x) => x.id === 'b.ts:shared');
    expect(shared?.via).toEqual(['a.ts:bar', 'a.ts:foo']); // sorted
  });

  it('includes extends, implements, and import edges', () => {
    const graph = new SymbolGraph();
    const add = (id: string, kind: NodeKind) =>
      graph.addNode(id, { tokens: 10, file: id.split(':')[0], kind });
    add('a.ts:Child', 'class');
    add('b.ts:Base', 'class');
    add('b.ts:Iface', 'interface');
    add('b.ts:mod', 'function');
    graph.addEdge('a.ts:Child', 'b.ts:Base', { weight: 1, kind: 'extends' });
    graph.addEdge('a.ts:Child', 'b.ts:Iface', { weight: 1, kind: 'implements' });
    graph.addEdge('a.ts:Child', 'b.ts:mod', { weight: 1, kind: 'import' });
    const ids = buildFrontier(graph, new Set(['a.ts:Child'])).map((x) => x.id);
    expect(ids).toEqual(['b.ts:Base', 'b.ts:Iface', 'b.ts:mod']);
  });
});
