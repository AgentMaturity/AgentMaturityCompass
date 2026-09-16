# ADR-0024 — P5.2a: three questions, honestly, and the L1 ceiling

Status: accepted · Date: 2026-08-26 · Builds on [ADR-0023](0023-r224-evidence-gating-correction.md)

## The measurement that framed the work

r224 made evidence count only toward the question it is tagged to. Nothing in
the emission path tagged anything, so the first thing built was a measurement,
not a feature. A governed run of nine tool calls:

    evidence written:   9 audit + 9 metric, all signed
    question-tagged:    0
    questions scored:   0 / 244
    every layer:        avgFinalLevel 0
    trustLabel:         UNRELIABLE — DO NOT USE FOR CLAIMS

That is the honest starting point. P5.2a's real job was never "live scoring" —
it was the binding that makes harness evidence mean something.

## What the bank actually requires

Measured across all 244 questions rather than assumed:

| evidence type | gates naming it |
|---|---|
| stdout | 1114 |
| audit | 732 |
| metric | 731 |
| artifact | 509 |
| review | 307 |
| test | 289 |
| llm_response / llm_request | 19 / 12 |
| tool_action / tool_result | 10 / 10 |
| gateway | 2 |

Three facts came out of this that no amount of reading the plan would have
produced:

1. **Every question's L1 gate is `{stdout}` and nothing else.** A run emitting
   only `audit`/`metric` clears no gate at any level, for any question. `stdout`
   is not one option among several — it is the entry fee.
2. **Every question's L2 gate is `{review, stdout}`.** All 244. Machine
   evidence cannot supply `review`.
3. **The runner scans L5→L0 and takes the first passing gate** (`runner.ts:821`),
   so L2 is skipped rather than required. A question can publish at L3 while its
   own L2 gate would fail.

A correction to my own earlier comment: `src/tools/toolEvidence.ts` claimed
`tool_action` was "not among" the gate vocabulary. It is — AMC-5.21, 5.25, 5.29
and 5.30 name it at L3. The conclusion (project into the scored vocabulary)
survived; the stated reason was false and has been replaced with the measured
distribution.

## The design: declared bindings, emitted at write time

Rules live in `src/diagnostic/liveEvidenceProjection.ts`, each citing the
`evidenceGateHints` of the question it binds. "A denied tool call evidences
AMC-5.29" is a methodological claim, not an observed fact; keeping it in a
declared, versioned table is what lets a reviewer check it.

`meta.questionIds` is a LIST, and `runner.ts` indexes each id separately, so one
fact can evidence several questions while counting once toward each. Writing one
row per (fact, question) pair would have multiplied `minEvents` by breadth.

Three rows per governed call — `audit`, `metric`, and `stdout` when the call
produced output. The `stdout` payload is a descriptor plus a hash, never the
output: copying tool output into the ledger would put file contents in a second
place with a second retention and DSAR story, which is the same reason the audit
row does not copy the arguments.

## Adversarial review cut the feature from nine questions to three

The first version projected nine. A parallel review found the reason that was
wrong, and it is worth stating plainly:

**`agentToolset` composes all five guards unconditionally.** So a rule keyed on
"this guard was composed" fires on every call, and all nine questions were
tagged from one signal — one fact counted nine times and presented as nine
independent controls. The module's own docstring, "a workspace cannot evidence a
control it does not run", was vacuous in the only composition that ships.

Worse, one of the nine was structurally inert: `budgetUsageSnapshot` meters only
`llm_request`, `llm_response` and `tool_action`, none of which this path emits,
so the budget guard **cannot deny on spend** — while its composition was tagging
AMC-5.25 and AMC-EAM-1 as cost-cap evidence. That is the seventh instance in
this line of work of protection that reads as coverage and moves nothing.

What survives, each because the harness produces exactly what the question asks
for:

| question | the bank's hint | what the harness writes |
|---|---|---|
| AMC-SCI-2 | "complete tool-call audit logs" | a signed audit row per call |
| AMC-OPDISC-6 | "tool-call cost/latency" | a metric row per call |
| AMC-5.29 | "denied/allowed tool-call receipts" | both, with the guard that refused |

The six that were cut are kept as `DEFERRED_PROJECTIONS`, each recording what it
would take to earn — because "we considered this and it does not qualify" is the
useful half of the answer, and because otherwise the next reader re-derives the
same four rules and puts them back.

## My own invariant was wrong in the same way

