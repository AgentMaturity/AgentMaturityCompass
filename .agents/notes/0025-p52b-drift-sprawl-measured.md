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

## Step 2 — liveness: two drift systems that never spoke

The plan asks that "a drift monitor fires on a live behavioural change". It did
not. AMC had **two disjoint drift systems**:

| | reads the ledger? | statistics |
|---|---|---|
| `src/drift/continuousMonitor.ts` | **yes** — `openLedger`, `parseEvidenceEvent`, `EventEmitter`, `runMonitorTick` | a 241-line detector comparing `DiagnosticReport`s |
| `src/watch/liveDriftAlerts.ts` | **no** | 11.6k lines across 74 domains |

Verified in both directions: `liveDriftAlerts.ts` contains no `openLedger`, and
nothing under `src/drift/` references it. The rich engine had never seen a real
event; the live monitor had never used the rich engine.

### Why they never connected, and why it was easy after all

The engine's input is `LiveDriftSampleRow` — 936 fields of benchmark vocabulary,
which no runtime event can populate. That is the obvious reason to assume a
bridge is infeasible.

But only **six** of the 936 are mandatory: `traceId`, `scenarioId`, `timestamp`,
`score0to1`, `behaviorSignature`, `evidenceRefs`. Measured against the real
engine, rows carrying only those six produce correct score and behaviour drift
with working alerts, and all ~300 domain metrics degrade cleanly to 0. Nothing
was blocking liveness but a projection nobody had written.

`src/watch/sessionDriftProjection.ts` is that projection, over exactly the
governed tool-call evidence P5.2a writes. End-to-end on a real governed run:

    50 evidence events -> 20 drift rows (only TOOL_CALL_* audits project)
      baseline: mean 1.00, signature TOOL_CALL_ALLOWED:fs.read
      live:     mean 0.00, signature TOOL_CALL_DENIED:bash:tool-allowlist

    ALERTS: [critical] scoreMean0to1
            [high]     behaviorSignature
            [high]     signedEvidenceRefs

The plan's Verify criterion is met: a drift monitor fires on a live behavioural
change, from signed evidence, with a receipt hash.

### Two things named rather than glossed

**`score0to1` is a compliance rate here, not a quality score.** The engine's
field means "quality"; for governed tool calls it is the fraction policy
permitted. A drop means more guard denials — a behavioural change worth
alerting on, not a judgement that the agent got worse, since a rising denial
rate can equally mean the guards started biting. The alert text should be read
as "tool behaviour changed".

**The guard is in the behaviour signature.** Without it, a workspace whose
denials shifted from the allowlist to the budget guard would look completely
unchanged — the opposite of what a drift monitor is for.

`tsc` caught that `evidenceRefs` is mandatory too, which turned out to matter:
the engine raises a HIGH alert on a receipt carrying no evidence refs, and it is
right to. Every sample now walks back to its ledger row, and to the hash-chain
entry when the row was signed — **omitted rather than faked when it was not**,
because a drift receipt claiming signed provenance it lacks is worse than one
that admits the gap.

12 tests, 5 mutations all caught: accepting any audit type, accepting any event
type, scoring every call compliant, dropping the guard from the signature, and
emitting a signed ref for an unsigned row.

## Still open in P5.2b

- **The per-domain registry** — the actual decomposition of the remaining 11.6k
  lines. `LiveDriftSampleRow` is still a 936-field union across 74 domains.
- **Wiring the projection into `continuousMonitor`.** The bridge exists and is
  proven end-to-end, but nothing calls it on a tick yet — that is a monitor and
  CLI change, not a projection change.
- **~300 zero-valued metrics per receipt.** A live receipt reports every domain
  metric, almost all 0. That is the union type showing up in the output, and it
  is noise a per-domain registry would remove.

---

# Correction (2026-08-26): "the clones were not clones" was wrong

An adversarial review of this ADR re-measured the satellites and reached the
opposite conclusion. I verified its claims independently. **It is right and this
ADR's headline finding was wrong.** Recorded here rather than edited away,
because the error is in a commit message that is already published.

## The measurement error was circular

My normalisation stripped only the DOMAIN NAME from identifiers — `OpenCompass`,
`Garage` — and left every other identifier intact. But the remaining identifiers
are precisely the per-domain field names that a parameterized monitor exists to
factor out. **The metric measured the thing being abstracted away and concluded
there was nothing to abstract.**

