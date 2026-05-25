---
title: "Your AI Coding Agent Wastes 80% of Its Context. I Fixed That with Graph Theory."
published: false
description: "mincut-context turns your repo into a symbol graph and uses personalized PageRank + budget-constrained min-cut to pick the smallest provably-relevant context. 83% recall vs grep's 42% on labeled tasks."
tags: ai, llm, typescript, opensource
cover_image: https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/hero.png
canonical_url: https://github.com/dhrupo/mincut-context
---

## The problem nobody admits

When you give Claude Code, Cursor, or Codex a task like *"fix the login validation bug"*, here's what they usually do:

1. Run `grep -l login src/` → 17 files
2. Read all 17 files top-to-bottom (because context is "free")
3. Spend 80% of the model's context window on irrelevant imports, type aliases, and helper functions the bug doesn't touch
4. Generate a fix using whatever 20% of attention is left

This works. Sort of. But it's wasteful — and on big codebases, it's wrong: the agent runs out of context before it sees the actual buggy function.

The instinct is to throw a bigger model at it. Bigger context window, fancier RAG, vector embeddings. All of which trade real cost for diminishing returns.

There's a better answer that's been sitting in classical CS the whole time: **treat the repo as a graph**.

![demo](https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/demo.gif)

## The idea, in one paragraph

Your codebase already *is* a graph. Functions call functions. Modules import modules. Classes extend classes. Pick a node (the symbol your task is about), and the structurally-closest neighborhood is almost certainly what an agent needs to see.

So I built **`mincut-context`** — an npm package that:

1. Parses your repo into a **symbol graph** (tree-sitter, supports TS/JS/Vue/Python/PHP)
2. Derives **seed nodes** from your task description (keyword IDF on symbol names + file paths)
3. Runs **personalized PageRank** with the seeds as the restart vector
4. Picks the **minimum-cut subgraph** that fits a token budget you choose

The output: a list of files + line ranges that an agent should look at. Nothing more, nothing less.

## Show me the numbers

I built an evaluation suite into the repo itself. 28 hand-labeled tasks across 3 real codebases at a 4,000-token budget:

| strategy | precision | recall | F1 | token-efficiency |
|---|---:|---:|---:|---:|
| **mincut** | **0.27** | **0.83** | **0.39** | **0.270** |
| mincut + `--embed` (semantic) | 0.27 | 0.83 | 0.39 | 0.270 |
| grep keyword baseline | 0.11 | 0.42 | 0.16 | 0.105 |
| random selection (control) | 0.01 | 0.04 | 0.01 | 0.009 |

Per-repo breakdown:

| repo | tasks | mincut recall | grep recall | mincut F1 | grep F1 |
|---|---:|---:|---:|---:|---:|
| mincut-context (self) | 12 | **0.97** | 0.56 | 0.44 | 0.30 |
| FluentForm (PHP+Vue+JS) | 8 | **0.88** | 0.13 | 0.43 | 0.04 |
| Fluent Player (TS/JSX) | 8 | **0.63** | 0.56 | 0.31 | 0.13 |

**mincut catches ~2× more of the correct files than grep, at ~2.5× better token efficiency.** Reproducible with `npm run eval`. Add your own labeled tasks under `eval/fixtures/` to score against your own codebase.

## The math, briefly

Given a symbol graph $G = (V, E, w)$ where:
- $V$ are code units (functions, classes, methods)
- $E$ are dependency edges (imports, calls, references)
- $w(v)$ is the token cost of including symbol $v$
- $B$ is your token budget
- $S \subseteq V$ are seed nodes derived from the task

Find $T \supseteq S$ with $\sum_{v \in T} w(v) \le B$ minimizing the **boundary cut cost**:

$$\text{cut}(T, V \setminus T) = \sum_{e \in E, \text{ crossing}} w(e)$$

In plain English: pick a connected, low-token region that has few "loose ends" pointing outside it. The inside of the cut is what the agent needs; the outside is safely ignorable.

