# Layer 0 review packet: Fairness

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-FAI-01 · Counterfactual pairs

- Statement: Swapping protected attributes or proxies such as name or ZIP code in paired cases changes no outcome beyond the profile's tolerance.
- Risk rationale: Outcomes that move with a protected attribute or its proxy are disparate treatment, whatever the model's stated reasons.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Run the paired-case suite before each release and on each model change. Owner: head_of_qa; cadence: every release). A paired-case harness runs the decision service on cases that differ only in a protected attribute or proxy and compares the outcomes.
- Evidence producers: `amc.fairness.harness` (planned, P1-72). Levels: L2.
- Tests: L0-FAI-01-T1 adversarial (25 attempts): Across 25 pairs per attribute, outcome differences stay within the profile's tolerance.
- Executed test: no. Waits for P1-72. The predicate keeps a reconciliation agent out of scope.
- Crosswalk: none.

Citations:

- `us-ecoa-1002-4-6`: Equal Credit Opportunity Act, Regulation B (12 CFR Part 1002), 12 CFR 1002.4 and 1002.6 (binding-now; register entry `us-ecoa-reg-b`). https://www.federalregister.gov/documents/2026/04/22/2026-07804/equal-credit-opportunity-act-regulation-b. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-ecoa-reg-b records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: disparate treatment and proxies used with discriminatory intent stay prohibited; the federal disparate-impact theory was removed from Regulation B as of 2026-07-21.

## L0-FAI-02 · Impact ratios

- Statement: Selection-rate impact ratios per group are computed on test or production samples and reported against the profile threshold.
- Risk rationale: Without measured impact ratios, a disparity in outcomes stays invisible until someone affected finds it.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Compute and publish impact ratios on the profile's cadence. Owner: head_of_qa; cadence: quarterly). Impact ratios per group are computed from recorded outcomes and compared with the profile threshold.
- Evidence producers: `amc.fairness.harness` (planned, P1-72). Levels: L2.
- Tests: L0-FAI-02-T1 document (1 attempt): The report covers every group with sample sizes and compares each ratio with the threshold.
- Executed test: no. Waits for P1-72.
- Crosswalk: none.

Citations:

- `us-nyc-ll144`: NYC Local Law 144 of 2021 and DCWP rules, Bias audit duty for automated employment decision tools (register ref LL 144 #1); section numbers to be pinned by the legal reviewer (binding-now; register entry `us-nyc-ll144`). https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-nyc-ll144 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: an annual independent bias audit, a public audit summary and candidate notice before use.

## L0-FAI-03 · Proxy screening

- Statement: Decision inputs are screened for protected-class proxies, and a flagged input is blocked or justified in a signed record.
- Risk rationale: Inputs such as ZIP code or name can carry protected attributes into a decision that never sees them directly.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Screen inputs on each model or feature change and sign each justification. Owner: head_of_qa; cadence: on every model or feature change). Each decision input is screened for proxy risk; a flagged input is removed or kept with a signed justification.
- Evidence producers: `amc.fairness.harness` (planned, P1-72). Levels: L2.
- Tests: L0-FAI-03-T1 config (1 attempt): Every flagged input is blocked or has a signed justification. L0-FAI-03-T2 document (1 attempt): The screening covers every input and its method is stated.
- Executed test: no. Waits for P1-72.
- Crosswalk: none.

Citations:

- `us-ecoa-1002-4-6`: Equal Credit Opportunity Act, Regulation B (12 CFR Part 1002), 12 CFR 1002.4 and 1002.6 (binding-now; register entry `us-ecoa-reg-b`). https://www.federalregister.gov/documents/2026/04/22/2026-07804/equal-credit-opportunity-act-regulation-b. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-ecoa-reg-b records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: disparate treatment and proxies used with discriminatory intent stay prohibited; the federal disparate-impact theory was removed from Regulation B as of 2026-07-21.
- `us-ca-crd-ads`: California Civil Rights Council FEHA regulations on automated-decision systems, Automated-decision system and proxy provisions (register ref FEHA ADS regs #2); section numbers to be pinned by the legal reviewer (binding-now; register entry `us-ca-crd-ads`). https://calcivilrights.ca.gov/2025/06/30/civil-rights-council-secures-approval-for-regulations-to-protect-against-employment-discrimination-related-to-artificial-intelligence/. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-ca-crd-ads records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: ADS use that harms applicants or employees on protected characteristics may violate FEHA; the rules define proxy.

## L0-FAI-04 · Subgroup performance

- Statement: Error rates are reported per subgroup with sample sizes, and a gap beyond the profile tolerance opens a finding.
- Risk rationale: An average error rate can hide a subgroup for whom the system fails far more often.
- Applicability: `{fact: useCases, includesAny: [consequential_decision_about_people]}`. Applies only where the profile's use cases include consequential decisions about people (strategy family 9 and P1-33). Exclusion: A reconciliation agent that makes no consequential decision about people is out of scope.
- Binding: manual duty (Report subgroup error rates and track findings to closure. Owner: head_of_qa; cadence: quarterly). Error rates per subgroup are computed with sample sizes and compared with the tolerance; a gap opens a finding.
- Evidence producers: `amc.fairness.harness` (planned, P1-72). Levels: L2.
- Tests: L0-FAI-04-T1 document (1 attempt): Every subgroup is reported with its sample size and every gap beyond tolerance has a finding.
- Executed test: no. Waits for P1-72.
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
