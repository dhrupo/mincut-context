import type { SymbolGraph } from '../core/graph.js';
import { scoreSeeds } from './keyword.js';

export interface Embedder {
  /** Batch-embed an array of texts.  Each output Float32Array must be L2-normalized. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface HybridOptions {
  k: number;
  embedder: Embedder;
  /** 0 = keyword-only (same as scoreSeeds), 1 = embedding-only.  Default 0.5. */
  embedWeight: number;
  /**
   * Optional pool size for embedding candidates.  We embed at most this many
   * symbols (filtered by keyword score first) to keep the model call cheap.
   */
  poolSize?: number;
}

/**
 * Hybrid seed scorer.  Combines keyword IDF (from scoreSeeds) with embedding
 * cosine similarity, falling back to keyword-only if the embedder fails.
 *
 *   score(node) = (1 - w) · normalizeMax(keyword)  +  w · cosine(embed(task), embed(node))
 *
 * Embedder is dependency-injected so tests can pass a deterministic fake and
 * production can plug in @xenova/transformers without changing this module.
 */
export async function scoreSeedsHybrid(
  graph: SymbolGraph,
  task: string,
  options: HybridOptions,
): Promise<Map<string, number>> {
  const { k, embedder, embedWeight, poolSize = 200 } = options;
  if (embedWeight < 0 || embedWeight > 1) {
    throw new Error('embedWeight must be in [0, 1]');
  }
  if (graph.order() === 0) return new Map();

  // 1. Always run keyword scoring as a baseline / fallback.
  const keywordScores = scoreSeeds(graph, task, { k: Math.max(k * 4, poolSize) });
  if (embedWeight === 0) {
    return takeTop(keywordScores, k);
  }

  // 2. Build embedding candidate pool.  If keyword finds nothing, embed all
  // nodes (capped at poolSize) so the semantic path can still surface matches.
  let candidatePool: string[];
  if (keywordScores.size > 0) {
    candidatePool = [...keywordScores.keys()].slice(0, poolSize);
  } else {
    candidatePool = graph.nodes().slice(0, poolSize);
  }
  if (candidatePool.length === 0) return new Map();

  // 3. Try embeddings; on failure, return keyword-only.
  let taskVec: Float32Array;
  let nodeVecs: Float32Array[];
  const ids = candidatePool;
  try {
    const texts = ids.map((id) => describeNode(graph, id));
    const all = await embedder.embed([task, ...texts]);
    taskVec = all[0];
    nodeVecs = all.slice(1);
  } catch {
    return takeTop(keywordScores, k);
  }

  // 3. Blend scores.
  const maxKw = Math.max(...keywordScores.values(), 1e-9);
  const blended = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const kw = (keywordScores.get(id) ?? 0) / maxKw;
    const cos = cosine(taskVec, nodeVecs[i]);
    const score = (1 - embedWeight) * kw + embedWeight * cos;
    if (score > 0) blended.set(id, score);
  }

  // 4. Keyword-pool ⊇ embedding pool, so we won't drop any keyword-only hits.
  if (embedWeight < 1) {
    for (const [id, score] of keywordScores) {
      if (!blended.has(id)) blended.set(id, ((1 - embedWeight) * score) / maxKw);
    }
  }

  return takeTop(blended, k);
}

function takeTop(scores: ReadonlyMap<string, number>, k: number): Map<string, number> {
  return new Map([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, k));
}

function describeNode(graph: SymbolGraph, id: string): string {
  const data = graph.getNode(id);
  if (!data) return id;
  const parts: string[] = [];
  if (data.name) parts.push(data.name);
  parts.push(data.kind);
  parts.push(data.file);
  return parts.join(' ');
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Inputs are L2-normalized (per Embedder contract), so dot == cosine.
  return Math.max(0, Math.min(1, dot));
}
