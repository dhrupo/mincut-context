# Frontier-as-contract: the typed-handoff bridge

**Date:** 2026-05-30
**Status:** Approved design, pending implementation plan
**Author:** Dhrupo (with Claude)

## Motivation

A reader of the Dev.to article observed that at the SaaS-generation layer the
wasted context is *re-derivation*: a multi-phase generation agent re-infers
schema/types/imports every phase, and a "typed handoff" between phases fixes it.
That is a different layer from what `mincut-context` does today — `mincut-context`
*selects* a minimal region from an existing repo; the typed-handoff idea
*propagates* a typed boundary between generation phases.

The bridge: **the min-cut's frontier is already a typed boundary.** When the
budgeted cut selects a region `T`, the symbols just outside `T` that `T`
references (`pack.ts:348` `frontierCount`) are exactly the external dependencies
the region needs to *typecheck* but whose bodies were cut. Rendering that
frontier as **signature-only stubs** produces, from graph topology, the same
artifact the commenter derives from phase ordering: a typed contract the next
consumer can rely on without paying for full bodies.

This design prototypes that contract and measures, on the existing 28-task
cross-repo eval, whether frontier signatures recover correct-file coverage that
the budget cut dropped — at a fraction of the token cost of including the full
files.

## Scope

In scope:
- A `contract` output on `pack()` (opt-in) carrying type-aware signature stubs
  for the selected region's outbound dependency frontier.
- Type-aware signature extraction for the four supported language families
  (TS/JS/TSX, Python, PHP, Vue), reusing existing parser naming logic.
- A new eval strategy + a `boundaryCoverage` metric and an A/B report
  (cut-only vs cut+contract) over the existing fixtures.

Out of scope (explicit YAGNI):
- Baking signatures into the graph/cache at index time (Approach B). Only
  justified as a follow-up *if* the eval shows the feature is worth shipping.
- Rendering/emit format for agents (CLI/MCP surfacing). Prototype returns
  structured data; presentation is a later slice.
- Using the contract to drive an actual generation pipeline. The hypothesis
  under test is recall-recovery-per-token, not end-to-end generation.

## Architecture (Approach A + naming refinement)

```
pack() ──selection──▶ buildContract(graph, selected, repo, opts)
                          1. frontier = outbound type-edges of selected, minus selected
                          2. group frontier symbols by file
                          3. re-parse each frontier file with {signatures:true}
                          4. emit ContractStub per frontier symbol
                                 │
                                 ▼
                          PackResult.contract?: Contract
```

- **New module:** `src/select/contract.ts` — `buildContract(graph, selected, repo, opts): Contract`.
- **Parser refinement:** the contract needs each frontier symbol's *qualified*
  name (`Session.create`, not `create`) to match graph node ids. That naming
  logic already lives in each parser's visitor. Rather than write a second,
  divergent walker, extend the existing parsers with an **opt-in** signature
  capture: add `signature?: string` to `ParsedSymbol` and a
  `{ signatures?: boolean }` parse option. The index/cache path **never** sets
  the flag, so the indexing hot path and the gzipped cache format are
  unchanged. `contract.ts` re-parses only the (small) set of frontier files
  with the flag on.

This keeps the change consistent with Approach A's intent — no graph/cache
bloat, no index-time behavior change — while keeping symbol-naming logic in a
single place to avoid id drift.

## Data shapes

```ts
interface ContractStub {
  id: string;          // frontier symbol id (`${file}:${qualifiedName}`)
  file: string;
  kind: NodeKind;
  name: string;
  signature: string;   // type-aware stub text (no body)
  tokens: number;      // approxTokens(signature)
  via: string[];       // selected symbol ids that reference it — the "why"
}

interface Contract {
  stubs: ContractStub[];
  tokens: number;      // Σ stub tokens
  files: string[];     // distinct frontier files (for eval coverage)
}
```

Attached as optional `PackResult.contract`. Present only when
`pack({ contract: true })` (or `{ contract: { maxTokens } }`).

