export interface BoundaryInput {
  selectedFiles: string[];
  contractFiles: string[];
  /** Selected-region token count. Passed through for runner reporting; not used in the boundary formulas. */
  selectedTokens: number;
  contractTokens: number;
  correct: string[];
}

export interface BoundaryResult {
  /** Full-body file recall (selection only). */
  recall: number;
  /** Signature-level coverage: correct files reachable via selection OR a stub. NOT full recall. */
  boundaryCoverage: number;
  /** Marginal correct files recovered by the contract, per 1000 contract tokens. */
  recoveredPerKToken: number;
  contractTokens: number;
}

export function computeBoundary(input: BoundaryInput): BoundaryResult {
  const correct = new Set(input.correct);
  const total = correct.size;
  const sel = new Set(input.selectedFiles);
  const covered = new Set([...input.selectedFiles, ...input.contractFiles]);

  let recallHits = 0;
  let coverHits = 0;
  for (const c of correct) {
    if (sel.has(c)) recallHits += 1;
    if (covered.has(c)) coverHits += 1;
  }
  const recall = total === 0 ? 0 : recallHits / total;
  const boundaryCoverage = total === 0 ? 0 : coverHits / total;
  // Invariant: covered ⊇ selected, so boundaryCoverage >= recall and the
  // numerator is always >= 0. Preserve this if you change how `covered` is built.
  const recoveredPerKToken =
    input.contractTokens > 0 ? (boundaryCoverage - recall) / (input.contractTokens / 1000) : 0;

  return { recall, boundaryCoverage, recoveredPerKToken, contractTokens: input.contractTokens };
}
