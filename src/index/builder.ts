import path from 'node:path';
import { SymbolGraph } from '../core/graph.js';
import { parseTypeScript } from '../parsers/ts.js';
import { parsePython } from '../parsers/py.js';
import type { ParseResult, ParsedImport, ParsedSymbol } from '../parsers/parser.js';
import { walk, type WalkOptions } from './walker.js';

const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXT = new Set(['.py', '.pyi']);

function parseForExt(file: string, source: string): ParseResult | null {
  const ext = path.extname(file);
  if (TS_EXT.has(ext)) return parseTypeScript(file, source);
  if (PY_EXT.has(ext)) return parsePython(file, source);
  return null;
}

export interface IndexResult {
  graph: SymbolGraph;
  stats: {
    files: number;
    symbols: number;
    edges: number;
    unresolvedCalls: number;
  };
}

export function indexRepo(root: string, options: WalkOptions = {}): IndexResult {
  const graph = new SymbolGraph();

  // Per-file accumulators we need for cross-file resolution.
  const fileImports = new Map<string, ParsedImport[]>();
  const symbolsByFile = new Map<string, ParsedSymbol[]>();
  const symbolByName = new Map<string, string[]>();
  const pendingCalls: { from: string; toName: string; file: string }[] = [];

  let fileCount = 0;
  let unresolved = 0;

  for (const file of walk(root, options)) {
    const parsed = parseForExt(file.relPath, file.source);
    if (!parsed) continue;

    fileCount += 1;
    fileImports.set(file.relPath, parsed.imports);
    symbolsByFile.set(file.relPath, parsed.symbols);

    for (const sym of parsed.symbols) {
      if (graph.hasNode(sym.id)) continue;
      graph.addNode(sym.id, {
        tokens: sym.tokens,
        file: sym.file,
        kind: sym.kind,
        name: sym.name,
        startLine: sym.startLine,
        endLine: sym.endLine,
      });
      const arr = symbolByName.get(sym.name) ?? [];
      arr.push(sym.id);
      symbolByName.set(sym.name, arr);
    }

    for (const call of parsed.calls) {
      pendingCalls.push({ from: call.from, toName: call.toName, file: file.relPath });
    }
  }

  const knownFiles = new Set<string>(symbolsByFile.keys());

  const resolve = (file: string, spec: string): string | null =>
    resolveImportPath(file, spec, knownFiles);

  // Resolve calls in a second pass.
  for (const call of pendingCalls) {
    const target = resolveCall(call.from, call.toName, call.file, fileImports, symbolsByFile, symbolByName, resolve);
    if (!target) {
      unresolved += 1;
      continue;
    }
    if (!graph.hasNode(call.from) || !graph.hasNode(target)) continue;
    if (call.from === target) continue;
    graph.addEdge(call.from, target, { weight: 1, kind: 'call' });
  }

  // Add import-level structural edges (lower weight than calls).
  for (const [file, imports] of fileImports) {
    const callers = (symbolsByFile.get(file) ?? []).map((s) => s.id);
    if (callers.length === 0) continue;
    for (const imp of imports) {
      const resolvedFile = resolve(file, imp.source);
      if (!resolvedFile) continue;
      const targets = symbolsByFile.get(resolvedFile);
      if (!targets) continue;
      for (const name of imp.names) {
        const targetSym = targets.find((s) => s.name === name);
        if (!targetSym) continue;
        for (const caller of callers) {
          if (caller === targetSym.id) continue;
          if (!graph.hasNode(caller) || !graph.hasNode(targetSym.id)) continue;
          if (graph.hasEdge(caller, targetSym.id)) continue;
          graph.addEdge(caller, targetSym.id, { weight: 0.5, kind: 'import' });
        }
      }
    }
  }

  return {
    graph,
    stats: {
      files: fileCount,
      symbols: graph.order(),
      edges: graph.size(),
      unresolvedCalls: unresolved,
    },
  };
}

function resolveCall(
  fromId: string,
  name: string,
  file: string,
  fileImports: Map<string, ParsedImport[]>,
  symbolsByFile: Map<string, ParsedSymbol[]>,
  symbolByName: Map<string, string[]>,
  resolve: (file: string, spec: string) => string | null,
): string | null {
  // 1. Try imports in the caller's file.
  const imports = fileImports.get(file) ?? [];
  for (const imp of imports) {
    if (!imp.names.includes(name)) continue;
    const resolved = resolve(file, imp.source);
    if (!resolved) continue;
    const targetSym = symbolsByFile.get(resolved)?.find((s) => s.name === name);
    if (targetSym) return targetSym.id;
  }
  // 2. Same-file lookup.
  const candidates = symbolByName.get(name) ?? [];
  const sameFile = candidates.find((id) => id.startsWith(`${file}:`));
  if (sameFile && sameFile !== fromId) return sameFile;
  // 3. Unique global match (heuristic).
  if (candidates.length === 1 && candidates[0] !== fromId) return candidates[0];
  return null;
}

function resolveImportPath(
  fromFile: string,
  spec: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const isPython = fromFile.endsWith('.py') || fromFile.endsWith('.pyi');
  if (isPython) return resolvePythonImport(fromFile, spec, knownFiles);
  return resolveJsImport(fromFile, spec, knownFiles);
}

function resolveJsImport(
  fromFile: string,
  spec: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (!spec.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromFile);
  const base = path.posix.normalize(path.posix.join(fromDir, spec));
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
  ];
  for (const c of candidates) if (knownFiles.has(c)) return c;
  return null;
}

/**
 * Python import resolution.  Maps:
 *   `from .session import X`     →  same-dir/session.py
 *   `from ..auth import X`       →  parent-dir/auth.py
 *   `from pkg.sub import X`      →  pkg/sub.py
 *   `from . import X`            →  same-dir/X.py
 * Falls back to same-package layout.
 */
function resolvePythonImport(
  fromFile: string,
  spec: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const fromDir = path.posix.dirname(fromFile);
  let resolvedDir = fromDir;
  let remainder = spec;

  // Leading dots = relative level.
  while (remainder.startsWith('.')) {
    if (remainder.startsWith('..')) {
      resolvedDir = path.posix.dirname(resolvedDir);
      remainder = remainder.slice(1);
    } else {
      remainder = remainder.slice(1);
    }
  }
  // dotted_name → path segments.
  const moduleSegments = remainder ? remainder.split('.') : [];
  const base = moduleSegments.length
    ? path.posix.normalize(path.posix.join(resolvedDir, ...moduleSegments))
    : path.posix.normalize(resolvedDir);

  const candidates = [
    `${base}.py`,
    `${base}.pyi`,
    `${base}/__init__.py`,
    base,
  ];
  for (const c of candidates) if (knownFiles.has(c)) return c;
  return null;
}
