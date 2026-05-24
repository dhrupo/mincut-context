import type Parser from 'tree-sitter';
import { approxTokens, type ChunkOptions, type ParsedSymbol, type NodeKind } from './parser.js';

/**
 * Language-agnostic chunking helper.
 *
 * Each parser's visit-function calls this whenever it enters a function-like
 * node.  We split the body's top-level statements (whatever `bodyNode`'s
 * named children are) into chunks whose token sum is roughly maxTokens.
 *
 * Returns `null` if the function should NOT be chunked (small enough, or
 * chunking disabled).  Returns the emitted chunk symbols if it WAS chunked,
 * along with a `visitStmt` callback the caller invokes per statement so that
 * call edges attribute to the correct chunk id.
 */
export interface ChunkResult {
  symbols: ParsedSymbol[];
  /** Per-statement walker for the caller — must be invoked in order. */
  walkStatements: (visitStmt: (stmt: Parser.SyntaxNode) => void) => void;
}

export function tryChunkBody(
  args: {
    file: string;
    source: string;
    qualifiedName: string;
    bareName: string;
    kind: NodeKind;
    body: Parser.SyntaxNode | null;
    chunkOptions?: ChunkOptions;
    /**
     * Push/pop caller stack around each chunk walk so the body's calls
     * attribute to the chunk id instead of the parent.
     */
    callerStack: string[];
  },
): ChunkResult | null {
  const { file, source, qualifiedName, body, chunkOptions, callerStack, kind } = args;
  if (!chunkOptions?.enabled || !body) return null;

  const bodyText = source.slice(body.startIndex, body.endIndex);
  if (approxTokens(bodyText) <= chunkOptions.maxTokens) return null;

  const statements: Parser.SyntaxNode[] = [];
  for (let i = 0; i < body.namedChildCount; i++) {
    const c = body.namedChild(i);
    if (c) statements.push(c);
  }
  if (statements.length < 2) return null;

  // Cumulative statement token totals can differ from the body's text size
  // (whitespace, line breaks).  Compute statement-by-statement tokens, but
  // ensure we split into at least 2 chunks when the BODY exceeds the
  // threshold — the body-size check at the top of this function already
  // proved we want to chunk.
  type Group = { start: Parser.SyntaxNode; end: Parser.SyntaxNode; members: Parser.SyntaxNode[] };

  const stmtTokens = statements.map((s) => approxTokens(source.slice(s.startIndex, s.endIndex)));
  const stmtsTotal = stmtTokens.reduce((a, b) => a + b, 0);
  // Use the larger of (maxTokens) and (stmtsTotal / 2) so we always split at
  // least once when the body is over threshold.
  const target = Math.max(chunkOptions.maxTokens, Math.ceil(stmtsTotal / 2));

  const groups: Group[] = [];
  let current: Parser.SyntaxNode[] = [];
  let currentTokens = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (currentTokens + stmtTokens[i] > target && current.length > 0) {
      groups.push({ start: current[0], end: current[current.length - 1], members: current });
      current = [];
      currentTokens = 0;
    }
    current.push(stmt);
    currentTokens += stmtTokens[i];
  }
  if (current.length > 0) {
    groups.push({ start: current[0], end: current[current.length - 1], members: current });
  }
  if (groups.length < 2) {
    // Body exceeded threshold but greedy packing put everything in one group.
    // Fall back to a midpoint split so the user still gets >=2 chunks.
    const mid = Math.ceil(statements.length / 2);
    const a = statements.slice(0, mid);
    const b = statements.slice(mid);
    if (a.length === 0 || b.length === 0) return null;
    groups.length = 0;
    groups.push({ start: a[0], end: a[a.length - 1], members: a });
    groups.push({ start: b[0], end: b[b.length - 1], members: b });
  }

  const symbols: ParsedSymbol[] = groups.map((g, index) => {
    const text = source.slice(g.start.startIndex, g.end.endIndex);
    const baseLeaf = qualifiedName.split('.').pop() ?? qualifiedName;
    return {
      id: `${file}:${qualifiedName}#${index}`,
      name: `${baseLeaf}#${index}`,
      file,
      kind,
      startLine: g.start.startPosition.row + 1,
      endLine: g.end.endPosition.row + 1,
      tokens: approxTokens(text),
      chunk: { parent: qualifiedName, index },
    };
  });

  const walkStatements = (visitStmt: (stmt: Parser.SyntaxNode) => void): void => {
    groups.forEach((g, index) => {
      callerStack.push(symbols[index].id);
      for (const member of g.members) visitStmt(member);
      callerStack.pop();
    });
  };

  return { symbols, walkStatements };
}
