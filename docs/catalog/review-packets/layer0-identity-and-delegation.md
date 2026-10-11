# Layer 0 review packet: Identity and delegation

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-IDN-01 · Unique agent identity bound to a human principal

- Statement: Every tool call is attributed at the enforcement point to a unique agent identity and to the human principal the agent acts for, and a call with no resolvable identity or principal is refused.
- Risk rationale: Shared or missing identities make effects unattributable, so nobody can review, revoke or reconstruct which agent or person caused them.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. A tool-pipeline guard denies any call whose lease is missing, expired, revoked or issued for another workspace, or whose authorization record names no principal, before the tool body runs.
- Evidence producers: `amc.authorizationRecord` (available), `amc.leases.issuer` (available). Levels: L2, L3.
- Tests: L0-IDN-01-T1 runtime (1 attempt): Guard fixtures are denied with IDENTITY_UNRESOLVED or PRINCIPAL_UNRESOLVED and no tool body runs; the contradictory and empty evidence fixtures give not_evaluated; the positive fixture is allowed and its receipt names agentId and principalId.
- Executed test: yes (identity.test.ts). Partial. Under an active compiled plan a call without a verified lease is refused (IDENTITY_UNRESOLVED). A lease also counts as the principal, so a lease-bound call with no human principal is allowed (P1-75).
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.LEASE_SCOPING (partial).

Citations:

- `hipaa-164-312`: HIPAA Security Rule, technical safeguards, 45 CFR 164.312(a)(1) access control; 164.312(b) audit controls (binding-now; no register entry). https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-312.xml. Retrieval: unverified (Read by track F1 on 2026-10-03 without a content hash; fetch and hash before review.). Strategy: unique agent identity and audit controls (§164.312). Legal review pins the paragraph and confirms applicability.
- `glba-safeguards-314-4`: GLBA Safeguards Rule, 16 CFR 314.4 (binding-now; no register entry). https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314/section-314.4. Retrieval: unverified (URL from the strategy's US register; not yet fetched and hashed.). Strategy: log and monitor authorized users, agents included. Legal review pins the paragraph.

## L0-IDN-02 · Short-lived scoped credentials

- Statement: Agents act only with signed leases that expire and carry explicit scopes, and an expired, revoked or out-of-scope lease is refused.
- Risk rationale: A long-lived or unscoped credential turns one leaked token into standing access to every tool the agent could ever use.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. The authorization stage verifies the call's lease (signature, expiry, revocation list, agent, execute scope and action classes) before the tool body runs.
- Evidence producers: `amc.toolPipeline.receipt` (available), `amc.leases.issuer` (available). Levels: L2, L3.
- Tests: L0-IDN-02-T1 runtime (1 attempt): A valid lease is allowed; expired, revoked, out-of-scope and foreign-signed leases are refused at the authorization stage with a denied receipt and no tool body run.
- Executed test: yes (identity.test.ts). Partial. Expired, revoked, out-of-scope, other-agent and foreign-signed leases are refused at the authorization stage. The pipeline's lease check passes no workspace id, so a same-signer lease naming another workspace is not refused there (P1-75).
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.LEASE_SCOPING (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-IDN-03 · Delegation never widens authority

- Statement: A subagent receives equal or narrower scopes, limits and expiry than its parent, and a widening delegation is refused.
- Risk rationale: If a child can hold more authority than its parent, delegation becomes a way around every limit set on the parent.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. A delegation request is compared with the parent's signed scopes, limits and expiry; any wider field refuses the delegation before the child runs.
- Evidence producers: `amc.delegation.chain` (planned, P2-25). Levels: L2.
- Tests: L0-IDN-03-T1 runtime (1 attempt): Equal or narrower delegations are admitted; any wider scope, limit or expiry is refused. Today a wider scope is intersected down, not refused, and expiry is not clamped (P2-25).
- Executed test: no. Waits for P2-25. Today a wider child scope is intersected down instead of refused, and expiry is not clamped to the parent.
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.LEASE_SCOPING (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-IDN-04 · Revocation takes effect

- Statement: Revoking an agent credential stops new protected actions within the profile's time bound, and a drill records the time to effect.
- Risk rationale: A revocation that takes effect late leaves a compromised agent acting after the operator believes it is stopped.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. The signed revocation list is read again at every bind and recheck; a revoked lease is refused on the next call.
- Evidence producers: `amc.leases.issuer` (available), `amc.toolPipeline.receipt` (available). Levels: L2, L3.
- Tests: L0-IDN-04-T1 drill (1 attempt): A call allowed before revocation is refused on the next call after it, with lease_revoked; the drill records the time to effect.
- Executed test: yes (identity.test.ts). Full. The drill revokes a lease and the next call is refused (lease_revoked); a revocation during an approval wait is refused at the recheck; an unverifiable revocation list refuses every lease.
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.LEASE_SCOPING (partial).

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
