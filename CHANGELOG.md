# Changelog

All notable changes to `mincut-context` are documented here.
This project follows [Semantic Versioning](https://semver.org/).

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
