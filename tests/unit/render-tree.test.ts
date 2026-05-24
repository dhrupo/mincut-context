import { describe, it, expect } from 'vitest';
import { renderTree } from '../../src/adapters/cli/render.js';
import type { PackResult } from '../../src/select/pack.js';

function sample(): PackResult {
  return {
    files: [
      { path: 'src/auth/login.ts', ranges: [{ start: 1, end: 30 }], score: 0.5, tokens: 200, reasons: ['seed'] },
      { path: 'src/auth/session.ts', ranges: [{ start: 1, end: 20 }], score: 0.3, tokens: 150, reasons: ['attached'] },
      { path: 'src/db/users.ts', ranges: [{ start: 1, end: 12 }], score: 0.1, tokens: 60, reasons: ['attached'] },
      { path: 'tests/auth/login.test.ts', ranges: [{ start: 1, end: 20 }], score: 0.05, tokens: 80, reasons: ['attached'] },
    ],
    tokens: 490,
    graph: { selected: 8, frontier: 4, cutCost: 2, totalSymbols: 60 },
    explain: '',
  };
}

describe('renderTree', () => {
  it('renders a directory tree grouped by path segments', () => {
    const out = renderTree(sample(), { color: false, budget: 1000 });
    expect(out).toContain('src/');
    expect(out).toContain('auth/');
    expect(out).toContain('login.ts');
  });

  it('includes per-file token counts and scores', () => {
    const out = renderTree(sample(), { color: false, budget: 1000 });
    expect(out).toContain('200');
    expect(out).toContain('0.5');
  });

  it('aggregates token totals per directory', () => {
    const out = renderTree(sample(), { color: false, budget: 1000 });
    // src/auth/ has login (200) + session (150) = 350 tokens
    expect(out).toContain('350');
  });

  it('renders the summary footer', () => {
    const out = renderTree(sample(), { color: false, budget: 1000 });
    expect(out).toMatch(/selected.*8 symbols/);
    expect(out).toMatch(/490.*1000/);
  });

  it('handles flat single-level paths', () => {
    const flat: PackResult = {
      files: [
        { path: 'index.ts', ranges: [{ start: 1, end: 5 }], score: 0.4, tokens: 50, reasons: [] },
        { path: 'helper.ts', ranges: [{ start: 1, end: 8 }], score: 0.2, tokens: 30, reasons: [] },
      ],
      tokens: 80,
      graph: { selected: 2, frontier: 0, cutCost: 0, totalSymbols: 2 },
      explain: '',
    };
    const out = renderTree(flat, { color: false, budget: 200 });
    expect(out).toContain('index.ts');
    expect(out).toContain('helper.ts');
  });

  it('handles empty selection', () => {
    const empty: PackResult = {
      files: [],
      tokens: 0,
      graph: { selected: 0, frontier: 0, cutCost: 0, totalSymbols: 0 },
      explain: 'no symbols matched',
    };
    const out = renderTree(empty, { color: false, budget: 100 });
    expect(out).toMatch(/no.*selected|no.*matched/i);
  });
});
