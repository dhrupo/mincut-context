# mincut-context — evaluation report

Budget: **4000 tokens** per pack · 12 labeled tasks · 5 strategies

## Aggregate (averaged across all tasks)

| strategy | precision | recall | F1 | nice-to-have | tok-eff |
|---|---:|---:|---:|---:|---:|
| **mincut** | 0.29 | 0.97 | 0.42 | 0.13 | 0.392 |
| **mincut-embed** | 0.29 | 0.97 | 0.43 | 0.13 | 0.375 |
| **mincut-contract** | 0.16 | 0.97 | 0.26 | 0.13 | 0.356 |
| **grep** | 0.20 | 0.56 | 0.28 | 0.63 | 0.143 |
| **random** | 0.00 | 0.00 | 0.00 | 0.00 | 0.000 |

> token-efficiency = (recall × 1000) / tokens — higher means more signal per token spent.

> `mincut-contract` retrieval counts selected files **and** signature-stub files, so its precision/F1 in the table above are diluted by stubs and are NOT a quality regression. The Frontier-contract A/B section below is the meaningful metric.

## Per-task breakdown

### pagerank — "implement personalized PageRank algorithm"

correct: `src/core/pagerank.ts`, `src/core/graph.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.33 | 1.00 | 0.50 | 1749 | src/core/pagerank.ts, src/index/cache.ts, src/index/worker-pool.ts, src/index/builder.ts, src/core/graph.ts +1 |
| mincut-embed | 0.33 | 1.00 | 0.50 | 1749 | src/core/pagerank.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts +1 |
| mincut-contract | 0.13 | 1.00 | 0.22 | 2083 | src/core/pagerank.ts, src/index/cache.ts, src/index/worker-pool.ts, src/index/builder.ts, src/core/graph.ts +12 |
| grep | 0.20 | 0.50 | 0.29 | 3644 | src/core/select.ts, src/core/pagerank.ts, eval/benchmark-algorithms.ts, src/adapters/lib/index.ts, src/core/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### min-cut-selection — "greedy budget-constrained min-cut selection"

correct: `src/core/select.ts`, `src/core/graph.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.29 | 1.00 | 0.44 | 3985 | src/core/select.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts +2 |
| mincut-embed | 0.29 | 1.00 | 0.44 | 3985 | src/core/select.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts +2 |
| mincut-contract | 0.29 | 1.00 | 0.44 | 3985 | src/core/select.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts +2 |
| grep | 0.40 | 1.00 | 0.57 | 3936 | src/core/select.ts, src/core/graph.ts, tests/integration/core-pipeline.test.ts, src/core/index.ts, src/adapters/lib/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### vue-script-block — "vue single file component script block parsing"

correct: `src/parsers/vue.ts`, `src/parsers/ts.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.22 | 1.00 | 0.36 | 3417 | src/parsers/vue.ts, src/parsers/ts.ts, src/index/worker-pool.ts, src/index/cache.ts, src/lsp/typescript.ts +4 |
| mincut-embed | 0.25 | 1.00 | 0.40 | 3459 | src/parsers/vue.ts, src/parsers/ts.ts, src/select/pack.ts, src/index/worker-pool.ts, src/index/builder.ts +3 |
| mincut-contract | 0.18 | 1.00 | 0.31 | 3554 | src/parsers/vue.ts, src/parsers/ts.ts, src/index/worker-pool.ts, src/index/cache.ts, src/lsp/typescript.ts +7 |
| grep | 0.20 | 0.50 | 0.29 | 3907 | src/parsers/vue.ts, tests/unit/parsers/vue.test.ts, tests/integration/vue-pack.test.ts, src/index/parse-worker.ts, tests/integration/core-pipeline.test.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### python-chunking — "split large python functions into chunks at statement boundaries"

correct: `src/parsers/py.ts`, `src/parsers/chunking.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.29 | 1.00 | 0.44 | 3497 | src/parsers/py.ts, src/seeds/keyword.ts, src/parsers/chunking.ts, src/index/builder.ts, src/parsers/parser.ts +2 |
| mincut-embed | 0.29 | 1.00 | 0.44 | 3497 | src/parsers/py.ts, src/parsers/chunking.ts, src/seeds/keyword.ts, src/parsers/parser.ts, src/index/builder.ts +2 |
| mincut-contract | 0.25 | 1.00 | 0.40 | 3536 | src/parsers/py.ts, src/seeds/keyword.ts, src/parsers/chunking.ts, src/index/builder.ts, src/parsers/parser.ts +4 |
| grep | 0.00 | 0.00 | 0.00 | 3872 | src/index/builder.ts, src/core/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### mcp-server — "MCP server tools find_callers find_callees search_symbols"

