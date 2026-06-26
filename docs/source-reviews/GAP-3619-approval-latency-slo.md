# GAP-3619 - Approval latency SLO

- Gap: `GAP-3619`
- Dimension: `human-approval-latency`
- AMC surfaces requested: Enforce, Passport, Comply
- Source reviewed: LLM-driven discrete-event simulation: A generative AI framework for automated model generation, adaptation, and evaluation in manufacturing
- Retrieval: OpenAlex API `https://api.openalex.org/works/W7131082771`, OpenAlex landing page `https://openalex.org/W7131082771`, DOI `https://doi.org/10.1016/j.jmsy.2026.02.015`, Crossref API `https://api.crossref.org/works/10.1016/j.jmsy.2026.02.015`, Elsevier linkinghub `https://linkinghub.elsevier.com/retrieve/pii/S0278612526000427`
- Status: Done

## Relevance decision

`GAP-3619` is relevant to AMC because human oversight is not complete if it only records that a reviewer existed. Enterprise users need evidence that a high-risk action reached a reviewer, waited in queue for an acceptable time, received a timely decision, and had a fallback path when review was overdue. The source is a manufacturing simulation paper, but the AMC-relevant signal is the general workflow concept: timed, executable, auditable approval flow evidence.

OpenAlex metadata identified the work as a 2026 Journal of Manufacturing Systems article published by Elsevier BV, with Thomas Schmitt listed among the authors and concepts including Blueprint, Executable, and Workflow. Crossref confirmed DOI `10.1016/j.jmsy.2026.02.015`, journal article type, Elsevier BV publisher, and April 2026 publication metadata.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as a measurable human oversight quality signal, but not a new questionnaire-only claim. |
| Shield | Adjacent only; latency SLOs can reduce bypass pressure, but no new red-team pack was added. |
| Enforce | Relevant because overdue approvals need fallback reviewers or degraded-mode behavior. |
| Vault | Not relevant; no secrets, DLP, or secure storage behavior changed. |
| Watch | Adjacent because latency evidence can be monitored, but this gap closed in the scoring primitive. |
| Fleet | Adjacent for multi-agent operator queues, but no fleet routing subsystem was added. |
| Passport | Relevant because portable oversight proof needs timestamped approval receipts. |
| Comply | Relevant because human oversight claims must be auditable by risk tier and breach status. |

## Product closure

AMC now summarizes approval-latency SLO evidence in `assessOversightQuality`. The profile records risk tier, queue time, reviewer action time, breach status, and fallback for reviewed approval receipts. Critical approvals use a 5 minute target, high approvals use a 15 minute target, medium approvals use a 60 minute target, and low approvals use a 4 hour target. Breaches add an explicit gap and recommendation to route overdue approvals to fallback reviewers or degraded-mode behavior.

No public API, CLI, or source-specific endpoint was added. The existing human oversight quality primitive remains the closure point.

## Fail-closed rule

Questionnaire scores and source metadata are metadata-only signals for this gap. They do not prove an approval latency SLO. AMC only treats the SLO as met when reviewed approval receipts include finite request and decision timestamps and no reviewed receipt breaches its risk-tier target. Missing approval evidence fails closed with an `Approval latency SLO is not evidenced` gap.

## No-bloat boundary

No manufacturing simulation subsystem was added. AMC did not copy upstream code, paper prose, examples, datasets, prompts, figures, simulations, or Elsevier/Crossref/OpenAlex content into product code. The implementation is generic human oversight evidence handling, not a Journal of Manufacturing Systems, Elsevier, OpenAlex, or discrete-event simulation adapter.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3619ApprovalLatencySloBoundary.test.ts --reporter=dot` failed before implementation on the missing source-review receipt and missing approval-latency SLO fields.
- Focused verification: `npx vitest run tests/gap3619ApprovalLatencySloBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related verification: `npx vitest run tests/gap3619ApprovalLatencySloBoundary.test.ts tests/humanOversightQualitySignals.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` passed, 5 files / 31 tests.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 961 files / 7,840 tests.
