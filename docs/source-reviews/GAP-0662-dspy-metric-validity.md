# GAP-0662 source review: DSPy metric-validity boundary

- Gap: `GAP-0662`
- Priority: P0
- Surfaces requested: Score, Shield, Watch
- Source type: competitor / public web metadata
- Source reviewed: `https://dspy.ai`; related public repository metadata `https://github.com/stanfordnlp/dspy`
- Retrieval date: 2026-06-21

## Live source metadata

Verified live public metadata before the relevance decision. Only high-level website/repository identity metadata was recorded; no website prose, docs prose, examples, prompts, configs, tests, optimizer implementations, modules, teleprompters, assertions, result rows, screenshots, or implementation details were copied.

- `https://dspy.ai` returned HTTP `200` with content type `text/html; charset=utf-8`.
- First 200KB SHA-256 for the retrieved DSPy site payload: `e6cda5eb9b0aab91db7b8d268ecaced349ba5b0b76fa42439661b5ec761e2c78`.
- GitHub API endpoint `https://api.github.com/repos/stanfordnlp/dspy` returned HTTP `200`.
- GitHub API response SHA-256: `5fb2b42c550f7442a1f001ba4387e3170d9d5286e7c5fa44c6baaa4c07df3307`.
- `git ls-remote --symref https://github.com/stanfordnlp/dspy.git HEAD` returned `refs/heads/main` and HEAD `498760149b230f402c56bece2aa45df6e1ba946b`.
- GitHub API `full_name`: `stanfordnlp/dspy`.
- GitHub API description: `DSPy: The framework for programming—not prompting—language models`.
- Default branch: `main`; license metadata: `MIT`; primary language metadata: `Python`.
- GitHub API counts at retrieval: 35,216 stars; 2,991 forks; 532 open issues.
- GitHub API timestamps at retrieval: pushed `2026-06-18T16:57:05Z`; updated `2026-06-21T05:04:20Z`; repository public, not archived, not disabled.

## Relevance decision

**Decision: relevant source-review signal, but fail-closed metadata-only review; no implementation added.**

DSPy is relevant background for metric-validity and reliability discussions because public metadata identifies an active language-model programming/evaluation framework. However, public website and repository metadata alone does not establish an AMC metric-validity primitive, validation table, evaluator-suite proof, trace-evaluation proof, sample size, confidence interval, metric owner, signed evidence, row hash, threshold policy, or Score/Shield/Watch migration contract.

AMC must therefore keep DSPy metadata as source-review context only. A future DSPy-related metric-validity claim can pass only when backed by AMC-owned eval-pack manifests, validation tables, evaluator/trace evidence through existing primitives, signed evidence rows, row hashes, thresholds, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only as metadata context for future AMC-owned metric-validity evidence. |
| Shield | Relevant only if a future claim includes signed safety/evaluator evidence through existing Shield receipts. |
| Watch | Relevant only if a future claim includes signed trace/evaluation evidence through existing Watch primitives. |
| Enforce/Vault/Fleet/Passport/Comply | No direct implementation scope for this gap. |

## Non-implementation boundary

No `src/score/metricValidity.ts`, `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, badge source, DSPy subsystem, SDK/importer, optimizer adapter, parity layer, framework-compatibility layer, evaluator clone, docs mirror, examples/prompts/config copy, or source-specific product API was added for GAP-0662.

## Copy/provenance boundary

No DSPy website prose, docs prose, README prose, code, examples, prompts, configs, tests, optimizer implementations, modules, assertions, result rows, screenshots, or implementation details were copied. This review records only high-level public metadata facts, retrieval evidence, hashes, the relevance decision, and the fail-closed boundary.
