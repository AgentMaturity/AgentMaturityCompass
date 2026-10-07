# Compliance Maps

AMC compliance reports are **evidence-linked signals**, not legal certifications.

## What It Does
- Loads signed `.amc/compliance-maps.yaml` (+ `.sig`).
- Evaluates deterministic requirements per category:
  - required evidence event types with minimum OBSERVED ratio
  - required assurance pack score thresholds
  - required absence of denylisted audit events
- Produces category status: `SATISFIED | PARTIAL | MISSING | NOT_EVALUATED`, with `result` (`pass | fail | not_evaluated`), `evidence` (`sufficient | incomplete | untrusted`) and `notEvaluatedReasons`. `UNKNOWN` appears only in reports written before NOT_EVALUATED existed.
- Includes exact evidence references (event IDs/hashes, run context) and a "what to collect next" checklist.

## Evidence Binding and Not Evaluated
A requirement counts evidence only when all of these hold; otherwise it is **not evaluated**, never a pass:
- **Bound to the control.** The event's `meta.controlIds` names the mapping id (for example `"controlIds": ["nist_map"]`), or the event is an `audit` whose audit type is listed in the requirement's optional `auditTypes`. An event of a listed type that names no control is coincidental and counts for nothing.
- **Belongs to the subject.** `meta.agentId` must equal the reported agent; an event without an agent id belongs to nobody (it is not credited to `default`). Workspace `system` session events (diagnostic findings) count as positive evidence only for a mapping with `binding: { scope: workspace }`; for the default agent scope they can only fail a control.
- **Comes from an admitted producer.** Only AMC runtime evidence is admitted. Events whose `meta.source` marks them as imported (`eval_import`, `import`, `watch`, `attested_ingest`, chat exports), manual (`manual`, `operator`, `feedback.ingest`), external (`webhook`) or synthetic (`dogfood-maturity`, `meta.provenance: dogfood`, `meta.claimKind: synthetic_example`) leave the requirement not evaluated with evidence `untrusted`. Too few OBSERVED events for `minObservedRatio` is also `untrusted`.
- **Inside the window.** Events outside `--window` are not read.

Per requirement:
- `requires_evidence_event`: passes on control-bound runtime evidence; otherwise not evaluated.
- `requires_assurance_pack`: reads only sealed assurance reports that verify against the workspace auditor key and measured something; a hand-written or unsealed report is not evaluated (`untrusted`). A sealed run below `minScore` or above `maxSucceeded` fails.
- `requires_no_audit`: a denied audit type from the agent or the `system` session fails. With no AMC runtime activity for the agent in the window it is not evaluated: absence of violations proves nothing.

Per category: any failed requirement gives `MISSING`, or `PARTIAL` when another requirement passed; otherwise any not-evaluated requirement gives `NOT_EVALUATED`; only all-pass gives `SATISFIED`. Missing or invalid map signatures make every category `NOT_EVALUATED` with evidence `untrusted`.

Coverage: `NOT_EVALUATED` earns 0 and stays in the denominator; `coverage.score` is `null` when no category was evaluated, and the CLI prints `Coverage: not evaluated (0 of N categories had control-bound evidence)`. Most built-in categories report not evaluated until runtime evidence carries `controlIds`. A report is evidence of conformity, not a certification.

## Built-in Framework Families
- `SOC2` (Trust Services categories)
- `NIST_AI_RMF` (Govern/Map/Measure/Manage)
- `ISO_27001` (high-level control families)
- `ISO_42001` (ISO/IEC 42001:2023 AIMS clauses 4-10 + ISO 42005 Impact Assessment + ISO 42006 Conformity Evidence)
- `EU_AI_ACT` (Regulation (EU) 2024/1689 — high-risk AI obligations: Arts. 9-15, 17, 27, 72, 73, 86)

AMC intentionally avoids legal-claim language and does not infer unseen controls.

## Commands
- `amc compliance init`
- `amc compliance verify`
- `amc compliance report --framework SOC2 --window 14d --out .amc/reports/soc2.md`
- `amc comply risk-classify --employment --json`
- `amc compliance fleet --framework SOC2 --window 30d --out .amc/reports/fleet-compliance.json`
- `amc compliance diff <reportA.json> <reportB.json>`

## Console
Use `/console/compliance` to view per-agent and fleet coverage with trust-tier breakdown.
