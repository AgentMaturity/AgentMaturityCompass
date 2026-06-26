# GAP-1029 - Sensemaking multi-agent question-explainability boundary

- Gap: `GAP-1029`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `Sensemaking in Multi-Agent LLM Interfaces: How Users Interpret Transparency and Trustworthiness Cues`
- Retrieval: live OpenAlex work/API, DOI content negotiation and redirect headers, Crossref API, ACM landing headers, VBN repository landing page/headers/meta tags, and local backlog metadata fetched on 2026-06-24
- Status: Done

## Relevance decision

The paper is relevant to AMC as source-review context for how users interpret transparency, trustworthiness, sensemaking, mental-model, reliance, and multi-agent interface cues. It maps to the existing AMC question-level Score/Shield/Watch explainability primitive because AMC already needs question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, fail-closed thresholds, row hash, and source-boundary proof before a maturity score movement can pass.

Live source metadata verified:

- OpenAlex work: `https://openalex.org/W7153858602`
- OpenAlex API: `https://api.openalex.org/works/W7153858602`
- DOI: `https://doi.org/10.1145/3772318.3791157`
- DOI value: `10.1145/3772318.3791157`
- Crossref API: `https://api.crossref.org/works/10.1145/3772318.3791157`
- ACM landing page: `https://dl.acm.org/doi/10.1145/3772318.3791157`
- VBN UUID landing page: `https://vbn.aau.dk/en/publications/29038e14-80a8-4e5d-bf98-27c1d27fa7d4`
- VBN canonical page: `https://vbn.aau.dk/en/publications/sensemaking-in-multi-agent-llm-interfaces-how-users-interpret-tra/`
- Title: `Sensemaking in Multi-Agent LLM Interfaces: How Users Interpret Transparency and Trustworthiness Cues`
- Venue: `Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems`
- Publisher: ACM / Association for Computing Machinery
- publication_year `2026`
- publication_date `2026-04-13`
- Crossref type `proceedings-article`; OpenAlex type `article`; VBN type `Article in proceeding`
- article number `913`
- pages `1-20`
- OpenAlex open access status `gold`, license `cc-by`; VBN displays `CC BY 4.0`
- Crossref reference count `109`; OpenAlex cited_by_count `1`
- Authors verified across OpenAlex, Crossref, DOI content negotiation, and VBN: Saumya Pareek, Jarod Govers, Naja Kathrine Kollerup, Emily Wong, Eduardo Velloso, and Jorge Goncalves.
- Institutions verified include University of Melbourne, Aalborg University, and The University of Sydney.
- VBN citation keywords include human-AI decision-making, human-AI interaction, information seeking, mental models, multi-agent chatbots, multi-agent LLM, reliance, sensemaking, transparency, and trust.
- OpenAlex concepts include Transparency (behavior), Trustworthiness, Sensemaking, Internet privacy, Computer science, Psychology, Perception, Knowledge management, Public relations, and Social psychology.
- DOI headers returned `HTTP/2 302` to the ACM landing page.
- ACM landing headers returned `HTTP/2 403` with a Cloudflare challenge, so ACM page contents were not used as product evidence.
- VBN UUID and canonical routes returned redirects and then VBN HTTP/2 200 with `x-product: Pure Portal`, `content-language: en-GB`, `last-modified: Tue, 23 Jun 2026 00:00:00 GMT`, and Pure Portal page metadata.
- DOI content negotiation returned CSL JSON and BibTeX metadata for the CHI paper.
- VBN provided accessible bibliographic metadata and a short abstract/method signal that I reviewed only as source context: the work is a qualitative comparative structured observation study of multi-agent LLM interface transparency cues across different interface variants and task types. No abstract or method prose was copied into AMC.

The source does not justify a new AMC product area. It strengthens the boundary around existing question-score explainability receipts: user-facing transparency and trustworthiness language can inform repair hints and rejected-evidence reasons only after AMC-owned evidence rows prove what moved each question score.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when a question-level score change is explained through AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hint, row hash, and reproducible eval-pack evidence. |
| Shield | Relevant when rejected evidence or repair hints identify safety, trustworthiness, reliance, or misleading-transparency risks in AMC-owned evidence. |
| Enforce | No runtime enforcement change; metadata-only paper proof remains rejected by the existing explainability fail-closed path. |
| Vault | No secrets, privacy store, data residency, or secure-storage change. |
| Watch | Relevant only when Watch-facing evidence chains show score movement, rejected evidence, and repair hints from AMC-owned receipts. |
| Fleet | Contextual only for multi-agent interface evidence; no multi-agent simulator, interface runtime, or trustworthiness-cue model was added. |
| Passport | Existing Passport artifacts can carry score-explainability proof; no public proof-token semantics changed. |
| Comply | No compliance mapping change. |

