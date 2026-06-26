# GAP-0673 — Long-context modeling public-methodology boundary

- Gap: `GAP-0673`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/Xnhyacinth/Awesome-LLM-Long-Context-Modeling`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: skipped as public-methodology evidence; no AMC methodology version bump or product code change.

## Live source metadata

The live GitHub page identifies `Xnhyacinth/Awesome-LLM-Long-Context-Modeling` as a public repository on branch `main`, with approximately `2.1k` stars, `96 forks`, `0` issues, `0` pull requests, `61` watchers, `366` commits, MIT license, and no releases published. The repository is positioned as a curated list for LLM long-context modeling and shows topics such as agent, benchmark, evaluation, survey, RAG, transformer, long-term-memory, length-extrapolation, long-context-modeling, papers, and blogs.

These metadata facts identify the source and its adjacent domain only. No README prose beyond short metadata labels, paper lists, blog lists, tables, citations, examples, benchmark links, images, workflows, contribution text, configs, or implementation details were copied into AMC.

## Relevance decision

The source is relevant to AMC only as context for the breadth of long-context, RAG, memory, and evaluation references that may inform future source reviews. It does not define an AMC scoring methodology, evidence taxonomy change, question-bank migration, badge comparability rule, Shield threshold, Watch drift policy, validation artifact, deprecation notice, or migration guidance.

Therefore awesome-list metadata alone must fail closed for public Score, Shield, and Watch methodology claims. GAP-0673 is closed as a documented no-op: source-review context only, no public methodology version change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background long-context/evaluation bibliography context only; no accepted public scoring-methodology proof. |
| Shield | Background robustness/evaluation context only; no new safety threshold or assurance rule. |
| Watch | Background RAG/memory/evaluation context only; no new drift methodology or monitor integration. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, privacy, or data-residency feature. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed for GAP-0673. Existing AMC public-methodology primitives remain the only path for a public methodology claim: methodology id/version/hash, changelog, deprecation notice, migration guidance, validation proof, badge/report binding, signed evidence refs, row hashes, and no-copy proof.

## Fail-closed rule

GitHub repository metadata, stars/forks/watchers, MIT license, branch name, topic labels, awesome-list positioning, arXiv link presence, paper/blog list labels, benchmark/evaluation topic labels, local backlog metadata, and source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## No-bloat boundary

No long-context benchmark catalog, paper-list importer, blog-list mirror, RAG/memory taxonomy, benchmark link mirror, context-window scoring method, methodology version bump, badge query parameter, API route, CLI command, Studio panel, parity layer, or source-specific scoring path was added. No upstream README prose, paper lists, blog lists, tables, citations, examples, benchmark links, images, workflows, contribution text, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0673LongContextModelingPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