Re-measured with full identifier normalisation (every identifier → `ID`, string →
`STR`, number → `NUM`, then trigram Jaccard over the token stream):

| | my original metric | full normalisation |
|---|---|---|
| median similarity | 0.080 | **0.286** |
| pairs ≥ 0.70 | 9 / 171 | **34 / 171** |
| pairs ≥ 0.90 | **0 / 171** | **21 / 171** |
| max | 0.895 | **0.991** |

Single-linkage clustering at 0.90 finds **four clusters covering 15 of 19 files
and 6,920 lines**:

| files | lines | internal similarity |
|---|---|---|
| braintrust, decibenchVoice, paperReadSkill, reflexionAgent, skillMatch | 1,716 | min 0.971, median **0.979** |
| lmnrObservability, openCompass | 922 | median 0.972 |
| aiReputationClaude, awesomeAgentMemory, ctfAgentBenchmark, darwinGodelMachine | 2,136 | median 0.939 |
| agentReadingTest, garage, llmFighter, railScore | 2,146 | median 0.928 |

The review partitioned the files by structural features rather than by
similarity, and arrived at the same first cluster exactly — braintrust,
decibenchVoice, paperReadSkill, reflexionAgent, skillMatch. Two independent
methods agreeing on the same five files is stronger evidence than either alone.

**So the plan was right and I was wrong.** There is a genuine clone family. It is
15 files rather than "~26", and it is four clusters rather than one, but
"collapse the clone family behind one parameterized monitor" is warranted work.

What survives from the original finding: the satellites do already share types
and an engine, and 19 of 20 delegate to `runLiveScoreBehaviorDrift`. They are
adapters — but the adapters are themselves near-identical, which is exactly the
duplication worth removing.

## Three behavioural forks a collapse must not silently unify

Verified by reading the code, not taken from the review:

- **`round`** — `braintrustLiveDrift.ts:151` takes no `places`; `garageLiveDrift.ts:207`
  takes `places = 6`.
- **`unique`** — `braintrustLiveDrift.ts:142` returns `normalizeEvidenceRefs(values).sort()`;
  `garageLiveDrift.ts:217` returns it **unsorted**. `sortDeep` in `utils/json.ts:6-8`
  maps arrays without sorting them, so **array order reaches
  `sha256Hex(canonicalize(...))`**. Unifying `unique` changes every `rowProofHash`
  and `receiptHash` in the affected files. That is a published-artifact change,
  not a refactor.
- **`isPresent`** has three variants; some count `NaN` as present.

A collapse must carry these as parameters until each is deliberately retired with
its own decision, or it will change signed output while claiming to preserve it.

## The type extraction: net tracked lines went UP

Also correct, and I did not state it:

    src/watch/liveDriftAlerts.ts   15,980 -> 11,657
    src/watch/liveDriftTypes.ts         0 ->  4,436
    total tracked                  15,980 -> 16,093   (+113)

The re-export block and the 85-name import list cost ~111 lines. Both numbers
were in the commit message, so the arithmetic was available — but the ADR said
"materially smaller and the baseline lowered", which is true of the file and not
of the total, and I should have said so.

And `liveDriftTypes.ts` did not pass the cap. `architecture-boundaries-check.mjs:83-91`
fails a new file over 800 lines unless it is recorded as "a deliberate exception
in scripts/line-budgets.json" — which is what adding it to `budgets` is. Calling
that "the stricter choice" was true only relative to the `dataRegistries`
alternative; it is still the exception path. The ceiling was relocated, not met.

The extraction remains worth keeping — it creates the seam the registry needs and
carries no runtime risk — but it is a navigability change, not a size win.

## What this changes about the next step

The next step is the collapse, on the four measured clusters, largest first, with
the three forks carried as explicit parameters and receipt hashes pinned by
characterization tests captured BEFORE the change.

---

# Step 3 — the collapse, cluster 1

Acting on the correction above. The tightest of the four measured clusters:
**braintrust, decibenchVoice, paperReadSkill, reflexionAgent, skillMatch**,
internal trigram similarity 0.971–0.991. The same ~320-line program five times,
differing in field names.

## The safety net came first

Before touching anything, each of the five tests gained a **characterization
pin**: `sha256Hex(canonicalize(result))` over the WHOLE result — every
`rowProofHash`, the `receiptHash`, the summary, the alerts, the missing reasons.
Five golden hashes captured from the pre-collapse code.

