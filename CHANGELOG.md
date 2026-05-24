# Changelog

All notable changes to `mincut-context` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
