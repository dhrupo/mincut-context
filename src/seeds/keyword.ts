import type { SymbolGraph } from '../core/graph.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does',
  'for', 'from', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'is', 'it',
  'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'some',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to',
  'us', 'was', 'we', 'were', 'when', 'where', 'which', 'who', 'will', 'with',
  'you', 'your',
]);

export interface ScoreOptions {
  /** Top-k seeds to return. */
  k: number;
}

/**
 * Lower-cased, split-on-non-alphanum, broken on case boundaries.
 * Drops stopwords and 1-char fragments.
 */
export function tokenizeTask(task: string): string[] {
  const out = new Set<string>();
  const pieces = task.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (const piece of pieces) {
    for (const sub of splitOnCase(piece)) {
      const lower = sub.toLowerCase();
      if (lower.length < 2) continue;
      if (STOPWORDS.has(lower)) continue;
      out.add(lower);
    }
  }
  return [...out];
}

function splitOnCase(s: string): string[] {
  // Split on camelCase boundaries:  fooBar → ['foo','Bar'];  ABCDef → ['ABC','Def'].
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score every node by how strongly its symbol name (tokenized) overlaps with
 * the task tokens, weighted by inverse document frequency (rarer names matter
 * more).  Returns the top-k as a Map<nodeId, score>.
 *
 *   score(node) = Σ_{token ∈ task ∩ name}  IDF(token) · match_weight
 *
 * where match_weight = 1.0 for exact whole-name match, 0.5 for partial
 * sub-token match.
 */
export function scoreSeeds(
  graph: SymbolGraph,
  task: string,
  options: ScoreOptions,
): Map<string, number> {
  if (options.k <= 0) throw new Error('k must be positive');
  const tokens = tokenizeTask(task);
  if (tokens.length === 0) return new Map();

  // 1. Build the name-token index.
  const nodes = graph.nodes();
  const nameTokensByNode = new Map<string, string[]>();
  const documentFreq = new Map<string, number>();
  for (const id of nodes) {
    const data = graph.getNode(id);
    if (!data) continue;
    const name = data.name ?? id.split(':').slice(1).join(':');
    const nameTokens = tokenizeTask(name);
    nameTokensByNode.set(id, nameTokens);
    const seen = new Set<string>();
    for (const t of nameTokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      documentFreq.set(t, (documentFreq.get(t) ?? 0) + 1);
    }
  }

  const N = nodes.length || 1;
  const idf = (t: string): number => {
    const df = documentFreq.get(t) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + N / df);
  };

  // 2. Score each node against the task tokens.
  const scored: Array<[string, number]> = [];
  for (const [id, nameTokens] of nameTokensByNode) {
    if (nameTokens.length === 0) continue;
    const nameSet = new Set(nameTokens);
    let score = 0;
    for (const t of tokens) {
      if (nameSet.has(t)) {
        // exact sub-token match
        score += idf(t) * (nameTokens.length === 1 && nameTokens[0] === t ? 1.0 : 0.6);
      } else {
        // partial substring match (e.g. task 'session' vs name 'sess')
        for (const nt of nameSet) {
          if (nt.length >= 4 && (nt.includes(t) || t.includes(nt))) {
            score += idf(t) * 0.25;
            break;
          }
        }
      }
    }
    if (score > 0) scored.push([id, score]);
  }

  scored.sort((a, b) => b[1] - a[1]);
  return new Map(scored.slice(0, options.k));
}
