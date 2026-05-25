# Cross-repo evaluation results

`mincut-context` vs grep keyword baseline vs random baseline, on three independent codebases.

All runs at **4000-token budget**, syntactic-only seeding (no `--embed`), with consistent excludes (`vendor/**`, `node_modules/**`, `dist/**`, `build/**`).

## Aggregate across all 28 hand-labeled tasks

| strategy | precision | recall | F1 | tok-eff |
|---|---:|---:|---:|---:|
| **mincut**         | 0.27 | **0.83** | **0.39** | **0.270** |
| mincut + `--embed` | 0.27 | 0.83 | 0.39 | 0.270 |
| grep baseline      | 0.11 | 0.42 | 0.16 | 0.105 |
| random (control)   | 0.01 | 0.04 | 0.01 | 0.009 |

**mincut catches ~83% of correct files vs grep's ~42% — roughly 2× better recall and ~2.5× better token-efficiency across diverse real codebases.**

## Per-repo breakdown

### Self-repo (`mincut-context`) — 12 tasks, TS-only

| strategy | P | R | F1 | tok-eff |
|---|---:|---:|---:|---:|
| **mincut** | 0.30 | **0.97** | **0.44** | **0.413** |
| grep | 0.24 | 0.56 | 0.30 | 0.142 |
| random | 0.02 | 0.11 | 0.03 | 0.028 |

Full report: [`eval/results.md`](./results.md)

Tasks include: pagerank, min-cut-selection, vue-script-block, python-chunking, mcp-server, tui-vim-keys, watch-mode, compressed-cache, doctor, seed-scoring, lsp-resolver, parallel-parsing.

### FluentForm — 8 tasks, mixed PHP + Vue + JS (~800 files)

| strategy | P | R | F1 | tok-eff |
|---|---:|---:|---:|---:|
| **mincut** | 0.30 | **0.88** | **0.43** | **0.234** |
| grep | 0.02 | 0.13 | 0.04 | 0.032 |
| random | 0.00 | 0.00 | 0.00 | 0.000 |

Reproduce: `npx tsx eval/runner.ts --fixtures eval/fixtures/fluentform-tasks.json --budget 4000 --no-embed`

Tasks include: stripe-processor, submission-handler, form-builder, ai-form-builder, shortcode-parser, entries-list-vue, ajax-endpoints-payments, form-fields-parser.

### Fluent Player free — 8 tasks, mostly TS/JSX runtime + admin Vue (~225 files)

| strategy | P | R | F1 | tok-eff |
|---|---:|---:|---:|---:|
| **mincut** | 0.22 | **0.63** | **0.31** | **0.162** |
| grep | 0.07 | 0.56 | 0.13 | 0.141 |
| random | 0.00 | 0.00 | 0.00 | 0.000 |

Reproduce: `npx tsx eval/runner.ts --fixtures eval/fixtures/fluentplayer-tasks.json --budget 4000 --no-embed`

Tasks include: analytics-tracker, playback-speed, video-layout, audio-layout, playlist-manager, play-button, captions, video-source.

## Honest observations

- **mincut wins on every task set.**  No regression to grep on any repo.
- **The Fluent Player run is the weakest** (0.63 recall vs 0.88+ on the others).  Investigation: the path-aware seeding boosts the `analytics/` directory match, but Fluent Player has *two* analytics clusters — a runtime tracker in `resources/js/` and admin Vue components in `resources/admin/modules/analytics/`.  The seeder picks the admin cluster for some tasks where the runtime cluster was the correct answer.  A future improvement could disambiguate via call-graph centrality.
- **Embeddings don't help on these task sets.**  The labels were keyword-friendly, so semantic seeding produces identical hits as keyword seeding.  Embeddings remain useful for tasks where the user's vocabulary diverges from the code's (e.g. "centrality" → "PageRank").
- **Precision is consistently ~0.25–0.30**, not 1.0, because mincut fills the budget with attached context, so the returned set is larger than the ground-truth set.  For agent-consumption this is correct behavior — extra structural context is helpful, not harmful, as long as it's small.  If you need strict precision (e.g. for evaluator-as-a-judge work), lower `--trim-ratio` to be more aggressive.