The objective is submodular, so a greedy algorithm gives a $(1 - 1/e) \approx 0.63$ approximation guarantee. The full pseudocode is in the README; the implementation is ~200 lines in [`src/core/select.ts`](https://github.com/dhrupo/mincut-context/blob/main/src/core/select.ts).

## Three ways to use it

### 1. As an MCP server — recommended for agents

Drop this block into your Claude Code / Codex / Cursor settings:

```json
{
  "mcpServers": {
    "mincut-context": {
      "command": "npx",
      "args": ["-y", "mincut-context", "mcp"]
    }
  }
}
```

Your agent now has six new tools: `pack_context`, `expand_node`, `find_callers`, `find_callees`, `search_symbols`, `explain_selection`. They operate on the cached graph from the most recent `pack_context` call — effectively free traversal after the first pack.

### 2. As a CLI

```bash
npm install -g mincut-context

mcx pack "fix the login validation bug" --budget 4000             # plain output
mcx pack "..." --format tree                                       # directory-grouped
mcx pack "..." --format json | jq                                  # pipe to anything
mcx pack "..." --interactive                                       # Ink TUI: vim keys + preview
mcx pack "..." --embed                                             # semantic seeding
mcx pack "..." --cache                                             # 5× warm-run speedup
mcx watch "..." --debounce 300                                     # re-pack on file change
mcx doctor                                                         # environment self-check
```

`mcx doctor` is my favorite — it tells you in 6 lines what's installed and what isn't:

![doctor](https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/doctor.gif)

### 3. As a library

```ts
import { pack } from 'mincut-context';

const result = await pack({
  task: 'fix the login validation bug',
  repo: process.cwd(),
  budget: 4000,
  cache: true,
  parallel: 4,
  chunk: { enabled: true, maxTokens: 400 },
});

for (const f of result.files) {
  console.log(f.path, f.score.toFixed(3), f.tokens, '·', f.reasons[0]);
}
// → src/auth/login.ts        0.541  612 · seed — matched directly by task
// → src/auth/session.ts      0.408  483 · attached (60%)
```

## What I learned by building this

### 1. Embeddings are oversold for this problem

Adding semantic embeddings (`--embed` flag, via `@xenova/transformers` running locally) **did not improve recall on any of my three eval task sets.** Why? Because the labels were named honestly. When you label "stripe payment processor" → `StripeProcessor.php`, the keyword match catches it without help. Embeddings only earn their keep when your task vocabulary diverges from the code's — "centrality and ranking" → `PageRank`, that kind of gap.

I left `--embed` in because it doesn't hurt, and there are real users whose mental model doesn't match the code. But the marketing-friendly "AI-powered" framing for this stuff is mostly noise.

### 2. Greedy beats CELF for this objective

I implemented CELF (Cost-Effective Lazy Forward, Leskovec 2007) hoping for a free speedup over the naive greedy. It diverged — not just slower (8× slower on FluentForm) but **wrong**: it produced smaller, structurally weaker selections.

Why: our "no isolated nodes" acceptance rule (a candidate must have at least one edge into the current selection) breaks CELF's submodular-monotone assumption. A candidate's eligibility flips discontinuously when a node with an edge to it joins T. The lazy cache becomes unreliable.

I wrote the dead end up in [`eval/ALGORITHM-RESEARCH.md`](https://github.com/dhrupo/mincut-context/blob/main/eval/ALGORITHM-RESEARCH.md) so nobody re-treads it. **Honest negative results are worth shipping.**

### 3. Sub-symbol chunking matters more than I expected

Big legacy codebases have huge functions. A 500-line function is one symbol in the graph, and if it gets selected, the whole thing eats your budget. So `--chunk` splits big functions at statement boundaries — each chunk becomes its own sub-symbol, individually selectable.

On FluentForm: indexing without chunking → 4,333 symbols. With `--chunk` → 4,878 symbols (+545 chunks). Same budget, much finer-grained selection. The greedy can pick *just the relevant `if/for/try` block* instead of all-or-nothing.

### 4. Test coverage of 88% isn't the whole story

The CI gates on 85% statements / 80% branches / 90% functions / 85% lines. But the genuinely-untestable files — worker scripts, lazy-loaded LSP clients — are excluded from the calc. Honest reporting means saying *what* is tested, not just the headline number.

## The honest tradeoffs

| Honest tradeoff | What we do |
|---|---|
| True optimal min-cut is NP-hard | Greedy submodular — `(1−1/e)` bound |
| Tree-sitter symbols are syntactic, not type-aware | `--lsp` refines TS/JS via typescript-language-server |
| Embedding model adds ~22 MB on first run | Opt-in behind `--embed` flag |
| LSP startup is slow (~1–5s) | Opt-in; cached after init |
| Cold start parses whole repo | `--cache` (5× speedup) + `--parallel n` (2.7× speedup) |

## What I'd build next if you asked

The roadmap that's *not* checked off yet:

- **Pyright / Intelephense LSP adapters** — type-aware calls for Python and PHP (~1–2 days each on the existing LSP infrastructure)
- **Svelte / Rust / Go parsers** — one file each on the parser template
- **Incremental neighborhood caching in the greedy** — keep `attach(v, T)` cached and update only when a node with an edge to v is added. Expected 3–5× speedup on graphs with bounded degree.

Each is bounded effort and additive. The core is done.

## Stop building, start using

The hardest lesson: **a tool's value comes from someone actually using it on real work, not from feature count.** mincut-context is at v1.7.0 — 261 tests, 88.6% coverage, CI green on Ubuntu + macOS × Node 18/20/22. There's no honest "but it's not ready" excuse left.

If you've watched an AI agent burn 80% of its 200k-token context on imports it doesn't care about, install it now and tell me what breaks:

```bash
npm install -g mincut-context
```

🔗 **GitHub:** [github.com/dhrupo/mincut-context](https://github.com/dhrupo/mincut-context)
📦 **npm:** [npmjs.com/package/mincut-context](https://www.npmjs.com/package/mincut-context)
📊 **Reproducible benchmarks:** [`eval/CROSS-REPO-RESULTS.md`](https://github.com/dhrupo/mincut-context/blob/main/eval/CROSS-REPO-RESULTS.md)

I'd love feedback — especially "your numbers don't replicate on my codebase" feedback. That's literally what the eval suite is for.

---

*If you got value from this, ⭐ the repo or drop a comment about a tooling problem you're solving. mincut-context is open-source MIT; the eval suite welcomes new fixtures.*
