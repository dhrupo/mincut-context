import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Retrieval } from '../metrics.js';

const SUPPORTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyi', '.php', '.vue']);
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '.mincut-cache', 'coverage']);

/**
 * Random files until budget fills.  Lower bound on what "no signal" looks
 * like.  Deterministic via mulberry32 so the comparison report is stable.
 */
export function randomBaseline(_task: string, repo: string, budget = 4000, seed = 1, exclude: string[] = []): Retrieval {
  const excludeRes = exclude.map(globToRegex);
  const all: Array<{ rel: string; tokens: number }> = [];
  walk(repo, '', (rel, abs) => {
    const ext = path.extname(rel);
    if (!SUPPORTED.has(ext)) return;
    if (excludeRes.some((re) => re.test(rel))) return;
    try {
      const stat = statSync(abs);
      all.push({ rel, tokens: Math.ceil(stat.size / 4) });
    } catch {
      /* skip */
    }
  });

  const rng = mulberry32(seed);
  const shuffled = [...all].sort(() => rng() - 0.5);
  const out: string[] = [];
  let total = 0;
  for (const m of shuffled) {
    if (total + m.tokens > budget) continue;
    out.push(m.rel);
    total += m.tokens;
  }
  return { files: out, tokens: total };
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
    try {
      const s = statSync(abs);
      if (s.isDirectory()) walk(repo, rel, fn);
      else if (s.isFile()) fn(rel, abs);
    } catch {
      /* skip */
    }
  }
}

function globToRegex(glob: string): RegExp {
  const re = glob
    .replace(/[.+?^$()|[\]{}]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');
  return new RegExp(`^${re}$`);
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// readFileSync retained for future content-aware random baselines.
void readFileSync;
