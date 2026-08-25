# ADR-0023 — r224: making `requiredEvidenceTypes` mean what it says

Status: accepted · Date: 2026-08-25 · Resolves [ADR-0022](0022-scoring-integrity-findings.md)

## The decision

ADR-0022 recorded four scoring defects and three ways forward without choosing
one. Option 1 was chosen: **fix the semantics and version the methodology.**
Published methodology `2026.07.29-r223` → `2026.08.25-r224`.

The alternative — renaming the field to `countedEvidenceTypes` and keeping the
behaviour — was cheaper and would have changed no scores. It was rejected
because the *document* is the product. `docs/SCORING_METHODOLOGY.md` says
"Required evidence types for each level" to people deciding whether to trust a
badge. Renaming the code to match the weaker behaviour would have made the code
honest and the published claim false.

## What changed in the scorer

**1. `requiredEvidenceTypes` is now a requirement.** It was a whitelist filter
on which events got counted. A gate declaring `[stdout, audit, metric]` passed
on three `stdout` events. `evaluateGate` now checks presence and names what is
absent, because "failed gate 3" is not something an operator can act on:

    failed gate 3: events=2/2, sessions=2/2, days=2/2, missing evidence types=audit,metric

**2. Evidence counts only toward its own question.**
`STRICT_EVIDENCE_BINDING_LEVEL` moved from 3 to 0. Below L3 a question with no
evidence tagged to it was scored against every event in the window, including
events explicitly tagged to *other* questions. The code's own warning said so:
"add meta.questionId tagging to avoid score inflation."

Composed, these two were the live-scoring hazard: a governed run emitting many
untagged `stdout` events raised every untagged question toward L2, because the
events all counted and no gate required the types it named. More harness
evidence made the score go up without evidencing anything in particular.

**3. The dead ternary is repaired.** Both arms of the `claimMode === "auto"`
branch read `supportedMaxLevel`, so `claimedLevel` could never exceed
`supportedMaxLevel` and `FLAG_UNSUPPORTED_CLAIM` was unreachable on the default
path. The inflation-detection surface now has a path to fire.

`STRICT_EVIDENCE_BINDING=false` survives as a local-diagnosis escape hatch —
someone debugging a zero needs to see what the old behaviour would have counted
— and the methodology doc says it is not for scoring a real workspace.

## Scores move down, and that is the point

A workspace re-scored under r224 may score **lower** than under r223. The r223
number counted evidence toward gates naming types the evidence did not include,
and counted evidence gathered for other questions. A drop is a correction.

Badges issued under r223 stay verifiable by their embedded version and manifest
hash; they should be re-issued before being presented as current. That guidance
is in the changelog entry, the methodology doc, and the manifest — not only
here.

## The bump exposed a fifth defect: a changelog that renamed its own history

`changelog[0]` read `version: AMC_PUBLIC_METHODOLOGY_VERSION` — a reference to
the live constant — and the date normalizer at `publicMethodology.ts` exempts
entry 0 (`.slice(1)`) precisely so the head can float with the current release.

The effect is that bumping the version **relabels the previous entry instead of
adding a new one**. The moment r224 landed, the published changelog claimed
r224's change was "Aligns the public badge methodology assurance hash…", which
is what r223 did. In a compliance product the changelog is the artifact that
tells a consumer why two scores differ; a row that renames itself is worse than
no row.

Worse, the test that should have caught it could not:

    expect(first.changelog[0]?.version).toBe(AMC_PUBLIC_METHODOLOGY_VERSION)

compared a variable against itself. It passed for every possible value.

The head is now a literal. That single change converts the existing assertion
into a real gate, demonstrated by mutation — bump the constant, write no entry:

| head entry | result |
|---|---|
| literal (now) | **2 failed** — the changelog assertion fires |
| reference (before) | 1 failed — only unrelated hard-pinned literals |

This is the second time in this line of work that the fix was to make an
existing assertion load-bearing rather than to add a new one (see ADR-0021's
`g`-flag invariant).

### A readability trap left in place

Entries `[1..]` still carry `date: AMC_PUBLIC_METHODOLOGY_RELEASE_DATE` in
source, and the normalizer overwrites every one of them from the version
prefix. Those literals are dead values that read as live ones — they cost me a
wrong first diagnosis (I reported historical dates as floating; they are not).
Left alone as out of scope for a methodology fix, and recorded here because the
next reader will hit the same trap.

## Blast radius

11 tests across 11 files, every one of them a version pin. Nine hard-pinned the
version string; two pinned the changelog by index and needed a +1 shift for the
new head. That is what a version bump *should* break, and the count is a fair
measure of how many surfaces publish the number.

Three published surfaces carry the version and had to move with it:
`docs/SCORING_METHODOLOGY.md`, `website/methodology.html`,
`website/docs/methodology.html`.

## Verification

- 10 new tests in `tests/evidenceGatingCorrection.test.ts`, built through
  `parseEvidenceEvent` rather than hand-shaped. The first version cast a raw
  row to `ParsedEvidenceEvent` with only `meta_json` set; it looked right and
  threw the moment anything read `.meta`.
- 4 mutations on the semantics, all caught: forcing `evidenceTypesOk` true (2
  tests red), silencing the missing-types reason (1), restoring
  `STRICT_EVIDENCE_BINDING_LEVEL = 3` (2), reverting the version (1).
- 1 mutation on the changelog head, table above.
- Full suite **9982 passed / 9982**. `lint`, `typecheck`,
  `check:architecture-boundaries`, `check:docs-drift`, `check:counts`,
  `check:changelog-page`, `check:policy-fixtures` all pass.

## Why the reasoning is here and not in the code

The two source comments explaining these corrections added 15 lines to
`src/diagnostic/runner.ts`, and the descending line ratchet refused them — the
file is 2265 lines against a cap of 800. The comments are now one-line
signposts pointing here. That is the ratchet working as intended: a 2265-line
file is not where a methodology rationale should live.

## What this unblocks

P5.2a live scoring, on a scorer that means what it reads. ADR-0022's scoping
correction still stands and is unaffected: gate thresholds require 1/2/3/7/10
distinct calendar days for L1–L5, so **one agent run on one day can evidence at
most level 1**. The honest "live" feature is not a number that climbs during a
run; it is the current spine on demand, plus what is blocking the next level —
which `evaluateGate` now reports precisely, including which evidence types are
missing.
