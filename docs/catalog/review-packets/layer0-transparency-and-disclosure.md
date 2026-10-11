# Layer 0 review packet: Transparency and disclosure

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-TRN-01 · AI disclosure at first interaction

- Statement: In user-facing deployments the agent's first message in every session discloses that it is an AI system, and a transcript check covers every session.
- Risk rationale: People who do not know they are talking to an AI system cannot weigh its statements or ask for a human.
- Applicability: `{fact: useCases, includesAny: [interacts_with_natural_persons]}`. Applies only where the profile's use cases include direct interaction with people.
- Binding: manual duty (Configure the first-message disclosure and review the transcript check results. Owner: senior_manager; cadence: monthly). An output check requires the disclosure in the first message of each session and a transcript check confirms it across sessions.
- Evidence producers: `amc.transparency.outputCheck` (planned, P1-70). Levels: L2.
- Tests: L0-TRN-01-T1 runtime (1 attempt): Every session's first agent message carries the disclosure; a session without it fails.
- Executed test: no. Waits for P1-70. No output check requires a disclosure.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-50-1`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 50(1) (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: providers disclose direct interaction with an AI system; Art. 50 applies from 2026-08-02 (keyDate generalApplication).
- `us-co-sb26-189-deployers`: Colorado SB26-189 (Part 17 of Article 1 of Title 6, C.R.S.), Deployer duties (register ref Deployers); section numbers to be pinned by the legal reviewer (binding-future; register entry `us-co-sb26-189`). https://leg.colorado.gov/bills/sb26-189. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-co-sb26-189 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: notice at points of interaction; a plain-language description within 30 days after an adverse consequential decision; meaningful human review on request.

## L0-TRN-02 · Represented party stated

- Statement: When the agent acts for a principal towards a third party, it states whom it represents.
- Risk rationale: A third party who does not know whom the agent acts for cannot judge its offers, its authority or where to complain.
- Applicability: `{fact: useCases, includesAny: [acts_for_principal_towards_third_parties]}`. Applies only where the profile's use cases include acting for a principal towards third parties.
- Binding: manual duty (Configure the represented-party statement and review the output check results. Owner: senior_manager; cadence: monthly). An output check requires the represented party in the agent's first message to each third party.
- Evidence producers: `amc.transparency.outputCheck` (planned, P1-70). Levels: L2.
- Tests: L0-TRN-02-T1 runtime (1 attempt): Each first message to a third party names the represented principal.
- Executed test: no. Waits for P1-70.
- Crosswalk: none.

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-TRN-03 · Content marking

- Statement: Synthetic media and documents the agent publishes carry provenance marking, with C2PA manifests where required, and unmarked output is blocked from publishing channels.
- Risk rationale: Unmarked synthetic content can be passed off as authentic, and the operator cannot show which outputs it produced.
- Applicability: `{fact: useCases, includesAny: [publishes_synthetic_content]}`. Applies only where the profile's use cases include publishing synthetic media or documents.
- Binding: enforcement point egress. Publishing channels accept only output whose provenance manifest verifies; unmarked output is refused at egress.
- Evidence producers: `amc.provenance.c2pa` (planned, P1-70). Levels: L2.
- Tests: L0-TRN-03-T1 runtime (1 attempt): Marked output is published; unmarked output and output with a failing manifest are refused. Today AMC emits an AMC-C2PA-INSPIRED/1 manifest, not a C2PA manifest, and no channel checks it.
- Executed test: no. Waits for P1-70. The current manifest is AMC-C2PA-INSPIRED/1, not C2PA, and no channel checks it.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-50-2`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 50(2) (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: providers mark synthetic audio, image, video or text output in a machine-readable form.

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
