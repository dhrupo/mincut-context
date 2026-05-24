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

// Kind-specific multipliers applied to a node's raw score.  Functions/
// methods/classes are usually the right unit for an agent to look at;
// variables and type aliases are weaker leads.
const KIND_WEIGHTS: Record<string, number> = {
  function: 1.0,
  method: 1.0,
  class: 1.0,
  interface: 0.9,
  export: 0.9,
  type: 0.7,
  variable: 0.6,
  file: 0.5,
};

// Path tokens commonly found in test directories — we de-emphasize these
// unless the task itself contains a test-y word.
const TEST_PATH_TOKENS = new Set(['test', 'tests', 'spec', 'specs', '__tests__', 'e2e']);
const TEST_TASK_TOKENS = new Set(['test', 'tests', 'spec', 'specs', 'e2e', 'failing', 'flaky']);

interface SplitPathTokens {
  dirTokens: string[];
  fileTokens: string[];
  all: string[];
}

function pathTokensFor(filePath: string): SplitPathTokens {
  // 'src/auth/__tests__/login.test.ts'
  //   dirTokens  = ['src','auth','tests']        (boost — these say "where this code lives")
  //   fileTokens = ['login','test']              (weaker — filenames are noisy)
  const dirTokens = new Set<string>();
  const fileTokens = new Set<string>();
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length === 0) {
    return { dirTokens: [], fileTokens: [], all: [] };
  }
  const filenameRaw = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  for (const t of tokenizeTask(filenameRaw)) fileTokens.add(t);
  for (let i = 0; i < parts.length - 1; i++) {
    for (const t of tokenizeTask(parts[i])) dirTokens.add(t);
  }
  return {
    dirTokens: [...dirTokens],
    fileTokens: [...fileTokens],
    all: [...new Set([...dirTokens, ...fileTokens])],
  };
}

/**
 * Score every node by how strongly its symbol name AND containing file path
 * overlap with the task tokens, weighted by inverse document frequency.
 *
 *   raw(node)  = Σ_{token ∈ name}  IDF(token) · match_weight
 *              + Σ_{token ∈ path}  IDF(token) · 0.6        (path is a weaker signal)
 *   final(node) = raw(node) · kindWeight(node)
 *              · (testPenalty if file is in a test dir and task is not test-related)
 */
export function scoreSeeds(
  graph: SymbolGraph,
  task: string,
  options: ScoreOptions,
): Map<string, number> {
  if (options.k <= 0) throw new Error('k must be positive');
  const tokens = tokenizeTask(task);
  if (tokens.length === 0) return new Map();

  const taskMentionsTests = tokens.some((t) => TEST_TASK_TOKENS.has(t));

  // Build name + path token index per node.
  const nodes = graph.nodes();
  const nameTokensByNode = new Map<string, string[]>();
  const dirTokensByNode = new Map<string, string[]>();
  const fileTokensByNode = new Map<string, string[]>();
  const allPathTokensByNode = new Map<string, string[]>();
  const documentFreq = new Map<string, number>();
  const dirDocFreq = new Map<string, number>();
  const fileDocFreq = new Map<string, number>();

  for (const id of nodes) {
    const data = graph.getNode(id);
    if (!data) continue;
    const name = data.name ?? id.split(':').slice(1).join(':');
    const nameTokens = tokenizeTask(name);
    nameTokensByNode.set(id, nameTokens);

    const split = pathTokensFor(data.file ?? '');
    dirTokensByNode.set(id, split.dirTokens);
    fileTokensByNode.set(id, split.fileTokens);
    allPathTokensByNode.set(id, split.all);

    for (const t of new Set(nameTokens)) {
      documentFreq.set(t, (documentFreq.get(t) ?? 0) + 1);
    }
    for (const t of new Set(split.dirTokens)) {
      dirDocFreq.set(t, (dirDocFreq.get(t) ?? 0) + 1);
    }
    for (const t of new Set(split.fileTokens)) {
      fileDocFreq.set(t, (fileDocFreq.get(t) ?? 0) + 1);
    }
  }

  const N = nodes.length || 1;
  const idf = (df: Map<string, number>, t: string): number => {
    const v = df.get(t) ?? 0;
    if (v === 0) return 0;
    return Math.log(1 + N / v);
  };

  const scored: Array<[string, number]> = [];
  for (const id of nodes) {
    const data = graph.getNode(id);
    if (!data) continue;
    const nameTokens = nameTokensByNode.get(id) ?? [];
    const dirTokens = dirTokensByNode.get(id) ?? [];
    const fileTokens = fileTokensByNode.get(id) ?? [];
    const allPath = allPathTokensByNode.get(id) ?? [];
    if (nameTokens.length === 0 && allPath.length === 0) continue;

    const nameSet = new Set(nameTokens);
    const dirSet = new Set(dirTokens);
    const fileSet = new Set(fileTokens);
    let score = 0;

    for (const t of tokens) {
      // Name match (strongest signal).
      if (nameSet.has(t)) {
        score += idf(documentFreq, t) * (nameTokens.length === 1 && nameTokens[0] === t ? 1.0 : 0.6);
      } else {
        // partial substring match
        for (const nt of nameSet) {
          if (nt.length >= 4 && (nt.includes(t) || t.includes(nt))) {
            score += idf(documentFreq, t) * 0.25;
            break;
          }
        }
      }
      // Directory match (medium signal — "this code belongs to topic X").
      if (dirSet.has(t)) {
        score += idf(dirDocFreq, t) * 0.7;
      }
      // Filename match (weak signal — basenames are noisy).
      if (fileSet.has(t)) {
        score += idf(fileDocFreq, t) * 0.4;
      }
    }

    if (score <= 0) continue;

    // Kind weighting — functions/methods are the natural agent unit.
    score *= KIND_WEIGHTS[data.kind] ?? 1.0;

    // Test-dir penalty: if the file path looks test-y and the task does NOT
    // mention tests, halve the score.  Test-related tasks keep the boost.
    if (!taskMentionsTests) {
      const inTestDir = allPath.some((t) => TEST_PATH_TOKENS.has(t));
      if (inTestDir) score *= 0.5;
    }

    scored.push([id, score]);
  }

  scored.sort((a, b) => b[1] - a[1]);
  return new Map(scored.slice(0, options.k));
}
