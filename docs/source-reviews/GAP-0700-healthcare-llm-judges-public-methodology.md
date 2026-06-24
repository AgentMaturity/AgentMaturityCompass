# GAP-0700 - Healthcare LLM judges public-methodology boundary

- Gap: `GAP-0700`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://www.mdpi.com/2306-5354/13/1/108`, DOI `10.3390/bioengineering13010108`, and backlog OpenAlex `W7124460067`
- Retrieval: `2026-06-21` via browser access to the live MDPI article page; shell network remains DNS-restricted in this environment.
- Status: skipped as AMC public-methodology versioning evidence; no methodology version bump or product code change.

## Live source metadata

The live MDPI page identifies the source as a review article in `Bioengineering`, published on `16 January 2026`, volume `13`, issue `1`, article `108`, with DOI `10.3390/bioengineering13010108`, titled `Artificial Authority: The Promise and Perils of LLM Judges in Healthcare`. The page labels the article as open access and shows sections for abstract, LLM judge evaluation architectures, healthcare applications, cross-study thematic analysis, discussion, conclusions, version notes, funding, data availability, conflicts of interest, abbreviations, references, and article metrics.

Relevant methodology-governance signals include healthcare LLM-as-a-judge evaluation, clinical documentation, medical question-answering, clinical conversation assessment, structured evaluation, chain-of-thought prompting, human-clinician alignment, limitations around subjective or affective judgments, dataset quality, task specificity, rigorous human oversight, and explicit governance structures. The page also states that no new data were created or analyzed. These facts are healthcare evaluation-governance context only. No upstream article prose beyond short metadata facts, review sections, figures, tables, clinical claims, citations, rubrics, evaluation examples, prompts, model outputs, datasets, screenshots, or implementation details were copied into AMC.

## Relevance decision

GAP-0700 is relevant to AMC as cautionary source-review context for public methodology boundaries: LLM judges in healthcare require explicit limitations, human oversight, governance, and evidence-linked validation. AMC already exposes public methodology versioning and limitations through its existing methodology manifest and docs.

The source is not accepted as an AMC public methodology version source. It does not define AMC methodology ids, L0-L5 threshold semantics, badge comparability rules, methodology hashes, deprecation notices, migration guidance, diagnostic question-bank changes, or AMC report binding. Healthcare LLM-judge review metadata alone must fail closed for public methodology claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Healthcare judge-governance context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Reinforces fail-closed limits for LLM-judge assurance in safety-critical domains, but no Shield threshold changed. |
| Watch | Evaluation and governance context only; no Watch alert, live-drift, or monitoring semantics changed. |
| Enforce | No runtime clinical policy, judge guardrail, or enforcement behavior changed. |
| Vault | No patient data, clinical conversations, medical documents, prompts, or secure-storage behavior changed. |
| Fleet | No LLM-judge agent, clinical evaluator, or healthcare orchestration adapter added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No healthcare, HIPAA, FDA, clinical-governance, or regulated-medical-device mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, or scoring code changed for GAP-0700. No public methodology version bump was made.

The closure is a documented no-op: healthcare LLM-judge governance context only, no AMC methodology semantics change.

## Fail-closed rule

MDPI page metadata, article title, DOI, OpenAlex work ID, healthcare labels, LLM-as-a-judge labels, clinical documentation labels, medical question-answering labels, clinical conversation labels, structured-evaluation labels, chain-of-thought labels, human-alignment labels, data-availability statements, local backlog metadata, or source identity alone must fail closed for AMC public methodology claims. Passing evidence requires AMC-owned methodology id/version/hash, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge/report binding, and no-copy proof.

## No-bloat boundary

No healthcare LLM-judge methodology adapter, clinical evaluator, judge model, medical QA benchmark, clinician-alignment scorer, patient-facing evaluation workflow, MDPI importer, OpenAlex importer, article parser, citation importer, figure/table importer, clinical governance module, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No healthcare, clinical, patient-care, or medical-device claim was added. No upstream article prose beyond short metadata facts, review sections, figures, tables, clinical claims, citations, rubrics, evaluation examples, prompts, model outputs, datasets, screenshots, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0700HealthcareLlmJudgesPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
