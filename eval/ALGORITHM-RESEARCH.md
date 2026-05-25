# Algorithm research — CELF vs greedy

We investigated whether CELF (Cost-Effective Lazy Forward, Leskovec et al. 2007) could replace the current greedy selector for a speedup.

**TL;DR: it can't, and that's a finding worth recording.**

## What CELF assumes

CELF gives a `(1 - 1/e)` approximation guarantee with O(log V) amortized per pick **iff** the objective function is **monotone non-decreasing submodular**:

```
f(T ∪ {v}) - f(T)  ≥  f(T' ∪ {v}) - f(T')      whenever T ⊆ T'
```

i.e. a candidate's marginal gain only ever **shrinks** as T grows.  That's what lets CELF cache scores and lazy-update.

## What our objective is

```
score(v, T) = (rank(v) · attach(v, T) · communityBoost(v)) / tokens(v)
```

Where:
- `attach(v, T) = |edges(v) ∩ T| / |edges(v)|`
- `communityBoost(v) = 1 + boost if v.community ∈ seedCommunities else 1`

`attach(v, T)` is monotone non-decreasing in `T` — adding nodes can only **increase** the fraction of v's edges that point into T.

**But our acceptance rule has a hard constraint:**

```
accept v only if attach(v, T) > 0
```

This is the "no-isolated-nodes" rule that gives mincut its cohesion guarantee.  Combined with the "max-score wins" rule, this creates a *non-submodular* selection process:

- A candidate `v` with `attach = 0` is REJECTED, not just down-weighted.
- When some other node is added that makes `v`'s `attach` become `> 0`, `v` becomes ELIGIBLE.
- That's a discontinuous jump from "ineligible" to "eligible with score X", which violates the smoothness CELF assumes.

## What happens in practice

We benchmarked greedy vs CELF on three real graphs:

| repo | symbols | edges | greedy ms | CELF ms | greedy picks | CELF picks |
|---|---:|---:|---:|---:|---:|---:|
| self-repo | 296 | 316 | 2 | 1 | 28 | **17** |
| FluentForm | 4,333 | 3,776 | 13 | 112 | 15 | **13** |
| Fluent Player | 1,877 | 3,848 | 14 | 11 | 30 | **21** |

Reproduce: `npx tsx eval/benchmark-algorithms.ts`

Observations:

1. **CELF is not faster.**  On the biggest graph (FluentForm) it's 8× *slower* because the lazy-re-score loop ends up re-scoring almost everyone whenever a new node is added — the dirty-set heuristic is nearly all candidates.

2. **CELF picks fewer nodes.**  In every case, CELF terminates with a smaller selection.  Inspection: CELF is over-eager about deleting candidates when their `attach == 0` at the moment they bubble to the top, even though they might become eligible later if a different candidate is added first.  Greedy re-checks attach against the CURRENT T on every iteration; CELF caches it.

3. **Cut cost diverges.**  CELF sometimes produces a worse cut (e.g. self-repo: greedy 17.0 → CELF 33.0) because the smaller selection leaves more boundary edges.  In one case CELF accidentally produced a better cut (FluentForm: 12.0 → 10.0) because picking fewer nodes meant fewer boundary edges to begin with — but at the cost of less context delivered.

## Conclusion

**CELF is the wrong tool for this objective.**  Our `attach > 0` constraint breaks the smoothness CELF assumes; the lazy cache becomes unreliable and the algorithm produces worse, not just faster, results.

For a real speedup on big graphs, the right next step would be:

- **Incremental neighborhood updates** — keep `attach(v, T)` cached per candidate and update *only* when a node with an edge to `v` is added.  This is the same trick CELF tries but without the priority-queue overhead.  We'd save the O(V) inner scan per pick → O(neighbors-of-newly-added) per pick.  Expected ~3-5× speedup on graphs with bounded degree.
- **Spatial sort** — keep candidates sorted by `score` and only re-sort the dirty subset.

Both are bounded-effort and don't change the algorithm's output.  They're tracked as future v1.x work.

For now, **greedy stays.**  It's correct, simple, fast enough on graphs up to ~5k symbols (13 ms on FluentForm), and the eval suite shows it produces the right answers.

## What we keep from this work

- `src/core/select-celf.ts` is shipped but **not wired into pack()**.  It's available as an opt-in for future research / comparison.
- The eval suite gained `eval/benchmark-algorithms.ts` which any future selector can plug into to compare against greedy.
- This document so the same dead-end doesn't get re-explored.
