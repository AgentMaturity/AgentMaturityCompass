<!-- SPDX-License-Identifier: MIT -->
# 6. Maturity levels

Status: normative. Source: `LEVEL_SEMANTICS`, `LEVEL_BANDS` and `evaluateLevels` in
`src/diagnostic/levelSemantics.ts` (P1-07). The documented methodology is
[docs/SCORING_METHODOLOGY.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/SCORING_METHODOLOGY.md).

## The levels

Levels are cumulative: each level includes every level below it. The table is generated from the code:

<!-- amc:spec:levels -->
| Level | Name | Requires (each level includes every level below it) | Band of an averaged level |
| --- | --- | --- | --- |
| L0 | Not evidenced | nothing | 0 to 0.99 |
| L1 | Self-declared | rows tagged to the question, or bound to it by its evidence map, that a registered emitter admits by provenance; self-reported input never yields more than L1 | 1 to 1.99 |
| L2 | Configuration evidence | observed rows from every emitter the question's evidence map lists for L2; the map, never the row's own tag, binds them | 2 to 2.99 |
| L3 | Runtime evidence | observed runtime or executed test rows from every emitter the question's evidence map lists for L3, bound by the map; keyword matches never count | 3 to 3.99 |
| L4 | Continuity, anchoring and sampling | not evaluated until anchoring (P1-25, P1-26) and sampling emitters exist | 4 to 4.74 |
| L5 | Independently attested | not evaluated until a registry issues scoped attestations under pinned trust (P0-09, P3-04) | 4.75 to 5 |
<!-- /amc:spec:levels -->

1. L1 MUST NOT exceed self-declared evidence: self-reported input never yields more than L1.
2. L2 and L3 MUST count only rows that a registered emitter admits by provenance and that the question's evidence map
   binds to that level. A row's own question tag MUST NOT lift it above L1, so a writer cannot choose which questions
   its rows raise. Keyword matches never count.
3. L4 and L5 are not evaluated until their evidence exists: anchoring and sampling records for L4, and a scoped
   attestation signed by a key pinned for `independent-attestation` for L5 (chapter 8). An implementation MUST report
   them as not evaluated, never as reached.

## The one scale and the one formula

There is one scale, L0 to L5, and one formula:

1. **Question.** A question's level is the highest n for which a gate exists for every level 1 to n and every one of
   those gates passes. Gates are read by their declared level, never by position. A question MUST NOT declare two
   gates for one level.
2. **Layer.** A layer's score is the average of its questions' levels, weighted by each question's scoring weight (an
   unweighted mean when every weight is zero).
3. **Overall.** The overall score is the unweighted mean of the layer scores.
4. **Band.** An averaged score is labelled with the level whose band (last column above) contains it.

No other score, scale or decay applies. In particular, evidence age MUST NOT be applied as a continuous decay of a
score; staleness is a property of evidence (chapter 5) and turns a pass into not evaluated.

## Gate vocabulary

Each level's gate reports one of three statuses: `pass`, `fail` or `not_evaluated` (the gate names what it would need).
A report SHOULD give the status of every level above the reached one, so a reader can see why it was not reached.

## What a level means

A level explains progress only. It MUST NOT override a failed mandatory control: a deployment with any mandatory
control result `fail` or `not_evaluated` does not meet a profile, whatever its level. A level is not a claim of
compliance, and the claim kind of the evidence behind it (chapter 3) travels with it.
