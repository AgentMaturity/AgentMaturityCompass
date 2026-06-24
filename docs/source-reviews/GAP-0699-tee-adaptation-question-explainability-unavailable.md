# GAP-0699 - TEE adaptation question-explainability unavailable-source boundary

- Gap: `GAP-0699`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W4407764161`, DOI `10.1109/tse.2026.3655766`, and title `Automated TEE Adaptation With LLMs: Identifying, Transforming, and Porting Sensitive Functions in Programs`
- Retrieval: `2026-06-21` via browser search and direct URL attempts; exact-title, DOI, OpenAlex, IEEE publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment. Shell network remains DNS-restricted in this environment.
- Status: skipped as product-changing evidence; relevant theme only through existing question-level score explainability and Shield evidence rejection when AMC-owned evidence exists.

## Live source metadata

The local backlog identifies a paper titled `Automated TEE Adaptation With LLMs: Identifying, Transforming, and Porting Sensitive Functions in Programs`, DOI `10.1109/tse.2026.3655766`, OpenAlex work `W4407764161`, improvement dimension question-level score explainability, category `Agent evaluation and benchmarks`, and concepts including computer science, computer security, and business. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, IEEE publisher-domain, and quoted-title searches did not surface a reachable primary source.

These facts are insufficient for a product, security, or scoring claim. TEE adaptation with LLMs is security-relevant context for explaining why sensitive-function evidence is accepted or rejected, but AMC maturity proof still requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof. No upstream paper prose, abstract text beyond local backlog metadata, method details, transformation recipes, sensitive-function examples, code, datasets, tables, figures, prompts, model outputs, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0699 is not accepted as standalone AMC evidence because the primary source was unavailable for live review and the remaining facts are metadata-only. The security theme maps to existing question-level score explainability and Shield fail-closed behavior, but no source-specific implementation is justified.

The accepted AMC primitive is already `buildQuestionExplainabilityReport`. A source citation to this paper can be retained only as context when each question row carries AMC-owned accepted evidence, rejected evidence reasons, repair hints, signed evidence refs, thresholds, and row hashes. Metadata-only paper identity must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when existing AMC question rows explain why each L0-L5 question moved using accepted evidence, rejected reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported sensitive-function, TEE, or security-transformation claims are rejected with explicit reasons and fail closed. |
| Watch | Relevant only when caller-owned evaluation runs and evidence receipts are hash-bound; no live monitor changed. |
| Enforce | No runtime TEE policy, sensitive-function transformer, code guardrail, or enforcement behavior changed. |
| Vault | No secure enclave data, secrets, sensitive code, program slices, prompts, or secure-storage behavior changed. |
| Fleet | No code-transformation agent, TEE orchestration path, or multi-agent adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No confidential-computing, software-security, privacy, or audit-control mapping changed. |

## Product closure

GAP-0699 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing question-score explainability primitive. The positive path proves that TEE adaptation context can be cited only after AMC-owned question evidence exists. The negative path proves DOI/OpenAlex/title metadata fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, Passport field, Watch monitor, Shield verifier, TEE adapter, sensitive-function transformer, code-porting workflow, IEEE importer, paper parser, dataset importer, or scoring behavior changed for GAP-0699.

## Fail-closed rule

OpenAlex work ID, DOI, title, TEE labels, sensitive-function labels, code-transformation labels, LLM-porting labels, security labels, publisher identity, local backlog metadata, or source identity alone must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No TEE adapter, trusted-execution runtime, enclave verifier, sensitive-function transformer, code-porting workflow, compiler pass, program slicer, IEEE importer, OpenAlex importer, paper parser, dataset importer, benchmark pack, source-specific question lens, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No confidential-computing product claim was added. No upstream paper prose, abstract text beyond local backlog metadata, method details, transformation recipes, sensitive-function examples, code, datasets, tables, figures, prompts, model outputs, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0699TeeAdaptationQuestionExplainabilityUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
