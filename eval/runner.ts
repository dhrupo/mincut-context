/**
 * Evaluation runner.
 *
 *   npx tsx eval/runner.ts             # uses eval/fixtures/self-repo-tasks.json
 *   npx tsx eval/runner.ts --fixtures eval/fixtures/custom.json
 *   npx tsx eval/runner.ts --budget 3000
 *
 * For each labeled task, runs:
 *   - mincut (default)
 *   - mincut + --embed weight=0.5
 *   - mincut-contract (mincut + frontier-contract A/B)
 *   - grep baseline
 *   - random baseline (seed=1)
 *
 * Computes precision / recall / F1 / token-efficiency for each and writes
 * a Markdown report to eval/results.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pack } from '../src/select/pack.js';
import { aggregate, computeMetrics, type Metrics, type Retrieval } from './metrics.js';
import { grepBaseline } from './baselines/grep-baseline.js';
import { randomBaseline } from './baselines/random-baseline.js';
import { computeBoundary } from './boundary.js';

interface Task {
  id: string;
  task: string;
  correct: string[];
  nice_to_have?: string[];
}

interface Fixtures {
  repo: string;
  tasks: Task[];
  /** Optional repo-wide excludes applied to ALL strategies for fair comparison. */
  exclude?: string[];
}

const DEFAULT_EXCLUDES = ['vendor/**', 'node_modules/**', 'dist/**', 'build/**', '.git/**'];

interface Run {
  taskId: string;
  retrieval: Retrieval;
  metrics: Metrics;
}

interface RunnerReport {
  perStrategy: Record<string, { perTask: Run[]; aggregate: Metrics }>;
}

const STRATEGIES = ['mincut', 'mincut-embed', 'mincut-contract', 'grep', 'random'] as const;
type Strategy = (typeof STRATEGIES)[number];

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  const v = args[idx + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fixturesPath = path.resolve(getArg(args, '--fixtures') ?? 'eval/fixtures/self-repo-tasks.json');
  const budget = Number(getArg(args, '--budget') ?? 4000);
  const skipEmbed = args.includes('--no-embed');

  const fx = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixtures;
  const repo = path.resolve(path.dirname(fixturesPath), fx.repo);
  const exclude = [...DEFAULT_EXCLUDES, ...(fx.exclude ?? [])];

  const report: RunnerReport = { perStrategy: {} };
  for (const s of STRATEGIES) report.perStrategy[s] = { perTask: [], aggregate: {} as Metrics };

  const boundaryByTask: Array<{ taskId: string } & ReturnType<typeof computeBoundary>> = [];

  for (const t of fx.tasks) {
    const ground = { correct: t.correct, niceToHave: t.nice_to_have };

    const mincut = toRetrieval(await pack({ task: t.task, repo, budget, cache: true, exclude }));
    pushRun(report, 'mincut', t.id, mincut, ground);

    let embedRet: Retrieval = mincut;
    if (!skipEmbed) {
      try {
        const { createTransformersEmbedder } = await import('../src/seeds/transformers-embedder.js');
        const embedder = createTransformersEmbedder();
        embedRet = toRetrieval(await pack({ task: t.task, repo, budget, cache: true, exclude, embedder, embedWeight: 0.5 }));
      } catch {
        embedRet = mincut;
      }
    }
    pushRun(report, 'mincut-embed', t.id, embedRet, ground);

    const contractPackResult = await pack({ task: t.task, repo, budget, cache: true, exclude, contract: true });
    const selectedFiles = contractPackResult.files.map((f) => f.path);
    const contractFiles = contractPackResult.contract?.files ?? [];
    const boundary = computeBoundary({
      selectedFiles,
      contractFiles,
      selectedTokens: contractPackResult.tokens,
      contractTokens: contractPackResult.contract?.tokens ?? 0,
      correct: t.correct,
    });
    const contractRet: Retrieval = {
      files: [...selectedFiles, ...contractFiles],
      tokens: contractPackResult.tokens + (contractPackResult.contract?.tokens ?? 0),
    };
    pushRun(report, 'mincut-contract', t.id, contractRet, ground);
    boundaryByTask.push({ taskId: t.id, ...boundary });

    pushRun(report, 'grep', t.id, grepBaseline(t.task, repo, budget, exclude), ground);
    pushRun(report, 'random', t.id, randomBaseline(t.task, repo, budget, 1, exclude), ground);
  }

  for (const s of STRATEGIES) {
    report.perStrategy[s].aggregate = aggregate(report.perStrategy[s].perTask.map((r) => r.metrics));
  }

  const md = renderMarkdown(report, fx.tasks, budget, boundaryByTask);
  writeFileSync(path.resolve('eval/results.md'), md);
  console.log(md);
}

