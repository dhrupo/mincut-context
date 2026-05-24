import { parseTypeScript } from './ts.js';
import type { ParseResult } from './parser.js';

/**
 * Vue Single-File Component parser.
 *
 * Vue SFCs are not really a "language" — they wrap HTML, script(s), and CSS.
 * We only need the <script> / <script setup> blocks (where logic lives) and
 * forward them to the TypeScript parser.
 *
 * Why regex instead of an HTML parser?  v1.0 of @vue/compiler-sfc is ~30 MB
 * of dependencies for what amounts to "find the script tag".  Vue's grammar
 * for SFC blocks is intentionally simple — closing tags are unambiguous,
 * there's no nesting, tag names are fixed.  Regex handles >99% of files;
 * pathological edge cases fall back to "no symbols", which the rest of the
 * pipeline tolerates gracefully.
 */
export function parseVueSfc(file: string, source: string): ParseResult {
  const blocks = extractScriptBlocks(source);
  if (blocks.length === 0) {
    return { symbols: [], imports: [], calls: [] };
  }

  const merged: ParseResult = { symbols: [], imports: [], calls: [] };

  for (const block of blocks) {
    // Parse each block as TS regardless of lang.  tree-sitter-typescript handles
    // plain JS just fine, so we don't bother dispatching here.
    const inner = parseTypeScript(file, block.content);

    // Shift line numbers from script-local back to SFC-global.
    const offset = block.startLine - 1;
    for (const sym of inner.symbols) {
      merged.symbols.push({
        ...sym,
        startLine: sym.startLine + offset,
        endLine: sym.endLine + offset,
      });
    }
    merged.imports.push(...inner.imports);
    merged.calls.push(...inner.calls);
  }

  return merged;
}

interface ScriptBlock {
  content: string;
  startLine: number;
}

const SCRIPT_REGEX = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

function extractScriptBlocks(source: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_REGEX.exec(source)) !== null) {
    const fullMatchStart = m.index;
    const openTagEnd = fullMatchStart + m[0].indexOf('>') + 1;
    const startLine = source.slice(0, openTagEnd).split('\n').length;
    blocks.push({ content: m[2], startLine });
  }
  return blocks;
}
