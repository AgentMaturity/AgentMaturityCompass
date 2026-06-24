# GAP-1026 - DocSync public-methodology boundary

- Gap: `GAP-1026`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `DocSync: Agentic Documentation Maintenance via Critic-Guided Reflexion`
- Retrieval: live OpenAlex API, DOI headers, Crossref API, IEEE Xplore headers, and local backlog metadata fetched on 2026-06-24
- Status: Done - skipped
- Linear: `AMC-1305`

## Live source metadata

- OpenAlex work: `https://openalex.org/W7163218920`
- OpenAlex API: `https://api.openalex.org/works/W7163218920`
- DOI: `https://doi.org/10.1109/icaiset66439.2026.11541905`
- DOI value: `10.1109/icaiset66439.2026.11541905`
- Crossref API: `https://api.crossref.org/works/10.1109/icaiset66439.2026.11541905`
- IEEE Xplore landing URL: `https://ieeexplore.ieee.org/document/11541905/`
- Title: `DocSync: Agentic Documentation Maintenance via Critic-Guided Reflexion`
- OpenAlex publication_date `2026-04-21`
- OpenAlex type `article`
- OpenAlex language `null`
- OpenAlex open-access state: is_oa `false`, oa_status `closed`, any_repository_has_fulltext `false`
- OpenAlex primary location raw source: `2026 International Conference on Artificial Intelligence, Systems, and Emerging Technologies (ICAISET)`
- OpenAlex raw_type `proceedings-article`
- OpenAlex locations_count `1`
- OpenAlex cited_by_count `1`
- Crossref type `proceedings-article`
- Crossref publisher `IEEE`
- Crossref issued `2026-04-21`
- Crossref event: `2026 International Conference on Artificial Intelligence, Systems, and Emerging Technologies (ICAISET)`, Cairo, Egypt
- Crossref event dates `2026-04-21` to `2026-04-23`
- Crossref page `1-6`
- Crossref reference-count `14`
- Crossref is-referenced-by-count `1`
- Crossref prefix `10.1109`
- DOI headers returned HTTP/2 302 to IEEE Xplore.
- IEEE Xplore direct headers returned HTTP/2 202 with `x-amzn-waf-action: challenge`, so publisher body content was not retrieved or copied.
- Authors: Sidhesh Badrinarayan and Adithya Parthasarathy
- OpenAlex concepts include Documentation, Computer science, Process management, Knowledge management, Engineering ethics, Epistemology, Psychology, Agency, Engineering, and Human-computer interaction.
- Relevant title/source labels for the AMC relevance decision: agentic documentation maintenance, critic-guided reflexion, documentation drift, code-to-text alignment, and executable-logic documentation upkeep.

No article prose, method text, figures, tables, equations, benchmark rows, examples, or publisher body content were copied into AMC.

## Relevance decision

GAP-1026 is relevant to AMC only as public-methodology boundary evidence. DocSync is adjacent to methodology discipline because documentation drift and critic-guided review are relevant to public trust in scoring documentation. That context reinforces why AMC public scoring claims need an explicit methodology version, changelog, deprecation notice, migration guidance, limitations, evidence taxonomy, and report-binding proof when AMC scoring semantics actually change.

DocSync paper evidence alone cannot justify an AMC public methodology version bump. The paper metadata does not define AMC scoring formulas, L0-L5 thresholds, evidence trust tiers, diagnostic question-bank changes, badge comparability rules, deprecation policy, migration guidance, or the public methodology contract. This slice is skipped as public-methodology implementation evidence.

Because OpenAlex marks the work closed access and IEEE Xplore returned a WAF challenge, AMC must not infer method-level details or public methodology requirements from inaccessible paper contents.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. No AMC score formula, maturity threshold, evidence taxonomy, methodology version, changelog, deprecation notice, migration guidance, known-limitation text, or badge comparability changed. |
| Shield | Context only. Documentation-maintenance framing can inform assurance discipline, but it is not Shield evidence without AMC-owned signed evidence. |
| Enforce | Not changed. No runtime policy, documentation gate, critic loop, or enforcement path changed. |
| Vault | Not changed. No document store, privacy boundary, or secret handling changed. |
| Watch | Context only. Documentation drift is not Watch evidence unless AMC-owned monitoring receipts exist. |
| Fleet | Not changed. No agentic documentation-maintenance agent or fleet workflow was added. |
| Passport | Not changed. No proof-bundle schema or portable trust-token field changed. |
| Comply | Not changed. No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notices, migration guidance, known limitations, or report-binding proof.

The focused regression test proves the live source metadata and skip decision are documented, `getPublicMethodologyManifest()` does not include DocSync as an AMC methodology source, and public methodology/badge/scoring modules do not contain source-specific DocSync, DOI, IEEE, critic-guided reflexion, or identifier strings.

## Fail-closed rule

DocSync paper metadata, OpenAlex work id, DOI, Crossref metadata, IEEE Xplore headers, closed-access status, WAF challenge headers, title, authors, venue, event dates, event location, page range, reference count, citation count, concepts, documentation labels, critic-guided reflexion labels, documentation drift labels, local backlog text, or source identity cannot prove AMC public methodology versioning.

An AMC public methodology change can pass only when there is an AMC-owned scoring semantic change with explicit methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, report-binding proof, tests, and public documentation.

## No-bloat boundary

No DocSync runner, documentation-maintenance subsystem, critic-guided reflexion engine, documentation drift monitor, code-to-text alignment checker, executable-logic doc updater, paper importer, IEEE scraper, DOI adapter, Crossref adapter, OpenAlex adapter, benchmark clone, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, public methodology version bump, package dependency, copied article prose, copied abstract text, copied method text, copied figures, copied tables, copied equations, copied examples, copied prompts, copied benchmark rows, copied screenshots, copied configs, copied source code, or source-specific subsystem was added.

DocSync remains source-review signal only.

## Verification

- Live source retrieval:
  - `curl -sS https://api.openalex.org/works/W7163218920 | jq ...`
  - `curl -sSIL https://doi.org/10.1109/icaiset66439.2026.11541905 | sed -n '1,80p'`
  - `curl -sS https://api.crossref.org/works/10.1109/icaiset66439.2026.11541905 | jq ...`
  - `curl -sSI https://ieeexplore.ieee.org/document/11541905/ | sed -n '1,80p'`
- Expected-red focused test before doc: `npx vitest run tests/gap1026DocSyncPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1026-docsync-public-methodology.md` did not exist; the implementation guard passed.
- `npx vitest run tests/gap1026DocSyncPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- `npx vitest run tests/gap1015NemoGymPublicMethodologyBoundary.test.ts tests/gap1026DocSyncPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 6 tests.
- `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Narrow token scan over `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, and `src/badge/badgeCli.ts` found no GAP-1026 DocSync identifiers.
- `npm run typecheck` passed.
- `npm test -- --reporter=dot` passed, 873 files / 7,478 tests.
