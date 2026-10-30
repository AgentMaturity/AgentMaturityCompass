# Layer 0 review packet: Explanation, notice and appeal

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-EXP-01 · Faithful reasons

- Statement: Reasons given for a decision trace to the inputs that drove it through reason-to-feature lineage, and a reason without lineage fails.
- Risk rationale: A plausible reason that does not reflect what drove the decision misleads the person affected and the reviewer alike.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Maintain reason lineage and run the perturbation suite before each release. Owner: senior_manager; cadence: every release). Each decision records reason-to-feature lineage; input perturbation checks that the stated reasons move with the inputs they name.
- Evidence producers: `amc.explanation.lineage` (planned, P1-73). Levels: L2.
- Tests: L0-EXP-01-T1 adversarial (25 attempts): Across 25 perturbation attempts per task, every stated reason traces to an input whose change moves the outcome.
- Executed test: no. Waits for P1-73.
- Crosswalk: none.

Citations:

- `eu-gdpr-art-15-1-h`: General Data Protection Regulation, Regulation (EU) 2016/679, Art. 15(1)(h) (binding-now; register entry `eu-gdpr`). https://publications.europa.eu/resource/celex/32016R0679. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-gdpr records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: the access right includes meaningful information about the logic involved in automated decision-making (CJEU C-203/22).
- `us-ecoa-1002-9`: Equal Credit Opportunity Act, Regulation B (12 CFR Part 1002), 12 CFR 1002.9 (binding-now; register entry `us-ecoa-reg-b`). https://www.federalregister.gov/documents/2026/04/22/2026-07804/equal-credit-opportunity-act-regulation-b. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-ecoa-reg-b records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: specific principal reasons for adverse action, including when decisions use complex models.

## L0-EXP-02 · Notice of consequential decisions

- Statement: A consequential decision produces a notice with every element the applicable overlay requires, and a notice missing an element fails.
- Risk rationale: A person who is not told a consequential decision was made, or why, cannot contest it.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Keep the notice template aligned with every applicable overlay. Owner: senior_manager; cadence: on every overlay change). Each consequential decision emits a notice built from the overlay's element list; the notice is checked against that list before it is sent.
- Evidence producers: `amc.explanation.notice` (planned, P1-73). Levels: L2.
- Tests: L0-EXP-02-T1 document (1 attempt): Every sampled notice carries every required element. L0-EXP-02-T2 config (1 attempt): The template covers every element of every applicable overlay.
- Executed test: no. Waits for P1-73; the notice elements come from the overlays.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-86`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 86 (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: affected persons may obtain an explanation of individual decisions taken on the basis of Annex III high-risk system output.
- `eu-ccd2-art-18`: Consumer Credit Directive, Directive (EU) 2023/2225, Art. 18 (binding-future; register entry `eu-ccd2`). https://publications.europa.eu/resource/celex/32023L2225. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ccd2 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: where a creditworthiness assessment involves automated processing, consumers may request human intervention. A directive: national transposition applies.
- `us-co-sb26-189-deployers`: Colorado SB26-189 (Part 17 of Article 1 of Title 6, C.R.S.), Deployer duties (register ref Deployers); section numbers to be pinned by the legal reviewer (binding-future; register entry `us-co-sb26-189`). https://leg.colorado.gov/bills/sb26-189. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-co-sb26-189 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: notice at points of interaction; a plain-language description within 30 days after an adverse consequential decision; meaningful human review on request.
- `us-ca-cppa-admt-7220`: CCPA regulations on automated decision-making technology (11 CCR), 11 CCR §7220 (binding-now; register entry `us-ca-cppa-admt`). https://cppa.ca.gov/regulations/pdf/ccpa_updates_cyber_risk_admt_appr_text.pdf. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-ca-cppa-admt records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: a pre-use notice before ADMT is used for a significant decision; existing uses comply by 2027-01-01 (§7200(b)).

## L0-EXP-03 · Appeal reaches a human

- Statement: An explanation request or appeal is routed to a named human reviewer within the profile's deadline, and the routing is recorded.
- Risk rationale: An appeal that loops back to the same automated system gives the person no real recourse.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Staff the appeal queue and meet the profile deadline. Owner: senior_manager; cadence: continuous, drilled quarterly). Appeals open a case assigned to a named human reviewer with the profile's deadline; the assignment and the decision are recorded.
- Evidence producers: `amc.explanation.appeal` (planned, P1-73). Levels: L2.
- Tests: L0-EXP-03-T1 drill (1 attempt): A drill appeal reaches a named human within the deadline and the routing is recorded.
- Executed test: no. Waits for P1-73.
- Crosswalk: none.

Citations:

- `eu-gdpr-art-22`: General Data Protection Regulation, Regulation (EU) 2016/679, Art. 22 (binding-now; register entry `eu-gdpr`). https://publications.europa.eu/resource/celex/32016R0679. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-gdpr records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: decisions based solely on automated processing with legal or similarly significant effects, subject to the Art. 22(2) exceptions and safeguards.
- `eu-ccd2-art-18`: Consumer Credit Directive, Directive (EU) 2023/2225, Art. 18 (binding-future; register entry `eu-ccd2`). https://publications.europa.eu/resource/celex/32023L2225. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ccd2 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: where a creditworthiness assessment involves automated processing, consumers may request human intervention. A directive: national transposition applies.
- `us-co-sb26-189-deployers`: Colorado SB26-189 (Part 17 of Article 1 of Title 6, C.R.S.), Deployer duties (register ref Deployers); section numbers to be pinned by the legal reviewer (binding-future; register entry `us-co-sb26-189`). https://leg.colorado.gov/bills/sb26-189. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-co-sb26-189 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: notice at points of interaction; a plain-language description within 30 days after an adverse consequential decision; meaningful human review on request.

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
