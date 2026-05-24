import { existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

export function runDoctor(repo: string): DoctorReport {
  const checks: DoctorCheck[] = [];
  checks.push(checkNodeVersion());
  checks.push(checkTreeSitter());
  checks.push(checkTreeSitterLanguages());
  checks.push(checkTypescriptLsp());
  checks.push(checkTransformers());
  checks.push(checkCache(repo));
  checks.push(checkRepoLooksRight(repo));
  const ok = checks.every((c) => c.status !== 'fail');
  return { checks, ok };
}

function checkNodeVersion(): DoctorCheck {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) {
    return { name: 'node version', status: 'ok', detail: `v${process.versions.node}` };
  }
  return {
    name: 'node version',
    status: 'fail',
    detail: `v${process.versions.node} (need >= 18.17)`,
    hint: 'Upgrade Node.  Recommended: install via nvm or volta.',
  };
}

function checkTreeSitter(): DoctorCheck {
  try {
    const req = createRequire(import.meta.url);
    const v = (req('tree-sitter/package.json') as { version: string }).version;
    return { name: 'tree-sitter native', status: 'ok', detail: `v${v}` };
  } catch (e) {
    return {
      name: 'tree-sitter native',
      status: 'fail',
      detail: `not loadable (${(e as Error).message})`,
      hint: 'Try re-running `npm install --legacy-peer-deps`',
    };
  }
}

function checkTreeSitterLanguages(): DoctorCheck {
  const langs = [
    ['tree-sitter-typescript', 'TS/JS/Vue'],
    ['tree-sitter-python', 'Python'],
    ['tree-sitter-php', 'PHP'],
  ];
  const req = createRequire(import.meta.url);
  const found: string[] = [];
  const missing: string[] = [];
  for (const [mod, label] of langs) {
    try {
      req.resolve(mod);
      found.push(label);
    } catch {
      missing.push(label);
    }
  }
  if (missing.length === 0) {
    return { name: 'language grammars', status: 'ok', detail: found.join(' · ') };
  }
  return {
    name: 'language grammars',
    status: 'warn',
    detail: `found ${found.join(', ')} · missing ${missing.join(', ')}`,
    hint: 'Affected file types will be skipped.',
  };
}

function checkTypescriptLsp(): DoctorCheck {
  try {
    // Literal arguments, no user input — safe.
    execFileSync('typescript-language-server', ['--version'], { stdio: 'ignore' });
    return { name: 'typescript-language-server', status: 'ok', detail: 'available — --lsp will work' };
  } catch {
    return {
      name: 'typescript-language-server',
      status: 'warn',
      detail: 'not installed',
      hint: 'Install with `npm i -g typescript-language-server` to enable --lsp.',
    };
  }
}

function checkTransformers(): DoctorCheck {
  try {
    const req = createRequire(import.meta.url);
    req.resolve('@xenova/transformers');
    return { name: '@xenova/transformers', status: 'ok', detail: 'available — --embed will work' };
  } catch {
    return {
      name: '@xenova/transformers',
      status: 'warn',
      detail: 'not installed',
      hint: 'Reinstall mincut-context to get semantic embeddings.',
    };
  }
}

function checkCache(repo: string): DoctorCheck {
  const cacheDir = path.join(repo, '.mincut-cache');
  if (!existsSync(cacheDir)) {
    return { name: 'parse cache', status: 'ok', detail: 'no cache yet (will be created on first --cache run)' };
  }
  let size = 0;
  let files = 0;
  walk(cacheDir, (p) => {
    size += statSync(p).size;
    files += 1;
  });
  const mb = (size / (1024 * 1024)).toFixed(1);
  return { name: 'parse cache', status: 'ok', detail: `${files} entries · ${mb} MB at ${cacheDir}` };
}

function checkRepoLooksRight(repo: string): DoctorCheck {
  if (!existsSync(repo)) {
    return { name: 'repo path', status: 'fail', detail: `${repo} does not exist` };
  }
  const hasNodeModules = existsSync(path.join(repo, 'node_modules'));
  const hasGit = existsSync(path.join(repo, '.git'));
  const hasGitignore = existsSync(path.join(repo, '.gitignore'));
  const indicators = [hasNodeModules && 'node_modules', hasGit && '.git', hasGitignore && '.gitignore']
    .filter(Boolean)
    .join(' · ');
  if (indicators.length === 0) {
    return {
      name: 'repo path',
      status: 'warn',
      detail: `${repo} has no .git, .gitignore, or node_modules — is this really a code repo?`,
    };
  }
  return { name: 'repo path', status: 'ok', detail: `${repo} (${indicators})` };
}

function walk(dir: string, fn: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const s = statSync(p);
      if (s.isDirectory()) walk(p, fn);
      else fn(p);
    } catch {
      /* ignore */
    }
  }
}

export function renderDoctor(report: DoctorReport, color = true): string {
  const c = color
    ? { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m' }
    : { reset: '', green: '', yellow: '', red: '', dim: '', bold: '' };

  const lines: string[] = [];
  lines.push(`${c.bold}mincut-context · environment check${c.reset}`);
  lines.push('');
  for (const ch of report.checks) {
    const mark = ch.status === 'ok' ? `${c.green}✓${c.reset}` : ch.status === 'warn' ? `${c.yellow}!${c.reset}` : `${c.red}✗${c.reset}`;
    lines.push(`  ${mark} ${c.bold}${ch.name.padEnd(28)}${c.reset} ${c.dim}${ch.detail}${c.reset}`);
    if (ch.hint) lines.push(`    ${c.dim}↳ ${ch.hint}${c.reset}`);
  }
  lines.push('');
  lines.push(report.ok ? `${c.green}all checks passed${c.reset}` : `${c.red}one or more failures — see above${c.reset}`);
  return lines.join('\n') + '\n';
}
