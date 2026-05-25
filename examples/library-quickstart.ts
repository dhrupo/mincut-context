/**
 * Programmatic usage of mincut-context.
 *
 *   npx tsx examples/library-quickstart.ts "fix the login bug" --repo .
 *
 * Pulls a token-minimal context window for the given task, prints a
 * compact budget report, and writes the full pack result to context.json.
 */
import { pack } from 'mincut-context';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const task = args[0];
  if (!task) {
    console.error('usage: library-quickstart.ts "<task>" [--repo <path>] [--budget <n>]');
    process.exit(1);
  }
  const repo = path.resolve(args[args.indexOf('--repo') + 1] ?? process.cwd());
  const budget = Number(args[args.indexOf('--budget') + 1] ?? 4000);

  const result = await pack({
    task,
    repo,
    budget,
    cache: true,
    communityBoost: 0.5,
    chunk: { enabled: true, maxTokens: 400 },
    trimScoreRatio: 0.02,
  });

  console.log(`task   : ${task}`);
  console.log(`repo   : ${repo}`);
  console.log(`budget : ${budget} tokens · used ${result.tokens} (${Math.round((result.tokens / budget) * 100)}%)`);
  console.log(`graph  : ${result.graph.selected}/${result.graph.totalSymbols} symbols · cut ${result.graph.cutCost.toFixed(1)} · frontier ${result.graph.frontier}`);
  console.log('');
  for (const f of result.files) {
    const ranges = f.ranges.map((r) => `${r.start}-${r.end}`).join(',');
    console.log(`  ${f.score.toFixed(3).padStart(6)} ${String(f.tokens).padStart(5)} tok  ${f.path}  [${ranges}]`);
  }

  writeFileSync('context.json', JSON.stringify(result, null, 2));
  console.log('\nfull result → context.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
