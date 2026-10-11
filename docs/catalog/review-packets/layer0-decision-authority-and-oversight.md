# Layer 0 review packet: Decision authority and oversight

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-OVS-01 · Recommend versus finalize

- Statement: Actions the profile marks recommend-only cannot be finalized by the agent, and finalizing one needs a recorded human decision at the enforcement point.
- Risk rationale: If the agent can finalize what should only be recommended, human oversight becomes a label rather than a control.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, approvals. Action classes that need approval are refused at the pipeline until signed human approvals are named through the trusted channel; the approvals are consumed when the call runs.
- Evidence producers: `amc.approvals.engine` (available), `amc.toolPipeline.receipt` (available). Levels: L2, L3.
- Tests: L0-OVS-01-T1 runtime (1 attempt): Without a signed human approval the call is refused with approval_missing and no tool body runs; with one it runs once and the approval is consumed. AMC has no separate recommend-only marker: approval-required classes stand for it.
- Executed test: yes (oversight.test.ts). Full, read through approval-required classes: AMC has no separate recommend-only marker. Without a signed approval the call is refused (approval_missing); denied and short-quorum approvals are refused.
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.APPROVALS (partial); amc-audit-map-v1 MODEL_TOOL_GOVERNANCE.HIGH_RISK_APPROVALS (partial).

Citations:

- `eu-ai-act-art-26`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 26 (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: deployers of high-risk AI systems assign human oversight, monitor operation and keep automatically generated logs.

## L0-OVS-02 · Approval bound to the exact action

- Statement: An approval binds the approver, the action digest including amount, recipient and resource, and an expiry, and any change to them voids it for the action.
- Risk rationale: An approval that is not bound to the exact action can be reused for a larger amount, another recipient or a later time.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point approvals, tool_pipeline. The authorization record binds the approval request digest and the call's normalized amount, recipient and resource; the recheck before the body refuses any change and any expired approval.
- Evidence producers: `amc.authorizationRecord` (available), `amc.approvals.engine` (available). Levels: L2, L3.
- Tests: L0-OVS-02-T1 runtime (1 attempt): The action the approvers saw runs once; a changed amount or recipient, an expired approval and a second use are refused before the tool body runs.
- Executed test: yes (oversight.test.ts). Full. A changed amount or recipient, an expired approval and a second use are refused before the tool body runs.
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.APPROVALS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-OVS-03 · Separation of duties

- Statement: Where the approval policy requires it, initiate, approve and execute use distinct identities, and a self-approval is refused.
- Risk rationale: One identity that can initiate and approve its own action defeats dual control.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point approvals. The approval engine refuses a second decision by the same user when the signed policy requires distinct users, and counts only distinct approvers toward the quorum.
- Evidence producers: `amc.approvals.engine` (available). Levels: L2, L3.
- Tests: L0-OVS-03-T1 runtime (1 attempt): Two distinct approvers meet the quorum; the same user deciding twice is refused. Today the request records no initiator, so initiator-approver separation is not enforced.
- Executed test: yes (oversight.test.ts). Partial. The engine refuses a second decision by the same user and counts only distinct approvers. Requests record no initiator, so initiator-approver separation is not enforced (P1-78).
- Crosswalk: amc-audit-map-v1 ACCESS_CONTROL.APPROVALS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-OVS-04 · Override and rubber-stamp telemetry

- Statement: Override rate, approve rate and approval dwell time are measured per reviewer, and a value beyond the profile threshold raises an oversight alert.
- Risk rationale: Reviewers who approve everything in seconds give the appearance of oversight without its substance.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point approvals. Each approval decision feeds per-reviewer rates and dwell times; a breach of the profile threshold raises a recorded oversight alert.
- Evidence producers: `amc.oversight.telemetry` (planned, P1-71). Levels: L2.
- Tests: L0-OVS-04-T1 runtime (1 attempt): Metrics are computed from the signed records and a threshold breach raises an alert. L0-OVS-04-T2 document (1 attempt): Every alert has a recorded response from a named owner.
- Executed test: no. Waits for P1-71. analyzeRubberStamping exists but nothing feeds it.
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
