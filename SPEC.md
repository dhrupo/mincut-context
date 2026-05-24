# mincut-context — Spec

**Current release:** v1.0.0 (shipped). **In development:** v1.1.0 (parse cache + Louvain).

> Token-minimal context selection for AI coding agents. Build a symbol graph of your repo and use personalized PageRank + budget-constrained min-cut to pick the smallest provably-relevant context for any task.

## The problem

AI coding agents (Claude Code, Codex, Cursor, OpenHands, CrewAI…) eat your context window. Two failure modes:

1. **Over-stuffing.** Dump entire files or all of `src/`. Wastes tokens, drowns the model, hurts answer quality.
2. **Under-stuffing.** Grep for a string, return 3 lines. The model can't see callers, dependents, or relevant tests.

Neither approach uses what we know about the code's *structure*. The repo is a graph. Selection is a graph problem.

## The idea

Treat context selection as a **constrained graph cut**:

> Given a symbol graph `G = (V, E, w)` where `V` are code units (functions, classes, files), `E` are dependency edges (imports, calls, references), `w(v)` is the token cost of `v`, a token budget `B`, and a set of seed nodes `S ⊆ V` derived from the task:
>
> Find subset `T ⊇ S` minimizing the **boundary cut cost** `cut(T, V\T) = Σ w(e) for e ∈ E crossing the boundary`, subject to `Σ w(v) for v ∈ T ≤ B`.

In plain English: pick a connected, low-token region of code that has few "loose ends" pointing outside it — the inside of the cut is what the agent needs to see; the outside is safely ignorable.

The objective is **submodular** in a useful way, so a greedy algorithm gives a `(1 - 1/e) ≈ 0.63` approximation guarantee.

## Why this matters

| Today | mincut-context |
|---|---|
| Agents dump whole files | Selects relevant ranges within files |
| Grep returns isolated matches | Returns matches + their structural neighborhood |
| No token budget awareness | Budget is a first-class constraint |
| Selection logic opaque | Every node has a *why included* explanation |
| Per-tool reimplementation | One server, all MCP-aware agents benefit |

## Architecture

Single npm package, three surfaces, one core.

```
mincut-context
├── core/                    # pure, no I/O, no deps beyond graphology
│   ├── graph.ts             # Graph<NodeData, EdgeData> wrapper
│   ├── pagerank.ts          # Personalized PageRank with seed restart vector
│   ├── louvain.ts           # Community detection (slice 4)
│   └── select.ts            # Greedy budget-constrained min-cut
├── index/
│   ├── walker.ts            # Walk repo, respect .gitignore
│   ├── cache.ts             # JSON cache at .mincut-cache/
│   └── builder.ts           # Files → graph
├── parsers/
│   ├── parser.ts            # Common Parser interface
│   ├── ts.ts                # TS/JS via web-tree-sitter
│   └── py.ts                # Python via web-tree-sitter
├── seeds/
│   ├── keyword.ts           # IDF-scored keyword + symbol-name match
│   └── embedding.ts         # @xenova/transformers (post-v1.0, opt-in)
├── select/
│   └── pack.ts              # Orchestrator: index → seed → rank → cut
├── adapters/
│   ├── lib/                 # Public JS API
│   ├── cli/                 # commander entry + Ink TUI
│   └── mcp/                 # @modelcontextprotocol/sdk server
```

## Core algorithm (v1.0.0)

```text
pack(task, repo, budget):
  1. graph    = index(repo)                  // cached, incremental
  2. seeds    = scoreSeeds(task, graph)      // keyword + symbol IDF
  3. ranks    = personalizedPageRank(graph, seeds, α=0.85, ε=1e-6)
  4. selected = greedyMinCut(graph, ranks, seeds, budget):
       T ← S
       while Σ tokens(T) < B:
         v* ← argmax_{v ∉ T, t(v) ≤ B - Σtokens(T)}
                 ( rank(v) · w(adj(v) ∩ T) / w(adj(v)) )  // ratio "how-attached"
                 − λ · t(v)                                // token penalty
         if v* is null: break
         T ← T ∪ {v*}
       return T
  5. ranges   = collapseToFileRanges(T)
  6. explain  = describeSelection(T, seeds, ranks)
  7. return { files: ranges, tokens, graph: { ... }, explain }
```

Greedy with the "fraction of v's edges already inside T" heuristic is a classic submodular-monotone-knapsack approximation; the math is solid.

