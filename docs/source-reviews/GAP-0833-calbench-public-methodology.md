# GAP-0833 - CalBench public-methodology boundary

- Gap: `GAP-0833`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://arxiv.org/abs/2605.09823`, DOI `10.48550/arXiv.2605.09823`, `https://openalex.org/W7160929251`
- Retrieval: `2026-06-21` via live arXiv header/page review plus OpenAlex checks. arXiv returned HTTP/2 200. The live arXiv page identifies `CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs`, Submitted on 10 May 2026 and last revised 5 Jun 2026. OpenAlex page returned HTTP/2 403. api.openalex.org DNS lookup failed.
- Status: skipped as public-methodology implementation evidence; no public methodology versioning change was made.

## Live source metadata

The live arXiv page and local backlog both identify `CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs`. The source is relevant to coordination-privacy evaluation context for multi-agent LLMs, including calendar coordination, privacy leakage, burden fairness, excess cost, communication efficiency, and model-family comparisons.

These facts are useful source-review context, but they are not AMC public-methodology evidence. No upstream benchmark rows, calendars, private information, prompts, negotiation traces, privacy labels, CP-SAT formulations, protocol implementations, tables, figures, generated outputs, arXiv prose, or evaluation code were copied into AMC.

## Relevance decision

This source is relevant to AMC as source-review context for public methodology versioning because coordination/privacy benchmarks can influence how users reason about Score, Shield, and Watch evidence limits. It does not justify changing AMC public scoring semantics by itself.

For a public methodology change to pass, AMC needs an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations update, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, and release lifecycle proof. The paper metadata alone cannot justify a public methodology version bump. GAP-0833 is therefore closed as a documented no-op: the source remains useful context, but No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only; no scoring semantics changed because the source did not supply an AMC-owned methodology version/change record. |
| Shield | Context only; fail-closed boundary protects users from unsupported safety, privacy, or coordination methodology claims. |
| Watch | Context only; no monitoring receipt or public methodology lifecycle event changed. |
| Enforce | No runtime policy, route enforcement, privacy policy, or circuit breaker changed. |
| Vault | No calendars, private records, prompts, traces, benchmark rows, or secure-storage behavior changed. |
| Fleet | Multi-agent coordination context only; no orchestration topology or multi-agent benchmark runner added. |
| Passport | No portable proof-bundle field, badge semantics, or public proof token changed. |
| Comply | Privacy concept is context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed for GAP-0833.

The focused regression verifies that arXiv, DOI, OpenAlex, title, coordination-privacy, calendar, privacy-leakage, fairness, model-family, and paper metadata stay out of AMC public methodology semantics. No public methodology version bump, changelog update, deprecation notice, migration guidance, badge semantic change, API route, CLI command, or Studio change was added.

## Fail-closed rule

arXiv HTTP/2 200 reachability, OpenAlex page returned HTTP/2 403, api.openalex.org DNS lookup failed, paper title, DOI, OpenAlex id, Submitted on 10 May 2026, last revised 5 Jun 2026, coordination-privacy label, calendar scheduling label, private-calendar label, CP-SAT oracle label, task-success label, excess-cost label, communication-efficiency label, burden-fairness label, privacy-leakage label, model-family label, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing evidence requires AMC-owned methodology version, changelog, deprecation notice, migration guidance, known-limitations text, evidence taxonomy change, badge/report semantics, signed evidence refs, row hashes, release lifecycle proof, and no-copy proof.

## No-bloat boundary

No CalBench runner, calendar scheduler, privacy benchmark importer, CP-SAT oracle, negotiation simulator, reference-protocol implementation, paper importer, OpenAlex importer, arXiv importer, dataset mirror, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific methodology path, or source-specific scoring path was added. No upstream benchmark rows, calendars, private information, prompts, negotiation traces, privacy labels, CP-SAT formulations, protocol implementations, tables, figures, generated outputs, arXiv prose, or evaluation code were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0833CalBenchPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
