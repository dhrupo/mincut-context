import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ParseResult } from '../parsers/parser.js';

const CACHE_SCHEMA_VERSION = 'v1';

export interface CacheEntry {
  version: string;
  path: string;
  mtimeMs: number;
  size: number;
  result: ParseResult;
}

export interface CacheStats {
  hits: number;
  misses: number;
}

export class ParseCache {
  private readonly dir: string;
  private stats: CacheStats = { hits: 0, misses: 0 };

  constructor(cacheRoot: string) {
    this.dir = path.join(cacheRoot, CACHE_SCHEMA_VERSION);
    mkdirSync(this.dir, { recursive: true });
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Look up a cached parse result.  Returns undefined on cache miss, OR if
   * the cached entry's mtime/size do not match the current file on disk, OR
   * if the schema version has drifted.
   */
  get(relPath: string, mtimeMs: number, size: number): ParseResult | undefined {
    const file = this.entryPath(relPath);
    if (!existsSync(file)) {
      this.stats.misses += 1;
      return undefined;
    }
    let raw: CacheEntry;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry;
    } catch {
      this.stats.misses += 1;
      return undefined;
    }
    if (
      raw.version !== CACHE_SCHEMA_VERSION ||
      raw.path !== relPath ||
      raw.mtimeMs !== mtimeMs ||
      raw.size !== size
    ) {
      this.stats.misses += 1;
      return undefined;
    }
    this.stats.hits += 1;
    return raw.result;
  }

  put(relPath: string, mtimeMs: number, size: number, result: ParseResult): void {
    const entry: CacheEntry = {
      version: CACHE_SCHEMA_VERSION,
      path: relPath,
      mtimeMs,
      size,
      result,
    };
    writeFileSync(this.entryPath(relPath), JSON.stringify(entry));
  }

  private entryPath(relPath: string): string {
    // Stable, filesystem-safe filename from the source path.  We hash so deeply
    // nested paths don't blow the OS filename limit, and we prefix with a short
    // human-readable hint so cache dirs are debuggable.
    const hash = createHash('sha1').update(relPath).digest('hex').slice(0, 16);
    const hint = relPath.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 40);
    return path.join(this.dir, `${hint}-${hash}.json`);
  }
}

export function fileFingerprint(absPath: string): { mtimeMs: number; size: number } | null {
  try {
    const s = statSync(absPath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}
