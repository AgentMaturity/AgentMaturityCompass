# P1-45 qualification receipt: S6 crosswalks landed experimental after an AI refutation pass

Environment: local run on macOS arm64 (darwin), Node 22, not CI. The agent had no network access, so no
official source was fetched or re-read.

- `receipt.json`: commit, toolchain, every check with its exit code and duration, and the related-test totals (94 files, 1,451 tests).
- `review.json`: the review of all 149 built-in mappings and 290 clause-level controls (with their 341
  crosswalk links): source URL, whether the text matches, whether the relation is correct, the verdict, the
  corrections and notes, plus the 19 refutations and how each was resolved.
- `inputs.json`: the sha256 values of the round-2 research files the controls were applied from (copied from
  the round-2 apply receipt and re-hashed here; all ten match). The controls are hand-maintained from now on.
- `mutations.json`: one mutation per guard; all ten were killed and the tests passed again after restoring.
- `checks.json`: each check's command, exit code and duration.

## What the review is, and is not

An AI reviewer that wrote neither S6 nor the round-2 controls refuted them adversarially. It may refute; it
never approves (truth rule 8). No named D-08 expert has signed off, so every family, mapping and link stays
experimental. The approval field in `review.json` is `null` (Needs-Sid).

The reviewer had no network access. So `textMatches` is `not_evaluated` for every mapping and for 241 of
the 290 controls. The 49 NIST AI RMF subcategory rows were string-compared with the offline AI RMF 1.0
reference table that P0-25 committed: 46 match and 3 differ in wording (R9, open for the expert).

Verdicts: 138 mappings and 257 controls not refuted, 11 mappings and 33 controls corrected, nothing removed.
"Not refuted" means the checks listed in `review.json` found no defect. It is not an approval.

## Refutations that changed the landed content

- R1, R2: ten mappings (seven S6, three HIPAA) had a "no denied audit" check that named only audit types
  AMC never emits, so it passed on any activity. They now name emitted types, or the check is removed.
- R3: `hti1_dsi_feedback` over-read §170.315(b)(11)(ii)(C).
- R4, R5: one pinpoint (CA AB 2013 quotes the §3111 chapeau) and nine titles claimed text that their rows
  do not quote.
- R6: 25 NIS2 sources used `http://`.
- R7: all 341 links now carry `relation` and `rationale`; `coverage` is removed.
- R8: ISO/IEC 42005 is descoped. It is an alias with zero mapped controls, and the ISO 42001 family says its
  42005 and 42006 categories are unverified.
- R12: the 60-line-function mutation that survives the logic-ratio check is now caught by a data-only test.

## Declined and open items

- R14, HHS requiredFix 2 (declined, recorded here as the spec asks): add question-level refs (HLT-DHR-11,
  HLT-PP-1, HLT-PL-1, HLT-WM-9, HLT-LT-6, HLT-LT-8, HLT-LT-11, HLT-LT-15) and three regulatoryBasis strings
  to the research mapping's aliases. That list has no target in AMC's registry; pack-string resolution is
  unchanged at 193 unresolved strings. Question-level references belong to P1-09 and P1-53.
- R17: Colorado SB26-189's final text was not re-verified (no network); the 2026-10-04 retrieval date is
  recorded and the family is flagged.
- R18: HHS HTI-1 is flagged at risk; whether an HTI-5 final rule was issued was not verified.
- R9, R10: three NIST AI RMF rows to compare with the AI 600-1 PDF, and the Korea mappings to check against
  the Korean text. Both need an expert.
- The unresolved pack-string fixture was regenerated against the packs on int (before P1-42); regenerate it
  on `main` after P1-42. `docs/compliance/*` sample reports were not regenerated (release build, root ruling).
