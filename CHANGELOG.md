# Changelog

All notable changes to `mincut-context` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
