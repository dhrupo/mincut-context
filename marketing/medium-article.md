# Your AI Coding Agent Wastes 80% of Its Context. I Used Graph Theory to Fix That.

### A 5-day side project, 28 hand-labeled tasks, and an honest negative result.

---

![hero](https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/hero.png)
<sub>*`mcx pack 'personalized pagerank algorithm'` on the project's own source — it correctly surfaces the algorithm files at 99% budget utilization.*</sub>

---

The moment that started this project: I was watching Claude Code politely read a 4,000-line file to fix a typo.

Not skim it. *Read it.* End to end. To fix three characters.

If you've used any of the AI coding agents — Claude Code, Codex, Cursor, OpenHands — you've seen this happen. The agent decides it needs context. So it dumps the whole file. Then another file. Then a config. Then a test. By the time it gets to your actual question, two-thirds of the model's attention is spent on imports it doesn't need to read.

The instinct is to throw a bigger model at it. Context windows have ballooned from 4k to 200k to a million tokens. RAG systems with vector embeddings. Custom retrieval pipelines. All of these are real tools, but they're treating a symptom.

The actual problem is simpler: **the agent is choosing what to read based on filename matches.** That's grep. Grep is from 1973.

We can do better. And in classical computer science, we've had the right answer the whole time.

## The repo is a graph. Just use the graph.

Your codebase isn't a flat soup of files. Functions call functions. Modules import modules. Classes extend interfaces. Variables reference each other. It's a graph — and a *useful* graph, because if you pick any one symbol (the function your task is about), the structurally closest neighborhood is almost certainly what the agent needs to see.

So I built `mincut-context`. The idea fits in five steps:

1. **Parse** your repo into a symbol graph. Functions and classes are nodes; calls and imports are edges. Tree-sitter does the heavy lifting; five languages supported as of v1.7 (TypeScript, JavaScript, Vue, Python, PHP).

