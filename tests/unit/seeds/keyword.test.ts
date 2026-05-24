import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../../src/core/graph.js';
import { scoreSeeds, tokenizeTask } from '../../../src/seeds/keyword.js';

describe('tokenizeTask', () => {
  it('lowercases and splits on whitespace and punctuation', () => {
    expect(tokenizeTask('Fix login validation BUG!').sort()).toEqual([
      'bug',
      'fix',
      'login',
      'validation',
    ]);
  });

  it('splits camelCase, snake_case and kebab-case', () => {
    expect(tokenizeTask('createSession user_id stripe-checkout').sort()).toEqual([
      'checkout',
      'create',
      'id',
      'session',
      'stripe',
      'user',
    ]);
  });

  it('drops stopwords and single-character tokens', () => {
    expect(tokenizeTask('the a fix the login of').sort()).toEqual(['fix', 'login']);
  });
});

describe('scoreSeeds', () => {
  it('returns top-k symbols by combined keyword match', () => {
    const g = makeGraph([
      ['src/auth/login.ts:login', 'login'],
      ['src/auth/session.ts:createSession', 'createSession'],
      ['src/ui/dashboard.tsx:Dashboard', 'Dashboard'],
      ['src/utils/format.ts:formatDate', 'formatDate'],
    ]);
    const seeds = scoreSeeds(g, 'fix the login bug', { k: 2 });
    expect([...seeds.keys()]).toContain('src/auth/login.ts:login');
    expect(seeds.size).toBeLessThanOrEqual(2);
  });

  it('weights rare names higher than common names (IDF)', () => {
    const g = makeGraph([
      ['a.ts:login', 'login'],
      ['b.ts:login', 'login'],
      ['c.ts:login', 'login'],
      ['rare.ts:obscureThing', 'obscureThing'],
    ]);
    const seeds = scoreSeeds(g, 'login obscureThing', { k: 4 });
    const rareScore = seeds.get('rare.ts:obscureThing') ?? 0;
    const commonScore = seeds.get('a.ts:login') ?? 0;
    expect(rareScore).toBeGreaterThan(commonScore);
  });

  it('returns empty map when no tokens match any symbol', () => {
    const g = makeGraph([['a.ts:foo', 'foo']]);
    expect(scoreSeeds(g, 'nothingmatcheshere xyzqq', { k: 10 }).size).toBe(0);
  });

  it('matches camelCase pieces of symbol names', () => {
    const g = makeGraph([['s.ts:createSession', 'createSession']]);
    const seeds = scoreSeeds(g, 'session expired', { k: 5 });
    expect(seeds.has('s.ts:createSession')).toBe(true);
  });

  it('falls back gracefully when graph is empty', () => {
    expect(scoreSeeds(new SymbolGraph(), 'whatever', { k: 5 }).size).toBe(0);
  });

  it('throws when k <= 0', () => {
    const g = makeGraph([['a.ts:foo', 'foo']]);
    expect(() => scoreSeeds(g, 'foo', { k: 0 })).toThrow();
  });
});

function makeGraph(items: Array<[string, string]>): SymbolGraph {
  const g = new SymbolGraph();
  for (const [id, name] of items) {
    g.addNode(id, { tokens: 50, file: id.split(':')[0], kind: 'function', name });
  }
  return g;
}
