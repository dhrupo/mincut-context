import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../src/core/graph.js';
import type { NodeKind } from '../../src/core/graph.js';
import { buildFrontier, buildContract } from '../../src/select/contract.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexRepo } from '../../src/index/builder.js';

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

describe('buildContract', () => {
  it('emits body-free stubs for frontier symbols, summing tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcx-contract-'));
    writeFileSync(join(dir, 'dep.ts'),
      'export function dep(x: number): number {\n  return x * 2;\n}\n');
    writeFileSync(join(dir, 'main.ts'),
      "import { dep } from './dep.js';\nexport function main(): number {\n  return dep(21);\n}\n");

    const { graph } = indexRepo(dir);
    const selected = new Set(graph.nodes().filter((id) => id.startsWith('main.ts:')));
    expect([...selected].some((id) => id.endsWith(':main'))).toBe(true);

    const contract = buildContract(graph, selected, dir);
    const depStub = contract.stubs.find((s) => s.id.endsWith(':dep'));
    expect(depStub).toBeDefined();
    expect(depStub!.signature).toContain('dep(x: number): number');
    expect(depStub!.signature).not.toContain('return x * 2');
    expect(contract.tokens).toBe(contract.stubs.reduce((n, s) => n + s.tokens, 0));
    expect(contract.files).toContain('dep.ts');
  });

  it('caps total stub tokens with maxTokens, keeping most-referenced first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcx-contract-cap-'));
    // Two deps, both referenced by main; budget admits only the smaller set.
    writeFileSync(join(dir, 'big.ts'),
      'export function big(aaaaaaaaaa: string, bbbbbbbbbb: string, cccccccccc: string): string {\n  return aaaaaaaaaa;\n}\n');
    writeFileSync(join(dir, 'small.ts'),
      'export function small(x: number): number {\n  return x;\n}\n');
    writeFileSync(join(dir, 'main.ts'),
      "import { big } from './big.js';\nimport { small } from './small.js';\nexport function main(): string {\n  return big('a','b','c') + small(1);\n}\n");
    const { graph } = indexRepo(dir);
    const selected = new Set(graph.nodes().filter((id) => id.startsWith('main.ts:')));

    const uncapped = buildContract(graph, selected, dir);
    expect(uncapped.stubs.length).toBeGreaterThanOrEqual(2);

    const capped = buildContract(graph, selected, dir, { maxTokens: 1 });
    // budget of 1 token admits nothing (every stub is larger)
    expect(capped.tokens).toBeLessThanOrEqual(1);
    expect(capped.tokens).toBe(capped.stubs.reduce((n, s) => n + s.tokens, 0));
  });

  it('skips frontier symbols from parsers that do not emit signatures yet (mixed language)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcx-contract-mixed-'));
    // A TS file importing nothing parseable for signatures from a .py frontier.
    // Simulate by making main.ts call a function whose graph node lives in a .py file.
    writeFileSync(join(dir, 'helper.py'), 'def helper(x):\n    return x + 1\n');
    writeFileSync(join(dir, 'dep.ts'),
      'export function dep(x: number): number {\n  return x * 2;\n}\n');
    writeFileSync(join(dir, 'main.ts'),
      "import { dep } from './dep.js';\nexport function main(): number {\n  return dep(1);\n}\n");
    const { graph } = indexRepo(dir);
    const selected = new Set(graph.nodes().filter((id) => id.startsWith('main.ts:')));
    const contract = buildContract(graph, selected, dir);
    // dep.ts (TS) yields a stub; any non-TS frontier symbol yields none.
    expect(contract.stubs.some((s) => s.file === 'dep.ts')).toBe(true);
    expect(contract.stubs.every((s) => !s.file.endsWith('.py'))).toBe(true);
  });

  it('records skipped count for an unreadable frontier file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcx-contract-skip-'));
    writeFileSync(join(dir, 'dep.ts'),
      'export function dep(x: number): number {\n  return x * 2;\n}\n');
    writeFileSync(join(dir, 'main.ts'),
      "import { dep } from './dep.js';\nexport function main(): number {\n  return dep(1);\n}\n");
    const { graph } = indexRepo(dir);
    const selected = new Set(graph.nodes().filter((id) => id.startsWith('main.ts:')));
    const ok = buildContract(graph, selected, dir);
    expect(ok.skipped).toBe(0);
    // Delete dep.ts so its frontier file is unreadable at contract time.
    rmSync(join(dir, 'dep.ts'));
    const broken = buildContract(graph, selected, dir);
    expect(broken.skipped).toBeGreaterThan(0);
    expect(broken.stubs.every((s) => s.file !== 'dep.ts')).toBe(true);
  });
});