2. **Seed** from your task. You give it "fix the login validation bug" — it tokenizes that, matches against symbol names and file paths (with IDF weighting so common words don't dominate), and picks the top-k seeds.

3. **Rank** the whole graph by relevance to those seeds. This is personalized PageRank — same algorithm Google used in 1998, except the "restart vector" is concentrated on your task's seeds instead of being uniform.

4. **Cut.** Greedy budget-constrained min-cut. Add nodes to the selection one at a time, picking whichever maximizes "rank × attachment-to-current-selection / tokens" — but never adding a node with zero connection to what's already selected. That's the cohesion guarantee: the output stays a connected subgraph.

5. **Emit** the result as file paths + line ranges. This goes straight into the agent's context window.

![demo](https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/demo.gif)

The greedy gives you a $(1 - 1/e) \approx 0.63$ approximation guarantee on the underlying NP-hard problem. That's a mathematical lower bound on output quality. It's the kind of thing that lets you sleep at night when shipping.

## The honest numbers

Building a context selector that *feels* good is easy. Proving it's good is the hard part.

So I built an evaluation suite into the repo. 28 hand-labeled tasks across 3 real codebases. For each task, I wrote down what an expert would consider "correct context" — the actual files an engineer would open to do the work. Then I measured how each strategy did against those labels.

At a 4,000-token budget per task, averaged across all 28:

| Strategy | Precision | Recall | F1 | Token-efficiency |
|---|---:|---:|---:|---:|
| **mincut-context** | **0.27** | **0.83** | **0.39** | **0.270** |
| mincut + `--embed` (semantic) | 0.27 | 0.83 | 0.39 | 0.270 |
| grep keyword baseline | 0.11 | 0.42 | 0.16 | 0.105 |
| random (sanity control) | 0.01 | 0.04 | 0.01 | 0.009 |

mincut catches **83% of the labeled correct files**. Grep catches 42%. That's roughly twice the recall at the same budget — or equivalently, mincut needs about 2.5× less of your token budget to deliver the same useful information.

Per-repo breakdown is where it gets interesting:

| Repo | Tasks | mincut R | grep R | Δ |
|---|---:|---:|---:|---:|
| mincut-context itself | 12 | **0.97** | 0.56 | +73% |
| FluentForm (PHP + Vue + JS, ~800 files) | 8 | **0.88** | 0.13 | +577% |
| Fluent Player (TS/JSX + admin Vue, ~225 files) | 8 | **0.63** | 0.56 | +13% |

The Fluent Player number is the weakest, and I'm being upfront about it. Investigation: that repo has *two* analytics clusters — a runtime tracker in `resources/js/` and admin Vue components in `resources/admin/modules/analytics/`. The path-aware seeding sometimes picks the admin cluster when the runtime cluster was the right answer. It's a real limitation; the next algorithm improvement (call-graph centrality disambiguation) is in the roadmap.

I'm leaving that visible because pretending it's perfect would be the kind of marketing exaggeration that makes you stop trusting the rest of the numbers.

## The dead end I'd been ready to declare a win

Halfway through, I implemented [CELF](https://www.cs.cmu.edu/~jure/pubs/detect-kdd07.pdf) — Cost-Effective Lazy Forward selection, a 2007 paper that promises to speed up greedy submodular optimization by lazy-evaluating candidate scores in a priority queue. I expected an easy 5× speedup on big graphs.

It diverged from the greedy. Worse: it was *slower* on the biggest graph (112ms vs 13ms on FluentForm).

The reason is a beautiful detail. CELF assumes the objective function is monotone non-decreasing — adding a node to the selection can only *increase* every candidate's marginal gain. Our objective isn't quite that. We have a hard "no isolated nodes" acceptance rule: a candidate can only be picked if it shares at least one edge with the current selection. That eligibility flips discontinuously as the selection grows. CELF's lazy cache becomes unreliable.

I wrote the dead end up in [`eval/ALGORITHM-RESEARCH.md`](https://github.com/dhrupo/mincut-context/blob/main/eval/ALGORITHM-RESEARCH.md) and shipped it with the package. Negative results are research too. Someone's going to consider trying CELF on a similar problem; the document will save them a weekend.

## What you can actually do with it

There are three drop-in surfaces:

**As an MCP server** — for Claude Code, Codex, Cursor, or any MCP-aware agent. Drop one config block in:

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

Your agent now has six tools: `pack_context`, `expand_node`, `find_callers`, `find_callees`, `search_symbols`, `explain_selection`. All operate on the cached graph from the most recent pack — effectively free graph navigation after the first call.

**As a CLI** — for shell pipelines, CI workflows, or just exploring:

```bash
npm install -g mincut-context
mcx pack "fix the login bug" --budget 4000
```

There's an interactive TUI (`--interactive`) with vim keys and a source-preview pane. There's a `mcx watch` mode that re-packs on file change. There's `mcx doctor` that runs an environment self-check:

![doctor](https://raw.githubusercontent.com/dhrupo/mincut-context/main/docs/doctor.gif)

**As a Node library** — for embedding into your own tooling:

```ts
import { pack } from 'mincut-context';

const result = await pack({
  task: 'fix the login validation bug',
  repo: process.cwd(),
  budget: 4000,
  cache: true,                                   // gzip-compressed parse cache
  parallel: 4,                                   // worker-thread parser pool
  chunk: { enabled: true, maxTokens: 400 },      // split huge functions
});
```

## What I learned about building open source tools in 2026

A few things that surprised me. None of them are about graphs.

**Honest numbers beat polished marketing.** The README has a "Tradeoffs (honest)" table that lists every weakness. The eval suite includes a `random` baseline so anyone can verify that mincut is doing *anything* beyond noise. Counterintuitively, this made early users trust the project *more*, not less.

**The "examples/" directory is more valuable than prose docs.** Six concrete drop-in files — Claude Code config, Codex config, Cursor config, GitHub Actions workflow, library quickstart, shell pipeline — get more engagement than a 2,000-word "Getting Started" page. People copy. People rarely read.

**Negative results are content.** The CELF writeup is the most-linked-to file in the repo. Engineers who've considered the same path want to know what happened to someone who tried it.

**`mcx doctor` is the single highest-ROI feature I built.** It costs nothing to maintain (just env checks) and saves users an hour the first time they have a "why isn't `--lsp` working" question. Every dev tool should ship one.

## Where this goes next

The roadmap that's *not* yet checked off:

- **Pyright + Intelephense LSP adapters** for type-aware call resolution in Python and PHP. The LSP infrastructure is generic; it's about a day each.
- **Svelte, Rust, Go parsers.** One file each, copying the Python parser as a template.
- **Incremental neighborhood caching in the greedy.** The real performance win on huge graphs — keep the per-candidate `attach(v, T)` value cached and update only when a node with an edge to v gets added. Expected 3–5× speedup on bounded-degree graphs.

But honestly: **the right next step is to stop building.**

The hardest lesson of this project is that a tool's value comes from someone using it on actual work, not from feature count. v1.7 is the version that's defensible. Every claim has a number. Every algorithm choice has a documented reason. The CI gates correctness and coverage on six platform combinations.

If you've ever watched an AI agent burn 80% of its 200k-token context on imports it doesn't care about — install it now and tell me what breaks:

```bash
npm install -g mincut-context
```

🔗 **GitHub:** [github.com/dhrupo/mincut-context](https://github.com/dhrupo/mincut-context)
📦 **npm:** [npmjs.com/package/mincut-context](https://www.npmjs.com/package/mincut-context)
📊 **Reproducible benchmarks:** [`eval/CROSS-REPO-RESULTS.md`](https://github.com/dhrupo/mincut-context/blob/main/eval/CROSS-REPO-RESULTS.md)

I'd love feedback — especially "your numbers don't replicate on my codebase" feedback. That's literally what the eval suite is for.

---

*If you got value from this, follow me here or ⭐ the repo. mincut-context is open-source MIT, and the eval suite welcomes new fixtures — particularly from larger and stranger codebases than the three I tested on.*
