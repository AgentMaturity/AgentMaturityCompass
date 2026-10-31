# Layer 0 review packet: Logging and retention

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-LOG-01 · Step-level traces

- Statement: Every model call, tool call, approval and refusal is a hash-chained ledger event bound to its session, agent and deployment.
- Risk rationale: Without a step-level trace nobody can reconstruct what the agent did, in what order, or on whose authority.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, approvals. The native toolset records every tool outcome, allowed, denied or failed, as ledger rows in the session's hash chain.
- Evidence producers: `amc.ledger` (available). Levels: L2, L3.
- Tests: L0-LOG-01-T1 runtime (1 attempt): An allowed and a denied call each leave ledger rows naming the session, agent and tool, and the chain verifies, whether the session writer records them or a writer-less toolset records into a session the ledger holds open. A writer-less toolset whose session the ledger does not hold refuses the call and writes no row (UNVERIFIABLE_TOOL_EVIDENCE), so the chain still verifies.
- Executed test: yes (logging.test.ts). Partial. Allowed and denied calls are hash-chained rows naming the session, agent and tool, and the chain verifies. Authorization records bind the active plan's tenant and deployment, or say deploymentId not_bound when no plan names one. A toolset never writes a row its session cannot verify: a call whose rows cannot be written is refused before its body, and a row lost after a body ran refuses every later call. Model calls and approvals are not driven here.
- Crosswalk: amc-audit-map-v1 LOGGING_MONITORING.LEDGER_CHAIN (partial).

Citations:

- `hipaa-164-312-b`: HIPAA Security Rule, technical safeguards, 45 CFR 164.312(b) audit controls (binding-now; no register entry). https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-312.xml. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Source named by the strategy as quoted in the P1-14 spec; fetch, hash and pin the paragraph before expert review (D-08).). Strategy: audit controls record activity in systems that hold ePHI (as cited by L0-IDN-01). Legal review confirms applicability.
- `glba-safeguards-314-4-c-8`: GLBA Safeguards Rule, 16 CFR 314.4(c)(8) (binding-now; no register entry). https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314/section-314.4. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Source named by the strategy as quoted in the P1-14 spec; fetch, hash and pin the paragraph before expert review (D-08).). Strategy: log and monitor the activity of authorized users, agents included (as cited by L0-IDN-01). Legal review pins the paragraph.

## L0-LOG-02 · Tamper evidence

- Statement: Ledger verification detects any rewritten, deleted or reordered event, and checkpoints are signed, then timestamped and anchored once those producers exist.
- Risk rationale: A log that can be edited without detection proves nothing about what happened.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Run ledger verification before every export and on the profile's cadence. Owner: ciso; cadence: daily and before every export). Ledger verification recomputes every event hash, writer signature and chain link; signed checkpoints bind the head.
- Evidence producers: `amc.ledger` (available). Levels: L2, L3.
- Tests: L0-LOG-02-T1 runtime (1 attempt): An intact ledger verifies; a rewritten, a deleted and a reordered event each fail verification. Today the tail of an open session can be deleted undetected and checkpoints are not verified (P1-25, P1-26).
- Executed test: yes (logging.test.ts). Partial. Rewritten, deleted and reordered events fail verification. The tail of an open session can be deleted undetected, and signed checkpoints are not verified (P1-25, P1-26).
- Crosswalk: amc-audit-map-v1 LOGGING_MONITORING.LEDGER_CHAIN (partial); amc-audit-map-v1 LOGGING_MONITORING.MERKLE_ROOT (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-LOG-03 · Retention per regime

- Statement: Each record class is kept for the longest applicable regime, such as six months for AI Act deployer logs and 180 days for CERT-In logs, and deletion under an unknown hold is refused.
- Risk rationale: Deleting a record a regime or a hold still requires destroys evidence the operator is obliged to keep.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point deletion_executor. The deletion gate checks the signed legal-hold registry before each deletion and refuses deletion when a hold applies or the hold state cannot be established.
- Evidence producers: `amc.residency.deletionGate` (available). Levels: L2, L3.
- Tests: L0-LOG-03-T1 config (1 attempt): Deletion with no hold proceeds; deletion under an active hold and under an unknown hold state is refused. Regime-specific retention periods are not built yet (P2-26).
- Executed test: yes (logging.test.ts). Partial. Deletion is refused under an unverifiable hold registry; a hold in a workspace with no tenant identity is refused as unknown (tenant_unmapped). Regime retention periods wait for P2-26.
- Crosswalk: amc-audit-map-v1 INCIDENT_RESPONSE_PREPAREDNESS.RETENTION (partial).

Citations:

- `eu-ai-act-art-26-6`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 26(6) (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Strategy: deployer logs are kept for at least six months. The register lists Art. 26 without the paragraph; the legal reviewer confirms 26(6).

## L0-LOG-04 · WORM export

- Statement: Evidence is exported to write-once storage with a verifiable manifest.
- Risk rationale: Evidence kept only where the operator can rewrite it cannot stand against the operator.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Export evidence to write-once storage and verify the manifest. Owner: ciso; cadence: monthly and at each incident). Evidence bundles are exported to write-once storage with a signed manifest that a verifier checks.
- Evidence producers: `amc.evidence.wormExport` (planned, P2-09). Levels: L2.
- Tests: L0-LOG-04-T1 config (1 attempt): The target is write-once and the manifest verifies. L0-LOG-04-T2 drill (1 attempt): A drill restores an export whose manifest verifies.
- Executed test: no. Waits for P2-09 (the spec named P2-26; P2-09's title carries WORM export).
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
