/**
 * Algorithm benchmark — greedy vs CELF on real graphs.
 *
 *   npx tsx eval/benchmark-algorithms.ts
 *
 * Runs both selectors over the same (graph, seeds, ranks) input on:
 *   1. self-repo (90 symbols, small)
 *   2. FluentForm (4,333 symbols, large)
 *   3. Fluent Player (845 symbols, medium)
 *
 * Reports wall-clock time + verifies the selected sets are equivalent.
 */
import { indexRepo } from '../src/index/builder.js';
import { detectCommunities, personalizedPageRank } from '../src/core/index.js';
import { greedySelect } from '../src/core/select.js';
import { celfSelect } from '../src/core/select-celf.js';
import { scoreSeeds } from '../src/seeds/keyword.js';
import path from 'node:path';

interface Bench {
  repo: string;
  label: string;
  task: string;
}

const BENCHES: Bench[] = [
  { repo: path.resolve('.'), label: 'self-repo', task: 'PageRank algorithm' },
  { repo: '/Volumes/Projects/forms/wp-content/plugins/fluentform', label: 'FluentForm', task: 'stripe payment processor' },
  { repo: '/Volumes/Projects/forms/wp-content/plugins/fluent-player-dev', label: 'Fluent Player', task: 'analytics tracking' },
];

const ITERATIONS = 5;
const BUDGET = 4000;

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main(): Promise<void> {
  console.log('| repo | symbols | edges | algorithm | median ms | selected | cut |');
  console.log('|---|---:|---:|---|---:|---:|---:|');
  for (const b of BENCHES) {
    try {
      const { graph } = indexRepo(b.repo, {
        cache: true,
        exclude: ['vendor/**', 'node_modules/**', 'dist/**', 'build/**'],
      });
      const seedMap = scoreSeeds(graph, b.task, { k: 8 });
      const seeds = new Set<string>();
      let used = 0;
      for (const [id] of seedMap) {
        const data = graph.getNode(id);
        if (!data) continue;
        if (used + data.tokens > BUDGET) continue;
        seeds.add(id);
        used += data.tokens;
      }
      if (seeds.size === 0) {
        console.log(`| ${b.label} | - | - | (no seeds) | - | - | - |`);
        continue;
      }
      const ranks = personalizedPageRank(graph, { seeds: seedMap });
      const communities = detectCommunities(graph, { seed: 1 });

      const greedyTimes: number[] = [];
      const celfTimes: number[] = [];
      let g, c;
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = Date.now();
        g = greedySelect(graph, { seeds, ranks, budget: BUDGET, communities, communityBoost: 0.5 });
        greedyTimes.push(Date.now() - t0);

        const t1 = Date.now();
        c = celfSelect(graph, { seeds, ranks, budget: BUDGET, communities, communityBoost: 0.5 });
        celfTimes.push(Date.now() - t1);
      }
      const gMed = median(greedyTimes);
      const cMed = median(celfTimes);
      const eq = g && c && setsEqual(g.selected, c.selected);

      console.log(`| ${b.label} | ${graph.order()} | ${graph.size()} | greedy | ${gMed} | ${g!.selected.size} | ${g!.cutCost.toFixed(1)} |`);
      console.log(`| ${b.label} | ${graph.order()} | ${graph.size()} | **CELF** | **${cMed}** | ${c!.selected.size} | ${c!.cutCost.toFixed(1)} | ${eq ? '✓ equivalent' : '✗ DIVERGED'} |`);
    } catch (e) {
      console.log(`| ${b.label} | error | error | - | - | - | - | ${(e as Error).message.slice(0, 60)} |`);
    }
  }
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
