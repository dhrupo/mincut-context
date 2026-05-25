# Changelog

All notable changes to `mincut-context` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.7.0 — 2026-05-25

### Added

- **Cross-repo evaluation** — labeled task sets for **FluentForm** (PHP +
  Vue + JS, ~800 files) and **Fluent Player** (TS/JSX + admin Vue, ~225 files)
  alongside the original self-repo fixtures.  28 hand-labeled tasks total
  across 3 codebases.  Full per-repo + aggregate report at
  [`eval/CROSS-REPO-RESULTS.md`](./eval/CROSS-REPO-RESULTS.md).

  Aggregate result: **mincut catches 83% of correct files vs grep's 42% —
  ~2× better recall, ~2.5× better token-efficiency** across three real
  codebases.

- **Coverage gate in CI** — new `coverage` job runs `vitest --coverage` on
  every push with thresholds 85% statements / 80% branches / 90% functions
  / 85% lines.  HTML report uploaded as a 30-day CI artifact.

- **Algorithm research** — implemented CELF (Cost-Effective Lazy Forward)
  as an alternative to greedy.  Benchmarked: **CELF diverges from greedy
  on our objective** and is slower on big graphs (FluentForm: 13 ms greedy
  vs 112 ms CELF).  Honest writeup at
  [`eval/ALGORITHM-RESEARCH.md`](./eval/ALGORITHM-RESEARCH.md).  CELF
  ships as opt-in code but is NOT the default — greedy stays.

### Improved

- **Actionable error messages** — "no symbols matched" now suggests
  `--embed`; "no source files found" lists supported extensions and
  points users at `--repo`/`--include`/`--exclude`.
