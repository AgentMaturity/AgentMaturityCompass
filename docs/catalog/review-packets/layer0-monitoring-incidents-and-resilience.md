# Layer 0 review packet: Monitoring, incidents and resilience

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-MON-01 · Drift alarms

- Statement: Declared quality and behaviour metrics are checked against thresholds, and a breach raises an alarm with a recorded response.
- Risk rationale: Behaviour that degrades slowly goes unnoticed without thresholds, and an alarm without a recorded response changes nothing.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. A drift check compares run reports with the signed alert thresholds; a breach writes a DRIFT_REGRESSION_DETECTED event and a signed freeze, and the pipeline then refuses frozen action classes.
- Evidence producers: `amc.drift.detector` (available). Levels: L2, L3.
- Tests: L0-MON-01-T1 runtime (1 attempt): A run within thresholds raises nothing; a regression beyond them raises the alarm and records a signed freeze as the response.
- Executed test: yes (monitoring.test.ts). Full. A breach writes DRIFT_REGRESSION_DETECTED and a signed freeze, and the pipeline then refuses the frozen class (action_class_frozen).
- Crosswalk: amc-audit-map-v1 INCIDENT_RESPONSE_PREPAREDNESS.FREEZE_CONTROLS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-MON-02 · Incidents start regulatory clocks

- Statement: A detected incident starts every applicable regulatory clock with its deadline, and notice drafts exist before each deadline.
- Risk rationale: A reporting deadline that nobody started counting is missed by default.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Record incident triggers and notices and prepare each notice before its deadline. Owner: ciso; cadence: per incident). Recording an incident starts its clocks from the F4 table; signed clock events record triggers and notices; a draft notice is prepared before each deadline.
- Evidence producers: `amc.incidents.clocks` (available), `amc.incidents.notices` (planned, P2-26). Levels: L2, L3.
- Tests: L0-MON-02-T1 drill (1 attempt): Every applicable clock starts with its deadline and each notice is recorded before it. L0-MON-02-T2 runtime (1 attempt): Backdated, future-dated and unknown clock events are refused. Notice drafts are not built yet (P2-26).
- Executed test: yes (monitoring.test.ts). Partial. An incident starts the station's clocks with deadlines, and the clock store refuses backdated, future-dated, unknown and duplicate events. Notice drafts wait for P2-26.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-73`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 73 (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: providers report serious incidents of high-risk AI systems. The F4 clock table holds the Art. 73 deadlines.
- `eu-gdpr-art-33`: General Data Protection Regulation, Regulation (EU) 2016/679, Art. 33 (binding-now; register entry `eu-gdpr`). https://publications.europa.eu/resource/celex/32016R0679. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-gdpr records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: personal data breaches are notified to the supervisory authority without undue delay and, where feasible, within 72 hours.
- `eu-dora-art-19`: Digital Operational Resilience Act, Regulation (EU) 2022/2554, Art. 19 (binding-now; register entry `eu-dora`). https://publications.europa.eu/resource/celex/32022R2554. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-dora records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: major ICT-related incidents are reported to the competent authority.

## L0-MON-03 · Kill switch with manual fallback

- Statement: An operator can stop all new protected effects within the profile's bound, with a manual fallback, and drills record the time to stop.
- Risk rationale: Without a tested stop, an agent that misbehaves keeps acting while people look for the off switch.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. An operator stop refuses every new protected call at the pipeline; a manual fallback stops the runtime when the stop path fails.
- Evidence producers: `amc.killSwitch` (planned, P2-26). Levels: L2.
- Tests: L0-MON-03-T1 drill (1 attempt): After the stop no protected call runs and the drill records the time to stop. Today freezes exist only as drift responses and an operator cannot start one.
- Executed test: no. Waits for P2-26. Freezes exist only as drift responses; an operator cannot start one.
- Crosswalk: amc-audit-map-v1 INCIDENT_RESPONSE_PREPAREDNESS.FREEZE_CONTROLS (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-MON-04 · Safe state on provider outage

- Statement: When the model or provider is unavailable, new effects stop or a safe state with a recorded hazard analysis applies, and an incident is recorded.
- Risk rationale: An agent that improvises when its provider fails can leave half-finished effects nobody tracks.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. A provider failure stops new protected calls or switches to the documented safe state and records an incident.
- Evidence producers: `amc.providerOutage.safeState` (planned, P1-76). Levels: L2.
- Tests: L0-MON-04-T1 drill (1 attempt): During the outage no new protected effect starts outside the safe state and an incident is recorded.
- Executed test: no. Waits for P1-76.
- Crosswalk: none.

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-MON-05 · Provider exit plan

- Statement: Each critical model or tool provider has a documented exit plan that has been tested.
- Risk rationale: Dependence on a provider the operator cannot leave turns that provider's failure or change into the operator's.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Document and test an exit plan for each critical provider. Owner: senior_manager; cadence: annually and on each critical-provider change). A named owner keeps an exit plan per critical provider and tests it.
- Evidence producers: `amc.manualDuty.record` (planned, P1-76). Levels: L1.
- Tests: L0-MON-05-T1 document (1 attempt): Each critical provider has a current exit plan. L0-MON-05-T2 drill (1 attempt): The latest test shows the fallback provider can take over.
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
