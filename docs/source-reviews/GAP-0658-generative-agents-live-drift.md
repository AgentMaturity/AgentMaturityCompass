# GAP-0658 — generative agents urban-perception live-drift boundary

- Gap: `GAP-0658`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W4390092730` / DOI `10.1016/j.chbah.2026.100277`
- Retrieval: `2026-06-21T04:38:00Z` via OpenAlex, Crossref, and DOI content negotiation.

## Live source metadata

- OpenAlex status: `200`; id `https://openalex.org/W4390092730`; DOI `https://doi.org/10.1016/j.chbah.2026.100277`.
- OpenAlex title: `Generative agents in the streets: Exploring the use of Large Language Models (LLMs) in collecting urban perceptions`.
- OpenAlex type/year/date: `preprint` / `2026` / `2026-02-24`.
- OpenAlex source: `Computers in Human Behavior Artificial Humans`.
- Crossref status: `200`; DOI `10.1016/j.chbah.2026.100277`; publisher `Elsevier BV`; type `journal-article`; container title `Computers in Human Behavior: Artificial Humans`; print publication `2026-03`.
- DOI content-negotiation status: `200`.
- Metadata hashes: OpenAlex first payload SHA-256 `a54783d34ca346a422b563b8391cecb7ceec8e751ef0a249641ea4ffa8878827`; Crossref first payload SHA-256 `d1864cc379fe233634b411b043eed309cc03a16acf1c599ba160a1dbef51e092`; DOI CSL payload SHA-256 `4834dbd79c239baf9ad257d9a347f37ecc7efc8c0c2e7024df4fcdcb16568a65`.

## Relevance decision

The source is relevant as background context for LLM generative-agent behavior in simulated/urban-perception tasks, which can inform why AMC Watch drift alerts must compare behavior signatures, score windows, cost/latency changes, and signed trace evidence before externalizing Score, Shield, or Watch claims.

It is not a standalone AMC product feature. The paper metadata does not by itself provide AMC-owned baselines, live windows, trace rows, evaluator configs, threshold policies, signed evidence, or row hashes. Source metadata alone must therefore fail closed for live score/behavior drift claims.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Only through existing score-window and evidence-gated maturity primitives. |
| Shield | Only when signed drift evidence supports a safety/behavior regression claim. |
| Watch | Only through existing `liveDriftAlerts` receipts and Watch alert builders. |
| Enforce | No direct implementation for this gap. |
| Vault | No direct implementation for this gap. |
| Fleet | No direct implementation for this gap. |
| Passport | No direct implementation for this gap. |
| Comply | No direct implementation for this gap. |

## Fail-closed rule

DOI/OpenAlex/Crossref metadata, publication venue, urban-perception framing, generative-agent title language, citation metadata, and source identity must fail closed for live score/behavior drift claims. Passing evidence requires AMC-owned baseline/live windows, trace rows, evaluator configs, threshold policies, signed evidence refs, row hashes, receipt hashes, and Watch alert or waiver proof.

## No-bloat boundary

No generative-agent subsystem, urban simulation runner, survey importer, perception dataset mirror, paper benchmark clone, paper-content parser, LLM-agent simulator, provider adapter, or parity claim was added. No paper prose, tables, figures, survey instruments, prompts, datasets, results, or implementation details were copied. The closure uses only high-level public metadata and AMC-owned live-drift receipt primitives.

## Product closure

GAP-0658 is closed by documenting the source-review boundary and adding regression coverage that exercises the existing Watch live score/behavior drift receipt path with AMC-owned synthetic traces. The test confirms source metadata is only a source ref; readiness still depends on AMC-owned baseline/live rows, signed evidence refs, thresholds, and receipt verification.

## Verification

- Focused regression: `npx vitest run tests/gap0658GenerativeAgentsLiveDriftBoundary.test.ts tests/gap0650To0658SourceReviewShape.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
