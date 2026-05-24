import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SymbolGraph } from '../core/graph.js';
import type { LspClient } from './types.js';

export interface CallSite {
  file: string;       // repo-relative POSIX path
  line: number;       // 1-based
  character: number;  // 0-based
  toName: string;     // textual callee name (unresolved)
  from: string;       // caller's graph node id
}

export interface ResolverResult {
  /** Number of call sites for which the LSP returned at least one location. */
  resolved: number;
  /** Number of new edges actually added to the graph. */
  added: number;
}

/**
 * Use an LSP client to refine ambiguous call edges.  For each call site,
 * ask the language server "where is this symbol defined?".  If the answer
 * lands inside a known graph node, add (or upgrade) the edge.
 *
 * Existing edges are left alone; this is purely additive / refinement.
 */
export async function resolveCallsWithLsp(
  graph: SymbolGraph,
  callSites: CallSite[],
  lsp: LspClient,
  repoRoot: string,
): Promise<ResolverResult> {
  let resolved = 0;
  let added = 0;

  for (const cs of callSites) {
    if (!graph.hasNode(cs.from)) continue;
    let result;
    try {
      result = await lsp.definition(cs.file, { line: cs.line - 1, character: cs.character });
    } catch {
      continue;
    }
    if (result.locations.length === 0) continue;

    let mappedAny = false;
    for (const loc of result.locations) {
      const targetFile = lspUriToRelPath(loc.uri, repoRoot);
      if (!targetFile) continue;
      const targetLine = loc.range.start.line + 1;
      const targetId = findNodeAt(graph, targetFile, targetLine);
      if (!targetId || targetId === cs.from) continue;
      mappedAny = true;
      if (graph.hasEdge(cs.from, targetId)) continue;
      graph.addEdge(cs.from, targetId, { weight: 1.5, kind: 'call' });
      added += 1;
    }
    if (mappedAny) resolved += 1;
  }

  return { resolved, added };
}

function lspUriToRelPath(uri: string, repoRoot: string): string | null {
  let abs: string;
  try {
    abs = uri.startsWith('file://') ? fileURLToPath(uri) : uri;
  } catch {
    return null;
  }
  if (!abs.startsWith(repoRoot)) return null;
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  if (rel.startsWith('..')) return null;
  return rel;
}

function findNodeAt(graph: SymbolGraph, file: string, line: number): string | null {
  // Prefer the smallest range containing the line (innermost symbol wins).
  let best: { id: string; span: number } | null = null;
  for (const id of graph.nodes()) {
    if (!id.startsWith(`${file}:`)) continue;
    const data = graph.getNode(id);
    if (!data?.startLine || !data.endLine) continue;
    if (line < data.startLine || line > data.endLine) continue;
    const span = data.endLine - data.startLine;
    if (!best || span < best.span) {
      best = { id, span };
    }
  }
  return best?.id ?? null;
}
