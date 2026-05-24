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
