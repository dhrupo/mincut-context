import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

export interface WalkOptions {
  /** Glob-like patterns of files to include (matched against POSIX-style relative paths). */
  include?: string[];
  /** Extra ignore patterns appended to .gitignore rules. */
  exclude?: string[];
  /** Max bytes per file before we skip (default 256 KB). */
  maxBytes?: number;
}

export interface WalkedFile {
  absPath: string;
  relPath: string;       // POSIX-separated relative path
  source: string;
}

const DEFAULT_EXCLUDES = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.cache/',
  '.parcel-cache/',
  '.svelte-kit/',
  '.pnpm-store/',
  '.idea/',
  '.vscode/',
  '.DS_Store',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.log',
];

const SUPPORTED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyi']);

export function* walk(root: string, options: WalkOptions = {}): IterableIterator<WalkedFile> {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const ig = buildIgnore(root, options.exclude);
  const includePatterns = options.include?.map(globToPrefix) ?? null;

  function* walkDir(dir: string): IterableIterator<WalkedFile> {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(dir, name);
      const rel = toPosix(path.relative(root, abs));
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      const relForIgnore = stat.isDirectory() ? `${rel}/` : rel;
      if (ig.ignores(relForIgnore)) continue;
      if (stat.isDirectory()) {
        yield* walkDir(abs);
        continue;
      }
      if (!stat.isFile()) continue;
      const ext = path.extname(name);
      if (!SUPPORTED_EXT.has(ext)) continue;
      if (stat.size > maxBytes) continue;
      if (includePatterns && !includePatterns.some((p) => rel.startsWith(p))) continue;
      let source: string;
      try {
        source = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      yield { absPath: abs, relPath: rel, source };
    }
  }

  yield* walkDir(root);
}

function buildIgnore(root: string, extraExcludes?: string[]): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_EXCLUDES);
  const gitignore = path.join(root, '.gitignore');
  if (existsSync(gitignore)) {
    try {
      ig.add(readFileSync(gitignore, 'utf8'));
    } catch {
      // ignore
    }
  }
  if (extraExcludes?.length) ig.add(extraExcludes);
  return ig;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Convert simple glob like 'src/auth/**' into a path prefix.  For v1.0 we
 * support only the trailing `**` / `*` wildcard form; anything fancier should
 * fall back to a full glob library if needed.
 */
function globToPrefix(glob: string): string {
  return glob.replace(/\/\*\*$/, '/').replace(/\/\*$/, '/').replace(/\*\*$/, '');
}