This is not belt-and-braces. `canonicalize` maps arrays without sorting them, so
element order reaches the receipt hash; and a payload key that is `undefined`
disappears from the canonical JSON while `null` survives. A collapse that got
either subtly wrong would change published artifacts while reading as a refactor.

**All five hashes are byte-identical after the collapse.**

## What is parameterised, and what deliberately is not

`src/watch/proofDelegatedMonitor.ts` owns the proof-coverage walk, the coverage
arithmetic, alert construction, receipt enrichment and the rehash — identical
across all five.

The row payload is supplied as a **callback**, not a field list. A field list
would have to reproduce each file's exact `?? null` handling to stay
byte-identical, which means reconstructing the hash-critical part. A callback
relocates it instead. Less "general", much safer, and the generality would have
bought nothing.

## Accounting, stated net this time

| file | before | after |
|---|---|---|
| braintrustLiveDrift.ts | 323 | 211 |
| decibenchVoiceLiveDrift.ts | 403 | 246 |
| paperReadSkillLiveDrift.ts | 314 | 175 |
| reflexionAgentLiveDrift.ts | 324 | 178 |
| skillMatchLiveDrift.ts | 351 | 205 |
| proofDelegatedMonitor.ts | — | 242 |
| **total** | **1,715** | **1,257** |

**Net −458 lines.** Unlike step 1, this one really is smaller — and the point is
that the coverage/alert/receipt logic now exists once rather than five times, so
a fix to it applies five times.

## Two mutations survived, and the reason was my own blind spot

The characterization hashes caught unsorting `unique` (5 tests red) and swapping
the signed refs (5 red). They did **not** catch:

- changing `round` from 4dp to 6dp
- discarding the `isPresent` fork with `const isPresent = defaultIsPresent`

Because every fixture has COMPLETE evidence: coverage is exactly 1, and
`round(1)` is 1 at any precision. And the two presence checks diverge **only on
`NaN`** — `defaultIsPresent(NaN)` is `true`, `numericAwareIsPresent(NaN)` is
`false`; they agree on every other value.

So the two forks I had carefully carried were, as tested, indistinguishable from
dead parameters — the same pattern this line of work has now hit eight times,
this time in code written to avoid it.

`tests/proofDelegatedMonitor.test.ts` adds the cases that separate them: a
repeating coverage of 6/9 that reads 0.6667 at 4dp and would read 0.666667 at
6dp, and a `NaN` proof field that the two presence checks disagree about. Both
mutations now turn it red.

## Verification

5 characterization hashes byte-identical · 5 new factory tests · 4 mutations
caught (2 by the hashes, 2 by the new tests after they were written to close the
gap). Full suite **10,017 / 10,017** across 1,244 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

## Remaining

Three clusters, 10 files, ~5,200 lines — and they are NOT the same shape as
cluster 1. Cluster 3/4 (`garage`, `railScore`, `llmFighter`, `agentReadingTest`,
and the `aiReputationClaude` group) build their own distributions, use
`totalVariationDistance`, round to 6dp, and leave `unique` UNSORTED. That last
one is the hash-affecting fork: collapsing them together requires either
carrying `roundPlaces` and `sortEvidenceRefs` as parameters, or accepting a
receipt-hash change with a methodology note. Cluster 1 needed neither, which is
why it went first.

---

# Step 4 — Family B: what actually collapses, and what does not

## The scouts' "Family B = 8 files" does not survive re-measurement

They reported Family B as one cluster with min 0.781 / median 0.871. Measured
with my tokenizer it is **two** clusters:

    within cluster 3 (aiReputationClaude, awesomeAgentMemory,
                      ctfAgentBenchmark, darwinGodelMachine)   median 0.939
    within cluster 4 (agentReadingTest, garage, llmFighter,
                      railScore)                               median 0.928
    CROSS 3 x 4                                                median 0.231

Two tight clusters, not one family. Same for the "A2 group" they named
(bisheng, lmnr, narrowTask, openCompass, trism): median 0.303, which is really
two pairs — lmnr+openCompass at 0.972 and narrowTask+trism at 0.891 — plus
bisheng with no close peer at all.

## The good news about the hash forks

