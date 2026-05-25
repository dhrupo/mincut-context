import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Retrieval } from '../metrics.js';

const SUPPORTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyi', '.php', '.vue']);
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '.mincut-cache', 'coverage']);

/**
 * Pick files whose path or content contains any task keyword.
 *
 * This is the canonical agent-tooling baseline: an LLM tool that runs
 * `grep -l keyword src/` and returns hits.  We score it the same way we
 * score mincut: precision/recall/F1 against the labeled correct set.
 */
export function grepBaseline(task: string, repo: string, budget = 4000): Retrieval {
  const keywords = tokenize(task);
  if (keywords.length === 0) return { files: [], tokens: 0 };

  const matches: Array<{ rel: string; tokens: number; hits: number }> = [];
  walk(repo, '', (relPath, absPath) => {
    const ext = path.extname(relPath);
    if (!SUPPORTED.has(ext)) return;
    let content = '';
    try {
      content = readFileSync(absPath, 'utf8');
    } catch {
      return;
    }
    let hits = 0;
    const lc = content.toLowerCase();
    const pathLc = relPath.toLowerCase();
    for (const k of keywords) {
      if (lc.includes(k) || pathLc.includes(k)) hits += 1;
    }
    if (hits > 0) {
      matches.push({ rel: relPath, tokens: Math.ceil(content.length / 4), hits });
    }
  });

  // Sort by hit count (more keywords = better) then by token cost asc.
  matches.sort((a, b) => b.hits - a.hits || a.tokens - b.tokens);

  // Pack into budget.
  const out: string[] = [];
  let totalTokens = 0;
  for (const m of matches) {
    if (totalTokens + m.tokens > budget) continue;
    out.push(m.rel);
    totalTokens += m.tokens;
  }
  return { files: out, tokens: totalTokens };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

function walk(repo: string, sub: string, fn: (rel: string, abs: string) => void): void {
  const dir = path.join(repo, sub);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const rel = sub ? `${sub}/${name}` : name;
    const abs = path.join(dir, name);
    let s;
    try {
      s = statSync(abs);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(repo, rel, fn);
    else if (s.isFile()) fn(rel, abs);
  }
}