## Product closure

No product code change was needed. GAP-1029 is closed by documenting the source-review boundary and adding regression coverage that proves:

- existing `buildQuestionExplainabilityReport` and `buildEvalScoreExplainabilityPack` can represent source-linked question-score explainability receipts for multi-agent transparency/trustworthiness context;
- accepted evidence IDs, rejected evidence reasons, repair hints, reproducible eval-pack metadata, fail-closed thresholds, row hashes, and signed evidence rows are preserved;
- OpenAlex, DOI, Crossref, ACM challenge headers, VBN metadata, CHI venue facts, article number, page range, access/license metadata, paper title, authors, institutional metadata, keywords, abstract/method labels, transparency/trustworthiness/sensemaking labels, mental-model labels, multi-agent interface labels, local backlog text, or source identity cannot replace AMC-owned question-level score evidence.

## Fail-closed rule

The following evidence is metadata-only and must fail closed if it is used without AMC-owned question-score explainability proof:

- OpenAlex work/API data, DOI redirects, DOI content-negotiation metadata, Crossref metadata, ACM challenge headers, VBN Pure Portal metadata, Scopus links, CHI venue facts, publisher facts, article number, page range, authors, ORCIDs, institutional affiliations, access/license labels, keywords, abstract summaries, method labels, local backlog text, or source identity.

A passing AMC question-score explainability claim must include question ID, accepted evidence IDs, rejected evidence reasons, repair hint, reproducible eval pack, signed evidence rows, fail-closed thresholds, row hash, accepted/rejected evidence ledger hashes, and source-boundary/no-parity proof.

## No-bloat boundary

AMC did not add a paper importer, ACM scraper, VBN scraper, DOI adapter, Crossref adapter, OpenAlex adapter, Scopus adapter, multi-agent transparency simulator, trustworthiness-cue model, sensemaking model, interface-study subsystem, mental-model subsystem, reliance scorer, dataset clone, benchmark clone, package dependency, API route, CLI command, Studio panel, Watch panel, Passport semantics change, copied abstract prose, copied method prose, copied paper examples, copied tables, copied figures, copied prompts, copied screenshots, copied configs, copied source code, copied datasets, or source-specific question-explainability module.

External sources remain source-review signals only. AMC's product primitive remains generic question-score explainability over Score/Shield/Watch.

## Verification

- `curl -sS https://api.openalex.org/works/W7153858602 | jq ...` passed.
- `curl -sSIL https://doi.org/10.1145/3772318.3791157 | sed -n '1,120p'` passed and showed `HTTP/2 302` to ACM.
- `curl -sSLH 'Accept: application/vnd.citationstyles.csl+json' https://doi.org/10.1145/3772318.3791157 | jq ...` passed.
- `curl -sSH 'Accept: application/x-bibtex' -L https://doi.org/10.1145/3772318.3791157 | sed -n '1,80p'` passed.
- `curl -sS https://api.crossref.org/works/10.1145/3772318.3791157 | jq ...` passed.
- `curl -sSIL https://dl.acm.org/doi/10.1145/3772318.3791157 | sed -n '1,120p'` passed and returned `HTTP/2 403` with a Cloudflare challenge.
- `curl -sSIL https://vbn.aau.dk/en/publications/29038e14-80a8-4e5d-bf98-27c1d27fa7d4 | sed -n '1,120p'` passed and redirected to the canonical Pure Portal page.
- `curl -sSIL https://vbn.aau.dk/en/publications/sensemaking-in-multi-agent-llm-interfaces-how-users-interpret-tra/ | sed -n '1,120p'` passed with VBN HTTP/2 200.
- `curl -sSL https://vbn.aau.dk/en/publications/sensemaking-in-multi-agent-llm-interfaces-how-users-interpret-tra/ | rg ...` passed for citation metadata, details, access/license, keywords, and source-shape checks.
- TDD expected failure before doc creation passed as expected: missing source-review doc was the only failing condition, while 3 question-score explainability primitive tests passed.
- `npx vitest run tests/gap1029SensemakingMultiAgentQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- `npx vitest run tests/gap1029SensemakingMultiAgentQuestionExplainabilityBoundary.test.ts tests/gap1022AnticaNnetQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, and `src/passport/passportArtifact.ts` found no GAP-1029 sensemaking paper identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 876 files / 7,490 tests.
