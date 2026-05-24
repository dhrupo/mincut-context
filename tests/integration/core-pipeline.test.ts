import { describe, it, expect } from 'vitest';
import { SymbolGraph, personalizedPageRank, greedySelect } from '../../src/core/index.js';

/**
 * End-to-end synthetic test: prove that the core algorithm pipeline
 *
 *      graph → personalized PageRank → greedy min-cut
 *
 * actually selects task-relevant context from a realistic-shape repo graph.
 *
 * Synthetic repo layout:
 *
 *      auth/login.ts        ←──── seed (matches "login")
 *      auth/session.ts          (called by login)
 *      auth/validators.ts       (called by login)
 *      db/users.ts              (called by session)
 *      db/pool.ts               (called by users)
 *      ui/dashboard.tsx         (unrelated UI)
 *      ui/profile.tsx           (unrelated UI)
 *      utils/format.ts          (helper, used by dashboard)
 */
describe('core pipeline (end-to-end synthetic)', () => {
  it('selects auth nodes for an auth-related task, excludes UI', () => {
    const g = buildSyntheticGraph();
    const seeds = new Map([['auth/login.ts:login', 1]]);
    const ranks = personalizedPageRank(g, { seeds });

    const result = greedySelect(g, {
      seeds: new Set(seeds.keys()),
      ranks,
      budget: 300,
    });

    const selectedFiles = [...result.selected].map((id) => id.split(':')[0]);
    const fileSet = new Set(selectedFiles);

    // Should include the auth cluster.
    expect(fileSet.has('auth/login.ts')).toBe(true);
    expect(fileSet.has('auth/session.ts')).toBe(true);

    // Should NOT include unrelated UI.
    expect(fileSet.has('ui/dashboard.tsx')).toBe(false);
    expect(fileSet.has('ui/profile.tsx')).toBe(false);
  });

  it('respects a tight budget', () => {
    const g = buildSyntheticGraph();
    const seeds = new Map([['auth/login.ts:login', 1]]);
    const ranks = personalizedPageRank(g, { seeds });

    const result = greedySelect(g, {
      seeds: new Set(seeds.keys()),
      ranks,
      budget: 100,
    });

    expect(result.tokens).toBeLessThanOrEqual(100);
    // At least the seed must be present.
    expect(result.selected.has('auth/login.ts:login')).toBe(true);
  });

  it('produces a cohesive selection (low cut cost)', () => {
    const g = buildSyntheticGraph();
    const seeds = new Map([['auth/login.ts:login', 1]]);
    const ranks = personalizedPageRank(g, { seeds });
    const result = greedySelect(g, {
      seeds: new Set(seeds.keys()),
      ranks,
      budget: 300,
    });

    // Cut cost should be small relative to total edge weight in selection.
    let internalWeight = 0;
    for (const id of result.selected) {
      for (const e of g.outEdges(id)) {
        if (result.selected.has(e.target)) internalWeight += e.data.weight;
      }
    }
    expect(result.cutCost).toBeLessThan(internalWeight);
  });

  it('selection scales rank-mass within the budget', () => {
    const g = buildSyntheticGraph();
    const seeds = new Map([['auth/login.ts:login', 1]]);
    const ranks = personalizedPageRank(g, { seeds });

    const tight = greedySelect(g, { seeds: new Set(seeds.keys()), ranks, budget: 100 });
    const loose = greedySelect(g, { seeds: new Set(seeds.keys()), ranks, budget: 500 });

    const massOf = (s: ReadonlySet<string>): number =>
      [...s].reduce((sum, id) => sum + (ranks.get(id) ?? 0), 0);

    expect(massOf(loose.selected)).toBeGreaterThanOrEqual(massOf(tight.selected));
  });
});

function buildSyntheticGraph(): SymbolGraph {
  const g = new SymbolGraph();
  const nodes: Array<[string, number]> = [
    ['auth/login.ts:login', 80],
    ['auth/session.ts:createSession', 60],
    ['auth/validators.ts:validate', 50],
    ['db/users.ts:findUser', 70],
    ['db/pool.ts:getConnection', 40],
    ['ui/dashboard.tsx:Dashboard', 120],
    ['ui/profile.tsx:Profile', 90],
    ['utils/format.ts:formatDate', 30],
  ];
  for (const [id, tokens] of nodes) {
    g.addNode(id, { tokens, file: id.split(':')[0], kind: 'function' });
  }
  // Auth-cluster edges (high cohesion).
  edge(g, 'auth/login.ts:login', 'auth/session.ts:createSession', 3);
  edge(g, 'auth/login.ts:login', 'auth/validators.ts:validate', 2);
  edge(g, 'auth/session.ts:createSession', 'db/users.ts:findUser', 2);
  edge(g, 'db/users.ts:findUser', 'db/pool.ts:getConnection', 1);
  // UI-cluster edges (separate component).
  edge(g, 'ui/dashboard.tsx:Dashboard', 'ui/profile.tsx:Profile', 1);
  edge(g, 'ui/dashboard.tsx:Dashboard', 'utils/format.ts:formatDate', 1);
  // Single weak bridge from UI → auth (so it's connected but far).
  edge(g, 'ui/dashboard.tsx:Dashboard', 'auth/session.ts:createSession', 0.1);
  return g;
}

function edge(g: SymbolGraph, src: string, dst: string, weight: number): void {
  g.addEdge(src, dst, { weight, kind: 'call' });
}
