import type { NodeKind } from '../core/graph.js';
export type { NodeKind } from '../core/graph.js';

export interface ParsedSymbol {
  id: string;             // canonical id: `${file}:${qualifiedName}`
  name: string;           // bare local name (e.g. 'login', 'Session.create')
  file: string;
  kind: NodeKind;
  startLine: number;      // 1-based
  endLine: number;        // 1-based, inclusive
  tokens: number;         // approximate token count for the symbol body
  /** Present on sub-symbol chunks emitted from a large parent function. */
  chunk?: { parent: string; index: number };
  /** Body-free signature stub. Populated only when parsed with { signatures: true }. */
  signature?: string;
}

export interface ChunkOptions {
  enabled: boolean;
  /** Functions whose body exceeds this token count get split into chunks. */
  maxTokens: number;
}

export interface ParsedImport {
  source: string;         // raw import specifier (e.g. './session', 'lodash')
  names: string[];        // imported names (incl. default)
  namespace?: string;     // for `import * as ns from ...`
}

export interface ParsedCall {
  from: string;           // caller symbol id
  toName: string;         // unresolved callee name
  /** Optional source position of the callee identifier (1-based line, 0-based col). */
  line?: number;
  character?: number;
}

export interface ParseResult {
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: ParsedCall[];
}

export interface LanguageParser {
  /** File extensions this parser claims, e.g. ['.ts', '.tsx']. */
  extensions: string[];
  parse(file: string, source: string): ParseResult;
}

/**
 * Approximate token count from a character count.
 * 4 chars/token is the canonical OpenAI rule-of-thumb.  Good enough for budgeting.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ParseOptions {
  /** When true, parsers populate ParsedSymbol.signature (used by the contract path). */
  signatures?: boolean;
}

/** A minimal node span — matches tree-sitter SyntaxNode without importing it. */
interface SpanLike { startIndex: number; endIndex: number }

/**
 * Produce a body-free signature stub for a symbol.
 *   - interface/type : full text (it IS the contract)
 *   - has a body node : text from node start up to body start, body elided
 *   - otherwise       : first source line only (variable / export / no-body fallback)
 */
export function sliceSignature(
  source: string,
  node: SpanLike,
  body: { startIndex: number } | null,
  kind: NodeKind,
): string {
  if (kind === 'interface' || kind === 'type') {
    return source.slice(node.startIndex, node.endIndex).trim();
  }
  if (body) {
    const head = source.slice(node.startIndex, body.startIndex).trimEnd();
    return `${head} { /* … */ }`;
  }
  const text = source.slice(node.startIndex, node.endIndex);
  const nl = text.indexOf('\n');
  return (nl === -1 ? text : text.slice(0, nl)).trim();
}
