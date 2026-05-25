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

interface Task {
  id: string;
  task: string;
  correct: string[];
  nice_to_have?: string[];
}

interface Fixtures {
  repo: string;
  tasks: Task[];
}

interface Run {
  taskId: string;
  retrieval: Retrieval;
  metrics: Metrics;
}

interface RunnerReport {
  perStrategy: Record<string, { perTask: Run[]; aggregate: Metrics }>;
}

const STRATEGIES = ['mincut', 'mincut-embed', 'grep', 'random'] as const;
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

  const report: RunnerReport = { perStrategy: {} };
  for (const s of STRATEGIES) report.perStrategy[s] = { perTask: [], aggregate: {} as Metrics };

  for (const t of fx.tasks) {
    const ground = { correct: t.correct, niceToHave: t.nice_to_have };

    const mincut = toRetrieval(await pack({ task: t.task, repo, budget, cache: true }));
    pushRun(report, 'mincut', t.id, mincut, ground);

    let embedRet: Retrieval = mincut;
    if (!skipEmbed) {
      try {
        const { createTransformersEmbedder } = await import('../src/seeds/transformers-embedder.js');
        const embedder = createTransformersEmbedder();
        embedRet = toRetrieval(await pack({ task: t.task, repo, budget, cache: true, embedder, embedWeight: 0.5 }));
      } catch {
        embedRet = mincut;
      }
    }
    pushRun(report, 'mincut-embed', t.id, embedRet, ground);

    pushRun(report, 'grep', t.id, grepBaseline(t.task, repo, budget), ground);
    pushRun(report, 'random', t.id, randomBaseline(t.task, repo, budget, 1), ground);
  }

  for (const s of STRATEGIES) {
    report.perStrategy[s].aggregate = aggregate(report.perStrategy[s].perTask.map((r) => r.metrics));
  }

  const md = renderMarkdown(report, fx.tasks, budget);
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

function renderMarkdown(report: RunnerReport, tasks: Task[], budget: number): string {
  const out: string[] = [];
  out.push(`# mincut-context — evaluation report`);
  out.push('');
  out.push(`Budget: **${budget} tokens** per pack · ${tasks.length} labeled tasks · 4 strategies`);
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
  return out.join('\n') + '\n';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