The test meant to prevent decoration asked: *does this question have some gate
the harness could reach?* It passed while two bound questions sat at L0 holding
six evidence refs each — because rules bound on denial only, denied calls emit
no `stdout`, and L1 requires `stdout`. The binding could never move a score.

The invariant now asks the real emitter what a matching call writes and checks
that against the gates, per rule. The mutation that reverts to denial-only
binding turns it red.

Also fixed at source: the guard a rule keys on is now DECLARED (`guardLabel`),
not parsed out of the rule id. Deriving it gave `budget-governed` → `budget`
when the label is `budgets`, and the failure was silent — the rule simply never
matched. That is the same name-keying bug this repo has now hit four times.

## The ceiling is L1, and the reason string had to be fixed to prove it

Forty calls across ten days and eight sessions clears every count L3 asks for,
and L3 still fails. Before this change, it failed like this:

    failed gate 3: events=120/8, sessions=8/3, days=10/3

Every number satisfied, nothing missing, no explanation. `evaluateGate`'s
`includeChecks` were anonymous booleans, so unmet `mustInclude` requirements
produced no message at all — a reason that lied by omission. It now reads:

    failed gate 3: events=120/8, sessions=8/3, days=10/3,
                   unmet=metaKey:questionId,auditType:ALIGNMENT_CHECK_PASS

Which names the real blocker: **every L3 gate in the bank requires an
`ALIGNMENT_CHECK_PASS` audit row**, and nothing on the tool path performs an
alignment check. AMC-5.29's L3 additionally wants `toolId`, `planStepId`,
`permissionScope`, a `per_step_least_privilege_rate` metric and
`tool_action`/`tool_result` rows.

So the claim this feature makes, precisely:

> Three questions accrue machine-observed evidence during a governed run. A
> question reaches **level 1** within a single session. Level 2 requires human
> review and level 3 requires an alignment check that the harness does not
> perform, so **the published level cannot move above 1 on harness evidence**,
> however much traffic there is.

Measured end-to-end: a nine-call run scores three questions at L1 and nothing
above. Any UI where the number climbs during a demo would be misrepresenting
the methodology.

## Known and deliberately not chased

- **`mustInclude.metaKeys: ["questionId"]` vs the plural `questionIds` we
  write.** The row is question-tagged; the check wants the singular key. Fixing
  it changes no outcome, because `ALIGNMENT_CHECK_PASS` blocks L3 regardless —
  and adding a field to satisfy a check that changes nothing is the decoration
  pattern this ADR is otherwise about.
- **`toolset-default` is never `startSession`'d**, so `minSessions` is
  permanently 1 and ledger verification may report rows referencing a missing
  session. Verified absent from `agentToolset.ts`. It does not affect the L1
  claim (L1 needs one session) but it must be fixed before any multi-session
  claim, and it is an integrity issue in its own right.
  **Fixed 2026-08-28.** `agentToolset` now REQUIRES a `sessionId`, and each
  caller passes the session whose turn produced the evidence — so tool rows
  land in a session that exists and `amc verify` no longer reports "references
  missing session" for a run that used its tools. Pinned by
  `tests/toolEvidenceSessionBinding.test.ts`.
- **`dayKey` is UTC**, so calls at 23:59 and 00:01 are two distinct days. Not
  load-bearing at L1; load-bearing for anything above it.
- **`mapTracesToEvidence`** (`autoAnswer/traceEvidenceMapper.ts`, ~14KB) maps
  traces straight to 1–5 answers with no gate evidence and has **zero
  production callers**. `runAutoAnswer` goes through `runDiagnostic` and is
  gate-backed, so nothing bypasses r224 today — but this is the non-canonical
  scorer P7.3 is meant to retire, and it would bypass r224 entirely if wired.

## Verification

16 projection tests, 2 new gate-reason tests, 5 mutations all caught: removing
the `stdout` row, ignoring the declared guard, re-adding a deferred question,
silencing the unmet-requirement list, and duplicating question tags.

Full suite **10,000 passed / 10,000** across 1,242 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:docs-drift`, `check:counts` and
`check:policy-fixtures` pass.

## What P5.2a does not yet do

The plan also asks that "the published score names which dimensions are live vs
attested". `QuestionScore` and `LayerScore` carry no provenance field, and the
honest surface is per-layer **counts** (`liveQuestionCount / scoredQuestionCount`)
rather than a per-dimension live/attested flag — labelling Skills "live" when 3
of 52 questions are live would be the dishonest version. That is a report-shape
change with its own methodology-version consequences, and it is the next step
rather than part of this one.