function toRetrieval(packResult: { files: { path: string }[]; tokens: number }): Retrieval {
  return { files: packResult.files.map((f) => f.path), tokens: packResult.tokens };
}

function pushRun(
  report: RunnerReport,
  strategy: Strategy,
  taskId: string,
  retrieval: Retrieval,
  ground: { correct: string[]; niceToHave?: string[] },
): void {
  const metrics = computeMetrics(retrieval, ground);
  report.perStrategy[strategy].perTask.push({ taskId, retrieval, metrics });
}

function avg(ns: number[]): number { return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0; }

function renderMarkdown(
  report: RunnerReport,
  tasks: Task[],
  budget: number,
  boundaryByTask: Array<{ taskId: string } & ReturnType<typeof computeBoundary>>,
): string {
  const out: string[] = [];
  out.push(`# mincut-context — evaluation report`);
  out.push('');
  out.push(`Budget: **${budget} tokens** per pack · ${tasks.length} labeled tasks · ${STRATEGIES.length} strategies`);
  out.push('');
  out.push(`## Aggregate (averaged across all tasks)`);
  out.push('');
  out.push('| strategy | precision | recall | F1 | nice-to-have | tok-eff |');
  out.push('|---|---:|---:|---:|---:|---:|');
  for (const s of STRATEGIES) {
    const m = report.perStrategy[s].aggregate;
    out.push(`| **${s}** | ${m.precision.toFixed(2)} | ${m.recall.toFixed(2)} | ${m.f1.toFixed(2)} | ${m.niceToHaveRecall.toFixed(2)} | ${m.tokenEfficiency.toFixed(3)} |`);
  }
  out.push('');
  out.push('> token-efficiency = (recall × 1000) / tokens — higher means more signal per token spent.');
  out.push('');
  out.push(
    '> `mincut-contract` retrieval counts selected files **and** signature-stub files, ' +
    'so its precision/F1 in the table above are diluted by stubs and are NOT a quality regression. ' +
    'The Frontier-contract A/B section below is the meaningful metric.',
  );
  out.push('');
  out.push(`## Per-task breakdown`);
  for (const t of tasks) {
    out.push('');
    out.push(`### ${t.id} — "${t.task}"`);
    out.push('');
    out.push(`correct: \`${t.correct.join('`, `')}\``);
    out.push('');
    out.push('| strategy | P | R | F1 | tokens | retrieved |');
    out.push('|---|---:|---:|---:|---:|---|');
    for (const s of STRATEGIES) {
      const run = report.perStrategy[s].perTask.find((r) => r.taskId === t.id)!;
      const ret = run.retrieval.files.slice(0, 5).join(', ') + (run.retrieval.files.length > 5 ? ` +${run.retrieval.files.length - 5}` : '');
      out.push(`| ${s} | ${run.metrics.precision.toFixed(2)} | ${run.metrics.recall.toFixed(2)} | ${run.metrics.f1.toFixed(2)} | ${run.retrieval.tokens} | ${ret || '_(empty)_'} |`);
    }
  }
  if (boundaryByTask.length > 0) {
    const aggRecall = avg(boundaryByTask.map((b) => b.recall));
    const aggCoverage = avg(boundaryByTask.map((b) => b.boundaryCoverage));
    const aggContractTokens = avg(boundaryByTask.map((b) => b.contractTokens));
    const aggRecovered = avg(boundaryByTask.map((b) => b.recoveredPerKToken));

    out.push('');
    out.push('## Frontier-contract A/B (signature-level coverage)');
    out.push('');
    out.push('| metric | value |');
    out.push('|---|---|');
    out.push(`| cut-only file recall | ${(aggRecall * 100).toFixed(1)}% |`);
    out.push(`| cut+contract boundary coverage | ${(aggCoverage * 100).toFixed(1)}% |`);
    out.push(`| avg contract tokens / task | ${aggContractTokens.toFixed(0)} |`);
    out.push(`| correct files recovered per 1k contract tokens | ${aggRecovered.toFixed(3)} |`);
    out.push('');
    out.push('> Boundary coverage is signature-level: a file recovered via a stub is reachable, not fully present.');
    out.push('');
  }

  return out.join('\n') + '\n';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
