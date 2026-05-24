import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { resolveCallsWithLsp } from '../../../src/lsp/resolver.js';
import type { LspClient, LspDefinitionResult, LspLocation, LspPosition } from '../../../src/lsp/types.js';
import path from 'node:path';

function makeGraph(): SymbolGraph {
  const g = new SymbolGraph();
  g.addNode('src/a.ts:caller', {
    tokens: 50, file: 'src/a.ts', kind: 'function', name: 'caller',
    startLine: 3, endLine: 6,
  });
  g.addNode('src/a.ts:localHelper', {
    tokens: 30, file: 'src/a.ts', kind: 'function', name: 'localHelper',
    startLine: 10, endLine: 15,
  });
  g.addNode('src/b.ts:remoteHelper', {
    tokens: 25, file: 'src/b.ts', kind: 'function', name: 'remoteHelper',
    startLine: 1, endLine: 3,
  });
  // ambiguous: two helpers with the same name in different files
  g.addNode('src/c.ts:helper', {
    tokens: 20, file: 'src/c.ts', kind: 'function', name: 'helper',
    startLine: 1, endLine: 3,
  });
  g.addNode('src/d.ts:helper', {
    tokens: 20, file: 'src/d.ts', kind: 'function', name: 'helper',
    startLine: 1, endLine: 3,
  });
  return g;
}

function fakeLsp(map: Record<string, LspLocation[]>): LspClient {
  return {
    async initialize() {},
    async didOpen() {},
    async definition(file: string, pos: LspPosition): Promise<LspDefinitionResult> {
      const key = `${file}:${pos.line}:${pos.character}`;
      return { locations: map[key] ?? [] };
    },
    async shutdown() {},
  };
}

describe('resolveCallsWithLsp', () => {
  it('refines an unresolved call by mapping a definition Location back to a graph node', async () => {
    const g = makeGraph();
    const repo = '/abs/repo';
    // The caller is at line 5 of src/a.ts, calls helper() at col 4 of line 5.
    const callSites = [{ file: 'src/a.ts', line: 5, character: 4, toName: 'helper', from: 'src/a.ts:caller' }];
    const lsp = fakeLsp({
      'src/a.ts:4:4': [
        // 0-based line 0 of src/c.ts = startLine 1 of helper in c.
        { uri: `file://${path.join(repo, 'src/c.ts')}`, range: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } } },
      ],
    });

    const result = await resolveCallsWithLsp(g, callSites, lsp, repo);
    expect(result.resolved).toBe(1);
    expect(result.added).toBe(1);
    expect(g.hasEdge('src/a.ts:caller', 'src/c.ts:helper')).toBe(true);
    expect(g.hasEdge('src/a.ts:caller', 'src/d.ts:helper')).toBe(false);
  });

  it('does not crash when the LSP returns zero locations', async () => {
    const g = makeGraph();
    const callSites = [{ file: 'src/a.ts', line: 5, character: 4, toName: 'unknown', from: 'src/a.ts:caller' }];
    const lsp = fakeLsp({});
    const result = await resolveCallsWithLsp(g, callSites, lsp, '/abs/repo');
    expect(result.resolved).toBe(0);
    expect(result.added).toBe(0);
  });

  it('skips locations pointing outside the repo', async () => {
    const g = makeGraph();
    const callSites = [{ file: 'src/a.ts', line: 5, character: 4, toName: 'helper', from: 'src/a.ts:caller' }];
    const lsp = fakeLsp({
      'src/a.ts:4:4': [
        { uri: 'file:///external/lib/util.ts', range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } } },
      ],
    });
    const result = await resolveCallsWithLsp(g, callSites, lsp, '/abs/repo');
    expect(result.resolved).toBe(0);
  });

  it('skips locations whose target line is outside any known symbol range', async () => {
    const g = makeGraph();
    const repo = '/abs/repo';
    const callSites = [{ file: 'src/a.ts', line: 5, character: 4, toName: 'mystery', from: 'src/a.ts:caller' }];
    const lsp = fakeLsp({
      'src/a.ts:4:4': [
        // Target line 50 of src/a.ts — no symbol covers it.
        { uri: `file://${path.join(repo, 'src/a.ts')}`, range: { start: { line: 49, character: 0 }, end: { line: 49, character: 5 } } },
      ],
    });
    const result = await resolveCallsWithLsp(g, callSites, lsp, repo);
    expect(result.added).toBe(0);
  });

  it('does not double-add an edge that already exists', async () => {
    const g = makeGraph();
    const repo = '/abs/repo';
    g.addEdge('src/a.ts:caller', 'src/c.ts:helper', { weight: 1, kind: 'call' });
    const before = g.size();
    const callSites = [{ file: 'src/a.ts', line: 5, character: 4, toName: 'helper', from: 'src/a.ts:caller' }];
    const lsp = fakeLsp({
      'src/a.ts:4:4': [
        { uri: `file://${path.join(repo, 'src/c.ts')}`, range: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } } },
      ],
    });
    const result = await resolveCallsWithLsp(g, callSites, lsp, repo);
    expect(g.size()).toBe(before);
    // 'resolved' counts the successful LSP lookup; 'added' is 0 because edge existed.
    expect(result.resolved).toBe(1);
    expect(result.added).toBe(0);
  });
});
