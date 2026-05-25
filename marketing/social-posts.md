# Social posts — mincut-context v1.7.0

Ready-to-paste copy for LinkedIn, X, and Facebook.

- Replace the **🔗** link with `https://github.com/dhrupo/mincut-context` if a platform strips it.
- For LinkedIn / X, attach `docs/demo.gif` directly. Both platforms auto-loop GIFs.
- For Facebook, attach the same GIF; if FB compresses it badly, upload `docs/hero.png` instead.
- All three posts share the same headline numbers so cross-platform readers see consistency.

---

## 1. LinkedIn (English · informative-with-a-grin)

> Attach: `docs/demo.gif`

```text
Confession: I spent too long watching Claude Code politely read 4,000-line files
just to fix a typo. So I built mincut-context.

It treats your repo as a graph and uses personalized PageRank + budget-constrained
min-cut to pick the smallest provably-relevant context for any task.

Tested on 28 hand-labeled tasks across 3 real codebases (FluentForm, Fluent Player,
the package itself), at the same 4,000-token budget:

→ mincut: 83% of correct files caught, F1 0.39
→ grep:   42% of correct files caught, F1 0.16
→ ~2.5× better token-efficiency

What it does, plainly:
• You give it a task in English ("fix the login validation bug")
• It builds a symbol graph from your code (tree-sitter, 5 languages)
• Runs personalized PageRank seeded by your task
• Picks the min-cut subgraph that fits a token budget
• Returns the exact files + line ranges your agent should look at

Three surfaces:
• MCP server — drops into Claude Code, Codex, Cursor in one config block
• CLI — mcx pack "fix the login bug" --budget 4000
• npm library — import { pack } from 'mincut-context'

Open-source (MIT), 261 tests passing, 88.6% coverage, eval suite built-in so
any improvement claims are testable.

If you've watched an AI agent burn 80% of its context window on imports it
doesn't care about — this is for you.

🔗 https://github.com/dhrupo/mincut-context
📦 npm i -g mincut-context

I'd genuinely love feedback from anyone shipping AI-agent tooling. Better
approaches welcome — that's literally what the eval suite is for.

#AI #Developer #OpenSource #TypeScript #MCP #Anthropic #ClaudeCode
```

---

## 2. X / Twitter (English · long-form Premium / Basic · meme energy)

> Attach: `docs/demo.gif`. If you'd rather thread it, every `\n\n` is a natural break.

```text
unpopular CS take:

your AI coding agent reading entire files is a *budgeting* problem, not a
context-window problem.

i built `mincut-context` — graph theory (personalized PageRank + budget-
constrained min-cut) picks the smallest provably-relevant slice of your repo
for any task.

28 hand-labeled tasks · 3 real codebases · same 4,000 token budget:

  mincut: 83% recall, 0.39 F1
  grep:   42% recall, 0.16 F1
  random: 4% recall (baseline)

≈ 2.5× more signal per token. all reproducible with `npm run eval`.

5 languages: TS/JS/Vue/Python/PHP
3 surfaces: MCP server / CLI / library

  npm i -g mincut-context
  mcx pack "fix the login bug" --budget 4000

free. MIT. 261 tests. 88.6% coverage. all the honest tradeoffs in the README,
including an entire writeup of "CELF didn't beat greedy on this objective and
here's why" because that's a real finding and it should be public.

🔗 github.com/dhrupo/mincut-context

(yes — when you ask mincut "implement PageRank algorithm", it surfaces its own
src/core/pagerank.ts at 0.97 recall. recursive validation feels good.)
```

### X thread variant (if you prefer 7 tweets)

```text
1/ unpopular CS take: your AI coding agent reading entire files is a *budgeting* problem, not a context-window problem 🧵

2/ i built mincut-context — uses graph theory (personalized PageRank + budget-constrained min-cut) to pick the smallest provably-relevant slice of your repo for any task

3/ tested on 28 hand-labeled tasks across 3 real codebases at a 4000-token budget:

  mincut: 83% recall, 0.39 F1
  grep:   42% recall, 0.16 F1
  random: 4% recall

~2.5× more signal per token

4/ all reproducible with `npm run eval`. labels under eval/fixtures/. the algorithm benchmark and CELF writeup are in eval/ too — because if you ship numbers without a way to re-derive them, they're vibes

5/ five languages (TS/JS/Vue/Python/PHP) via tree-sitter. three surfaces (MCP server / CLI / library). open source MIT.

  npm i -g mincut-context

6/ ships with a Claude Code MCP config in examples/. drop the block into your settings, restart, your agent gets pack_context, expand_node, find_callers, find_callees, search_symbols. zero new vocab to learn.

7/ honest tradeoffs and an entire CELF-didn't-work writeup are in the repo. better algorithms welcome — the eval suite is built exactly for that.

🔗 github.com/dhrupo/mincut-context
```

