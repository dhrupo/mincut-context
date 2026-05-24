import { greedySelect, personalizedPageRank } from '../core/index.js';
import type { SymbolGraph } from '../core/index.js';
import { indexRepo } from '../index/builder.js';
import type { WalkOptions } from '../index/walker.js';
import { scoreSeeds } from '../seeds/keyword.js';
import { scoreSeedsHybrid, type Embedder } from '../seeds/embedding.js';

export interface PackOptions {
  task: string;
  repo: string;
  budget: number;
  /** Top-k seeds derived from the task.  Default 8. */
  seeds?: number;
  /** PageRank damping factor.  Default 0.85. */
  alpha?: number;
  /** Walk include patterns. */
  include?: string[];
  /** Walk exclude patterns. */
  exclude?: string[];
  /**
   * Optional embedder for hybrid (semantic) seed scoring.
   * If omitted, pure keyword/IDF seeding is used.
   */
  embedder?: Embedder;
  /**
   * 0 = keyword-only (default if no embedder), 1 = embedding-only.
   * Honored only when `embedder` is provided.  Default 0.5.
   */
  embedWeight?: number;
  /** Enable persistent on-disk parse cache. Default false. */
  cache?: boolean;
  /** Override cache directory. */
  cacheDir?: string;
}

export interface FileRange {
  start: number;
  end: number;
}

export interface PackedFile {
  path: string;
  ranges: FileRange[];
  score: number;          // sum of rank scores for the selected nodes in this file
  tokens: number;
  reasons: string[];
}

export interface PackResult {
  files: PackedFile[];
  tokens: number;
  graph: {
    selected: number;
    frontier: number;
    cutCost: number;
    totalSymbols: number;
  };
  explain: string;
}

export async function pack(options: PackOptions): Promise<PackResult> {
  const {
    task,
    repo,
    budget,
    seeds = 8,
    alpha = 0.85,
    include,
    exclude,
    embedder,
    embedWeight = 0.5,
    cache,
    cacheDir,
  } = options;
  if (budget <= 0) throw new Error('budget must be positive');

  const walkOpts: WalkOptions = { include, exclude };
  const { graph, stats } = indexRepo(repo, { ...walkOpts, cache, cacheDir });

  if (graph.order() === 0) {
    return emptyResult('No supported source files found.', stats.symbols);
  }

  const seedMap = embedder
    ? await scoreSeedsHybrid(graph, task, { k: seeds, embedder, embedWeight })
    : scoreSeeds(graph, task, { k: seeds });
  if (seedMap.size === 0) {
    return emptyResult(`No symbols matched the task “${task}”.`, stats.symbols);
  }

  // Drop seeds (lowest-scored first) until the cumulative token cost fits the
  // budget — otherwise greedySelect would refuse the seed set outright.
  const seedsByScore = [...seedMap.entries()].sort((a, b) => b[1] - a[1]);
  const fittedSeeds = new Map<string, number>();
  let seedTokens = 0;
  for (const [id, score] of seedsByScore) {
    const n = graph.getNode(id);
    if (!n) continue;
    if (seedTokens + n.tokens > budget) continue;
    fittedSeeds.set(id, score);
    seedTokens += n.tokens;
  }
  if (fittedSeeds.size === 0) {
    return emptyResult(
      `All matching symbols exceed the budget of ${budget} tokens. Try increasing --budget.`,
      stats.symbols,
    );
  }

  const ranks = personalizedPageRank(graph, { seeds: fittedSeeds, alpha });
  const selection = greedySelect(graph, {
    seeds: new Set(fittedSeeds.keys()),
    ranks,
    budget,
  });

  // Group selected nodes by file and collapse to line ranges.
  type Acc = { ranges: FileRange[]; score: number; tokens: number; reasons: string[] };
  const byFile = new Map<string, Acc>();
  for (const entry of selection.entries) {
    const data = graph.getNode(entry.id);
    if (!data) continue;
    const file = data.file;
    const acc = byFile.get(file) ?? { ranges: [], score: 0, tokens: 0, reasons: [] };
    if (data.startLine && data.endLine) {
      acc.ranges.push({ start: data.startLine, end: data.endLine });
    }
    acc.score += entry.rank;
    acc.tokens += entry.tokens;
    acc.reasons.push(entry.reason);
    byFile.set(file, acc);
  }

  const files: PackedFile[] = [];
  for (const [path, acc] of byFile) {
    files.push({
      path,
      ranges: mergeRanges(acc.ranges),
      score: acc.score,
      tokens: acc.tokens,
      reasons: dedupe(acc.reasons),
    });
  }
  files.sort((a, b) => b.score - a.score);

  return {
    files,
    tokens: selection.tokens,
    graph: {
      selected: selection.selected.size,
      frontier: frontierCount(graph, selection.selected),
      cutCost: selection.cutCost,
      totalSymbols: stats.symbols,
    },
    explain: buildExplain(task, fittedSeeds, selection, files, budget, stats.files),
  };
}

function mergeRanges(ranges: FileRange[]): FileRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: FileRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function dedupe(strings: string[]): string[] {
  return [...new Set(strings)];
}

function frontierCount(graph: SymbolGraph, t: ReadonlySet<string>): number {
  const frontier = new Set<string>();
  for (const id of t) {
    for (const e of graph.outEdges(id)) {
      if (!t.has(e.target)) frontier.add(e.target);
    }
    for (const e of graph.inEdges(id)) {
      if (!t.has(e.target)) frontier.add(e.target);
    }
  }
  return frontier.size;
}

function emptyResult(reason: string, totalSymbols: number): PackResult {
  return {
    files: [],
    tokens: 0,
    graph: { selected: 0, frontier: 0, cutCost: 0, totalSymbols },
    explain: reason,
  };
}

function buildExplain(
  task: string,
  seeds: ReadonlyMap<string, number>,
  selection: { selected: Set<string>; tokens: number; cutCost: number },
  files: PackedFile[],
  budget: number,
  fileCount: number,
): string {
  const lines: string[] = [];
  lines.push(`task: "${task}"`);
  lines.push(`indexed ${fileCount} source files`);
  lines.push(`seeded ${seeds.size} symbol${seeds.size === 1 ? '' : 's'}:`);
  for (const [id, score] of [...seeds].slice(0, 5)) {
    lines.push(`  · ${id}  (seed-score ${score.toFixed(3)})`);
  }
  lines.push(
    `selected ${selection.selected.size} symbols across ${files.length} files` +
      ` (${selection.tokens} / ${budget} tokens, cut cost ${selection.cutCost.toFixed(1)})`,
  );
  return lines.join('\n');
}