## Public API

```ts
import { pack, index, explain } from 'mincut-context';

const result = await pack({
  task: 'fix the login validation bug',
  repo: process.cwd(),
  budget: 4000,           // tokens
  model: 'claude-3-5',    // for tokenizer choice
  languages: ['ts', 'py'],
  pin: ['src/auth/'],     // always include
  exclude: ['vendor/'],
});

// result.files: [{ path, ranges: [{start,end}], score, tokens, reason }]
// result.tokens: number
// result.graph: { selected: number, frontier: number, cutCost: number }
// result.explain: string  — human-readable
```

## CLI surface

```bash
# Pack context for a task
mcx pack "fix the login validation bug" --budget 4000

# Index a repo (warm cache)
mcx index .

# Show why a node was/wasn't included
mcx explain src/auth/login.ts:42

# Interactive review (Ink TUI)
mcx pack "..." --interactive

# Pipe to Claude / Codex
mcx pack "..." --format json | jq '.files[].path' | xargs cat | claude
mcx pack "..." --format markdown    # ready-to-paste
```

## MCP surface

Drop into any MCP-aware agent (Claude Code, Codex, Cursor):

```json
{
  "mcpServers": {
    "mincut-context": { "command": "npx", "args": ["-y", "mincut-context", "mcp"] }
  }
}
```

Tools exposed:
- `pack_context(task: string, budget?: number)` — main entry
- `expand_node(node: string, depth?: number)` — pull more around a node
- `explain_selection()` — last selection's rationale

## Tradeoffs (honest)

| Honest tradeoff | What we're doing |
|---|---|
| True optimal min-cut is NP-hard | Greedy submodular gives `(1-1/e)` guarantee — good enough |
| Tree-sitter symbols are syntactic, not type-aware | We don't follow generics or dynamic dispatch. Good for context, not refactoring. |
| Embedding-based seeding adds ~50 MB on first run | Deferred to slice 8, opt-in via `--embed` flag |
| Cache invalidation is hard | mtime-based + content hash; full reindex command available |
| Cold start parses whole repo | Mitigated by per-file cache + parallel parsing |

## Non-goals (v1.0.0)

- Replacing your IDE's "find references"
- Refactoring assistance (no type info)
- Cross-language imports (e.g., TS → Python via subprocess)
- Online indexing of remote repos

## Testing strategy

- **Unit:** Pure functions in `core/` are 100% covered. Algorithms tested against fixtures with known optimal answers.
- **Integration:** `tests/fixtures/sample-repo/` is a tiny realistic TS+Py project. Tests assert `pack()` returns expected files for known tasks.
- **TUI:** Ink components tested via `ink-testing-library`.
- **MCP:** Server tested by spawning and exchanging JSON-RPC messages.
- **Coverage gate:** 80% lines, 75% branches.

## Versioning & release

Semver from `1.0.0`. Each slice ships as a minor (`1.1.0`, `1.2.0`…) or patch depending on impact. Breaking changes only on `2.0.0`.

## Roadmap

| Slice | Feature | Status |
|---|---|---|
| 1 | Core: graph + PageRank + greedy min-cut | ✅ shipped (v1.0.0) |
| 2 | Parsers: TS/JS via tree-sitter | ✅ shipped (v1.0.0) |
| 3a | Index: repo walker + cross-file resolution | ✅ shipped (v1.0.0) |
| 3b | Index: persistent `.mincut-cache/` (incremental reparse) | 🔜 v1.1.0 |
| 4 | Seeds: keyword + symbol IDF | ✅ shipped (v1.0.0) |
| 5 | Library API (pack pipeline) | ✅ shipped (v1.0.0) |
| 6 | CLI: commander + plain / JSON / Markdown output | ✅ shipped (v1.0.0) |
| 7 | TUI: Ink interactive pin / exclude | ✅ shipped (v1.0.0) |
| 8 | MCP server (stdio JSON-RPC) | ✅ shipped (v1.0.0) |
| 9 | Python parser parity | ✅ shipped (v1.0.0) |
| 10 | Louvain communities + intra-cluster boost | 🔜 v1.1.0 |
| 11 | Local embeddings via `@xenova/transformers` | ✅ shipped (v1.0.0) |
| 12 (post-1.1) | Vue SFC / Svelte parsers | future |
| 13 (post-1.1) | Rust / Go parsers | future |
| 14 (post-1.1) | LSP-backed type-aware call resolution | future |
