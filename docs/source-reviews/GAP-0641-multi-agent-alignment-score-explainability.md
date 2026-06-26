# GAP-0641 — coordinated multi-agent alignment score-explainability boundary

- Gap: `GAP-0641`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W4415054476` / DOI `10.65109/uqpo8536`
- Retrieval: `2026-06-21T04:19:24Z` via OpenAlex API (`status=200`, type `article`, publication year `2026`, open-access true, metadata SHA-256 `2e06368fa99aca337f7bdacf04cce1f632e5929339bfbafbe978bd047daa8824`)

## Relevance decision

Relevant to AMC only through existing question-level score explainability for multi-agent coordination outcomes. The source metadata concerns coordinated multi-agent outcomes, which maps to AMC's existing question-score explainability rows and multi-user/multi-agent benchmark lens fields: source refs, scenario ids, role manifests, interaction traces, evaluator configs, coordination success rates, queue fairness, instruction-following, accepted evidence ids, rejected-evidence reasons, repair hints, signed evidence, and row hashes.

This does not justify a standalone alignment-study subsystem, paper importer, multi-agent simulator, dataset mirror, or copied paper prose/data. Metadata-only DOI/OpenAlex citation remains rejected as score evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Yes, only through existing question-score explainability rows and fail-closed thresholds. |
| Shield | Yes, only when rejected unsafe/unsupported coordination evidence is explicit and signed. |
| Watch | Yes, only when coordination traces/metrics are caller-owned and hash-bound. |
| Fleet | Indirect context; no Fleet runtime change in this gap. |
| Enforce/Vault/Passport/Comply | No direct scope for this gap. |

## Product closure

Closed through existing question-score explainability, multi-user benchmark lens, and test-suite evaluation lens primitives. No product code was needed beyond regression coverage proving DOI/OpenAlex metadata is accepted only as a source ref and rejected as score evidence unless AMC-owned traces, evaluator configs, accepted/rejected evidence, repair hints, signed rows, and thresholds are present.

## Fail-closed rule

Paper title, DOI, OpenAlex metadata, abstract concepts, citation status, or a local summary alone must fail closed. Coordinated multi-agent outcome claims pass only with AMC-owned role manifests, interaction traces, evaluator configs, question ids, repair hints, signed evidence refs, and row hashes.

## No-bloat boundary

No paper prose, tables, figures, datasets, prompts, model outputs, examples, or implementation details were copied. The source is used only as live bibliographic metadata for relevance review.

## Verification

- `npx vitest run tests/gap0640To0648RelevanceBoundaries.test.ts --reporter=dot`
