# Layer 0 review packet: Change control and validation

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-CHG-01 · Pinned versions

- Statement: Model, prompt, tool and corpus versions are pinned in a signed manifest, and an unpinned or changed component blocks activation until it is validated again.
- Risk rationale: An unpinned component can change behaviour under a deployment that was validated against something else.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. Activation compares the running components with the signed version manifest and refuses to start sessions when one is unpinned or differs.
- Evidence producers: `amc.versionManifest` (planned, P1-75). Levels: L2.
- Tests: L0-CHG-01-T1 config (1 attempt): The manifest verifies and pins every model, prompt, tool and corpus. L0-CHG-01-T2 runtime (1 attempt): A changed component blocks activation. Today only the compiled plan and catalog lock are pinned.
- Executed test: no. Waits for P1-75. Only the compiled plan and the catalog lock are pinned today.
- Crosswalk: amc-audit-map-v1 CHANGE_MANAGEMENT.POLICY_SIGNING (partial); amc-audit-map-v1 CHANGE_MANAGEMENT.RELEASE_MANIFESTS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-CHG-02 · Regression on a sequestered test set

- Statement: Changes pass a regression suite on a sequestered test set before release, and the CI gate receipt is the evidence.
- Risk rationale: A test set the developers can see and tune against stops measuring regressions.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Keep the sequestered set access-controlled and run it before each release. Owner: head_of_qa; cadence: every release). The release gate runs the sequestered regression suite and signs a receipt; a failing or missing receipt blocks release.
- Evidence producers: `amc.regression.sequestered` (planned, P1-75). Levels: L2.
- Tests: L0-CHG-02-T1 config (1 attempt): The receipt verifies, names the sequestered suite and records a pass. Today AMC's own release gate has no sequestered set.
- Executed test: no. Waits for P1-75. AMC's own release gate writes a signed receipt but has no sequestered set.
- Crosswalk: amc-audit-map-v1 INCIDENT_RESPONSE_PREPAREDNESS.ASSURANCE_RUNS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-CHG-03 · Evidence invalidated on change

- Statement: A new model, prompt, tool, policy or deployment version voids earlier evidence for the affected controls until they are evidenced again.
- Risk rationale: Evidence gathered on an earlier version says nothing about the version now running.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Record each version change as an invalidation trigger and re-run the affected tests. Owner: head_of_qa; cadence: on every version change). Version changes are recorded as invalidation triggers; the evidence evaluator rejects items recorded before a trigger for every control that lists it.
- Evidence producers: `amc.versionManifest` (planned, P1-75). Levels: L2.
- Tests: L0-CHG-03-T1 runtime (1 attempt): Items recorded before a trigger are rejected as invalidated. The evaluator applies triggers it is given; nothing records them from version changes yet.
- Executed test: no. Waits for P1-75. P1-11's evaluator rejects items recorded before an invalidation trigger, but nothing records triggers from version changes.
- Crosswalk: none.

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-CHG-04 · Vendor change notice

- Statement: Model and tool vendor change notices are tracked and trigger revalidation, and a notice unhandled past its deadline raises a finding.
- Risk rationale: A vendor can change a model or tool under a stable name; an untracked notice leaves the deployment running on something nobody validated.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Track vendor change notices and start revalidation before each deadline. Owner: head_of_qa; cadence: weekly). A named owner tracks vendor notices, sets a deadline for each and opens a revalidation; an overdue notice raises a finding.
- Evidence producers: `amc.manualDuty.record` (planned, P1-76). Levels: L1.
- Tests: L0-CHG-04-T1 document (1 attempt): Every notice has a deadline and an outcome; overdue notices have findings.
- Executed test: no. Manual duty; its signed record waits for P1-76.
- Crosswalk: none.

Citations:

- `eu-dora-art-28`: Digital Operational Resilience Act, Regulation (EU) 2022/2554, Art. 28 (binding-now; register entry `eu-dora`). https://publications.europa.eu/resource/celex/32022R2554. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-dora records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: general principles of ICT third-party risk management, including model and agent-platform providers. The legal reviewer pins the exit-strategy paragraph.

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
