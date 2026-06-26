# GAP-1000 - WFGY public methodology

- Gap: `GAP-1000`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `onestardao/WFGY`
- Retrieval: live GitHub API, raw repository files, release metadata, license endpoint, and `git ls-remote` on `2026-06-24`
- Status: Done - skipped

## Relevance decision

`onestardao/WFGY` is relevant to AMC as external agent-evaluation, RAG/debugging, workflow-evidence, and public-claim-boundary context. It is not an AMC scoring-methodology change, badge-comparability change, diagnostic question-bank migration, API behavior change, CLI behavior change, Studio behavior change, or public methodology semantic change.

WFGY repo evidence alone cannot justify an AMC public methodology version bump. The accepted AMC public-methodology primitive remains methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy, signed evidence refs, row hashes, badge assurance, and report-binding proof. This slice is skipped as public-methodology implementation evidence.

Live metadata facts reviewed:

- Repository: `https://github.com/onestardao/WFGY`
- GitHub API: `https://api.github.com/repos/onestardao/WFGY`
- README: `https://raw.githubusercontent.com/onestardao/WFGY/main/README.md`
- Polaris README: `https://raw.githubusercontent.com/onestardao/WFGY/main/Polaris/README.md`
- Polaris experiments README: `https://raw.githubusercontent.com/onestardao/WFGY/main/Polaris/experiments/README.md`
- Problem Map eval README: `https://raw.githubusercontent.com/onestardao/WFGY/main/ProblemMap/eval/README.md`
- Citation metadata: `https://raw.githubusercontent.com/onestardao/WFGY/main/CITATION.cff`
- License API: `https://api.github.com/repos/onestardao/WFGY/license`
- Git HEAD/default branch: `5d93beab43e445086e3a6728fbf445b1d70aa8f0`, default branch `main`
- Repository state: public, not archived, not disabled, not a fork
- Primary language: Jupyter Notebook
- Topics reviewed: ai-agents, alignment, debugging, evaluation, graphrag, hallucination, information-retrieval, knowledge-graph, llm, rag, reasoning, retrieval-augmented-generation
- Counts at retrieval: 1,758 stars, 163 forks, 11 open issues
- Timestamps reviewed: created_at `2025-06-04T13:45:14Z`, pushed_at `2026-06-24T09:35:45Z`, updated_at `2026-06-24T09:35:50Z`
- Latest release reviewed: release `v5.0.0-teaser-01` published `2026-05-11T06:09:14Z`
- License metadata: license API `NOASSERTION`; LICENSE/CITATION metadata reviewed as MIT
- Public source context reviewed: WFGY 5.0 Polaris Protocol, Polaris Goal Compiler, Problem Map 3.0, Global Debug Card, Cite First Verification, WFGY 4.0 governance/evaluation background, and staged WFGY 5.0 rollout notes
- Public evidence context reviewed: seven public evidence packages, raw outputs, parsed outputs, verdicts, audits, token records, SHA256 file fingerprints, Colab companion notebooks, and the source's own limitation that this is a self-built public experimental evidence chain rather than an official third-party benchmark.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. No AMC score formula, L0-L5 threshold, evidence taxonomy, methodology version, changelog, deprecation notice, migration guidance, or badge comparability changed. |
| Shield | Context only. The source discusses evaluation and evidence discipline, but no AMC red-team, assurance, safety, or threat-detection behavior changed. |
| Enforce | Not relevant; no runtime guardrail, policy enforcement, or circuit breaker changed. |
| Vault | Not relevant; no secrets, DLP, privacy, data residency, or secure-storage behavior changed. |
| Watch | Context only. The source has evidence/audit language, but no AMC live drift, monitoring, alert, or evidence-drilldown behavior changed. |
| Fleet | Context only. The source mentions agents/workflows, but no AMC multi-agent orchestration, trust topology, or fleet-level evidence changed. |
| Passport | Not relevant; no portable trust token or external proof bundle changed. |
| Comply | Not relevant; no EU AI Act, NIST, ISO, SOC2, or compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for this gap.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notice, migration guidance, or report-binding proof.

## Fail-closed rule

WFGY repository metadata, stars, forks, issues, topics, README language, release labels, staged rollout claims, public evidence package names, Colab companion notebooks, raw-output availability, verdict/audit/token/file-fingerprint language, license metadata, local backlog text, or the source's own benchmark/evaluation wording must fail closed for AMC public-methodology claims.

Passing public methodology evidence requires an AMC-owned methodology version, changelog row, deprecation notice, migration guidance, evidence taxonomy change, signed evidence refs, row hashes, badge/report binding proof, and an explicit AMC semantic change.

## No-bloat boundary

This gap did not add and must not add a WFGY importer, WFGY adapter, WFGY protocol runner, benchmark mirror, evidence ZIP parser, Colab runner, notebook runner, prompt/package importer, Problem Map subsystem, Polaris subsystem, Cite First Verification subsystem, RAG/debugging framework copy, API route, CLI command, Studio panel, Watch monitor, Shield verifier, package dependency, public methodology version bump, copied upstream code, copied upstream docs prose, copied prompts, copied notebook cells, copied ZIP evidence, copied case rows, copied raw outputs, copied parser records, copied metrics, copied charts, copied images, copied workflow policies, copied examples, copied configs, copied license text, or copied implementation details.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1000WfgyPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1000-wfgy-public-methodology.md` did not exist; the implementation guard passed.
- Focused test after doc: `npx vitest run tests/gap1000WfgyPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired adjacent source-review tests: `npx vitest run tests/gap0999VellumReplayCorpusBoundary.test.ts tests/gap1000WfgyPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Source-specific implementation token scan: `rg -n "onestardao/WFGY|https://github.com/onestardao/WFGY|5d93beab43e445086e3a6728fbf445b1d70aa8f0|v5\\.0\\.0-teaser-01|WFGY 5\\.0 Polaris Protocol|Polaris Goal Compiler|wfgy_public_methodology" src/methodology/publicMethodology.ts src/diagnostic/methodologyVersioning.ts docs/SCORING_METHODOLOGY.md src/badge/badgeCli.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 847 files / 7,380 tests.
- Post-doc focused rerun: `npx vitest run tests/gap1000WfgyPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