## Frontier scoping

From each selected node, walk **outbound** edges. A target is a contract stub iff:
- it is **not** in the selected set, AND
- the edge kind ∈ `{ call, reference, extends, implements, import }`.

Excluded:
- `contains` edges (file→symbol structural noise),
- **all inbound edges** (callers — who depends on the region, not what the
  region depends on),
- `file`-kind target nodes,
- targets with no extractable signature.

Rationale: a typed handoff is about what the region *needs to know to compile*,
i.e. its outbound dependency boundary — not its dependents.

Optional `maxTokens` cap: when set, rank candidate stubs by reference count from
the selected set (how many selected symbols point at them) and keep highest
first until the cap. Default: no cap.

## Type-aware stub rules

| kind | stub |
|---|---|
| function / method | declaration line(s) up to body; body → `;` or `{ /* … */ }` |
| interface / type | full body (it *is* the contract) |
| class | `class X extends Y` header + **public member signatures** only, no method bodies |
| variable / export | declaration line, initializer elided |

Per-language extraction lives with each parser (reusing its tree-sitter setup
and naming). No body text may appear in a stub (asserted by test).

## Eval: boundary-coverage metric + A/B

New strategy `mincut-contract` in `eval/runner.ts`. A new metric kept **separate**
from `metrics.ts`'s IR contract (so file-level recall semantics stay intact):

- **cut-only:** `recall` (full-body file recall), `tokens`.
- **cut+contract:** `boundaryCoverage = |correct ∩ (selectedFiles ∪ contractFiles)| / |correct|`,
  `tokens = selectedTokens + contractTokens`.
- **Headline:** marginal correct files recovered per 1k contract tokens:
  `(boundaryCoverage − recall) / (contractTokens / 1000)`.

Honesty constraints (non-negotiable in the report):
- `boundaryCoverage` is labeled **signature-level** coverage and is **never**
  conflated with full recall. A file recovered via a stub is *reachable*, not
  fully present.
- Precision is reported for both arms. Stubs add files; if precision dips, the
  report shows it rather than hiding it. The defensible claim is token
  efficiency (signature stub ≪ full file), not raw precision.

The claim the eval can support, stated precisely:
> "N% of the correct files the budget cut dropped are reachable as signature
> stubs at ~M tokens — versus the full token cost of including those files."

## Testing (TDD, Vitest)

This is a TypeScript library with no browser surface, so Vitest unit +
integration is the test discipline (the dual-layer Playwright rule is
Fluent-Forms-ecosystem-specific and does not apply here). Failing test first
for every behavior slice.

- **Per-language signature extraction** — fixtures for ts/py/php/vue asserting
  each stub rule and **no body leakage** (stub tokens ≪ source node tokens).
- **buildContract** — frontier excludes `contains` and inbound edges, dedups
  stubs, computes `via` correctly, deterministic ordering, honors `maxTokens`.
- **Integration** — `pack({ contract: true })` on a fixture repo: stubs
  reference real frontier symbols; `contract.tokens` equals Σ stub tokens.
- **Eval** — run `mincut-contract` over the existing 28 tasks; capture the
  A/B report.

## Risks / open questions

- Signature extraction edge cases (multi-line generics, decorators, PHP
  docblocks, Vue `<script setup>`). Mitigation: fixtures per language; lossy is
  acceptable for the prototype as long as no body leaks.
- The hypothesis may not hold — many dropped correct files may not be in the
  outbound frontier at all (they could be siblings, tests, or callers). That is
  itself a valid, honest result and the eval should report it plainly.
- `maxTokens` ranking heuristic (reference count) is a guess; revisit only if
  uncapped contracts prove too large in the eval.

## Decisions made without asking (vetoable)

1. Outbound type-edges only for the frontier (§ Frontier scoping).
2. The per-kind stub rules (§ Type-aware stub rules).
3. `boundaryCoverage` kept separate from full recall (§ Eval).
