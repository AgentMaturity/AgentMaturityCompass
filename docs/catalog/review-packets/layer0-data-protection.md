# Layer 0 review packet: Data protection

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-DAT-01 · Minimum necessary context

- Statement: Prompts, tool arguments and logs carry only the data classes the use case declares, and an undeclared sensitive class is redacted or blocked.
- Risk rationale: Context that carries more personal or regulated data than the task needs widens every later leak, retention and access duty.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, egress. Protected-data detection runs on each prepared model request and the signed purpose policy blocks any detected class the purpose does not declare.
- Evidence producers: `amc.dataflow.admission` (available). Levels: L2, L3.
- Tests: L0-DAT-01-T1 runtime (1 attempt): Declared classes are admitted; an undeclared class is blocked with class_not_permitted. Today this covers native model requests in workspaces with a processor registry, not tool arguments or logs.
- Executed test: yes (data.test.ts). Partial. Native model requests in a workspace with a signed processor registry: an undeclared class is blocked (class_not_permitted), never redacted. Tool arguments and logs are not covered.
- Crosswalk: amc-audit-map-v1 DATA_PROTECTION_AND_PRIVACY.REDACTION (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-DAT-02 · Redaction before models and logs

- Statement: Secrets and declared identifiers are redacted before they reach model providers or persistent logs, with a receipt for each redaction.
- Risk rationale: A secret sent to a provider or written to a log is disclosed to every party that can read either, for as long as either is kept.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, egress. A redaction step runs before each provider request and each persistent log write and emits a receipt per redaction.
- Evidence producers: `amc.redaction.receipt` (planned, P2-02). Levels: L2.
- Tests: L0-DAT-02-T1 runtime (1 attempt): No secret or declared identifier reaches the provider or the log, and each redaction has a receipt. Today the gateway redacts its ledger copy only and no per-redaction receipt exists.
- Executed test: no. Waits for P2-02's remainder. The gateway redacts its ledger copy, not the provider request, and no per-redaction receipt exists.
- Crosswalk: amc-audit-map-v1 DATA_PROTECTION_AND_PRIVACY.REDACTION (partial); amc-audit-map-v1 DATA_PROTECTION_AND_PRIVACY.NO_SECRET_LEAKS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-DAT-03 · Processor allowlist

- Statement: Protected data goes only to processors on the deployment allowlist, for HIPAA only to endpoints under a business associate agreement, and every other destination is blocked.
- Risk rationale: Sending protected data to an unlisted processor creates a disclosure the operator cannot account for or contract against.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point egress. The signed processor registry binds each model route to one processor and purpose; protected data on a route without a listed processor and a covering contract is refused, and PHI needs a BAA.
- Evidence producers: `amc.dataflow.admission` (available). Levels: L2, L3.
- Tests: L0-DAT-03-T1 runtime (1 attempt): Protected data on a listed route with a covering contract is admitted; an unlisted route, a processor outside the purpose and PHI without a BAA are refused. Today this covers native model requests only.
- Executed test: yes (data.test.ts). Partial. Native model requests only: an unlisted route, a processor outside the purpose and PHI without a BAA are refused.
- Crosswalk: none.

Citations:

- `hipaa-164-502-e`: HIPAA Privacy Rule, disclosures to business associates, 45 CFR 164.502(e) and 164.504(e) (binding-now; no register entry). https://www.ecfr.gov/current/title-45/section-164.502. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Source named by the strategy as quoted in the P1-14 spec; fetch, hash and pin the paragraph before expert review (D-08).). Strategy: protected health information goes only to processors under a business associate agreement. Legal review pins the paragraphs.

## L0-DAT-04 · Residency routing

- Statement: Where a residency rule applies, protected exports use only supported routes, an unsupported route is blocked, and no residency claim is made.
- Risk rationale: A route outside the permitted region breaks a residency duty the moment data crosses it, and a claim of residency without a route check misleads.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point egress. Egress checks each destination against the signed destination registry and its residency rules and blocks unregistered destinations and regions a rule does not allow.
- Evidence producers: `amc.residency.egress` (available). Levels: L2, L3.
- Tests: L0-DAT-04-T1 runtime (1 attempt): A registered destination in an allowed region is admitted; an unregistered destination, a disallowed region and an unverifiable registry are blocked.
- Executed test: yes (data.test.ts). Full for egress routes checked against the signed destination registry: unregistered destinations, disallowed and unknown regions and an edited registry are blocked, and a block reports not_evaluated.
- Crosswalk: none.

Citations:

- None. The strategy and the register name no instrument for this control yet.

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
