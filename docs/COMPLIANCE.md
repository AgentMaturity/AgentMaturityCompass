# Compliance Maps

AMC compliance reports are **evidence-linked signals**, not legal certifications.

## What It Does
- Loads signed `.amc/compliance-maps.yaml` (+ `.sig`).
- Evaluates deterministic requirements per category:
  - required evidence event types with minimum OBSERVED ratio
  - required assurance pack score thresholds
  - required absence of denylisted audit events
- Produces, per category, the five status dimensions (`dimensions`: applicability, evidence, result, enforcement, review), a derived `claimKind`, the `admitted` and `rejected` evidence refs with reasons, `notEvaluatedReasons`, and `result` and `evidence` copied from the dimensions. The decision table is in [catalog/CONTROL_RECORD.md](catalog/CONTROL_RECORD.md#status-dimensions).
- Keeps a derived `status` for one more minor release: `SATISFIED` (result `pass`), `MISSING` (`fail`) or `NOT_EVALUATED` (`not_evaluated`). It never emits `PARTIAL` or `UNKNOWN`; those appear only in reports written by earlier versions.
- Includes exact evidence references (event IDs/hashes, run context) and a "what to collect next" checklist.

## Evidence Binding and Not Evaluated
Each requirement runs through the catalog evidence evaluator (`evaluateControl`, P1-11). A record counts only when all of these hold; otherwise it is rejected with a reason and the requirement is **not evaluated**, never a pass:
- **Verified in the same read.** Ledger records count only when the whole hash chain verifies and its head carries the workspace monitor-key signature; binding fields are read from the bytes the chain covers, and a record whose receipt does not verify, or commits to another record, is rejected. The monitor key is the workspace's own, so this is a local audit trail, not a portable verdict.
- **Bound to the control.** The event's `meta.controlIds` names the mapping id (for example `"controlIds": ["nist_map"]`), or the event is an `audit` whose audit type is listed in the requirement's optional `auditTypes`. An event of a listed type that names no control is coincidental and counts for nothing.
- **Belongs to the subject.** `meta.agentId` must equal the reported agent; an event without an agent id belongs to nobody (it is not credited to `default`). Workspace `system` session events (diagnostic findings) count as positive evidence only for a mapping with `binding: { scope: workspace }`; for the default agent scope they can only fail a control.
- **Comes from an admitted producer.** Only AMC runtime evidence is admitted. Events whose `meta.source` marks them as imported (`eval_import`, `import`, `watch`, `attested_ingest`, chat exports), manual (`manual`, `operator`, `feedback.ingest`), external (`webhook`) or synthetic (`dogfood-maturity`, `meta.provenance: dogfood`, `meta.claimKind: synthetic_example`) leave the requirement not evaluated with evidence `untrusted`. Too few OBSERVED events for `minObservedRatio` is also `untrusted`.
- **Inside the window and fresh.** Events outside `--window` are not read, and records more than 30 days older than the window end are `stale`.
- **Same tenant.** A record that names a `tenantId` is another tenant's evidence (`cross_tenant`): a single workspace records no tenant.

Per requirement:
- `requires_evidence_event`: sufficient on control-bound runtime evidence; otherwise not evaluated. Admitted allow and deny records for one tool call id are `contradictory`.
- `requires_assurance_pack`: reads only sealed assurance reports that verify against the workspace auditor key, whose run passed its own ledger integrity check (`status: VALID`, `verificationPassed: true`) and that measured something; a hand-written, unsealed or integrity-failed report is not evaluated (`untrusted`). A pack whose scenarios were all inconclusive is not evaluated, and so is a passing pack with any inconclusive scenario (a partial measurement cannot pass). A sealed run below `minScore` or above `maxSucceeded` fails.
- `requires_no_audit`: a denied audit type from the agent or the `system` session fails. With no AMC runtime activity for the agent in the window it is not evaluated: absence of violations proves nothing. A denied audit type that was not admitted (an import, for example) still blocks a pass.

Per category: any failed requirement fails it (`MISSING`); a pass needs every requirement to pass; otherwise it is `NOT_EVALUATED`. Its claim kind is the weakest of its requirements', and its evidence the worst. Missing or invalid map signatures make every category `NOT_EVALUATED` with evidence `untrusted`.

Applicability: no compiled plan records yet whether a control applies to this deployment (P1-10), so applicability is `unresolved` and a category with sufficient evidence is still `NOT_EVALUATED`. Only a failure is evaluated until then.

Coverage: only a pass earns credit; `PARTIAL` and `UNKNOWN` earn nothing, and `NOT_EVALUATED` earns 0 and stays in the denominator. `coverage.score` is `null` when no category was evaluated, and the CLI prints `Coverage: not evaluated (0 of N categories passed or failed)`. A report is evidence of conformity, not a certification.

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