The forks that make a collapse dangerous — 6dp rounding, unsorted `unique` —
are a **Family A vs Family B** difference, not a within-cluster one. All eight
Family-B files use `round(value, places = 6)`, unsorted `unique`, their own
`distribution()` and `totalVariationDistance`. So work inside Family B needs no
fork carrying and risks no hash change.

## What is genuinely shared, measured rather than assumed

Hashing every function body across the eight files: **eight functions are
byte-identical in all eight** — `clamp01`, `round`, `mean`, `nonEmpty`,
`unique`, `labelDistribution`, `totalVariationDistance`, `withAdditionalAlerts`.
50 lines, copied eight times.

Eight more functions appear in all eight and have **eight variants each**:
`buildAlert`, `contextLabel`, `distribution`, `rowEvidenceCoverage`, `rowScore`,
`toLiveDriftRow`, `toLiveDriftWindow`, `toReceiptRow`.

That is the honest shape of this family, and it explains the 0.93 similarity
without contradicting it: the variants are structurally parallel but touch
different fields, so token-normalised comparison scores them near-identical
while their text differs entirely.

## What was done

`src/watch/driftMath.ts` — the eight identical functions, once.

    aiReputationClaude   508 -> 451      agentReadingTest  447 -> 390
    awesomeAgentMemory   441 -> 384      garage            567 -> 510
    ctfAgentBenchmark    560 -> 503      llmFighter        547 -> 490
    darwinGodelMachine   627 -> 570      railScore         585 -> 528

456 lines removed, 82 added. **Net −374**, spanning both clusters, at zero
runtime risk — the code is identical and merely relocated.

Characterization pins were captured first, as in step 3: two standalone
(aiReputationClaude, darwinGodelMachine) and four inside `liveDriftAlerts.test.ts`'s
table, which is better placed than cluster 1's because it exercises the
**fail-closed** path where coverage is fractional and 6dp rounding is
observable. All unchanged after the extraction.

## The claim in the module comment is now true

`driftMath.ts` says the two Family-B conventions are pinned so a later tidy-up
cannot converge them. `tests/driftMath.test.ts` makes that true rather than
leaving an unbacked assertion in a doc comment: `round(2/3)` is `0.666667` and
explicitly not `0.6667`; `unique(["z","a"])` stays `["z","a"]` and canonicalizes
differently from `["a","z"]`.

5 mutations, all caught, and with strong signal — 4dp rounding kills 8 tests,
un-halving the total variation distance kills 5, removing the empty-alert early
return kills 7.

## Why no Family-B factory yet

The eight varying functions are not field-list material in the way Family A's
were. `rowEvidenceCoverage` is 35 lines of per-domain predicates,
`garageLiveDrift.ts` derives `refused` from
`deflectionAccuracy0to1 >= 0.9 && answerFaithfulness0to1 < 0.6` while
`railScoreLiveDrift.ts` hardcodes it to `false`. A factory over these would be
mostly callbacks, and callbacks that only ever have one caller each are not
deduplication — they are indirection.

What *is* factory-shaped is the orchestration: every `run()` merges thresholds,
maps rows, computes distributions, derives N `round(Math.max(0, a - b))` score
drifts and M `totalVariationDistance` behaviour drifts, then pushes an alert per
breached threshold. Those alert rules are data. That is the next step, and it is
worth doing only if it subsumes the ~80–100 line `run()` bodies rather than
merely relocating them.

## Verification

