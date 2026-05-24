import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { scoreSeeds } from '../../../src/seeds/keyword.js';

function makeGraph(items: Array<{ id: string; name: string; kind?: 'function' | 'class' | 'method' | 'variable' | 'type' | 'interface' | 'export' | 'file' }>): SymbolGraph {
  const g = new SymbolGraph();
  for (const it of items) {
    g.addNode(it.id, { tokens: 50, file: it.id.split(':')[0], kind: it.kind ?? 'function', name: it.name });
  }
  return g;
}

describe('scoreSeeds — file-path-aware', () => {
  it('matches the task against tokens in the file path (not just the symbol name)', () => {
    const g = makeGraph([
      { id: 'src/auth/login.ts:handle', name: 'handle' },
      { id: 'src/checkout/handle.ts:handle', name: 'handle' },
      { id: 'src/auth/session.ts:create', name: 'create' },
    ]);
    // Task mentions 'auth' but no symbol has 'auth' in its name.  Path token
    // matching should still surface the auth/* files.
    const seeds = scoreSeeds(g, 'auth handle', { k: 5 });
    expect(seeds.has('src/auth/login.ts:handle')).toBe(true);
    // The auth match should outrank the checkout/handle.ts since auth is
    // a sharper signal than the shared 'handle' token.
    const authScore = seeds.get('src/auth/login.ts:handle') ?? 0;
    const checkoutScore = seeds.get('src/checkout/handle.ts:handle') ?? 0;
    expect(authScore).toBeGreaterThan(checkoutScore);
  });

  it('ignores test path tokens for non-test tasks (does not promote __tests__)', () => {
    const g = makeGraph([
      { id: 'src/auth/login.ts:login', name: 'login' },
      { id: 'src/auth/__tests__/login.test.ts:login', name: 'login' },
    ]);
    const seeds = scoreSeeds(g, 'login bug', { k: 2 });
    const real = seeds.get('src/auth/login.ts:login') ?? 0;
    const test = seeds.get('src/auth/__tests__/login.test.ts:login') ?? 0;
    expect(real).toBeGreaterThan(test);
  });

  it('promotes test files for explicit test-related tasks', () => {
    const g = makeGraph([
      { id: 'src/auth/login.ts:login', name: 'login' },
      { id: 'src/auth/login.test.ts:login', name: 'login' },
    ]);
    const seeds = scoreSeeds(g, 'login test failure', { k: 2 });
    // Both should score; test file MUST be present.
    expect(seeds.has('src/auth/login.test.ts:login')).toBe(true);
  });
});

describe('scoreSeeds — kind-aware', () => {
  it('boosts function/method/class over variable when ties', () => {
    const g = makeGraph([
      { id: 'a.ts:login', name: 'login', kind: 'function' },
      { id: 'b.ts:login', name: 'login', kind: 'variable' },
    ]);
    const seeds = scoreSeeds(g, 'login', { k: 2 });
    const fn = seeds.get('a.ts:login') ?? 0;
    const v = seeds.get('b.ts:login') ?? 0;
    expect(fn).toBeGreaterThan(v);
  });
});
