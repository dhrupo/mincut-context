#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { pack, type PackResult } from '../../select/pack.js';
import { indexRepo } from '../../index/builder.js';
import { renderJson, renderMarkdown, renderPlain, renderTree, renderVerboseTrace } from './render.js';

async function runInteractive(
  result: PackResult,
  budget: number,
  repo: string,
): Promise<PackResult> {
  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { ReviewApp } = await import('./tui.js');

  return new Promise((resolve) => {
    const app = render(
      React.createElement(ReviewApp, {
        initial: result,
        budget,
        repo,
        onSubmit: (paths: string[]) => {
          const keep = new Set(paths);
          resolve({
            ...result,
            files: result.files.filter((f) => keep.has(f.path)),
            tokens: result.files
              .filter((f) => keep.has(f.path))
              .reduce((s, f) => s + f.tokens, 0),
          });
          app.unmount();
        },
      }),
    );
  });
}

const program = new Command();

program
  .name('mcx')
  .description('mincut-context — token-minimal context selection for AI coding agents')
  .version('1.6.0');

program
  .command('pack <task...>')
  .description('Pack a token-minimal context window for the given task')
  .option('-r, --repo <path>', 'Repository root', process.cwd())
  .option('-b, --budget <tokens>', 'Token budget', (v) => Number(v), 4000)
  .option('-k, --seeds <count>', 'Top-k seeds', (v) => Number(v), 8)
  .option('--alpha <number>', 'PageRank damping factor', (v) => Number(v), 0.85)
  .option('--include <pattern...>', 'Restrict to glob patterns (e.g. src/auth/**)')
  .option('--exclude <pattern...>', 'Extra ignore patterns appended to .gitignore')
  .option('-f, --format <fmt>', 'Output format: plain | tree | json | markdown', 'plain')
  .option('--no-color', 'Disable colored output')
  .option('--embed', 'Use semantic embeddings (downloads ~22 MB model on first run)', false)
  .option('--embed-weight <number>', 'Blend factor 0..1 (0=keyword, 1=embedding only)', (v) => Number(v), 0.5)
  .option('--embed-model <id>', 'Hugging Face model id', 'Xenova/all-MiniLM-L6-v2')
  .option('-i, --interactive', 'Interactive review — pin/exclude in a TUI before output', false)
  .option('--cache', 'Use persistent parse cache at .mincut-cache/ (fast repeat runs)', false)
  .option('--cache-dir <path>', 'Override cache directory (absolute path)')
  .option('--community-boost <number>', 'Louvain same-community boost factor (0 = disabled)', (v) => Number(v), 0.5)
  .option('-v, --verbose', 'Print algorithm trace (seeds, ranks, selection order, timings)', false)
  .option('-j, --parallel <n>', 'Use n parallel parser workers (0 = sequential, default 0)', (v) => Number(v), 0)
  .option('--chunk', 'Split large functions into sub-symbol chunks (TS/JS/Vue)', false)
  .option('--chunk-tokens <n>', 'Token threshold for chunking', (v) => Number(v), 400)
  .option('--lsp', 'Refine call edges via typescript-language-server (requires the binary on PATH)', false)
  .option('--trim-ratio <r>', 'Drop tail files scoring < r × top-file (0 disables, default 0.02)', (v) => Number(v), 0.02)
  .action(async (taskWords: string[], opts) => {
    const task = taskWords.join(' ').trim();
    if (!task) {
      process.stderr.write('error: task is required\n');
      process.exit(1);
    }
    try {
      let embedder;
      if (opts.embed) {
        const { createTransformersEmbedder } = await import(
          '../../seeds/transformers-embedder.js'
        );
        embedder = createTransformersEmbedder({ model: opts.embedModel });
      }
      const result = await pack({
        task,
        repo: path.resolve(opts.repo),
        budget: opts.budget,
        seeds: opts.seeds,
        alpha: opts.alpha,
        include: opts.include,
        exclude: opts.exclude,
        embedder,
        embedWeight: opts.embedWeight,
        cache: opts.cache,
        cacheDir: opts.cacheDir,
        communityBoost: opts.communityBoost,
        verbose: opts.verbose,
        parallel: opts.parallel,
        chunk: opts.chunk ? { enabled: true, maxTokens: opts.chunkTokens } : undefined,
        lspClient: opts.lsp
          ? (await import('../../lsp/typescript.js')).createTypeScriptLsp()
          : undefined,
        trimScoreRatio: opts.trimRatio,
      });
      const color = Boolean(opts.color) && process.stdout.isTTY;
      const fmt = (opts.format ?? 'plain').toLowerCase();

      let finalResult = result;
      if (opts.interactive && process.stdout.isTTY) {
        finalResult = await runInteractive(result, opts.budget, path.resolve(opts.repo));
      }

      if (fmt === 'json') {
        process.stdout.write(renderJson(finalResult));
        process.stdout.write('\n');
      } else if (fmt === 'tree') {
        process.stdout.write(renderTree(finalResult, { color, budget: opts.budget }));
        if (opts.verbose && finalResult.trace) {
          process.stdout.write('\n');
          process.stdout.write(renderVerboseTrace(finalResult, { color, budget: opts.budget }));
        }
      } else if (fmt === 'markdown' || fmt === 'md') {
        process.stdout.write(renderMarkdown(finalResult, { color, budget: opts.budget, task }));
      } else {
        process.stdout.write(renderPlain(finalResult, { color, budget: opts.budget }));
        if (opts.verbose && finalResult.trace) {
          process.stdout.write('\n');
          process.stdout.write(renderVerboseTrace(finalResult, { color, budget: opts.budget }));
        }
      }
    } catch (err) {
      process.stderr.write(`error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command('index')
  .description('Index the repo and print stats (optionally warm the on-disk parse cache)')
  .option('-r, --repo <path>', 'Repository root', process.cwd())
  .option('--include <pattern...>', 'Restrict to glob patterns')
  .option('--cache', 'Use persistent parse cache at .mincut-cache/', false)
  .option('--cache-dir <path>', 'Override cache directory (absolute path)')
  .action((opts) => {
    const t0 = Date.now();
    const { stats } = indexRepo(path.resolve(opts.repo), {
      include: opts.include,
      cache: opts.cache,
      cacheDir: opts.cacheDir,
    });
    const elapsed = Date.now() - t0;
    const cacheNote = opts.cache
      ? ` · cache: ${stats.cacheHits} hit / ${stats.cacheMisses} miss`
      : '';
    process.stdout.write(
      `indexed ${stats.files} files · ${stats.symbols} symbols · ${stats.edges} edges ` +
        `(${stats.unresolvedCalls} unresolved calls)${cacheNote} in ${elapsed} ms\n`,
    );
  });

program
  .command('watch <task...>')
  .description('Long-running mode: re-pack the context whenever any source file changes')
  .option('-r, --repo <path>', 'Repository root', process.cwd())
  .option('-b, --budget <tokens>', 'Token budget', (v) => Number(v), 4000)
  .option('-k, --seeds <count>', 'Top-k seeds', (v) => Number(v), 8)
  .option('--include <pattern...>', 'Restrict to glob patterns')
  .option('--exclude <pattern...>', 'Extra ignore patterns')
  .option('--debounce <ms>', 'Debounce window in ms before re-packing', (v) => Number(v), 300)
  .option('--cache', 'Use persistent parse cache', false)
  .option('--community-boost <number>', 'Louvain community boost', (v) => Number(v), 0.5)
  .option('-j, --parallel <n>', 'Parallel parser workers', (v) => Number(v), 0)
  .option('--no-color', 'Disable colored output')
  .action(async (taskWords: string[], opts) => {
    const task = taskWords.join(' ').trim();
    if (!task) {
      process.stderr.write('error: task is required\n');
      process.exit(1);
    }
    const { runWatchCli } = await import('./watch.js');
    const w = runWatchCli({
      task,
      repo: path.resolve(opts.repo),
      budget: opts.budget,
      seeds: opts.seeds,
      include: opts.include,
      exclude: opts.exclude,
      debounceMs: opts.debounce,
      cache: opts.cache,
      communityBoost: opts.communityBoost,
      parallel: opts.parallel,
      color: Boolean(opts.color),
    });
    const shutdown = async (): Promise<void> => {
      await w.stop();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  });

program
  .command('doctor')
  .description('Check environment: Node version, tree-sitter, grammars, LSP, embedder, cache')
  .option('-r, --repo <path>', 'Repository root to inspect', process.cwd())
  .option('--no-color', 'Disable colored output')
  .action(async (opts) => {
    const { runDoctor, renderDoctor } = await import('./doctor.js');
    const report = runDoctor(path.resolve(opts.repo));
    process.stdout.write(renderDoctor(report, Boolean(opts.color) && process.stdout.isTTY));
    if (!report.ok) process.exit(1);
  });

program
  .command('mcp')
  .description('Run as an MCP server over stdio (slice 8 — placeholder)')
  .action(async () => {
    const { runMcpServer } = await import('../mcp/index.js');
    await runMcpServer();
  });

program.parseAsync().catch((err) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});
