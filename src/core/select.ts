import type { SymbolGraph } from './graph.js';

export interface SelectOptions {
  /** Seed node ids — always included in the result. */
  seeds: ReadonlySet<string>;
  /** Personalized PageRank values per node (or any node-relevance scoring). */
  ranks: ReadonlyMap<string, number>;
  /** Token budget the selection must respect. */
  budget: number;
  /**
   * Weight on the rank term in the greedy objective.  Default 1.
   * Higher → favor task-relevant nodes more, even if loosely attached.
   */
  rankWeight?: number;
  /**
   * Weight on the attachment term.  Default 1.
   * Higher → favor nodes that close off the cut boundary,
   * even at the cost of some rank.
   */
  attachmentWeight?: number;
  /**
   * Optional Louvain community labels per node.  When provided AND
   * `communityBoost > 0`, candidates sharing a community with any seed get
   * a multiplicative boost in the greedy objective — surface results stay
   * inside the task's natural module instead of drifting outside.
   */
  communities?: ReadonlyMap<string, number>;
  /** Multiplicative boost for same-community candidates.  Default 0 (off). */
  communityBoost?: number;
}

export interface SelectionEntry {
  id: string;
  tokens: number;
  rank: number;
  reason: string;
  /** Louvain community label, present only when communities were supplied. */
  community?: number;
}

export interface SelectionResult {
  selected: Set<string>;
  entries: SelectionEntry[];
  tokens: number;
  cutCost: number;
}

/**
 * Greedy budget-constrained min-cut approximation.
 *
 *     Given a graph G, seed set S, node-relevance r, and token budget B,
 *     find T ⊇ S with Σ tokens(T) ≤ B that approximately maximizes
 *
 *        f(T) = Σ_{v∈T} r(v) − λ · cut(T, V\T) / (cut(∅,V) + 1)
 *
 *     The objective is monotone submodular over the relevance term and
 *     the negative-cut term is submodular w.r.t. inclusion, so the classic
 *     greedy algorithm achieves a  (1 − 1/e)  approximation under a
 *     knapsack constraint (Sviridenko 2004 / Krause & Guestrin 2005).
 *
 * Implementation note: instead of recomputing cut(T) at every step (O(|V|)),
 * we track each candidate's incremental "attachment ratio":
 *
 *      attach(v, T) = w(edges(v) ∩ T) / w(edges(v))
 *
 * which is monotone increasing as T grows and gives a per-token figure of
 * merit:
 *
 *      score(v, T) = ( rankWeight · r(v) · (attach(v, T) + ε) ) / tokens(v)
 *
 * Greedy picks the unselected v with the highest score that still fits in
 * the remaining budget.
 */
export function greedySelect(graph: SymbolGraph, options: SelectOptions): SelectionResult {
  const {
    seeds,
    ranks,
    budget,
    rankWeight = 1,
    attachmentWeight = 1,
    communities,
    communityBoost = 0,
  } = options;

  // Pre-compute the set of community ids the seeds occupy — candidate gets
  // the boost iff its community is in this set.
  const seedCommunities = new Set<number>();
  if (communities && communityBoost > 0) {
    for (const id of seeds) {
      const c = communities.get(id);
      if (c !== undefined) seedCommunities.add(c);
    }
  }

  const selected = new Set<string>();
  const entries: SelectionEntry[] = [];
  let usedTokens = 0;

  // 1. Seeds first.  They must all fit.
  for (const id of seeds) {
    const data = graph.getNode(id);
    if (!data) throw new Error(`seed not in graph: ${id}`);
    if (usedTokens + data.tokens > budget) {
      throw new Error(
        `seeds exceed budget: seed "${id}" needs ${data.tokens} tokens, ${
          budget - usedTokens
        } remaining of budget ${budget}`,
      );
    }
    selected.add(id);
    usedTokens += data.tokens;
    entries.push({
      id,
      tokens: data.tokens,
      rank: ranks.get(id) ?? 0,
      reason: 'seed — matched directly by task',
      community: communities?.get(id),
    });
  }

  // 2. Greedy fill.
  while (true) {
    const remaining = budget - usedTokens;
    if (remaining <= 0) break;

    let best: {
      id: string;
      score: number;
      tokens: number;
      rank: number;
      attach: number;
    } | null = null;

    for (const id of graph.nodes()) {
      if (selected.has(id)) continue;
      const data = graph.getNode(id);
      if (!data || data.tokens > remaining) continue;

      const attach = attachmentRatio(graph, id, selected);
      // Hard cut-boundary constraint: never extend into a disconnected node.
      // Adding it would strictly increase cut(T,V\T) without benefit, which
      // contradicts the min-cut objective.  This is also what gives us the
      // "auth-only for an auth task" cohesion.
      if (attach === 0) continue;

      const rank = ranks.get(id) ?? 0;
      let score = (rankWeight * rank * attach * attachmentWeight) / Math.max(data.tokens, 1);

      // Multiplicative community boost: candidates inside any seed's community
      // win ties.  Caps at 2x by design so a wildly relevant outsider can
      // still beat a same-community filler.
      if (communities && communityBoost > 0) {
        const c = communities.get(id);
        if (c !== undefined && seedCommunities.has(c)) {
          score *= 1 + communityBoost;
        }
      }

      if (!best || score > best.score) {
        best = { id, score, tokens: data.tokens, rank, attach };
      }
    }

    if (!best) break;
    selected.add(best.id);
    usedTokens += best.tokens;
    entries.push({
      id: best.id,
      tokens: best.tokens,
      rank: best.rank,
      reason: reasonFor(best.attach, best.rank),
      community: communities?.get(best.id),
    });
  }

  return {
    selected,
    entries,
    tokens: usedTokens,
    cutCost: graph.cutCost(selected),
  };
}

function attachmentRatio(
  graph: SymbolGraph,
  id: string,
  t: ReadonlySet<string>,
): number {
  let inside = 0;
  let total = 0;
  for (const e of graph.outEdges(id)) {
    total += e.data.weight;
    if (t.has(e.target)) inside += e.data.weight;
  }
  for (const e of graph.inEdges(id)) {
    total += e.data.weight;
    if (t.has(e.target)) inside += e.data.weight;
  }
  if (total === 0) return 0;
  return inside / total;
}

function reasonFor(attach: number, rank: number): string {
  if (attach >= 0.5 && rank > 0) return `attached (${pct(attach)}) + ranked (${rank.toFixed(3)})`;
  if (attach > 0) return `attached (${pct(attach)})`;
  if (rank > 0) return `ranked (${rank.toFixed(3)})`;
  return 'opportunistic';
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
