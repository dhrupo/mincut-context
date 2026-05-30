import { detectCommunities, greedySelect, personalizedPageRank } from '../core/index.js';
import type { SymbolGraph } from '../core/index.js';
import { indexRepo, indexRepoAsync } from '../index/builder.js';
import type { LspClient } from '../lsp/types.js';
import { resolveCallsWithLsp, type CallSite } from '../lsp/resolver.js';
import type { WalkOptions } from '../index/walker.js';
import { scoreSeeds } from '../seeds/keyword.js';
import { scoreSeedsHybrid, type Embedder } from '../seeds/embedding.js';
import { buildContract, type Contract, type ContractOptions } from './contract.js';
export type { Contract, ContractStub, ContractOptions } from './contract.js';

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
  /**
   * Multiplicative boost for selecting nodes that share a Louvain community
   * with any seed.  Default 0.5.  Set to 0 to disable the boost entirely.
   */
  communityBoost?: number;
  /** Include `trace` field in PackResult with algorithm internals. Default false. */
  verbose?: boolean;
  /** Worker count for parallel parsing. 0 (default) = sequential. */
  parallel?: number;
  /**
   * Split large functions into per-statement chunks (TS/JS/Vue only).
   * Pass { enabled: true, maxTokens: 400 } to opt in.
   */
  chunk?: { enabled: boolean; maxTokens: number };
  /**
   * Drop trailing files whose score is below (trimScoreRatio × top-file's score).
   * Defaults to 0.02 (drop files whose score is < 2% of the strongest file).
   * Pass 0 to disable.
   */
  trimScoreRatio?: number;
  /**
   * Optional LSP client used to refine call edges via textDocument/definition.
   * When provided, ambiguous syntactic name matches get upgraded to
   * type-resolved edges where the language server has a definite answer.
   * If the LSP errors out, the pack silently falls back to syntactic-only.
   */
  lspClient?: LspClient;
  /**
   * Emit a typed-handoff contract: body-free signature stubs for the selected
   * region's outbound dependency frontier. `true` = uncapped; pass
   * `{ maxTokens }` to bound it. Default off.
   */
  contract?: boolean | ContractOptions;
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
  /** Louvain community labels touched by nodes selected from this file. */
  communities?: number[];
}

