# GAP-0665 — Vibe coding omics replay-corpus boundary

- Gap: `GAP-0665`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7118933147` / DOI `10.1021/acs.jproteome.5c00984`
- Corroborating primary source reached: `https://arxiv.org/abs/2510.09804`
- Retrieval: `2026-06-21`; arXiv page was reachable by browser and DOI landing access was blocked; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing replay-corpus receipts; no omics application, vibe-coding workflow, or source-specific benchmark corpus added.

## Relevance decision

The accessible arXiv record identifies `Rapid Development of Omics Data Analysis Applications through Vibe Coding`, authored by Jesse G. Meyer, submitted `2025-10-10`, with subject areas `q-bio.OT` and `cs.SE`. The local backlog maps the source to OpenAlex work `W7118933147` and DOI `10.1021/acs.jproteome.5c00984`.

The source is relevant to AMC only as source-review context for replayable benchmark evidence. It describes building an omics data-analysis application with coding agents, which is adjacent to agent evaluation and reproducibility, but it does not supply AMC-owned replay manifests, fixture hashes, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipts, or row hashes.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay corpus has deterministic fixtures, signed baseline/candidate rows, score deltas, and thresholds. |
| Shield | Relevant only when safety/privacy/unsupported-domain claims in user-owned replay rows are signed and fail closed when incomplete. |
| Watch | Relevant only through existing replay-corpus lifecycle receipts and Watch alerts over AMC-owned rows. |
| Enforce | No policy-enforcement change. |
| Vault | No omics data storage, privacy, or data-residency change. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No biomedical, clinical, or regulatory compliance claim. |

## Product closure

GAP-0665 is closed by documenting the source-review boundary and adding regression coverage over the existing generic `eval-replay-corpus` evidence receipt. The positive path uses AMC-owned synthetic replay rows with deterministic fixture hashes, Score/Shield/Watch surfaces, signed evidence refs, score delta, and CI receipt. The negative path proves metadata-only source refs fail closed.

No `src/eval`, `src/diagnostic`, API, CLI, Studio, or scoring behavior changed because the existing replay-corpus primitive already captures the relevant requirement.

## Fail-closed rule

ArXiv metadata, DOI/OpenAlex fields, title, author, subject labels, vibe-coding framing, omics/proteomics application claims, prompt counts, cost/timing claims, demo application descriptions, local backlog metadata, and source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifests, deterministic fixture hashes, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipt hashes, row hashes, thresholds, and no-copy proof.

## No-bloat boundary

No omics data-analysis app, proteomics workflow, vibe-coding prompt set, generated website, data upload pipeline, differential-expression implementation, volcano-plot module, paper importer, dataset mirror, benchmark runner, replay corpus mirror, source-specific evaluator, API route, CLI command, Studio panel, or parity layer was added. No upstream paper prose beyond bibliographic title/metadata, abstract text, prompts, code, configs, datasets, examples, benchmark rows, generated outputs, screenshots, UI assets, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0665VibeCodingOmicsReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
