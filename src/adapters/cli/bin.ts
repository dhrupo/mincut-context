#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { pack, type PackResult } from '../../select/pack.js';
import { indexRepo } from '../../index/builder.js';
import { renderJson, renderMarkdown, renderPlain } from './render.js';

async function runInteractive(result: PackResult, budget: number): Promise<PackResult> {
  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { ReviewApp } = await import('./tui.js');

  return new Promise((resolve) => {
    const app = render(
      React.createElement(ReviewApp, {
        initial: result,
        budget,
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
  .version('1.0.0');

program
  .command('pack <task...>')
  .description('Pack a token-minimal context window for the given task')
  .option('-r, --repo <path>', 'Repository root', process.cwd())
  .option('-b, --budget <tokens>', 'Token budget', (v) => Number(v), 4000)
  .option('-k, --seeds <count>', 'Top-k seeds', (v) => Number(v), 8)
  .option('--alpha <number>', 'PageRank damping factor', (v) => Number(v), 0.85)
  .option('--include <pattern...>', 'Restrict to glob patterns (e.g. src/auth/**)')
  .option('--exclude <pattern...>', 'Extra ignore patterns appended to .gitignore')
  .option('-f, --format <fmt>', 'Output format: plain | json | markdown', 'plain')
  .option('--no-color', 'Disable colored output')
  .option('--embed', 'Use semantic embeddings (downloads ~22 MB model on first run)', false)
  .option('--embed-weight <number>', 'Blend factor 0..1 (0=keyword, 1=embedding only)', (v) => Number(v), 0.5)
  .option('--embed-model <id>', 'Hugging Face model id', 'Xenova/all-MiniLM-L6-v2')
  .option('-i, --interactive', 'Interactive review — pin/exclude in a TUI before output', false)
  .option('--cache', 'Use persistent parse cache at .mincut-cache/ (fast repeat runs)', false)
  .option('--cache-dir <path>', 'Override cache directory (absolute path)')
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
      });
      const color = Boolean(opts.color) && process.stdout.isTTY;
      const fmt = (opts.format ?? 'plain').toLowerCase();

      let finalResult = result;
      if (opts.interactive && process.stdout.isTTY) {
        finalResult = await runInteractive(result, opts.budget);
      }

      if (fmt === 'json') {
        process.stdout.write(renderJson(finalResult));
        process.stdout.write('\n');
      } else if (fmt === 'markdown' || fmt === 'md') {
        process.stdout.write(renderMarkdown(finalResult, { color, budget: opts.budget, task }));
      } else {
        process.stdout.write(renderPlain(finalResult, { color, budget: opts.budget }));
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
