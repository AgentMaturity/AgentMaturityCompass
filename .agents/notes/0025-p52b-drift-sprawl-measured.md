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
