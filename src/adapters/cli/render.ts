import type { PackResult } from '../../select/pack.js';

/**
 * ANSI dim/reset.  We hand-code these instead of pulling a colors lib so the
 * package stays tiny and works in non-TTY pipes (we detect and strip).
 */
const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

export interface RenderOptions {
  color: boolean;
  budget: number;
  task?: string;
}

export function renderPlain(result: PackResult, options: RenderOptions): string {
  const c = options.color ? COLOR : Object.fromEntries(Object.keys(COLOR).map((k) => [k, ''])) as typeof COLOR;
  if (result.files.length === 0) {
    return `${c.yellow}no context selected${c.reset}\n${c.dim}${result.explain}${c.reset}\n`;
  }
  const lines: string[] = [];
  const pad = Math.max(...result.files.map((f) => f.path.length)) + 2;
  const maxScore = result.files[0]?.score ?? 1;
  for (const file of result.files) {
    const ranges = file.ranges.map((r) => `${r.start}-${r.end}`).join(',');
    const score = file.score / Math.max(maxScore, 1e-9);
    const bar = bar20(score);
    lines.push(
      `${c.green}→${c.reset} ${file.path.padEnd(pad)}` +
        `${c.dim}lines ${ranges.padEnd(14)} ${c.reset}` +
        `${c.cyan}${bar}${c.reset} ` +
        `${c.bold}${file.score.toFixed(3)}${c.reset} ` +
        `${c.dim}${file.tokens} tok${c.reset}`,
    );
  }
  lines.push('');
  const pct = options.budget > 0 ? Math.round((result.tokens / options.budget) * 100) : 0;
  lines.push(
    `${c.bold}selected${c.reset} ${result.graph.selected} symbols · ` +
      `${c.bold}cut${c.reset} ${result.graph.cutCost.toFixed(1)} · ` +
      `${c.bold}frontier${c.reset} ${result.graph.frontier} · ` +
      `${c.bold}${result.tokens}${c.reset} / ${options.budget} tokens (${pct}%)`,
  );
  return lines.join('\n') + '\n';
}

export function renderJson(result: PackResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderVerboseTrace(result: PackResult, options: RenderOptions): string {
  if (!result.trace) return '';
  const t = result.trace;
  const c = options.color ? COLOR : (Object.fromEntries(Object.keys(COLOR).map((k) => [k, ''])) as typeof COLOR);
  const lines: string[] = [];
  lines.push(`${c.bold}── trace ───────────────────────────────────────${c.reset}`);
  lines.push(
    `${c.dim}timings:${c.reset} index ${t.timings.indexMs}ms · rank ${t.timings.rankMs}ms ` +
      `· select ${t.timings.selectMs}ms · ${c.bold}total ${t.timings.totalMs}ms${c.reset}`,
  );
  if (t.cache && (t.cache.hits + t.cache.misses) > 0) {
    lines.push(`${c.dim}cache: ${t.cache.hits} hit / ${t.cache.misses} miss${c.reset}`);
  }
  lines.push('');
  lines.push(`${c.bold}seeds (${t.seeds.length}):${c.reset}`);
  for (const s of t.seeds.slice(0, 10)) {
    lines.push(`  ${c.cyan}${s.score.toFixed(3).padStart(7)}${c.reset}  ${s.id}`);
  }
  lines.push('');
  lines.push(`${c.bold}top-ranked nodes:${c.reset}`);
  for (const r of t.topRanked.slice(0, 10)) {
    lines.push(`  ${c.cyan}${r.rank.toFixed(4).padStart(7)}${c.reset}  ${r.id}`);
  }
  lines.push('');
  lines.push(`${c.bold}selection order:${c.reset}`);
  for (let i = 0; i < t.selectionOrder.length && i < 20; i++) {
    const e = t.selectionOrder[i];
    const prefix = (i + 1).toString().padStart(2);
    lines.push(
      `  ${c.dim}${prefix}${c.reset}  ${c.cyan}${e.rank.toFixed(4).padStart(7)}${c.reset} ` +
        `${c.dim}${(e.tokens + ' tok').padEnd(8)}${c.reset} ${e.id}  ${c.dim}${e.reason}${c.reset}`,
    );
  }
  return lines.join('\n') + '\n';
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
  tokens: number;
  score: number;
  ranges?: Array<{ start: number; end: number }>;
}

export function renderTree(result: PackResult, options: RenderOptions): string {
  const c = options.color ? COLOR : (Object.fromEntries(Object.keys(COLOR).map((k) => [k, ''])) as typeof COLOR);
  if (result.files.length === 0) {
    return `${c.yellow}no context selected${c.reset}\n${c.dim}${result.explain}${c.reset}\n`;
  }

  const root: TreeNode = { name: '', children: new Map(), isFile: false, tokens: 0, score: 0 };
  for (const file of result.files) {
    const segments = file.path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const isLast = i === segments.length - 1;
      const seg = segments[i];
      let child = node.children.get(seg);
      if (!child) {
        child = {
          name: seg,
          children: new Map(),
          isFile: isLast,
          tokens: 0,
          score: 0,
        };
        node.children.set(seg, child);
      }
      child.tokens += file.tokens;
      child.score += file.score;
      if (isLast) {
        child.ranges = file.ranges;
      }
      node = child;
    }
  }

  const lines: string[] = [];
  walkTree(root, '', lines, c);

  lines.push('');
  const pct = options.budget > 0 ? Math.round((result.tokens / options.budget) * 100) : 0;
  lines.push(
    `${c.bold}selected${c.reset} ${result.graph.selected} symbols · ` +
      `${c.bold}cut${c.reset} ${result.graph.cutCost.toFixed(1)} · ` +
      `${c.bold}${result.tokens}${c.reset} / ${options.budget} tokens (${pct}%)`,
  );
  return lines.join('\n') + '\n';
}

