# GAP-3626 - Escalation quality scoring

- Gap: `GAP-3626`
- Dimension: `human-escalation-quality`
- AMC surfaces requested: Enforce, Passport, Comply
- Source reviewed: Usable XAI: 10 Strategies Towards Exploiting Explainability in the LLM Era
- Retrieval: OpenAlex API `https://api.openalex.org/works/W4392866835`, OpenAlex landing page `https://openalex.org/W4392866835`, DOI `https://doi.org/10.1145/3816150`, Crossref API `https://api.crossref.org/works/10.1145/3816150`, ACM DOI page `https://dl.acm.org/doi/10.1145/3816150`
- Status: Done

## Relevance decision

`GAP-3626` is relevant to AMC because human escalation is only useful when the reviewer receives a complete packet: concise context, risk, options, missing evidence, recommended reviewer action, reviewer role, and outcome. A timestamped escalation without reviewer-ready context can still become rubber-stamp oversight.

OpenAlex identified the source as a 2026 ACM Transactions on Knowledge Discovery from Data article published by the Association for Computing Machinery, with Xuansheng Wu among the authors and concepts including USable, Business, Computer science, and World Wide Web. Crossref confirmed DOI `10.1145/3816150`, journal article type, Association for Computing Machinery (ACM) publisher, and ACM DOI URL metadata.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because escalation packet completeness becomes a measurable human oversight quality signal. |
| Shield | Adjacent only; clearer escalation packets can improve safety review, but no red-team pack was added. |
| Enforce | Relevant because incomplete escalation packets should create findings before risky execution is allowed. |
| Vault | Not relevant; no secrets, DLP, or secure-storage behavior changed. |
| Watch | Adjacent because packet quality can be monitored, but this gap closed in the scoring primitive. |
| Fleet | Adjacent for multi-agent escalation queues, but no fleet subsystem was added. |
| Passport | Relevant because portable human-oversight proof needs reviewer role and outcome context. |
| Comply | Relevant because audit reviewers need defensible escalation packet completeness evidence. |

## Product closure

AMC now scores escalation packet quality in `assessOversightQuality`. Each escalation can record a generic packet with context summary, risk, options, missing evidence, recommended reviewer action, reviewer role, and outcome. The human oversight profile reports Escalation packet, reviewer role, completeness score, and outcome through `escalationPacketQuality` and `escalationPacketQualityMet`.

No public API, CLI, Studio route, guide subsystem, or methodology version changed. The closure is bounded to the existing human oversight quality primitive.

## Fail-closed rule

Questionnaire scores, local backlog rows, OpenAlex facts, Crossref facts, DOI redirects, ACM metadata, title text, and paper concepts are metadata-only. They do not prove escalation quality. AMC only treats escalation packet quality as met when AMC-owned escalation events include complete reviewer-ready packets.

## No-bloat boundary

No XAI strategy subsystem was added. AMC did not copy upstream paper prose, ACM page text, examples, figures, prompts, datasets, strategy lists, or implementation details. No ACM/OpenAlex/Crossref importer, paper adapter, source-specific API/CLI, Studio screen, guide page, or methodology bump was added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap3626EscalationQualityScoringBoundary.test.ts --reporter=dot` failed before implementation on the missing source-review receipt and missing escalation packet quality fields.
- Focused verification: `npx vitest run tests/gap3626EscalationQualityScoringBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Related verification: `npx vitest run tests/gap3626EscalationQualityScoringBoundary.test.ts tests/gap3619ApprovalLatencySloBoundary.test.ts tests/humanOversightQualitySignals.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1087ClinicalAiPosthocAuditSamplingBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts --reporter=dot` passed, 6 files / 36 tests.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 962 files / 7,845 tests.
