# mincut-context — evaluation report

Budget: **4000 tokens** per pack · 12 labeled tasks · 4 strategies

## Aggregate (averaged across all tasks)

| strategy | precision | recall | F1 | nice-to-have | tok-eff |
|---|---:|---:|---:|---:|---:|
| **mincut** | 0.30 | 0.97 | 0.44 | 0.13 | 0.413 |
| **mincut-embed** | 0.30 | 0.97 | 0.44 | 0.13 | 0.413 |
| **grep** | 0.24 | 0.56 | 0.30 | 0.54 | 0.142 |
| **random** | 0.02 | 0.11 | 0.03 | 0.08 | 0.028 |

> token-efficiency = (recall × 1000) / tokens — higher means more signal per token spent.

## Per-task breakdown

### pagerank — "implement personalized PageRank algorithm"

correct: `src/core/pagerank.ts`, `src/core/graph.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.33 | 1.00 | 0.50 | 1794 | src/core/pagerank.ts, src/index/cache.ts, src/index/worker-pool.ts, src/index/builder.ts, src/core/graph.ts +1 |
| mincut-embed | 0.33 | 1.00 | 0.50 | 1794 | src/core/pagerank.ts, src/index/cache.ts, src/index/worker-pool.ts, src/index/builder.ts, src/core/graph.ts +1 |
| grep | 0.20 | 0.50 | 0.29 | 3905 | src/core/select.ts, src/core/pagerank.ts, tests/integration/core-pipeline.test.ts, src/adapters/lib/index.ts, src/core/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### min-cut-selection — "greedy budget-constrained min-cut selection"

correct: `src/core/select.ts`, `src/core/graph.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.40 | 1.00 | 0.57 | 2416 | src/core/select.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts |
| mincut-embed | 0.40 | 1.00 | 0.57 | 2416 | src/core/select.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts |
| grep | 0.40 | 1.00 | 0.57 | 3924 | src/core/select.ts, src/core/graph.ts, tests/integration/core-pipeline.test.ts, src/core/index.ts, src/adapters/lib/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### vue-script-block — "vue single file component script block parsing"

correct: `src/parsers/vue.ts`, `src/parsers/ts.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.22 | 1.00 | 0.36 | 3221 | src/parsers/vue.ts, src/parsers/ts.ts, src/index/worker-pool.ts, src/index/cache.ts, src/lsp/typescript.ts +4 |
| mincut-embed | 0.22 | 1.00 | 0.36 | 3221 | src/parsers/vue.ts, src/parsers/ts.ts, src/index/worker-pool.ts, src/index/cache.ts, src/lsp/typescript.ts +4 |
| grep | 0.17 | 0.50 | 0.25 | 3995 | src/parsers/vue.ts, tests/unit/parsers/vue.test.ts, tests/integration/vue-pack.test.ts, src/index/parse-worker.ts, tests/integration/core-pipeline.test.ts +1 |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### python-chunking — "split large python functions into chunks at statement boundaries"

correct: `src/parsers/py.ts`, `src/parsers/chunking.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.29 | 1.00 | 0.44 | 3321 | src/parsers/py.ts, src/seeds/keyword.ts, src/parsers/chunking.ts, src/index/builder.ts, src/parsers/parser.ts +2 |
| mincut-embed | 0.29 | 1.00 | 0.44 | 3321 | src/parsers/py.ts, src/seeds/keyword.ts, src/parsers/chunking.ts, src/index/builder.ts, src/parsers/parser.ts +2 |
| grep | 0.00 | 0.00 | 0.00 | 3907 | src/index/builder.ts, vitest.config.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### mcp-server — "MCP server tools find_callers find_callees search_symbols"