export interface PackTrace {
  seeds: Array<{ id: string; score: number }>;
  topRanked: Array<{ id: string; rank: number }>;
  selectionOrder: Array<{ id: string; reason: string; tokens: number; rank: number }>;
  timings: { indexMs: number; rankMs: number; selectMs: number; totalMs: number };
  cache?: { hits: number; misses: number };
  lsp?: { resolved: number; added: number };
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
  /** Present only when options.verbose was true. */
  trace?: PackTrace;
  /**
   * Present only when options.contract was set. Note: `graph.frontier` counts
   * ALL cut-boundary symbols (inbound + outbound, every edge kind), whereas the
   * contract covers only the region's OUTBOUND type-dependency frontier
   * (`contract.stubs.length + contract.skipped`). The two numbers are not
   * expected to match.
   */
  contract?: Contract;
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
    communityBoost = 0.5,
    verbose = false,
    parallel = 0,
    chunk,
    lspClient,
    trimScoreRatio = 0.02,
    contract,
  } = options;
  if (budget <= 0) throw new Error('budget must be positive');

  const t0 = Date.now();
  const walkOpts: WalkOptions = { include, exclude };
  const indexed =
    parallel > 0
      ? await indexRepoAsync(repo, { ...walkOpts, cache, cacheDir, parallel, chunk })
      : indexRepo(repo, { ...walkOpts, cache, cacheDir, chunk });
  const { graph, stats } = indexed;
  const indexMs = Date.now() - t0;

  // Optional LSP refinement: ask a language server for authoritative
  // call resolution.  Fully best-effort — on any error we keep the
  // syntactic edges already in the graph.
  if (lspClient && indexed.callSites && indexed.callSites.length > 0) {
    try {
      await lspClient.initialize(repo);
      const seenFiles = new Set<string>();
      for (const cs of indexed.callSites) {
        if (seenFiles.has(cs.file)) continue;
        seenFiles.add(cs.file);
        try {
          const { readFileSync } = await import('node:fs');
          const fullPath = `${repo}/${cs.file}`;
          const source = readFileSync(fullPath, 'utf8');
          const lang =
            cs.file.endsWith('.tsx') ? 'typescriptreact'
            : cs.file.endsWith('.jsx') ? 'javascriptreact'
            : cs.file.endsWith('.ts') ? 'typescript'
            : cs.file.endsWith('.js') ? 'javascript'
            : 'plaintext';
          await lspClient.didOpen(cs.file, source, lang);
        } catch {
          // ignore file open errors
        }
      }
      const result = await resolveCallsWithLsp(graph, indexed.callSites as CallSite[], lspClient, repo);
      stats.lspResolved = result.resolved;
      stats.lspAdded = result.added;
    } catch {
      // LSP failed — keep going with syntactic results.
    } finally {
      try {
        await lspClient.shutdown();
      } catch {
        // ignore
      }
    }
  }

  if (graph.order() === 0) {
    return emptyResult(
      'No supported source files found.\n' +
        'Hint: mincut-context indexes .ts .tsx .js .jsx .mjs .cjs .py .pyi .php .vue files. ' +
        'Check --repo points at a real source repo and your --include/--exclude patterns are correct.',
      stats.symbols,
    );
  }

  const seedMap = embedder
    ? await scoreSeedsHybrid(graph, task, { k: seeds, embedder, embedWeight })
    : scoreSeeds(graph, task, { k: seeds });
  if (seedMap.size === 0) {
    const hint = embedder
      ? 'Even with --embed no symbols seemed semantically close. Try widening the task with related terms.'
      : 'Hint: try --embed for semantic matching when your task vocabulary differs from the code\'s.';
    return emptyResult(`No symbols matched the task “${task}”.\n${hint}`, stats.symbols);
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

  const tRank0 = Date.now();
  const ranks = personalizedPageRank(graph, { seeds: fittedSeeds, alpha });
  const rankMs = Date.now() - tRank0;

  // Detect Louvain communities once and pass to greedySelect.  Deterministic
  // RNG so results are reproducible across runs (matters for caching tests).
  const communities = communityBoost > 0 ? detectCommunities(graph, { seed: 1 }) : undefined;

  const tSelect0 = Date.now();
  const selection = greedySelect(graph, {
    seeds: new Set(fittedSeeds.keys()),
    ranks,
    budget,
    communities,
    communityBoost,
  });
  const selectMs = Date.now() - tSelect0;

  // Group selected nodes by file and collapse to line ranges.
  type Acc = {
    ranges: FileRange[];
    score: number;
    tokens: number;
    reasons: string[];
    communities: Set<number>;
  };
  const byFile = new Map<string, Acc>();
  for (const entry of selection.entries) {
    const data = graph.getNode(entry.id);
    if (!data) continue;
    const file = data.file;
    const acc = byFile.get(file) ?? {
      ranges: [],
      score: 0,
      tokens: 0,
      reasons: [],
      communities: new Set<number>(),
    };
    if (data.startLine && data.endLine) {
      acc.ranges.push({ start: data.startLine, end: data.endLine });
    }
    acc.score += entry.rank;
    acc.tokens += entry.tokens;
    acc.reasons.push(entry.reason);
    if (entry.community !== undefined) acc.communities.add(entry.community);
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
      communities: acc.communities.size > 0 ? [...acc.communities].sort((a, b) => a - b) : undefined,
    });
  }
  files.sort((a, b) => b.score - a.score);

  // Trim trailing low-score files.  These are "filler" pulled in by
  // attachment alone — they help cohesion but often add noise without much
  // information.  Default cut: anything below 2% of the top file's score.
  let trimmedTokens = selection.tokens;
  if (trimScoreRatio > 0 && files.length > 1) {
    const top = files[0].score;
    if (top > 0) {
      const threshold = top * trimScoreRatio;
      const keep = files.filter((f, i) => i === 0 || f.score >= threshold);
      const dropped = files.length - keep.length;
      if (dropped > 0) {
        trimmedTokens = keep.reduce((sum, f) => sum + f.tokens, 0);
        files.length = 0;
        files.push(...keep);
      }
    }
  }

  let trace: PackTrace | undefined;
  if (verbose) {
    const topRanked = [...ranks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id, rank]) => ({ id, rank }));
    trace = {
      seeds: [...fittedSeeds.entries()].map(([id, score]) => ({ id, score })),
      topRanked,
      selectionOrder: selection.entries.map((e) => ({
        id: e.id,
        reason: e.reason,
        tokens: e.tokens,
        rank: e.rank,
      })),
      timings: { indexMs, rankMs, selectMs, totalMs: Date.now() - t0 },
      cache: { hits: stats.cacheHits, misses: stats.cacheMisses },
      lsp:
        stats.lspResolved !== undefined || stats.lspAdded !== undefined
          ? { resolved: stats.lspResolved ?? 0, added: stats.lspAdded ?? 0 }
          : undefined,
    };
  }

  let contractResult: Contract | undefined;
  if (contract) {
    const contractOpts: ContractOptions = contract === true ? {} : contract;
    contractResult = buildContract(graph, selection.selected, repo, contractOpts);
  }

  return {
    files,
    tokens: trimmedTokens,
    graph: {
      selected: selection.selected.size,
      frontier: frontierCount(graph, selection.selected),
      cutCost: selection.cutCost,
      totalSymbols: stats.symbols,
    },
    explain: buildExplain(task, fittedSeeds, selection, files, budget, stats.files),
    trace,
    contract: contractResult,
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
  // Show distinct community labels touched by the selection (if any).
  const communitySet = new Set<number>();
  for (const f of files) {
    for (const c of f.communities ?? []) communitySet.add(c);
  }
  if (communitySet.size > 0) {
    lines.push(
      `touched ${communitySet.size} community${communitySet.size === 1 ? '' : 'ies'}: ${[...communitySet]
        .sort((a, b) => a - b)
        .join(', ')}`,
    );
  }
  lines.push(
    `selected ${selection.selected.size} symbols across ${files.length} files` +
      ` (${selection.tokens} / ${budget} tokens, cut cost ${selection.cutCost.toFixed(1)})`,
  );
  return lines.join('\n');
}
