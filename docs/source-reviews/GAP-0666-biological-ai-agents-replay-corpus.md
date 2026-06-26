# GAP-0666 — Biological AI agents replay-corpus boundary

- Gap: `GAP-0666`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7131698947` / DOI `10.1093/bib/bbag075`
- Primary source reached: DOI resolved to the Oxford Academic article page.
- Retrieval: `2026-06-21`; browser access to the DOI/Oxford page succeeded, while shell network remains DNS-restricted in this environment.
- Status: relevant as biological-agent survey context for existing replay-corpus receipts only; no biological benchmark corpus or source-specific subsystem added.

## Live source metadata

The DOI resolved to an Oxford Academic article titled `Artificial Intelligence agents for biological research: a survey`, published in `Briefings in Bioinformatics`, Volume 27, Issue 1, January 2026, article id `bbag075`, with publication date `2026-02-26`. The article page lists authors including Cong Qi, Wenbo Wang, Siqi Jiang, Qin Liu, Xun Song, Hanzhang Fang, and Zhi Wei, and states that it is open access.

These facts identify the source and its adjacent domain only. No survey prose beyond bibliographic metadata, no abstract text, no taxonomy table, no figure, no resource list, no benchmark summary, no GitHub repository content, no datasets, no prompts, no model outputs, and no implementation details were copied.

## Relevance decision

The source is relevant to AMC as high-level context for biological-agent evaluation and reproducibility. A survey of biological AI agents can help explain why replay claims need versioned manifests, deterministic fixtures, signed rows, score deltas, CI/lifecycle receipts, and no-copy boundaries.

The source is not an AMC replay corpus. Its article metadata, survey framing, taxonomy, GitHub resource link, benchmark summaries, author list, open-access status, and DOI/OpenAlex identifiers cannot become Score, Shield, or Watch evidence. Accepted claims still need AMC-owned replay manifests, fixture hashes, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipts, row hashes, thresholds, and privacy/safety boundaries for biological data.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay pack contains deterministic biological-agent fixtures, signed rows, score deltas, and thresholds. |
| Shield | Relevant only when safety/privacy/unsupported-biological claims are rejected or accepted through signed AMC evidence. |
| Watch | Relevant only through existing replay-corpus lifecycle receipts and Watch alerts over AMC-owned rows. |
| Enforce | No policy-enforcement change. |
| Vault | No biological data storage, privacy, or data-residency change. |
| Fleet | No multi-agent biological workflow implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No biomedical, clinical, IRB, HIPAA, or regulatory compliance claim. |

## Product closure

GAP-0666 is closed as a source-review boundary over existing `eval-replay-corpus` primitives. No `src/eval`, `src/diagnostic`, API, CLI, Studio, methodology, guide, passport, or scoring behavior changed. The existing replay-corpus receipt path already requires the evidence this gap cares about: replay manifest, fixture hash, source refs, baseline/candidate rows, score delta, signed evidence refs, CI/lifecycle receipt, row hashes, thresholds, and no-copy proof.

## Fail-closed rule

DOI/OpenAlex metadata, Oxford page metadata, article title, author list, journal issue, open-access status, survey taxonomy, biological-agent framing, benchmark/resource summaries, linked GitHub/resource pages, local backlog metadata, and metadata-only source refs must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifests, deterministic fixture hashes, signed baseline/candidate rows, score deltas, CI/lifecycle receipt hashes, thresholds, row hashes, privacy/safety proof, and no-copy proof.

## No-bloat boundary

No biological-agent benchmark corpus, survey-resource importer, GitHub resource mirror, taxonomy mirror, benchmark-summary mirror, biomedical workflow, clinical/biological agent subsystem, dataset mirror, paper parser, source-specific evaluator, API route, CLI command, Studio panel, Passport field, compliance claim, or parity layer was added. No upstream prose, abstract text, figures, tables, taxonomies, resource lists, benchmark rows, datasets, prompts, model outputs, screenshots, source code, configs, examples, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0666BiologicalAiAgentsReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
