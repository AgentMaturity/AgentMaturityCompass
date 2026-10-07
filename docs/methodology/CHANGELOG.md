# Methodology Changelog

Each public methodology version, newest first. The machine-readable copy is the `changelog` array of `amc methodology --json` (`src/methodology/publicMethodology.ts`); the current scoring rule is [How a Level Is Earned](../SCORING_METHODOLOGY.md#how-a-level-is-earned).

Entries for `2026.08.27-r225` and earlier remain in the "Methodology Changelog" section of [SCORING_METHODOLOGY.md](../SCORING_METHODOLOGY.md) for now. More than a hundred existing test assertions read that history there, so it moves here together with those tests rather than ahead of them.

## 2026.10.08-r226 (2026-10-08)

**Summary.** Rebuilds the diagnostic gates from runtime evidence and makes levels cumulative (P1-07).

- A question's level is the highest n for which the gates for every level 1 to n exist and pass. Before, the runner walked from L5 down and kept the first gate that passed, so a question could reach L3 without the review its L2 gate required.
- Every L3, L4 and L5 gate used to require audit types that only the dogfood seeder wrote, so no real workspace could reach them. Now only rows a registered emitter (`src/diagnostic/evidenceEmitters.ts`) admits by shape and provenance count above L0. Seeded rows, keyword-only text, the diagnostic's own findings and imported rows cannot lift a level beyond their claim kind.
- Above L1, a question's evidence map (`src/diagnostic/evidenceMaps/`) is the only thing that binds a row to it; the row's own `questionIds` tag decides nothing there.
- L1 is self-declared. L2 is configuration evidence, evaluated for AMC-5.29, AMC-SCI-2, AMC-OPDISC-6 and AMC-2.15. L3 has no admissible emitter yet and is not evaluated. L4 (continuity, anchoring, sampling) and L5 (registry attestation) are not evaluated.
- The `STRICT_EVIDENCE_BINDING` opt-out is removed; setting the variable only prints a deprecation warning.
- Level bands, layer and overall arithmetic, and trust-label thresholds are unchanged and now come from one module (`src/diagnostic/levelSemantics.ts`). The published formulas now match the code: there is no confidence multiplier, and confidence is reported, never multiplied into a level.
- `npm run check:gates` proves in CI that every evaluated gate requirement has a registered, non-synthetic emitter, and prints the reachability table.

**Migration.** Reports, badges, methodology receipts, and signed outputs generated under `2026.08.27-r225` remain valid as r225 scores and must not be rewritten. Re-score under `2026.10.08-r226` before comparing or publishing. Scores drop wherever a level was reached through seeded, untagged or unregistered evidence, or through a higher gate without the lower ones: no question can exceed L2 under r226, and only four can exceed L1. That is a correction, not a regression. A question may rise from L0 to L1 where it has two admitted rows but no `stdout` row. Results from 1.x carry the P1-35 relabel notice. Outstanding badges issued under r225 remain verifiable by their embedded version and manifest hash, and should be re-issued before being presented as current.
