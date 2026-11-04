<!-- SPDX-License-Identifier: MIT -->
# Annex A. Levels and EU AI Act articles

Status: informative, experimental. Expert sign-off: open (D-08 reviewers; no named expert has reviewed this annex).

This annex is a reading aid. It says which kind of AMC evidence a reader might look at when an article of Regulation
(EU) 2024/1689 (the AI Act) is in question. It does not say that any level meets any article, that an article
applies to a deployment, or that AMC evidence is enough for anything. AMC output is evidence of conformity, never
proof of compliance.

## How this draft was built

- The list of articles comes from the strategy (L622: "Map each level to EU AI Act Arts. 9–15, 17, 26, 27, 72 and
  73"). The article subjects follow the headings in
  [docs/EU_AI_ACT_COMPLIANCE.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/EU_AI_ACT_COMPLIANCE.md).
- The evidence cells describe the level definitions of chapter 6 only. They were drafted by an AI agent, which may
  draft regulatory content but never approve it.
- The research note standards.md §1.2 (an article-to-agent-evidence table marked as the researcher's own synthesis)
  was not available to the drafting agent. Before publishing, cross-check every row against it and against the
  primary text.
- Art. 13 has no row in standards.md §1.2, so its cells stay blank for the expert.
- Every row carries "to re-verify against the primary source before publishing". The annex stays experimental until a
  named expert signs it off (truth rule 8).

## Table

| Article | L3 evidence a reader may consult | L4 evidence a reader may consult | L5 evidence a reader may consult | Status |
| --- | --- | --- | --- | --- |
| Art. 9 (risk management system) | Executed tests and runtime rows for the deployment's declared risks | Continuous, anchored, sampled runtime evidence over the window | An independent scoped attestation covering the risk controls | Draft; to re-verify against the primary source before publishing |
| Art. 10 (data and data governance) | Runtime rows showing data-handling controls enforced at a named boundary | Continuous records of those controls, anchored and sampled | An independent scoped attestation covering them | Draft; to re-verify against the primary source before publishing |
| Art. 11 (technical documentation) | Configuration and runtime evidence the documentation cites by record id | Documentation tied to anchored evidence for the whole window | An independent review of the documentation against the evidence | Draft; to re-verify against the primary source before publishing |
| Art. 12 (record-keeping) | Hash-chained ledger rows and receipts for each action | Anchored, sampled logs with no gap over the window | An independent attestation that the logs are complete for the window | Draft; to re-verify against the primary source before publishing |
| Art. 13 (transparency and information to deployers) |  |  |  | Expert to fill; to re-verify against the primary source before publishing |
| Art. 14 (human oversight) | Authorization records and approval receipts for consequential actions | Continuous approval evidence, anchored and sampled | An independent attestation covering the oversight controls | Draft; to re-verify against the primary source before publishing |
| Art. 15 (accuracy, robustness and cybersecurity) | Executed assurance tests with recorded failures | Recurring tests and runtime monitoring over the window | An independent attestation covering those tests | Draft; to re-verify against the primary source before publishing |
| Art. 17 (quality management system) | Configuration evidence for the declared process controls | Continuous evidence that the process ran over the window | An independent review of the process evidence | Draft; to re-verify against the primary source before publishing |
| Art. 26 (obligations of deployers) | Runtime evidence of the deployer's oversight and logging controls | Continuous, anchored evidence of those controls | An independent attestation scoped to the deployer's deployment | Draft; to re-verify against the primary source before publishing |
| Art. 27 (fundamental rights impact assessment) | Configuration evidence that an assessment record exists for the deployment | Evidence the assessment was kept current over the window | An independent review of the assessment | Draft; to re-verify against the primary source before publishing |
| Art. 72 (post-market monitoring) | Runtime monitoring rows for the deployed system | Continuous, anchored, sampled monitoring over the window | An independent attestation covering the monitoring | Draft; to re-verify against the primary source before publishing |
| Art. 73 (reporting of serious incidents) | Incident records with receipts and their clocks | Continuous incident evidence with no unexplained gap | An independent review of incident handling | Draft; to re-verify against the primary source before publishing |

## Open before this annex can leave experimental

- Expert sign-off: open. A named, credentialed expert (D-08) reviews every row, fills Art. 13 and records the review.
- Cross-check against standards.md §1.2 and the primary text: open.
- Level L4 and L5 evidence does not exist yet in AMC (chapter 6), so those columns describe evidence that would be
  needed, not evidence AMC produces today.