---

## 3. Facebook (বাংলা · ব্যক্তিগত-বন্ধুসুলভ টোন)

> Attach: `docs/demo.gif` directly to the post.

```text
একটা ছোট্ট জিনিস বানালাম, ভাবলাম শেয়ার করি 🙂

AI coding agent — Claude Code, Cursor, এইসব tool — যখন তোমার codebase-এ
কাজ করে, ওদের একটা বড় সমস্যা: ওরা প্রায়ই পুরো ফাইল পড়ে ফেলে। ৪০০০
লাইনের একটা ফাইলে একটা bug fix করতে গিয়ে ৪০০০ লাইন-ই context-এ ঢুকিয়ে
দেয়। token খরচ হয় বেশি, accuracy পড়ে যায়।

তাই বানালাম একটা npm package:

  📦 mincut-context

কী করে এটা? পুরো repo-কে একটা graph হিসেবে treat করে — function, class,
import, call — সব কিছুকে nodes আর edges বানিয়ে ফেলে। তারপর graph
algorithm (personalized PageRank + budget-constrained min-cut) দিয়ে শুধু
*relevant* অংশটুকু বেছে নেয়।

৩টা real codebase-এ ২৮টা hand-labeled task দিয়ে test করেছি:

  → mincut catches ৮৩% correct files
  → grep keyword search পায় ৪২%
  → মানে ২ গুণ better recall, ২.৫ গুণ better token efficiency

Tools যেগুলো support করে:
  • TypeScript / JavaScript / Vue / Python / PHP
  • Claude Code, Codex, Cursor (MCP server হিসেবে drop-in)
  • CLI command (mcx pack "task description")
  • Node library

পুরো open source, MIT licensed, ২৬১টা test, ৮৮.৬% coverage —
দেখতে চাইলে:

  🔗 https://github.com/dhrupo/mincut-context
  install: npm i -g mincut-context

কেউ যদি AI dev tools নিয়ে কাজ করো, feedback বা suggestion দিও — এই
project real users-এর কাজে আসছে কিনা সেটা আমার জন্য জানা important।

Star দিলে আনন্দ পাবো 🌟
```

---

## Posting playbook (90-minute window)

| When | Where | Asset to attach |
|---|---|---|
| **T+0min** | LinkedIn | `docs/demo.gif` |
| **T+15min** | X (post 1 above OR thread variant) | `docs/demo.gif` on the first tweet |
| **T+30min** | Facebook | `docs/demo.gif` |
| **T+45min** | Hacker News — Show HN (see below) | `docs/hero.png` if you want a preview |
| **T+60min** | r/LocalLLaMA · r/programming · r/javascript (one per subreddit, different angle each) | `docs/demo.gif` |
| **T+90min** | Reply to every comment that landed in the first hour |

### Show HN — title + body ready

> **Title:** `Show HN: Mincut-context – Token-minimal context for AI coding agents`
>
> **URL:** `https://github.com/dhrupo/mincut-context`
>
> **First comment (post immediately after submitting):**
>
> Hi HN — author here. I got tired of watching Claude Code dump entire files to fix one bug, so I built this. It treats the repo as a symbol graph (tree-sitter), runs personalized PageRank from your task description, and picks the min-cut subgraph that fits a token budget.
>
> Eval against 28 hand-labeled tasks on 3 real repos: 83% recall vs grep's 42%, ~2.5× better token-efficiency. Everything reproducible with `npm run eval`.
>
> Tradeoffs and an honest CELF-didn't-work writeup are in the README. Happy to answer anything.

### awesome-mcp-servers PR — body ready

Add under "Code Analysis & Search" of [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers):

```
- [mincut-context](https://github.com/dhrupo/mincut-context) - Token-minimal
  context selection via symbol graph + personalized PageRank + budget min-cut.
  TS/JS/Vue/Python/PHP. Measured: 83% recall vs grep's 42% on labeled tasks.
```

### Engagement rules of thumb

- **Reply to every comment within the first 2 hours.** Engagement velocity is what pushes posts into recommendation tiers.
- **Tag people in the first reply, not the post body.** Tagging in body looks needy; in a reply it looks like an invitation.
- **Numbers in the first line, code in the third.** Hook → context → call to action. Same template on every platform.
