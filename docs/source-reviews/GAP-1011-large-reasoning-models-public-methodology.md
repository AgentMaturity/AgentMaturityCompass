# GAP-1011 - Large reasoning models public-methodology boundary

- Gap: `GAP-1011`
- Dimension: Public methodology versioning (`std-public-methodology`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: OpenAlex work `https://openalex.org/W7128026658`, OpenAlex API `https://api.openalex.org/works/W7128026658`, DOI `https://doi.org/10.1038/s41467-026-69010-1`, Nature article `https://www.nature.com/articles/s41467-026-69010-1`, Nature PDF `https://www.nature.com/articles/s41467-026-69010-1.pdf`, Crossref API `https://api.crossref.org/works/10.1038/s41467-026-69010-1`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through OpenAlex API, DOI/Nature headers, Nature HTML metadata, Nature PDF headers, Crossref API, and local backlog metadata.
- Status: Done - skipped
- Linear: `AMC-1290`

## Live source metadata

OpenAlex identifies the work as `Large reasoning models are autonomous jailbreak agents`, id `https://openalex.org/W7128026658`, DOI `https://doi.org/10.1038/s41467-026-69010-1`, type `article`, publication_year `2026`, publication_date 2026-02-05, open access `gold`, primary location source `Nature Communications`, source type `journal`, ISSN-L `2041-1723`, license `cc-by`, version `publishedVersion`, locations_count 6, and cited_by_count 2.

OpenAlex and Crossref author metadata identifies Thilo Hagendorff, Erik Derner, and Nuria Oliver, with affiliations including University of Stuttgart and ELLIS Alicante. Crossref identifies the type as `journal-article`, publisher `Springer Science and Business Media LLC`, title `Large reasoning models are autonomous jailbreak agents`, container `Nature Communications`, DOI `10.1038/s41467-026-69010-1`, published date 2026-02-05, and Creative Commons Attribution 4.0 license metadata.

The DOI returned `HTTP/2 302` to the Nature article. Nature HTML and PDF retrieval used a browser-like user agent because direct `curl -L` entered an identity/cookie transit. Nature metadata returned `HTTP/2 303`, `HTTP/2 302`, and final `HTTP/2 200` for the PDF, with `content-type: application/pdf`, `last-modified: Fri, 06 Feb 2026 13:02:52 GMT`, and `content-length: 871299`.

Nature page metadata includes page title `Large reasoning models are autonomous jailbreak agents | Nature Communications`, source `Nature Communications 2026 17:1`, `datePublished 2026-02-05`, `dateModified 2026-02-05`, volume 17, issue 1, pages 1-8, Open Access, article subjects `Mathematics and computing` and `Scientific community`, and the PDF URL `https://www.nature.com/articles/s41467-026-69010-1.pdf`.

Relevant source-review signals include OpenAlex topic `Adversarial Robustness in Machine Learning`, related topics `Explainable Artificial Intelligence` and `Ethics and Social Impacts of AI`, field `Computer Science`, and subfield `Safety Research`. Nature abstract metadata describes a security-evaluation setup involving DeepSeek-R1, Gemini 2.5 Flash, Grok 3 Mini, Qwen3 235B, nine widely used target models, multi-turn conversations, a system prompt, no further supervision, harmful prompts, sensitive domains, an overall jailbreak success rate of 97.14%, alignment regression, and safety guardrails.

No abstract, benchmark prompt, harmful prompt, attack conversation, figure, table, method prose, code, dataset, target-model row, chart, PDF content, reference list, author contribution prose, license prose beyond short license identity, generated output, or implementation detail was copied into AMC.

## Relevance decision

GAP-1011 is relevant to AMC only as public-methodology boundary evidence. The paper is security-relevant and reinforces why AMC public scoring claims need clear evidence taxonomy, limitations, benchmark-backed score semantics, signed evidence, regression thresholds, and Shield/Watch context when evaluating red-team or jailbreak-agent risk.

Large reasoning models are autonomous jailbreak agents cannot justify an AMC public methodology version bump. The source does not define AMC score semantics, badge semantics, diagnostic evidence taxonomy, methodology versioning, deprecation policy, migration guidance, or public changelog entries. The correct closure is a documented no-op: source-review context only, no public methodology version change, and no source-specific jailbreak-agent benchmark subsystem.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Context only. The source reinforces adversarial-evaluation risk but does not change AMC score formula, L0-L5 thresholds, methodology version, changelog, deprecation notice, migration guidance, or badge comparability. |
| Shield | Context only. The paper is safety/security-relevant, but no AMC red-team, threat detection, policy, benchmark, or evaluator behavior changed. |
| Enforce | Not changed. No runtime guardrail, prompt filter, jailbreak detector, or circuit breaker changed. |
| Vault | Not changed. No private prompt corpus, harmful prompt store, credential, DLP, or data residency behavior changed. |
| Watch | Context only. No live drift monitor, alert, evidence drilldown, or production telemetry behavior changed. |
| Fleet | Context only. The source discusses autonomous adversarial behavior, but no AMC multi-agent topology, fleet score, or orchestration primitive changed. |
| Passport | Not changed. No proof-bundle schema, external trust token, or source-specific proof field changed. |
| Comply | Not changed. No regulatory mapping or compliance control changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

No public methodology version bump was made because the verified source does not alter AMC public scoring semantics, evidence taxonomy, methodology versioning, badge comparability, deprecation notices, migration guidance, or report-binding proof.

The focused regression test proves the live source metadata and skip decision are documented, `getPublicMethodologyManifest()` does not include this paper as an AMC methodology source, and public methodology/badge/scoring modules do not contain source-specific Nature, DOI, jailbreak-agent, model-name, or success-rate identifiers.

## Fail-closed rule

OpenAlex metadata, DOI metadata, Nature article metadata, Nature PDF metadata, Crossref metadata, author/affiliation metadata, journal labels, Open Access labels, `cc-by` license identity, publication_date 2026-02-05, cited_by_count 2, topic labels, model names, target-model counts, multi-turn-jailbreak labels, harmful-prompt labels, sensitive-domain labels, reported 97.14% jailbreak success-rate metadata, local backlog text, or source identity alone cannot prove AMC public methodology versioning.

An AMC public methodology change can pass only when there is an AMC-owned scoring semantic change with explicit methodology version, changelog, deprecation notice, migration guidance, tests, and public documentation.

## No-bloat boundary

No jailbreak-agent importer, Nature adapter, OpenAlex adapter, Crossref adapter, DOI resolver, PDF parser, harmful-prompt dataset importer, autonomous jailbreak simulator, adversarial conversation replayer, target-model benchmark mirror, DeepSeek/Gemini/Grok/Qwen-specific evaluator, attack orchestration subsystem, Shield detector, Watch monitor, API route, CLI command, Studio panel, package dependency, badge semantics change, public methodology version bump, diagnostic question-bank migration, copied paper text, copied abstract, copied harmful prompts, copied target-model rows, copied figures, copied tables, copied PDF content, copied reference list, copied examples, copied generated outputs, copied code, or copied implementation details was added.

The paper remains source-review signal only and is skipped as public-methodology implementation evidence.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap1011LargeReasoningModelsPublicMethodologyBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1011-large-reasoning-models-public-methodology.md` did not exist; the implementation guard passed.
- Live source retrieval:
  - `curl -fsSL https://api.openalex.org/works/W7128026658`
  - `curl -I -L https://doi.org/10.1038/s41467-026-69010-1`
  - `curl -fsSL -A 'Mozilla/5.0' 'https://www.nature.com/articles/s41467-026-69010-1?error=cookies_not_supported'`
  - `curl -I -L -A 'Mozilla/5.0' https://www.nature.com/articles/s41467-026-69010-1.pdf`
  - `curl -fsSL https://api.crossref.org/works/10.1038/s41467-026-69010-1`
- Focused regression: `npx vitest run tests/gap1011LargeReasoningModelsPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap1005GoogleVertexEvaluationPublicMethodologyBoundary.test.ts tests/gap1011LargeReasoningModelsPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 6 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed; narrow token scan over public methodology, methodology versioning, scoring docs, and badge CLI files found no GAP-1011 source identifiers.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 858 files / 7,421 tests.