correct: `src/adapters/mcp/handler.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.14 | 1.00 | 0.25 | 3941 | src/adapters/mcp/handler.ts, src/core/graph.ts, src/adapters/mcp/index.ts, src/index/cache.ts, src/lsp/resolver.ts +2 |
| mincut-embed | 0.14 | 1.00 | 0.25 | 3941 | src/adapters/mcp/handler.ts, src/core/graph.ts, src/adapters/mcp/index.ts, src/index/cache.ts, src/lsp/resolver.ts +2 |
| mincut-contract | 0.13 | 1.00 | 0.22 | 4095 | src/adapters/mcp/handler.ts, src/core/graph.ts, src/adapters/mcp/index.ts, src/index/cache.ts, src/lsp/resolver.ts +5 |
| grep | 0.33 | 1.00 | 0.50 | 3828 | src/adapters/mcp/handler.ts, tests/integration/mcp-graph-tools.test.ts, src/adapters/mcp/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### tui-vim-keys — "interactive TUI with vim navigation and preview pane"

correct: `src/adapters/cli/tui.tsx`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.33 | 1.00 | 0.50 | 2744 | src/adapters/cli/tui.tsx, src/index/builder.ts, src/adapters/cli/bin.ts |
| mincut-embed | 0.33 | 1.00 | 0.50 | 2760 | src/adapters/cli/tui.tsx, src/index/builder.ts, src/adapters/cli/bin.ts |
| mincut-contract | 0.10 | 1.00 | 0.18 | 2989 | src/adapters/cli/tui.tsx, src/index/builder.ts, src/adapters/cli/bin.ts, eval/baselines/random-baseline.ts, eval/boundary.ts +5 |
| grep | 0.00 | 0.00 | 0.00 | 3902 | tests/integration/tui.test.tsx, src/adapters/cli/bin.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### watch-mode — "long running watch mode that re-packs on file change"

correct: `src/adapters/cli/watch.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.14 | 1.00 | 0.25 | 3999 | src/adapters/cli/watch.ts, src/select/pack.ts, src/adapters/cli/render.ts, src/index/cache.ts, src/index/walker.ts +2 |
| mincut-embed | 0.14 | 1.00 | 0.25 | 3748 | src/adapters/cli/watch.ts, src/select/pack.ts, src/adapters/cli/render.ts, src/index/cache.ts, src/index/worker-pool.ts +2 |
| mincut-contract | 0.07 | 1.00 | 0.13 | 4327 | src/adapters/cli/watch.ts, src/select/pack.ts, src/adapters/cli/render.ts, src/index/cache.ts, src/index/walker.ts +12 |
| grep | 0.33 | 1.00 | 0.50 | 3947 | src/adapters/cli/watch.ts, src/adapters/cli/bin.ts, tests/integration/watch.test.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### compressed-cache — "gzip compress persistent parse cache entries"

correct: `src/index/cache.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.09 | 1.00 | 0.17 | 3853 | src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/adapters/cli/doctor.ts, src/index/parse-worker.ts +6 |
| mincut-embed | 0.10 | 1.00 | 0.18 | 3879 | src/index/cache.ts, src/index/worker-pool.ts, src/index/builder.ts, src/parsers/py.ts, src/index/parse-worker.ts +5 |
| mincut-contract | 0.08 | 1.00 | 0.15 | 4032 | src/index/cache.ts, src/index/builder.ts, src/index/worker-pool.ts, src/adapters/cli/doctor.ts, src/index/parse-worker.ts +10 |
| grep | 0.20 | 1.00 | 0.33 | 3811 | src/index/cache.ts, tests/integration/cache-gzip.test.ts, tests/integration/cache.test.ts, tests/integration/parallel.test.ts, tests/unit/doctor.test.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### doctor — "environment self check command"

correct: `src/adapters/cli/doctor.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.50 | 1.00 | 0.67 | 1647 | src/adapters/cli/doctor.ts, src/index/builder.ts |
| mincut-embed | 0.50 | 1.00 | 0.67 | 1647 | src/adapters/cli/doctor.ts, src/index/builder.ts |
| mincut-contract | 0.14 | 1.00 | 0.25 | 1776 | src/adapters/cli/doctor.ts, src/index/builder.ts, eval/metrics.ts, eval/runner.ts, src/index/worker-pool.ts +2 |
| grep | 0.00 | 0.00 | 0.00 | 3938 | src/adapters/cli/bin.ts, tests/unit/doctor.test.ts, src/lsp/typescript.ts, vitest.config.ts, tests/parsers/signature-slicer.test.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### seed-scoring — "keyword IDF seed scoring with file path tokens and kind weights"

