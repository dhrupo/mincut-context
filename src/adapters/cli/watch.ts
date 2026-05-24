import chokidar from 'chokidar';
import { pack, type PackOptions, type PackResult } from '../../select/pack.js';
import { renderPlain } from './render.js';

export interface WatchOptions extends PackOptions {
  /** Debounce window in ms before re-packing after a file change. Default 300. */
  debounceMs?: number;
  /** Glob patterns to watch. Defaults to supported source extensions. */
  watchPatterns?: string[];
  /** ANSI color in plain output. Default true. */
  color?: boolean;
  /** Run once immediately, then on changes. Default true. */
  initial?: boolean;
  /** Force polling instead of native fs events.  Slower but more reliable. */
  usePolling?: boolean;
}

/**
 * Long-running watch mode.  Re-packs whenever any source file in the repo
 * changes, with a small debounce to coalesce rapid editor saves.  Designed
 * to be piped into terminals during active development sessions.
 *
 * Returns a stop() function so embedders (and tests) can shut it down.
 */
export function startWatch(
  options: WatchOptions,
  onResult: (result: PackResult, reason: 'initial' | 'change') => void,
): { stop: () => Promise<void> } {
  const debounceMs = options.debounceMs ?? 300;
  const watchTarget = options.watchPatterns ?? options.repo;
  const supportedExt = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|pyi|php|vue)$/;

  const watcher = chokidar.watch(watchTarget, {
    ignored: (filePath, stats) => {
      if (/node_modules|\.mincut-cache|\.git|dist|build/.test(filePath)) return true;
      if (stats?.isFile() && !supportedExt.test(filePath)) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true,
    usePolling: options.usePolling ?? false,
    interval: 80,
  });

  let pending: NodeJS.Timeout | null = null;
  let inflight = false;
  let queued = false;

  const fire = async (reason: 'initial' | 'change'): Promise<void> => {
    if (inflight) {
      queued = true;
      return;
    }
    inflight = true;
    try {
      const result = await pack(options);
      onResult(result, reason);
    } finally {
      inflight = false;
      if (queued) {
        queued = false;
        await fire('change');
      }
    }
  };

  const schedule = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void fire('change');
    }, debounceMs);
  };

  watcher.on('change', schedule);
  watcher.on('add', schedule);
  watcher.on('unlink', schedule);

  if (options.initial !== false) {
    // Fire-and-forget initial pack on next tick so callers can attach listeners.
    setImmediate(() => void fire('initial'));
  }

  return {
    async stop(): Promise<void> {
      if (pending) clearTimeout(pending);
      await watcher.close();
    },
  };
}

/**
 * CLI-facing wrapper.  Formats each result with the plain renderer and
 * writes it to stdout, prefixed by a clear marker so the consumer can
 * see when a new pack lands.
 */
export function runWatchCli(options: WatchOptions): { stop: () => Promise<void> } {
  return startWatch(options, (result, reason) => {
    const ts = new Date().toISOString().slice(11, 19);
    process.stdout.write(
      `\n${reason === 'initial' ? '── initial pack' : '── re-pack'} (${ts}) ────────────────────\n`,
    );
    process.stdout.write(
      renderPlain(result, { color: Boolean(options.color) && process.stdout.isTTY, budget: options.budget }),
    );
  });
}
