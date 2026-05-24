import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ParseResult } from '../parsers/parser.js';

/**
 * Minimal worker pool for parallel parsing.
 *
 * Each worker hosts its own tree-sitter Parser instances and processes one
 * file at a time.  The main thread dispatches files round-robin and awaits
 * a Promise per file; the underlying message channel is shared with the
 * pool's idle-worker queue to keep things simple.
 */
export class ParsePool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly pending = new Map<number, (r: ParseResult | null) => void>();
  private readonly queue: Array<{ id: number; file: string; source: string }> = [];
  private nextId = 1;
  private closed = false;

  constructor(size: number) {
    const workerPath = resolveWorkerPath();
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerPath);
      w.on('message', (m: { id: number; result: ParseResult | null }) => {
        const resolve = this.pending.get(m.id);
        if (resolve) {
          this.pending.delete(m.id);
          resolve(m.result);
        }
        this.idle.push(w);
        this.drain();
      });
      w.on('error', () => {
        // Worker died — drop it.  Other workers continue.
      });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  parse(file: string, source: string): Promise<ParseResult | null> {
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.queue.push({ id, file, source });
      this.drain();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
  }

  private drain(): void {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const w = this.idle.shift()!;
      const job = this.queue.shift()!;
      w.postMessage(job);
    }
  }
}

/**
 * Resolve the compiled worker file path.  Workers require pre-compiled .js —
 * Node's worker_threads can't run .ts directly even when the parent is
 * launched by vitest.  Walk from src/index/* → dist/index/* if necessary.
 *
 * Throws a clear error if the build artifact is missing.
 */
function resolveWorkerPath(): string {
  const here = fileURLToPath(import.meta.url);
  const dir = path.dirname(here);

  if (here.endsWith('.js')) {
    return path.join(dir, 'parse-worker.js');
  }

  // We're being loaded from src/ — walk to <pkg>/dist/index/parse-worker.js.
  const repoRoot = path.resolve(dir, '..', '..');
  const candidate = path.join(repoRoot, 'dist', 'index', 'parse-worker.js');
  // We can't sync-check existence without 'fs', but worker_threads will throw
  // a clear ENOENT if the file is missing — that surfaces "did you `npm run
  // build`?" naturally.
  return candidate;
}