Full suite **10,026 / 10,026** across 1,245 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts`, `check:docs-drift` pass.

---

# Step 5 — cluster 4, and a measurement bug of my own

## The orchestration factory I proposed is not warranted

Step 4 said the next step was a Family-B orchestration factory, "worth doing
only if it subsumes the ~80–100 line `run()` bodies rather than merely
relocating them". Measured, it does not:

- The **alert rules are uniform** — 99 of them across the eight files, every one
  `if (observed op threshold) push(buildAlert(input, metricId, observed,
  threshold, message, severity))`. A table would turn ~3 lines into ~1, saving
  roughly 100 lines across four files.
- The **score/behaviour drift computations** are one line each either way. A
  rule table saves nothing; it only moves the expression into a string.

Before concluding, I audited those 99 rules for the copy-paste bug a table would
prevent: every `if` observed/threshold matching its `buildAlert` arguments, every
`>` paired with a `max*` threshold and every `<` with a `min*`. **Zero
anomalies.** So there was no latent correctness win either — only indirection.

## A measurement bug, and what it hid

Step 4 reported `buildAlert` as "2 lines, 8 variants" and used that to argue the
remaining duplication was thin. That was wrong. My function-extent scanner
counted `{`/`}` from the declaration line, so any function with a **multi-line
signature** terminated immediately and measured as 2 lines. `buildAlert` has a
six-parameter signature across seven lines.

Re-measured with a scanner that finds the body's opening brace first:

| function | files | lines | similarity | verdict |
|---|---|---|---|---|
| rowEvidenceCoverage | 8 | 318 | 0.435 | genuinely different |
| **buildAlert** | 8 | **236** | **0.988** | extract |
| toLiveDriftRow | 8 | 205 | 0.639 | genuinely different |
| toReceiptRow | 8 | 173 | 0.485 | genuinely different |
| distribution | 8 | 151 | 0.264 | genuinely different |
| contextLabel | 8 | 113 | 0.353 | genuinely different |
| rowScore | 8 | 84 | 0.335 | genuinely different |
| **toLiveDriftWindow** | 8 | **64** | **0.997** | extract |
| **percentile / ratioIncrease / boolMean** | 4 | **52** | **1.000** | extract |

So the honest answer flipped: not "~30 lines left" but **352**, and the largest
single duplicated function in the family was the one I had measured as trivial.

## What was extracted

Into `driftMath.ts`:

- `boolMean`, `percentile`, `ratioIncrease` — byte-identical in all four files
  that have them.
- `toLiveDriftWindow` — identical apart from the parameter type, so the row
  mapper became a callback and the rest is generic.
- `createDriftAlertBuilder(alertPrefix, defaultRefs)` — the 236-line
  duplication, closed over the only two things that vary: the `alertId` slug
  (`garage`, `rail-score`, `dgm`, …) and which `DEFAULT_*` constants seed the
  evidence refs. Each satellite keeps a one-line specialisation.

**Ref order is load-bearing** and is now pinned by its own test: `unique` here
does not sort, and `canonicalize` maps arrays without sorting, so the sequence
caller-refs → defaults → baseline rows → live rows reaches the receipt hash.
Sorting it "for tidiness" would change every published Family-B alert.

## Accounting for the whole Family-B effort

| file | before | after |
|---|---|---|
| aiReputationClaude | 508 | 426 |
| awesomeAgentMemory | 441 | 359 |
| ctfAgentBenchmark | 560 | 475 |
| darwinGodelMachine | 627 | 532 |
| agentReadingTest | 447 | 364 |
| garage | 567 | 471 |
| llmFighter | 547 | 451 |
| railScore | 585 | 492 |
| driftMath.ts | — | 187 |
| **total** | **4,282** | **3,757** |

**Net −525**, every published receipt hash byte-identical, across all eight
files — verified by six characterization pins covering all eight.

## One honest edge, pinned rather than fixed

`ratioIncrease(NaN, 5)` returns **0, not 1**: the guard falls through to
`live > baseline ? 1 : 0`, and every comparison with `NaN` is false. That is
fail-OPEN on unknown data.

It is pinned as-is rather than corrected, because `mean([])` and
`percentile([])` both return 0, so every baseline reaching this function is
finite and the branch cannot be hit. Changing it would alter published receipts
to fix a case that does not occur.

## Verification

5 mutations on the new helpers, all caught — swapping the ref order (caught by
exactly the one test written for it), dropping the slug from the alert id (5),
turning the percentile into a minimum (4), simplifying the cold-start ratio (1),
and dropping the mapped rows from a lifted window (12).

Full suite **10,033 / 10,033** across 1,245 files; six gates pass.

## What is genuinely left

`rowEvidenceCoverage` (318 lines), `toLiveDriftRow` (205), `toReceiptRow` (173),
`distribution` (151), `contextLabel` (113), `rowScore` (84) — 1,044 lines at
0.26–0.64 similarity. These are per-domain predicates and field selections, not
repeated logic. `garageLiveDrift.ts` derives `refused` from
`deflectionAccuracy0to1 >= 0.9 && answerFaithfulness0to1 < 0.6`;
`railScoreLiveDrift.ts` hardcodes it `false`. Collapsing those behind callbacks
that each have exactly one caller would be indirection, not deduplication.

The remaining structural sprawl is the one named in step 1 and still untouched:
`LiveDriftSampleRow`, a 936-field union across 74 domains, and the ~3,400-line
aggregator that reads it.
