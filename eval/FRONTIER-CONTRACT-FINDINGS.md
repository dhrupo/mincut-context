# Frontier-as-contract: experimental findings

**Date:** 2026-05-31
**Branch:** `feat/frontier-contract`
**Spec:** [`docs/superpowers/specs/2026-05-30-frontier-contract-design.md`](../docs/superpowers/specs/2026-05-30-frontier-contract-design.md)

## Hypothesis under test

A reader proposed that the min-cut's **frontier** — the symbols just outside the
selected region that the region depends on — could be rendered as body-free
**signature stubs** and serve as a "typed handoff" contract. The testable claim:

> Frontier signatures recover correct-file coverage that the budget cut dropped,
> at a fraction of the token cost of including the full files.

Measured with a new `boundaryCoverage` metric (signature-level, kept distinct
from full-body `recall`) and the headline number **correct files recovered per
1 000 contract tokens**, via the `mincut-contract` eval strategy.

## Result: hypothesis falsified across all three repos

| repo | language mix | cut-only recall | cut+contract boundary coverage | avg contract tokens/task | recovered per 1k tokens |
|---|---|---:|---:|---:|---:|
| self (mincut-context) | TS | 97.2% | 97.2% | ~209 | **0.000** |
| FluentForm | PHP + Vue | 87.5% | 87.5% | 72 | **0.000** |
| Fluent Player | PHP + JS/JSX + Vue | 62.5% | 62.5% | 123 | **0.000** |

In every case `boundaryCoverage == recall` — the contract's signature stubs land
**only on files already inside the selection**. Even on Fluent Player, where the
budgeted cut *misses 37.5 % of correct files*, the outbound type-frontier
recovers **none** of them.

(Budget 4 000 tokens. FluentForm/Player fixtures index the live sibling repos at
`/Volumes/Projects/forms/wp-content/plugins/`; numbers are reproducible via
`npx tsx eval/runner.ts --fixtures eval/fixtures/<repo>-tasks.json`.)

## Why it fails (mechanistic reading)

This is not a bug — it is what the algorithm *should* do, and the experiment
makes that explicit:

1. **A min-cut already absorbs outbound dependencies.** Minimizing the boundary
   cut means the greedy selection preferentially pulls in the things the seed
   region calls/imports/references — that *is* the objective. So by the time
   selection finishes, the outbound type-frontier is largely **already selected**.
   The stubs we emit therefore point back into the region (redundant) rather than
   out to new files.

2. **The files the cut MISSES are not outbound dependencies.** A dropped correct
   file is missed precisely because it is *not* in the seed region's outbound
   type-closure — it is a caller, a sibling, a config/registration file, or a
   semantically-related file with no direct dependency edge. The outbound
   frontier, by construction, cannot reach it.

In short: the outbound type-frontier is the wrong signal for *recall recovery*.
It is redundant with the cut, not complementary to it.

## What this does and doesn't say

- It does **not** say typed handoffs are useless in general. It says that
  **deriving the handoff from the min-cut's outbound frontier** does not improve
  file-level coverage on these repos.
- The contract output is still well-formed and cheap (72–209 tokens/task) — if a
  future use wants signature stubs of the region's dependencies *for context
  quality* (not recall), the machinery is there and tested. But that is a
  different claim than the one tested here, and it is unmeasured.

## Directions that might actually move recall (untested)

If the goal is recovering *missed* correct files cheaply, the signal has to come
from where the missed files actually live:

- **Inbound callers** of the selected region (who depends on it), as stubs.
- **Semantic neighbors** (the `--embed` seeding already finds some of these).
- **Co-occurrence / co-change** edges, which are not in the current graph.

Each is a separate hypothesis with its own eval; none is implemented here.

## Status

The feature is complete, tested (301 tests green), and merge-ready as an
opt-in capability. Its headline hypothesis returns a clean **null result** — which
is the honest outcome the spec explicitly anticipated ("the hypothesis may not
hold… that is itself a valid, honest result and the eval should report it
plainly").
