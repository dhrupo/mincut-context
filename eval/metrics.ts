/**
 * Information-retrieval metrics for evaluating a context selector against a
 * labeled "correct files" set.
 *
 * Vocabulary:
 *   - retrieved : the files the selector returned (top-k or whatever it chose)
 *   - correct   : the labeled ground-truth files for the task
 *   - precision : fraction of retrieved that were correct
 *   - recall    : fraction of correct that were retrieved
 *   - F1        : harmonic mean — penalizes lopsided trade-offs
 *   - tokenEff  : recall per 1000 tokens — how much signal per token spent
 */

export interface Retrieval {
  files: string[];
  tokens: number;
}

export interface Ground {
  correct: string[];
  niceToHave?: string[];
}

export interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  /** Fraction of nice-to-have files included (0..1). */
  niceToHaveRecall: number;
  /** Recall normalized per 1000 tokens — higher = more efficient. */
  tokenEfficiency: number;
  /** Raw counts for debugging. */
  retrieved: number;
  correctTotal: number;
  hits: number;
}

export function computeMetrics(retrieval: Retrieval, ground: Ground): Metrics {
  const retrievedSet = new Set(retrieval.files);
  const correctSet = new Set(ground.correct);
  const niceSet = new Set(ground.niceToHave ?? []);

  let hits = 0;
  for (const c of correctSet) if (retrievedSet.has(c)) hits += 1;
  let niceHits = 0;
  for (const n of niceSet) if (retrievedSet.has(n)) niceHits += 1;

  const precision = retrievedSet.size === 0 ? 0 : hits / retrievedSet.size;
  const recall = correctSet.size === 0 ? 0 : hits / correctSet.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const niceToHaveRecall = niceSet.size === 0 ? 0 : niceHits / niceSet.size;
  const tokenEfficiency = retrieval.tokens === 0 ? 0 : (recall * 1000) / retrieval.tokens;

  return {
    precision,
    recall,
    f1,
    niceToHaveRecall,
    tokenEfficiency,
    retrieved: retrievedSet.size,
    correctTotal: correctSet.size,
    hits,
  };
}

/** Average each metric across a list of per-task results. */
export function aggregate(perTask: Metrics[]): Metrics {
  if (perTask.length === 0) {
    return {
      precision: 0,
      recall: 0,
      f1: 0,
      niceToHaveRecall: 0,
      tokenEfficiency: 0,
      retrieved: 0,
      correctTotal: 0,
      hits: 0,
    };
  }
  const sum = perTask.reduce<Metrics>(
    (acc, m) => ({
      precision: acc.precision + m.precision,
      recall: acc.recall + m.recall,
      f1: acc.f1 + m.f1,
      niceToHaveRecall: acc.niceToHaveRecall + m.niceToHaveRecall,
      tokenEfficiency: acc.tokenEfficiency + m.tokenEfficiency,
      retrieved: acc.retrieved + m.retrieved,
      correctTotal: acc.correctTotal + m.correctTotal,
      hits: acc.hits + m.hits,
    }),
    { precision: 0, recall: 0, f1: 0, niceToHaveRecall: 0, tokenEfficiency: 0, retrieved: 0, correctTotal: 0, hits: 0 },
  );
  const n = perTask.length;
  return {
    precision: sum.precision / n,
    recall: sum.recall / n,
    f1: sum.f1 / n,
    niceToHaveRecall: sum.niceToHaveRecall / n,
    tokenEfficiency: sum.tokenEfficiency / n,
    retrieved: sum.retrieved,
    correctTotal: sum.correctTotal,
    hits: sum.hits,
  };
}
