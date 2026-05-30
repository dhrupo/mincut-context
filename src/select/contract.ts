import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SymbolGraph, NodeKind, EdgeKind } from '../core/graph.js';
import { approxTokens } from '../parsers/parser.js';
import type { ParsedSymbol } from '../parsers/parser.js';
import { parseTypeScript } from '../parsers/ts.js';
import { parsePython } from '../parsers/py.js';
import { parsePhp } from '../parsers/php.js';
import { parseVueSfc } from '../parsers/vue.js';

export interface ContractStub {
  id: string;
  file: string;
  kind: NodeKind;
  name: string;
  signature: string;
  tokens: number;
  via: string[];
}
export interface Contract {
  stubs: ContractStub[];
  tokens: number;
  files: string[];
  /** Count of frontier symbols that did NOT yield a stub (file unreadable/unparseable, or no signature extracted). Lets callers distinguish "no frontier" from "frontier had no usable signatures". */
  skipped: number;
}
export interface ContractOptions {
  maxTokens?: number;
}

/** Edge kinds that represent an outbound *type* dependency of the region. */
const TYPE_EDGES: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'call', 'reference', 'extends', 'implements', 'import',
]);

export interface FrontierEntry {
  id: string;
  via: string[];   // selected symbols that reference this frontier symbol
}

/**
 * The selected region's outbound dependency boundary: targets of TYPE_EDGES
 * leaving the selected set, that are not themselves selected and are not files.
 */
export function buildFrontier(
  graph: SymbolGraph,
  selected: ReadonlySet<string>,
): FrontierEntry[] {
  const via = new Map<string, Set<string>>();
  for (const src of selected) {
    for (const e of graph.outEdges(src)) {
      if (selected.has(e.target)) continue;
      if (!TYPE_EDGES.has(e.data.kind)) continue;
      const node = graph.getNode(e.target);
      if (!node || node.kind === 'file') continue;
      let set = via.get(e.target);
      if (!set) {
        set = new Set<string>();
        via.set(e.target, set);
      }
      set.add(src);
    }
  }
  return [...via.entries()]
    .map(([id, set]) => ({ id, via: [...set].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function parseWithSignatures(file: string, source: string): ParsedSymbol[] {
  const ext = file.slice(file.lastIndexOf('.'));
  const opts = { signatures: true } as const;
  if (TS_EXT.has(ext)) return parseTypeScript(file, source, undefined, opts).symbols;
  if (ext === '.py' || ext === '.pyi') return parsePython(file, source, undefined, opts).symbols;
  if (ext === '.php') return parsePhp(file, source, undefined, opts).symbols;
  // vue does not accept ParseOptions yet — Task 10 will forward `opts` here.
  if (ext === '.vue') return parseVueSfc(file, source).symbols;
  return [];
}

export function buildContract(
  graph: SymbolGraph,
  selected: ReadonlySet<string>,
  repo: string,
  options: ContractOptions = {},
): Contract {
  const frontier = buildFrontier(graph, selected);

  // Group wanted symbol ids by file so each file is parsed at most once.
  const wantByFile = new Map<string, FrontierEntry[]>();
  for (const entry of frontier) {
    const file = graph.getNode(entry.id)!.file;
    let arr = wantByFile.get(file);
    if (!arr) {
      arr = [];
      wantByFile.set(file, arr);
    }
    arr.push(entry);
  }

  const stubs: ContractStub[] = [];
  for (const [file, wanted] of wantByFile) {
    let symbols: ParsedSymbol[];
    try {
      symbols = parseWithSignatures(file, readFileSync(join(repo, file), 'utf8'));
    } catch {
      // Best-effort: a frontier file may be unreadable (deleted since index) or
      // unparseable. Skip it; the `skipped` count in the returned Contract makes
      // these omissions observable rather than fully silent.
      continue;
    }
    const byId = new Map(symbols.map((s) => [s.id, s]));
    for (const entry of wanted) {
      const sym = byId.get(entry.id);
      const node = graph.getNode(entry.id)!;
      if (!sym?.signature) continue;
      stubs.push({
        id: entry.id,
        file,
        kind: node.kind,
        name: node.name ?? entry.id,
        signature: sym.signature,
        tokens: approxTokens(sym.signature),
        via: entry.via,
      });
    }
  }

  // `skipped` reflects parse/signature failures only — computed before the
  // budget cap so intentional budget drops do not inflate this count.
  const skipped = frontier.length - stubs.length;

  // Optional budget cap: keep the most-referenced stubs first.
  stubs.sort((a, b) => b.via.length - a.via.length || a.id.localeCompare(b.id));
  let kept = stubs;
  const tokenBudget = options.maxTokens ?? 0;
  if (tokenBudget > 0) {
    kept = [];
    let total = 0;
    for (const s of stubs) {
      if (total + s.tokens > tokenBudget) continue;
      kept.push(s);
      total += s.tokens;
    }
  }
  kept.sort((a, b) => a.id.localeCompare(b.id)); // stable, deterministic output

  return {
    stubs: kept,
    tokens: kept.reduce((n, s) => n + s.tokens, 0),
    files: [...new Set(kept.map((s) => s.file))].sort(),
    skipped,
  };
}
