# GAP-0768 - CogTrust question-explainability unavailable-source boundary

- Gap: `GAP-0768`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7128157408`, DOI `10.1016/j.eswa.2026.131535`, and title `CogTrust: Cognitive Logic-Based framework for dynamic trust evaluation in multi-agent systems`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title, DOI, and CogTrust multi-agent trust searches did not surface a reachable primary source, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing question-level score explainability receipts; no CogTrust framework, cognitive-logic trust engine, or multi-agent trust evaluator added.

## Live source metadata

The local backlog identifies a paper titled `CogTrust: Cognitive Logic-Based framework for dynamic trust evaluation in multi-agent systems`, DOI `10.1016/j.eswa.2026.131535`, OpenAlex work `W7128157408`, improvement dimension question-level score explainability, category `Agent evaluation and benchmarks`, and concepts including reputation, cognition, trustworthiness, computational trust, computer security, and value. The backlog abstract field contains no OpenAlex abstract.

Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, and CogTrust multi-agent trust searches returned no usable source result, and direct DOI opening was blocked. These metadata facts are relevant to AMC only as question-level explainability context for dynamic trust and multi-agent evaluation. They do not justify copying the paper, adding a cognitive-logic trust engine, importing trust rules, or changing AMC scoring semantics. No upstream paper prose, abstract text beyond local backlog metadata, formulas, trust rules, multi-agent scenarios, examples, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0768 is relevant to AMC through existing question-level score explainability because dynamic trust claims need a concrete explanation for why each L0-L5 question moved, which evidence was accepted, which evidence was rejected, which gates were missing, and what repair hint is available. The accepted AMC primitive is already `buildQuestionExplainabilityReport`.

The source can be retained only as context when the explainability packet carries AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, missing gate reasons, repair hints, signed rows, thresholds, row hashes, and no-copy proof. DOI/OpenAlex/title metadata, CogTrust labels, cognitive-logic labels, reputation labels, trustworthiness labels, or multi-agent trust labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through question-level explanations for maturity score movement and accepted evidence. |
| Shield | Relevant through fail-closed rejection of unsupported trust, reputation, or multi-agent claims. |
| Watch | Relevant when explainability rows bind to regression thresholds or lifecycle receipts; no live monitor changed. |
| Fleet | Multi-agent trust context only; no trust-topology or orchestration behavior changed. |
| Passport | No portable proof-bundle field, trust token, or external credential changed. |
| Enforce | No runtime trust policy, cognitive-logic rule engine, or circuit breaker changed. |
| Vault | No trust-rule corpus, agent logs, prompts, or secure-storage behavior changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0768 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing question-score explainability primitive. The positive path proves that dynamic multi-agent trust context can be cited only with AMC-owned question IDs, accepted evidence, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes. The negative path proves DOI/OpenAlex/title/CogTrust metadata fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, CogTrust framework, cognitive-logic trust engine, dynamic trust evaluator, multi-agent trust simulator, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0768.

## Fail-closed rule

OpenAlex work ID, DOI, title, CogTrust labels, cognitive-logic labels, dynamic-trust labels, multi-agent-system labels, reputation labels, trustworthiness labels, computational-trust labels, computer-security labels, local backlog metadata, or source identity alone must fail closed for question-level explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, missing gate reasons, repair hints, signed evidence rows, thresholds, row hashes, and CI/lifecycle gate proof.

## No-bloat boundary

No CogTrust framework, cognitive-logic trust engine, dynamic trust evaluator, reputation model, multi-agent trust simulator, trust-rule importer, benchmark mirror, paper importer, Elsevier importer, OpenAlex importer, source-specific question lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, formulas, trust rules, multi-agent scenarios, examples, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0768CogtrustQuestionExplainabilityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
