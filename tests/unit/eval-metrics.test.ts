import { describe, it, expect } from 'vitest';
import { computeMetrics, aggregate } from '../../eval/metrics.js';

describe('computeMetrics', () => {
  it('perfect recall + precision = F1 of 1', () => {
    const m = computeMetrics(
      { files: ['a.ts', 'b.ts'], tokens: 100 },
      { correct: ['a.ts', 'b.ts'] },
    );
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
  });

  it('extra noise lowers precision', () => {
    const m = computeMetrics(
      { files: ['a.ts', 'b.ts', 'noise.ts'], tokens: 150 },
      { correct: ['a.ts', 'b.ts'] },
    );
    expect(m.recall).toBe(1);
    expect(m.precision).toBeCloseTo(2 / 3, 5);
    expect(m.f1).toBeGreaterThan(0);
    expect(m.f1).toBeLessThan(1);
  });

  it('missing a correct file lowers recall', () => {
    const m = computeMetrics(
      { files: ['a.ts'], tokens: 50 },
      { correct: ['a.ts', 'b.ts'] },
    );
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0.5);
  });

  it('empty retrieval yields zero precision and zero recall', () => {
    const m = computeMetrics({ files: [], tokens: 0 }, { correct: ['a.ts'] });
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });

  it('counts nice-to-have files separately', () => {
    const m = computeMetrics(
      { files: ['a.ts', 'b.ts', 'tests/a.test.ts'], tokens: 100 },
      { correct: ['a.ts', 'b.ts'], niceToHave: ['tests/a.test.ts'] },
    );
    expect(m.niceToHaveRecall).toBe(1);
  });

  it('tokenEfficiency = recall × 1000 / tokens', () => {
    const m = computeMetrics(
      { files: ['a.ts', 'b.ts'], tokens: 500 },
      { correct: ['a.ts', 'b.ts'] },
    );
    expect(m.tokenEfficiency).toBeCloseTo(2, 5); // 1.0 recall * 1000 / 500
  });

  it('aggregate averages each metric across tasks', () => {
    const a = computeMetrics({ files: ['x'], tokens: 100 }, { correct: ['x'] });
    const b = computeMetrics({ files: ['y'], tokens: 100 }, { correct: ['x', 'y'] });
    const avg = aggregate([a, b]);
    expect(avg.precision).toBeCloseTo(1, 5); // both 1.0
    expect(avg.recall).toBeCloseTo(0.75, 5); // 1.0 + 0.5 / 2
    expect(avg.hits).toBe(2);
    expect(avg.correctTotal).toBe(3);
  });

  it('aggregate of empty list returns zeros', () => {
    const avg = aggregate([]);
    expect(avg.precision).toBe(0);
    expect(avg.recall).toBe(0);
    expect(avg.f1).toBe(0);
  });
});
