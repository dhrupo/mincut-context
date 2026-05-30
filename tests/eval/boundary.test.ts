import { describe, it, expect } from 'vitest';
import { computeBoundary } from '../../eval/boundary.js';

describe('computeBoundary', () => {
  const correct = ['a.ts', 'b.ts', 'c.ts'];

  it('coverage counts correct files reachable via selection OR contract stub', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'],
      contractFiles: ['b.ts'],
      selectedTokens: 1000,
      contractTokens: 80,
      correct,
    });
    expect(r.recall).toBeCloseTo(1 / 3);            // full-body only
    expect(r.boundaryCoverage).toBeCloseTo(2 / 3);  // + signature stub
    // marginal correct-files recovered per 1k contract tokens
    expect(r.recoveredPerKToken).toBeCloseTo(((2 / 3) - (1 / 3)) / (80 / 1000));
  });

  it('recoveredPerKToken is 0 when no contract tokens were spent', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'], contractFiles: [],
      selectedTokens: 1000, contractTokens: 0, correct,
    });
    expect(r.recoveredPerKToken).toBe(0);
  });

  it('returns zeros for an empty correct set (no fabricated denominator)', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'], contractFiles: ['b.ts'],
      selectedTokens: 100, contractTokens: 50, correct: [],
    });
    expect(r.recall).toBe(0);
    expect(r.boundaryCoverage).toBe(0);
    expect(r.recoveredPerKToken).toBe(0);
  });

  it('does not double-count a correct file present in both selected and contract sets', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'], contractFiles: ['a.ts'],
      selectedTokens: 100, contractTokens: 50, correct: ['a.ts'],
    });
    expect(r.recall).toBe(1);
    expect(r.boundaryCoverage).toBe(1);
    expect(r.recoveredPerKToken).toBe(0); // contract added no new coverage
  });

  it('a correct file in neither set lowers coverage below 1', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'], contractFiles: ['b.ts'],
      selectedTokens: 100, contractTokens: 50, correct: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(r.boundaryCoverage).toBeCloseTo(2 / 3); // c.ts missed entirely
  });
});
