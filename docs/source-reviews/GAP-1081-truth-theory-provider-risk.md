# GAP-1081 - Truth theory provider risk

- Gap: `GAP-1081`
- Dimension: Third-party agent and provider risk
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7133239131`, OpenAlex API `https://api.openalex.org/works/W7133239131`, DOI `https://doi.org/10.1007/s43681-026-01065-8`, Springer landing page `https://link.springer.com/article/10.1007/s43681-026-01065-8`, and Springer PDF URL `https://link.springer.com/content/pdf/10.1007/s43681-026-01065-8.pdf`
- Retrieval: Live HTTP and metadata review on `2026-06-25T08:15:00.000+05:30`
- Status: Done

## Relevance decision

OpenAlex identifies `Truth without belief: can LLM-generated content satisfy classical theories of truth?` as an `article` in `AI and Ethics`, publication_year `2026`, publication_date `2026-03-02`, DOI `https://doi.org/10.1007/s43681-026-01065-8`, closed access, and no license in the OpenAlex record. Concepts include `Normative`, `Intentionality`, `Epistemology`, `Interpretation (philosophy)`, `Meaning (existential)`, `Semantics (computer science)`, `Pragmatic theory of truth`, and `Semantic theory of truth`. OpenAlex lists authors `Xufeng Zhang` and `Han Li`; `Han Li` is affiliated with `Lanzhou University`.

Springer metadata identifies the same title, journal `AI and Ethics`, publisher `Springer International Publishing`, DOI `10.1007/s43681-026-01065-8`, online date `2026/03/02`, publication date `2026/04`, authors `Zhang, Xufeng` and `Li, Han`, and subject terms including `Large language models`, `Truth`, `Belief`, `Correspondence theory`, `Deflationism`, `Davidson`, `Technological mediation`, and `Epistemic responsibility`.

This source is relevant to AMC only as provider-risk governance context for LLM-generated content dependencies. It maps to AMC's existing generic third-party provider-risk receipt because the backlog acceptance requires provider record, attestation, data boundary, contractual control, and review date.

It does not justify a truth-theory subsystem, epistemology evaluator, Springer importer, OpenAlex importer, paper parser, truth/belief classifier, source-specific provider-risk route, source-specific CLI command, autonomous truth-verification claim, philosophical claim, or copied article content.

Live access boundary: `https://api.openalex.org/works/W7133239131` returned HTTP/2 `200`. `https://openalex.org/W7133239131` returned HTTP/2 `403` in this environment. The DOI returned HTTP/2 `302` to Springer, then Springer redirected to the article route and returned HTTP/2 `200`. The Springer PDF URL redirected through Springer's identity/cookie flow and ended on the article HTML route in this environment. AMC therefore treats retrieved metadata as source-review context only.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Provider-risk evidence can cap or contextualize score claims when vendor proof is missing. |
| Shield | No Shield evaluator or truth-theory classifier was added. Shield evidence must be AMC-owned and signed when cited. |
| Enforce | No runtime enforcement path changed. Provider restrictions can be represented through generic contractual controls. |
| Vault | Relevant because provider-risk receipts record data-boundary commitments without embedding prompts, outputs, customer data, or article content. |
| Watch | No Watch monitor changed. Provider review cadence and evidence can be linked through signed evidence refs. |
| Fleet | Relevant as dependency context when fleet agents rely on third-party model/content providers. |
| Passport | Relevant because the audit export preserves provider record, attestations, data-boundary hash, controls, exceptions, and receipt hash. |
| Comply | Relevant because third-party provider evidence must be reviewable and fail closed before compliance claims can pass. |

## Product closure

No product code changed. Existing `src/compliance/providerRisk.ts` provider-risk receipt primitives already satisfy this gap:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

The receipt records provider record, owner, review date, next review date, data-processing posture, allowed-use count, model-restriction count, attestations, data boundary, contractual controls, exception states, source citations, signed evidence refs, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1081TruthTheoryProviderRiskBoundary.test.ts` proves this existing primitive accepts source-cited LLM-content provider governance context and fails closed when paper metadata replaces signed provider-risk proof.

## Fail-closed rule

metadata-only truth-theory evidence must fail closed. A paper title, DOI, OpenAlex id, Springer URL, publication date, subject term, author name, affiliation, journal name, closed-access label, abstract metadata, or local backlog text cannot satisfy third-party provider risk.

A valid provider-risk claim requires a provider record, owner, review date, signed attestation, signed data boundary, contractual controls, signed exceptions when present, signed evidence refs, source citations, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No truth-theory subsystem, epistemology evaluator, Springer importer, OpenAlex importer, paper parser, truth/belief classifier, source-specific provider-risk route, source-specific CLI command, autonomous truth-verification claim, philosophical claim, upstream article prose, prompts, figures, tables, datasets, screenshots, model outputs, examples, or implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1081TruthTheoryProviderRiskBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1081-truth-theory-provider-risk.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7133239131` returned OpenAlex API metadata with the fields recorded above.
  - `curl -sSIL https://doi.org/10.1007/s43681-026-01065-8` returned HTTP/2 `302` to Springer, then redirects to Springer article HTML and HTTP/2 `200`.
  - `curl -sSL https://doi.org/10.1007/s43681-026-01065-8` returned Springer article HTML with title `Truth without belief: can LLM-generated content satisfy classical theories of truth? | AI and Ethics | Springer Nature Link`.
  - `curl -sSIL https://openalex.org/W7133239131` returned HTTP/2 `403`.
  - `curl -sSL https://link.springer.com/article/10.1007/s43681-026-01065-8` returned citation metadata for journal, publisher, DOI, publication date, authors, and PDF URL.
  - `curl -sSIL https://link.springer.com/content/pdf/10.1007/s43681-026-01065-8.pdf` redirected through Springer's identity/cookie flow and ended on article HTML in this environment.
- Focused test: `npx vitest run tests/gap1081TruthTheoryProviderRiskBoundary.test.ts --reporter=dot`
- Paired provider-risk regression: `npx vitest run tests/gap1081TruthTheoryProviderRiskBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
