# ADR-0022 — What P5.2a found in the scorer, and why the feature is blocked on a decision

Status: **findings recorded; P5.2a not implemented** · Date: 2026-08-25 · Follows [ADR-0021](0021-phase-5-1-one-injection-matcher.md)

## What was asked

P5.2a — live scoring over session events, the plan's "headline feature". Its
method is stated precisely: *"start from the gates whose `requiredEvidenceTypes`
map onto session events"*, project harness events into answers, and label the
rest by evidence source.

## Why it is not built

Scouting the scorer to find that subset turned up four defects in how scoring
works today. Three of them mean the method the plan prescribes does not do what
it appears to, and one means the published score is weaker than it reads.
Building live scoring on top would amplify all four rather than deliver a
headline feature.

Each was verified independently, not taken from the scouting report.

### 1. `requiredEvidenceTypes` does not require anything

It is a **whitelist filter** on which events get counted, never a requirement
that those types be present. Verified by calling `evaluateGate` directly:

    gate declares requiredEvidenceTypes: [stdout, audit, metric]
    evidence supplied:                   stdout x3 only
    result: PASSES | gate level 3 satisfied

So a gate naming three evidence types is satisfied by one of them. The field
name states a guarantee the code does not implement — and the plan's method
("gates whose `requiredEvidenceTypes` map onto session events") assumes the
guarantee. There is no subset to derive this way.

### 2. The same field means something different a few lines later

`gates.ts` treats it as a filter; `confidenceForQuestion` in `runner.ts` treats
it as a required set and counts how many members are present. One field, two
contradictory meanings, both fed from `gate.requiredEvidenceTypes` in the same
run.

### 3. Below L3, a question is scored against evidence belonging to other questions

`selectRelevantEvents` returns **every event in the window** when a question has
no evidence tagged to it. Strict binding blocks that at L3 and above; at L0–L2
it does not. The code knows: its own warning reads *"add meta.questionId
tagging to avoid score inflation"*.

Composed with (1), this is the live-scoring hazard in one sentence: **a
governed run emitting many untagged `stdout` events raises every untagged
question toward L2**, because the events all count and no gate requires the
types it names. More harness evidence would make the score go up without
evidencing anything in particular.

### 4. The unsupported-claim flag cannot fire on a default run

    claimMode === "auto" ? supportedMaxLevel : supportedMaxLevel

Both arms are identical. In `auto` — the default — `claimedLevel` always equals
`supportedMaxLevel`, so `finalLevel` is unchanged and `FLAG_UNSUPPORTED_CLAIM`,
guarded by `claimedLevel > supportedMaxLevel`, is unreachable. The
inflation-detection surface reports nothing on the path everyone uses.

## The scoping fact that reframes "live"

Gate thresholds scale by level: `minDistinctDays` is 1/2/3/7/10 for L1–L5, and
`minSessions` 1/2/3/5/8. Distinct days are distinct calendar days of evidence.

**One agent run on one day can therefore evidence at most level 1**, by design.
Any "live score" that appeared to move meaningfully during a run would be
misrepresenting a methodology that deliberately requires sustained evidence.

That is not an obstacle to the feature so much as a correction to what it can
claim. The honest version of "moves in real time" is: the score reflects the
current spine the moment you ask it, and says what is blocking the next level.
`evaluateGate` already returns `events=X/Y, sessions=A/B, days=C/D` — the
machinery for that half exists.

## What was built instead

The precondition, which is unambiguous and was P5.1's remainder: **every
governed tool call now lands in the signed spine.**

`ToolPipeline` has always taken a `record` callback and nothing supplied one,
so guard denials were returned to the caller and recorded nowhere — enforcement
that leaves no trace is advisory again at the only moment that matters.
`agentToolset()` now supplies one. Each call writes an `audit` row (what policy
decided, with the guard and reason on a denial) and a `metric` row (what it
cost), at trust tier `OBSERVED`, correlated by the execution token.

Projected into `audit`/`metric` rather than the harness's own `tool_action`
vocabulary, because the gates filter on evidence types that do not include it —
the projection the plan asks for, applied to the one thing that does not depend
on the four defects above.

Arguments are deliberately **not** copied into the audit row: they are already
recorded on the call, and repeating them would put the same untrusted content
in a second place with a second retention and DSAR story.

### Two implementation notes

**Cost.** Recording per call opened and closed the ledger, measured at 1.6ms —
a third of a governed call. The toolset now holds one handle for the run and
exposes `close()`. 10.45ms → 5.87ms per governed call.

**The guarantee moved.** "A failing recorder must not break a call" started
inside `agentToolset`'s recorder, where proving it required making a real
SQLite ledger fail — and every filesystem sabotage I tried was survived, so the
test passed without reaching the path it claimed to cover. It now lives in
`ToolPipeline`, tested with a recorder that genuinely throws.

## The decision this needs

Fixing (1) and (3) changes published scores. Some workspaces will score
**lower**, because evidence that currently counts would stop counting. In a
compliance product that is a methodology change with a version, a migration
note, and possibly a re-issue of outstanding badges — not something to slip
into a feature commit.

Three ways forward, in the order I would recommend them:

1. **Fix the semantics, version the methodology.** `requiredEvidenceTypes`
   comes to mean what it says; the sub-L3 fallback is removed or made
   opt-in; the dead ternary is repaired. Then build live scoring on a scorer
   that means what it reads. Costs a methodology version bump and a re-score.
2. **Rename rather than re-mean.** Call the field `countedEvidenceTypes`, keep
   behaviour identical, fix (2) and (4), and derive the live subset some other
   way. No score changes; the honesty problem becomes a naming fix.
3. **Build P5.2a on today's semantics.** Cheapest, and I would advise against
   it: more harness evidence would raise scores through the L0–L2 fallback
   without evidencing any particular question, which is the opposite of the
   feature's stated purpose.

Recorded rather than chosen, because (1) and (2) change what AMC has already
told users about their maturity.