- **`mcx mcp --help`** description cleaned up (was stale "slice 8 —
  placeholder").

### Tests: 261 across 41 files (+5 net)

## 1.6.0 — 2026-05-25

The "honest claims" release.  We can now point at numbers instead of prose.

### Added

- **Evaluation suite** at `eval/`.  Twelve hand-labeled tasks against this
  repo itself, four comparison strategies (mincut, mincut+embed, grep,
  random), and an end-to-end runner that writes a Markdown report.

  ```
  npm run eval
  ```

  Live results at 4000-token budget:

  | strategy       | P    | R    | F1   | tok-eff |
  |----------------|-----:|-----:|-----:|--------:|
  | **mincut**     | 0.30 | 0.97 | 0.44 |   0.413 |
  | mincut-embed   | 0.30 | 0.97 | 0.44 |   0.413 |
  | grep           | 0.24 | 0.56 | 0.30 |   0.142 |
  | random         | 0.02 | 0.11 | 0.03 |   0.028 |

  Token-efficiency = recall × 1000 / tokens.  mincut catches 97% of
  correct files vs 56% for grep, at ~3× better token-efficiency.

- **`examples/` directory** with drop-in integration configs for Claude Code,
  Codex, Cursor, generic MCP clients, GitHub Actions PR-context workflow,
  programmatic library usage, and shell pipeline.

### Internals

- `eval/` and `examples/` excluded from the published tarball via `.npmignore`
  (npm package stays the same size).
- New `npm run eval` script.
- 8 new unit tests for the metrics math + 6 unit tests for examples
  validation.

### Tests: 256 across 40 files (+14 net)

## 1.5.0 — 2026-05-24

A quality + polish release.  Five improvements land; default behavior
gets better without any flag changes.

### Improvements

- **Smarter seed scoring.**  Three orthogonal changes to `scoreSeeds`:
  - File-path tokens now contribute, split into directory tokens
    (boost ×0.7 — "this code belongs to topic X") and filename tokens
    (×0.4 — basenames are noisy).
  - Symbol kind weighting — functions/methods/classes get full weight,
    variables/types/files less.  Ties break toward the more agent-actionable
    unit.
  - Test-directory penalty — files under `__tests__/`, `tests/`, `*.test.ts`
    etc. get halved unless the task itself mentions tests/specs/e2e.
- **Compressed parse cache** — entries are now `.json.gz`.  ~3.5× smaller
  on disk (FluentForm: ~10-12 MB → 3.2 MB).
- **Trim weak tail files** — files scoring below 2% of the top file's
  score are dropped from the final selection by default.  Configurable via
  `--trim-ratio <r>` or `pack({ trimScoreRatio })`.  The top file is
  always retained.

### Added

- **`mcx doctor`** — environment self-check.  Reports Node version,
  tree-sitter availability, per-language grammars, optional LSP / embedder
  binaries, cache size, and repo-path sanity.  Exit code 1 if any check
  fails.
- **MCP graph-navigation tools** — `find_callers(node)`, `find_callees(node)`,
  `search_symbols(query)` operate on the cached graph from the most recent
  `pack_context` call.  Agents can now traverse the code graph without
  re-packing.

### Internals

- Cache directory now stores `*.json.gz` files (gunzip on read, gzip on
  write — both synchronous).  Legacy `*.json` entries from v1.1–v1.4 are
  treated as misses; on next run they'll be replaced.
- `PackResult.tokens` reflects the post-trim total.

### Tests: 236 across 37 files (+18 net)

## 1.4.1 — 2026-05-24

### Fixed

- LSP fallback no longer hangs when the language-server binary is missing
  or unreachable.  spawn/error events are now awaited up to 250 ms; if the
  process never starts, initialize() throws clearly and pack() falls back
  to syntactic resolution.  shutdown() races the polite handshake against
  a 500 ms timeout so a dead LSP can't stall the caller.

## 1.4.0 — 2026-05-24

### Added

- **Sub-symbol chunking now works for Python and PHP** (was TS/JS/Vue only
  in v1.3). The chunking algorithm was extracted into
  `src/parsers/chunking.ts` so all parsers share one implementation.
- **LSP-backed call resolution.** Optional refinement of call edges via the
  Language Server Protocol — currently `typescript-language-server`. When
  enabled, ambiguous syntactic name matches get upgraded to type-resolved
  edges where the LSP has a definite answer.
  - Library: `pack({ lspClient: createTypeScriptLsp() })`
  - CLI: `mcx pack '...' --lsp` (requires `typescript-language-server` on PATH)
  - Falls back to syntactic resolution if the binary or initialize fails.

### Internals

- New module `src/lsp/` with: `types`, `stdio-client` (JSON-RPC over stdio),
  `typescript` adapter, `resolver`.
- `ParsedCall` now carries optional `(line, character)` for the callee identifier.
- `IndexResult.callSites[]` exposes positional call info for downstream
  refinement.

### Tests: 217 across 33 files (+19 net)

## 1.3.0 — 2026-05-24

A "developer experience" release — seven user-visible features land.

### Added

- **MCP `pack_context` tool now exposes `cache`, `cacheDir`, `communityBoost`.**
  Agents using mincut-context over MCP can now opt into the v1.1 features that
  were previously CLI-only.
- **`-v / --verbose` algorithm trace.** Prints seeds, top-ranked nodes,
  selection order, and phase timings (index / rank / select / total).
  Helps debug "why did it pick that?". Exposed as `PackResult.trace` on the
  library API too.
- **`--format tree`** directory-grouped output:
  ```
  └── src/  (1484 tok, 3 items)
      ├── core/  (819 tok)
      │   ├── pagerank.ts  0.391 613 tok lines 34-113
      │   └── graph.ts     0.102 206 tok …
  ```
- **`-j / --parallel <n>` workers.** node:worker_threads pool for parsing.
  Real-world: FluentForm cold index 1344 ms → 493 ms (2.7×).
- **`mcx watch '<task>'` long-running mode.** Re-packs on any source file
  change, debounced. Plain output prefixed with timestamp markers.
- **`--chunk [--chunk-tokens N]` sub-symbol chunking** (TS/JS/Vue).
  When a function body exceeds N tokens, split at top-level statement
  boundaries into sub-symbols `parent#0`, `parent#1`, etc.  Lets the
  greedy include just the relevant slice of a 500-line function instead
  of all-or-nothing.
- **TUI v2** (`-i / --interactive`):
  - Split-pane layout — file list left, source preview right
  - Preview reads actual file content for selected line ranges
  - Vim navigation: j/k arrows, gg/G top/bottom, /filter, Esc clear, Enter, q
  - Live fuzzy filter on path substring

### Tests: 198 across 29 files (+33 net)

## 1.2.0 — 2026-05-24

### Added

- **PHP parser** via `tree-sitter-php`. Symbols: namespaces, classes,
  traits, interfaces, methods, functions. Imports: `use`, aliased,
  grouped. Calls: function, member (`$this->`), scoped (`Foo::bar()`).
  - 15 unit tests + 3 integration tests
- **Vue SFC parser** via `<script>` / `<script setup>` block extraction.
  Both Options API (Vue 2) and Composition API (Vue 3). `lang="ts"`
  honored. Line numbers shifted to SFC coordinates so the output points
  at the right lines of the `.vue` file.
  - 8 unit tests + 4 integration tests

### Validated on FluentForm (real-world)

| Metric | v1.1.0 | v1.2.0 | Δ |
|---|---|---|---|
| Files indexed | 85 | **809** | 9.5× |
| Symbols | 285 | **4,333** | 15.2× |
| Edges | 345 | **3,776** | 10.9× |

Queries that returned mostly admin-JS noise in v1.1 now return the real
PHP service code:

```
$ mcx pack "payment stripe processor"
→ Stripe/StripeProcessor.php   ← seed
→ Stripe/StripeHandler.php
→ Payments/AjaxEndpoints.php
→ Stripe/API/RequestProcessor.php
→ Stripe/API/Plan.php
→ Stripe/API/ApiRequest.php
```

### Tests: 165 across 23 files

## 1.1.0 — 2026-05-24

### Added

- **Persistent JSON parse cache** at `.mincut-cache/v1/`. mtime+size keyed,
  schema-versioned invalidation. Live `mcx index --cache` on Fluent Player
  free (225 files): cold 397 ms → warm 76 ms (**5.2× speedup**).
  - `pack({ cache, cacheDir })`
  - `indexRepo({ cache, cacheDir })`
  - `mcx pack ... --cache [--cache-dir <path>]`
  - `mcx index ... --cache`
  - `IndexResult.stats.cacheHits` / `cacheMisses`
- **Louvain community detection + intra-community boost.** Selected nodes
  expose their community label; selections favor the seed's natural module
  at the budget boundary. Default boost `0.5`; set to `0` to disable.
  - `pack({ communityBoost })`
  - `mcx pack ... --community-boost <number>`
  - new core export: `detectCommunities(graph, { seed? })`
  - new `PackedFile.communities[]` and `SelectionEntry.community`
- 16 new tests (8 cache integration, 4 unit communities, 3 unit
  community-aware select, 4 integration pack-community). Total: 135 tests
  across 19 files.

### Notes

- Cache is opt-in. Default behavior unchanged from v1.0.0.
- Community boost default of `0.5` changes ranking on dense graphs but
  doesn't alter inclusion strictly — the min-cut attachment constraint
  still governs whether a node enters the selection.

## 1.0.0 — 2026-05-24

Initial release. See [README.md](./README.md).
