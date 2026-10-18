---
"agent-maturity-compass": major
---

Adds the catalog admission checker; packs claiming reviewed support without all ten criteria are treated as experimental (P1-33, docs/catalog/ADMISSION.md). No pack is promoted by this change: every pack is still `experimental`, and with no D-08 reviewer no pack can be admitted as reviewed.

- **`amc catalog check [--pack <id>] [--catalog <dir>] [--json] [--write]`** reports each pack against the ten admission criteria (manifest and reproducible digest, citations and legal review, applicability, binding, tests, negative fixtures, evidence contracts, unknown facts failing closed, sign-offs, stewardship), each `met`, `not_met` or `not_evaluated` with coded findings. Declared `experimental` is admitted as experimental only when the pack passes P1-09 validation; `reviewed` only when all ten are met; `qualified` is refused ("qualification rule not defined") until Sid defines a rule; `retired` is reported, never admitted. Exit 0 when every declared support is admissible, 1 otherwise. `--write` writes `catalog/admission/<pack-id>-<version>.json`; nothing edits a pack.
- **Record criteria build on P1-34.** Citations' legal review and the sign-offs read only `effectiveSupport` and the new `packSignoffs`, which verifies a pack version's review records by the same steps as a control's: a domain lead, a legal reviewer and a risk owner who are three distinct people, signed over the pack digest. A record naming a non-human signer is refused. A met record criterion shows that signed records exist, not that the content is right.
- **Fixtures run in process.** Evidence fixtures run through `evaluateControl`; a negative fixture that passes counts as a false mandatory pass. Guard-harness fixtures run only where a caller registers the harness, so `amc catalog check` reports them as not evaluated, never met.
- **Gating.** `amc catalog compile` and plan activation load the catalog with `enforceAdmission`: a pack declaring `reviewed` or `qualified` without a current committed report that admits it is loaded as `experimental`, with warning `ADM_SUPPORT_DOWNGRADED`, and its lock row says so. The YAML is never edited. The shipped catalog declares nothing stronger than experimental, so its plans and lock are unchanged.
- **CI.** `npm run check:catalog-admission` runs after the build and fails a reviewed or qualified claim a pack does not meet and a malformed admission report, never an experimental draft.

freeze-exception: P1-33 — amc catalog check
