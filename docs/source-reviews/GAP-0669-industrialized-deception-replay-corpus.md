# GAP-0669 — Industrialized deception replay-corpus boundary

- Gap: `GAP-0669`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7128718048` / DOI `10.1145/3774905.3795471`
- Corroborating primary source reached: `https://arxiv.org/abs/2601.21963`
- Retrieval: `2026-06-21`; arXiv page was reachable by browser and identifies the paper as part of the Companion Proceedings of the ACM Web Conference 2026; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing replay-corpus receipts for AMC-owned misinformation-risk fixtures; no misinformation corpus, detector, generator, crawler, or source-specific benchmark subsystem added.

## Live source metadata

The accessible arXiv page identifies `Industrialized Deception: The Collateral Effects of LLM-Generated Misinformation on Digital Ecosystems`, authored by Alexander Loth, Martin Kappes, and Marc-Oliver Pahl, dated `2026-01-29`. The page describes the work as an updated perspective on generative AI misinformation and names JudgeGPT and RogueGPT as practical contributions for studying human perception of AI-generated news and controlled stimulus generation. The arXiv page also lists the proceedings context as `Companion Proceedings of the ACM Web Conference 2026`.

These facts are bibliographic and domain context only. No paper prose beyond short metadata facts, abstract text, figures, tool documentation, prompts, generated examples, participant data, misinformation stimuli, evaluation content, source code, or implementation details were copied into AMC.

## Relevance decision

GAP-0669 is relevant to AMC because misinformation-risk evaluation can affect Score credibility, Shield assurance claims, and Watch lifecycle evidence. The source reinforces the need for reproducible and auditable evaluation around dual-use generation/detection, but it is not itself an AMC replay corpus and it does not establish AMC maturity evidence.

AMC should accept a replay-corpus claim here only when the operator supplies AMC-owned replay manifests, deterministic fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipt hashes, row hashes, regression thresholds, and no-copy proof. Source metadata, DOI/OpenAlex identity, arXiv title, ACM proceedings context, or upstream tool names alone must not move a maturity score or Shield claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when an AMC-owned replay corpus produces signed baseline/candidate rows, score deltas, thresholds, and reproducible fixture hashes. |
| Shield | Relevant only for caller-owned misinformation-risk assurance rows with signed evidence and fail-closed unsupported-claim handling. |
| Watch | Relevant only through lifecycle receipts and Watch projections over AMC-owned replay rows and regression thresholds. |
| Enforce | No policy-enforcement, content moderation, or platform takedown change. |
| Vault | No participant data, research data, or misinformation-stimulus storage feature. |
| Fleet | No coordinated influence-operation simulator or multi-agent campaign subsystem. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No regulatory, election-integrity, or platform-governance compliance mapping. |

## Product closure

GAP-0669 is closed by documenting the source-review boundary and adding regression coverage over the existing generic `eval-replay-corpus` evidence receipt. The positive path uses AMC-owned synthetic replay rows with deterministic hashes, Score/Shield/Watch coverage, signed baseline/candidate evidence refs, score delta, source refs, and CI receipt. The negative path proves that metadata-only source refs and upstream tool labels fail closed.

No `src/eval`, `src/diagnostic`, API, CLI, Studio, or scoring behavior changed because the existing replay-corpus primitive already captures the relevant requirement.

## Fail-closed rule

OpenAlex metadata, DOI/arXiv fields, paper title, ACM proceedings metadata, author names, misinformation/deception keywords, JudgeGPT/RogueGPT tool labels, local backlog metadata, literature-review framing, mitigation strategy labels, or source identity alone must fail closed for replay-corpus claims. Passing evidence requires AMC-owned replay manifests, deterministic fixture hashes, fixed seeds, baseline/candidate rows, score deltas, signed evidence refs, CI/lifecycle receipt hashes, row hashes, thresholds, and no-copy proof.

## No-bloat boundary

No misinformation detector, LLM-generated news benchmark, fake-news corpus, social-media crawler, disinformation campaign simulator, JudgeGPT/RogueGPT integration, upstream tool wrapper, generated stimulus pack, participant-study workflow, paper importer, dataset mirror, source-specific evaluator, API route, CLI command, Studio panel, methodology version bump, or parity layer was added. No upstream paper prose beyond bibliographic title/metadata, abstract text, prompts, code, configs, datasets, generated examples, misinformation stimuli, survey instruments, screenshots, UI assets, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0669IndustrializedDeceptionReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted previously in this sandbox with `npm test -- --reporter=dot`; blocked by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
