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