function walkTree(node: TreeNode, indent: string, lines: string[], c: typeof COLOR): void {
  const childArr = [...node.children.values()].sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1; // directories first
    return b.score - a.score;
  });
  for (let i = 0; i < childArr.length; i++) {
    const child = childArr[i];
    const last = i === childArr.length - 1;
    const branch = last ? '└── ' : '├── ';
    const cont = last ? '    ' : '│   ';
    const ranges = child.ranges?.map((r) => `${r.start}-${r.end}`).join(',');
    const right = child.isFile
      ? `  ${c.cyan}${child.score.toFixed(3)}${c.reset} ${c.dim}${child.tokens} tok${ranges ? ` lines ${ranges}` : ''}${c.reset}`
      : `  ${c.dim}(${child.tokens} tok, ${child.children.size} ${child.children.size === 1 ? 'item' : 'items'})${c.reset}`;
    const labelColor = child.isFile ? c.green : c.bold;
    const slash = child.isFile ? '' : '/';
    lines.push(`${indent}${branch}${labelColor}${child.name}${slash}${c.reset}${right}`);
    if (!child.isFile && child.children.size > 0) {
      walkTree(child, indent + cont, lines, c);
    }
  }
}

export function renderMarkdown(result: PackResult, options: RenderOptions): string {
  const lines: string[] = [];
  lines.push(`# Context for: ${escape(options.task ?? '')}`);
  lines.push('');
  lines.push(
    `Selected ${result.graph.selected} symbols from ${result.files.length} files · ` +
      `${result.tokens} / ${options.budget} tokens · cut cost ${result.graph.cutCost.toFixed(1)}`,
  );
  lines.push('');
  for (const file of result.files) {
    const ranges = file.ranges.map((r) => `${r.start}-${r.end}`).join(', ');
    lines.push(`## \`${file.path}\` (lines ${ranges})`);
    lines.push(`<sub>score ${file.score.toFixed(3)} · ${file.tokens} tokens</sub>`);
    lines.push('');
  }
  return lines.join('\n');
}

function bar20(fraction: number): string {
  const n = Math.max(0, Math.min(20, Math.round(fraction * 20)));
  return '█'.repeat(n).padEnd(20, '·');
}

function escape(s: string): string {
  return s.replace(/[`*_]/g, '\\$&');
}