correct: `src/adapters/mcp/handler.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.14 | 1.00 | 0.25 | 3888 | src/adapters/mcp/handler.ts, src/core/graph.ts, src/adapters/mcp/index.ts, src/index/cache.ts, src/lsp/resolver.ts +2 |
| mincut-embed | 0.14 | 1.00 | 0.25 | 3888 | src/adapters/mcp/handler.ts, src/core/graph.ts, src/adapters/mcp/index.ts, src/index/cache.ts, src/lsp/resolver.ts +2 |
| grep | 0.33 | 1.00 | 0.50 | 3828 | src/adapters/mcp/handler.ts, tests/integration/mcp-graph-tools.test.ts, src/adapters/mcp/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### tui-vim-keys — "interactive TUI with vim navigation and preview pane"

correct: `src/adapters/cli/tui.tsx`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.33 | 1.00 | 0.50 | 2744 | src/adapters/cli/tui.tsx, src/index/builder.ts, src/adapters/cli/bin.ts |
| mincut-embed | 0.33 | 1.00 | 0.50 | 2744 | src/adapters/cli/tui.tsx, src/index/builder.ts, src/adapters/cli/bin.ts |
| grep | 0.00 | 0.00 | 0.00 | 3903 | tests/integration/tui.test.tsx, src/adapters/cli/bin.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### watch-mode — "long running watch mode that re-packs on file change"

correct: `src/adapters/cli/watch.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.17 | 1.00 | 0.29 | 3985 | src/adapters/cli/watch.ts, src/select/pack.ts, src/index/cache.ts, src/adapters/cli/render.ts, src/index/walker.ts +1 |
| mincut-embed | 0.17 | 1.00 | 0.29 | 3985 | src/adapters/cli/watch.ts, src/select/pack.ts, src/index/cache.ts, src/adapters/cli/render.ts, src/index/walker.ts +1 |
| grep | 0.33 | 1.00 | 0.50 | 3948 | src/adapters/cli/watch.ts, src/adapters/cli/bin.ts, tests/integration/watch.test.ts |
| random | 0.13 | 1.00 | 0.22 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### compressed-cache — "gzip compress persistent parse cache entries"

correct: `src/index/cache.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.09 | 1.00 | 0.17 | 3923 | src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/adapters/cli/doctor.ts, src/index/parse-worker.ts +6 |
| mincut-embed | 0.09 | 1.00 | 0.17 | 3923 | src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/adapters/cli/doctor.ts, src/index/parse-worker.ts +6 |
| grep | 0.20 | 1.00 | 0.33 | 3784 | src/index/cache.ts, tests/integration/cache-gzip.test.ts, tests/integration/cache.test.ts, tests/integration/parallel.test.ts, eval/baselines/random-baseline.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### doctor — "environment self check command"

correct: `src/adapters/cli/doctor.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.50 | 1.00 | 0.67 | 1540 | src/adapters/cli/doctor.ts, src/index/builder.ts |
| mincut-embed | 0.50 | 1.00 | 0.67 | 1540 | src/adapters/cli/doctor.ts, src/index/builder.ts |
| grep | 0.00 | 0.00 | 0.00 | 3871 | src/adapters/cli/bin.ts, tests/unit/doctor.test.ts, vitest.config.ts, src/lsp/typescript.ts, tests/unit/examples.test.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### seed-scoring — "keyword IDF seed scoring with file path tokens and kind weights"

correct: `src/seeds/keyword.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.17 | 1.00 | 0.29 | 1461 | src/seeds/keyword.ts, src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/core/graph.ts +1 |
| mincut-embed | 0.17 | 1.00 | 0.29 | 1461 | src/seeds/keyword.ts, src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/core/graph.ts +1 |
| grep | 0.25 | 1.00 | 0.40 | 3960 | src/seeds/keyword.ts, src/seeds/embedding.ts, tests/unit/seeds/keyword.test.ts, eval/baselines/random-baseline.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### lsp-resolver — "LSP backed call edge resolver via textDocument definition"

correct: `src/lsp/resolver.ts`, `src/lsp/stdio-client.ts`, `src/lsp/typescript.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.25 | 0.67 | 0.36 | 2329 | src/lsp/resolver.ts, src/index/builder.ts, src/lsp/stdio-client.ts, src/index/cache.ts, src/lsp/types.ts +3 |
| mincut-embed | 0.25 | 0.67 | 0.36 | 2329 | src/lsp/resolver.ts, src/index/builder.ts, src/lsp/stdio-client.ts, src/index/cache.ts, src/lsp/types.ts +3 |
| grep | 0.50 | 0.33 | 0.40 | 3922 | src/select/pack.ts, src/lsp/resolver.ts |
| random | 0.13 | 0.33 | 0.18 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |

### parallel-parsing — "parallel parsing via worker threads pool"

correct: `src/index/worker-pool.ts`, `src/index/parse-worker.ts`, `src/index/builder.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.75 | 1.00 | 0.86 | 1604 | src/index/worker-pool.ts, src/index/builder.ts, src/index/parse-worker.ts, src/index/cache.ts |
| mincut-embed | 0.75 | 1.00 | 0.86 | 1604 | src/index/worker-pool.ts, src/index/builder.ts, src/index/parse-worker.ts, src/index/cache.ts |
| grep | 0.50 | 0.33 | 0.40 | 3921 | src/index/worker-pool.ts, src/select/pack.ts |
| random | 0.00 | 0.00 | 0.00 | 3997 | src/adapters/cli/watch.ts, tests/integration/cli.test.ts, src/core/index.ts, src/lsp/typescript.ts, src/parsers/parser.ts +3 |