correct: `src/seeds/keyword.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.14 | 1.00 | 0.25 | 1520 | src/seeds/keyword.ts, src/index/cache.ts, src/index/builder.ts, src/core/graph.ts, src/index/worker-pool.ts +2 |
| mincut-embed | 0.14 | 1.00 | 0.25 | 2428 | src/seeds/keyword.ts, src/index/cache.ts, src/core/graph.ts, src/index/worker-pool.ts, src/index/builder.ts +2 |
| mincut-contract | 0.07 | 1.00 | 0.13 | 1868 | src/seeds/keyword.ts, src/index/cache.ts, src/index/builder.ts, src/core/graph.ts, src/index/worker-pool.ts +13 |
| grep | 0.20 | 1.00 | 0.33 | 3982 | src/seeds/keyword.ts, src/seeds/embedding.ts, tests/unit/seeds/keyword.test.ts, src/lsp/typescript.ts, src/lsp/types.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### lsp-resolver — "LSP backed call edge resolver via textDocument definition"

correct: `src/lsp/resolver.ts`, `src/lsp/stdio-client.ts`, `src/lsp/typescript.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.25 | 0.67 | 0.36 | 2354 | src/lsp/resolver.ts, src/index/builder.ts, src/lsp/stdio-client.ts, src/index/cache.ts, src/lsp/types.ts +3 |
| mincut-embed | 0.25 | 0.67 | 0.36 | 2107 | src/lsp/resolver.ts, src/lsp/stdio-client.ts, src/index/builder.ts, src/core/graph.ts, src/index/cache.ts +3 |
| mincut-contract | 0.10 | 0.67 | 0.17 | 2793 | src/lsp/resolver.ts, src/index/builder.ts, src/lsp/stdio-client.ts, src/index/cache.ts, src/lsp/types.ts +17 |
| grep | 0.00 | 0.00 | 0.00 | 3966 | src/select/pack.ts, src/lsp/types.ts, src/core/index.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

### parallel-parsing — "parallel parsing via worker threads pool"

correct: `src/index/worker-pool.ts`, `src/index/parse-worker.ts`, `src/index/builder.ts`

| strategy | P | R | F1 | tokens | retrieved |
|---|---:|---:|---:|---:|---|
| mincut | 0.75 | 1.00 | 0.86 | 1604 | src/index/worker-pool.ts, src/index/builder.ts, src/index/parse-worker.ts, src/index/cache.ts |
| mincut-embed | 0.75 | 1.00 | 0.86 | 1604 | src/index/worker-pool.ts, src/index/builder.ts, src/index/parse-worker.ts, src/index/cache.ts |
| mincut-contract | 0.38 | 1.00 | 0.55 | 1714 | src/index/worker-pool.ts, src/index/builder.ts, src/index/parse-worker.ts, src/index/cache.ts, eval/metrics.ts +3 |
| grep | 0.50 | 0.67 | 0.57 | 3919 | src/index/worker-pool.ts, tests/integration/parallel.test.ts, src/adapters/cli/bin.ts, src/index/parse-worker.ts |
| random | 0.00 | 0.00 | 0.00 | 3936 | src/adapters/cli/render.ts, tests/integration/core-pipeline.test.ts, tests/integration/pack-chunked.test.ts, src/lsp/types.ts |

## Frontier-contract A/B (signature-level coverage)

| metric | value |
|---|---|
| cut-only file recall | 97.2% |
| cut+contract boundary coverage | 97.2% |
| avg contract tokens / task | 204 |
| correct files recovered per 1k contract tokens | 0.000 |

> Boundary coverage is signature-level: a file recovered via a stub is reachable, not fully present.

