# ADR-0025 — P5.2b step 1: the sprawl is not where the plan said it was

Status: accepted · Date: 2026-08-26 · Follows [ADR-0024](0024-p52a-live-evidence-projection.md)

## The plan's premise, and what measurement showed

P5.2b reads:

> Context: `liveDriftAlerts.ts` is 15,979 lines with ~26 near-clone satellites
> split-brained across `watch/`/`drift/`/`score/` — pure report-builders.
> Do: … collapse the clone family behind one parameterized monitor.

The line count is right. The diagnosis is not.

**The satellites are not clones.** Twenty files match `*LiveDrift*.ts`, totalling
8,660 lines. Normalising away domain names (identifiers, string literals, numeric
literals) and comparing all 171 pairs:

    median similarity  0.080
    pairs above 0.90   0 / 171
    pairs above 0.80   1 / 171
    exact duplicates   0

A first pass using `difflib.quick_ratio` reported a median of 0.675 and I nearly
acted on it. `quick_ratio` is an upper bound on a bag-of-characters comparison —
it overstated the true ratio by between 2.5× and 12×. Reading two files
side by side confirmed the corrected number: `openCompassLiveDrift.ts` verifies
source metadata (URLs, status codes, content types, titles) while
`garageLiveDrift.ts` measures RAG grounding quality (question complexity, cited
passages, answer validation, latency). They share a filename suffix, not a body.

**The abstraction the plan asks for already exists.** All 19 substantial
satellites import `LiveDriftWindow`, `LiveDriftReceipt`, `LiveDriftAlert`,
`LiveDriftThresholds` and `LiveDriftSampleRow` from `liveDriftAlerts.ts`, and 19
of 20 call its single entry point `runLiveScoreBehaviorDrift`. They are thin
per-domain adapters over a shared engine. "Collapse the clone family behind one
parameterized monitor" describes something that shipped some time ago.

## Where the sprawl actually is

`liveDriftAlerts.ts` has **283 functions and 3 exported ones** — a narrow public
surface. The size comes from two places:

| region | lines | what |
|---|---|---|
| `LiveDriftSampleRow` | 937 | **936 fields** across **74 domain prefixes** |
| type declarations (87 blocks) | 4,443 | 28% of the file |
| 283 helpers, ~half `normalize*`/`has*` | ~4,000 | one family per domain |
| `runLiveScoreBehaviorDrift` | ~3,400 | aggregates all 74 domains |

One interface carries `redTeamBenchmarkId`, `physicianBenchVerifierCheckpointHash`,
`hedraRagRuntimeContextDivergence0to1`, `navi*`, and seventy more domains' fields.
Every domain AMC has ever monitored added fields to one shared row, helpers to one
shared file, and branches to one shared aggregator — **and** a satellite. The
satellites are the symptom; the union type is the disease.

## What this step did

Extracted the type layer to `src/watch/liveDriftTypes.ts`.

The 87 type blocks were not scattered: 85 of them sit in `L1–4421`, and the only
non-type, non-comment lines in that region are the six imports at the top. So it
moved as **one contiguous block**, which is the one change to a 16k-line file that
carries no runtime risk at all — types are erased at compile time and `tsc` proves
the move exact. The engine re-exports them, so no consumer changed.

    src/watch/liveDriftAlerts.ts   15,980 -> 11,657   (-4,323, -27%)
    src/watch/liveDriftTypes.ts         0 ->  4,436

The ratchet baseline was lowered to 11,657, so the lines cannot come back, and
the new file is **tracked in `budgets` rather than exempted as a data registry**.
It would have qualified for the exemption — its measured logic ratio is 0.0018
against a 3% threshold — but tracking it is the stricter choice and costs nothing.

## Where this stopped, and why

The next mechanical seam is the `normalize*`/`has*` helper layer: 136 of the 283
functions. It is **not** contiguous — there are 98 alternations between helper and
non-helper functions in definition order — so extracting it means moving 136
scattered definitions rather than one block. That is a different risk class from a
type move, and it buys less than the real fix.

The real fix is a **per-domain registry**: each domain contributes its row fields,
its normalizers and its metrics from its own module, and the engine iterates
registered domains instead of hard-coding 74 of them. That makes adding a domain a
new file rather than an edit to three shared ones. It is an architectural change,
not a mechanical one, and it deserves its own step.

## Two corrections to the plan's Verify criteria

**"`liveDriftAlerts.ts` is under the ratchet ceiling"** is not reachable — not in
this step and not by decomposition alone. All **53** tracked files exceed the
800-line cap today; the largest is `replayBenchmarkCorpus.ts` at 29,469 and
`cli.ts` at 24,615. The ratchet is a *descending* mechanism — no file may exceed
its own recorded baseline — not a cap enforcer. The honest criterion is
"materially smaller and the baseline lowered", which this step meets.

**"the clone count is measured and falling"** — measured, and the premise does not
survive it. There is no clone count to reduce.

## Safety

The refactor is protected by a strong, fast harness that already existed: **58
test files import `runLiveScoreBehaviorDrift`, carrying 3,829 `expect()` calls**,
and the drift subset runs in 5.4 seconds. Those tests assert output VALUES —
coverage ratios, sample sizes, drift statistics, receipt hashes — not merely
shape.

75 drift-related files / 408 tests pass. Full suite **10,000 / 10,000** across
1,242 files. `lint`, `typecheck`, `check:architecture-boundaries` and
`check:counts` pass.

One full-suite run failed `tests/performance/sessionSpine.performance.test.ts`
and passed on re-run. It imports only `workspace.js` and `sessionService.js` —
nothing from `watch/` — and asserts a wall-clock ratio (`secondHalf <
firstHalf * 3`), so it is load-sensitive under a 1,242-file parallel run. A
type-only move cannot affect it. Flagged as flaky rather than explained away.

## Still open in P5.2b

- **The per-domain registry** — the actual decomposition.
- **Liveness.** The plan asks that "a drift monitor fires on a live behavioural
  change". Not addressed here and not yet verified to exist: the satellites take
  rows as input, which is what "pure report-builders" means. Whether anything
  subscribes to a live event stream is the open question for the next step.
