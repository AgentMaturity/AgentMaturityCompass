# GAP-1084 - Generative AI voting post-hoc audit sampling

- Gap: `GAP-1084`
- Dimension: Post-hoc human audit sampling
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7128424040`, OpenAlex API `https://api.openalex.org/works/W7128424040`, DOI `https://doi.org/10.1140/epjds/s13688-025-00612-3`, Crossref API `https://api.crossref.org/works/10.1140%2Fepjds%2Fs13688-025-00612-3`, Springer article page `https://link.springer.com/article/10.1140/epjds/s13688-025-00612-3`, and Springer PDF metadata URL `https://link.springer.com/content/pdf/10.1140/epjds/s13688-025-00612-3.pdf`
- Retrieval: Live OpenAlex, DOI, Crossref, and Springer metadata review on `2026-06-25T08:41:00.000+05:30`
- Status: Done

## Relevance decision

`Generative AI voting: fair collective choice is resilient to LLM biases and inconsistencies` is relevant to AMC only as governance context for post-hoc human audit sampling. The source metadata concerns generative AI, voting, representation, and group decision-making; that is useful context for retrospective review of autonomous actions that may affect collective or representative decisions.

The source does not justify a voting simulator, persona emulator, collective-choice subsystem, Springer importer, OpenAlex importer, Crossref importer, source-specific route, source-specific CLI command, or copied paper content. GAP-1084 maps to AMC's existing generic post-hoc audit sampling receipt, which already records sample plan, reviewed actions, findings, corrective action, score impact, signed evidence refs, hashes, and auditor-ready export.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7128424040`
- OpenAlex API: `https://api.openalex.org/works/W7128424040`
- DOI: `https://doi.org/10.1140/epjds/s13688-025-00612-3`
- Crossref API: `https://api.crossref.org/works/10.1140%2Fepjds%2Fs13688-025-00612-3`
- Springer article page: `https://link.springer.com/article/10.1140/epjds/s13688-025-00612-3`
- Springer PDF metadata URL: `https://link.springer.com/content/pdf/10.1140/epjds/s13688-025-00612-3.pdf`
- Title: `Generative AI voting: fair collective choice is resilient to LLM biases and inconsistencies`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-02-09`
- OpenAlex type `article`, language `en`
- Crossref type `journal-article`
- Crossref issued/online date `2026-02-09`
- Source: `EPJ Data Science`
- OpenAlex host organization: `Springer Nature`
- Crossref publisher: `Springer Science and Business Media LLC`
- ISSN `2193-1127`
- OpenAlex open access status: `gold`; OpenAlex license `cc-by`
- Crossref license metadata includes `https://creativecommons.org/licenses/by/4.0` for TDM and VOR records.
- OpenAlex abstract available, but AMC did not copy the abstract text into product code or public methodology.
- Authors/institutions from OpenAlex and Springer metadata:
  - Srijoni Majumdar, `University of Leeds`
  - Edith Elkind, `Northwestern University`
  - Evangelos Pournaras, `University of Leeds`
- Concepts from OpenAlex include `Ballot`, `Voting`, `Turnout`, `Representation (politics)`, `Democracy`, `Group decision-making`, `Artificial intelligence`, `Voting behavior`, and `Generative model`.
- DOI request returned HTTP/2 `302` to `https://link.springer.com/10.1140/epjds/s13688-025-00612-3`.
- Springer DOI path returned HTTP/2 `301` to the article page.
- Springer article metadata title: `Generative AI voting: fair collective choice is resilient to LLM biases and inconsistencies | EPJ Data Science | Springer Nature Link`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because post-hoc findings can create signed score impact rows when reviewed autonomous actions reveal evidence gaps. |
| Shield | Adjacent only; this gap is not a new safety pack. Human review findings may reference Shield evidence when relevant. |
| Enforce | Adjacent only; this gap closes retrospective review proof rather than runtime enforcement. |
| Vault | Relevant because the receipt stores evidence refs and hashes without embedding sensitive action payloads or copied paper content. |
| Watch | Adjacent only; completed action telemetry can feed the audited population, but no Watch monitor changed. |
| Fleet | Relevant when sampled actions belong to fleet agents and their agent IDs are preserved in reviewed action rows. |
| Passport | Relevant because the audit export preserves portable sample-plan, review, finding, corrective-action, score-impact, and receipt hashes. |
| Comply | Relevant because post-hoc audit sampling provides signed human review evidence, corrective actions, and owner accountability. |

## Product closure

No product code changed. Existing `src/audit/posthocAuditSampling.ts` primitives already satisfy this gap:

- `buildPosthocAuditSamplingReceipt`
- `verifyPosthocAuditSamplingReceipt`
- `renderPosthocAuditSamplingAuditExport`

The receipt records sample plans, owners, populations, sample size, sampling method, risk tier, signed sample-plan evidence, reviewed action metadata, reviewer IDs, review decisions, signed review evidence, findings, corrective actions, score impact rows, source citations, evidence-chain hashes, row hashes, and receipt hash.

`tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts` proves this existing primitive accepts source-cited collective-decision agent reviews, fails closed when paper metadata replaces signed post-hoc audit proof, and fails closed when an audit finding has no corrective action.

## Fail-closed rule

metadata-only Generative AI voting evidence must fail closed. Paper title, OpenAlex concepts, OpenAlex abstract availability, DOI redirects, Springer article metadata, Springer PDF URL, Crossref license metadata, journal labels, author names, local backlog text, or source category labels cannot satisfy post-hoc human audit sampling.

A valid post-hoc audit claim requires a signed sample plan, reviewed actions, signed review evidence, source citations, evidence refs, findings for non-passing reviews, corrective action for each finding, score impact rows, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No voting simulator, persona emulator, collective-choice subsystem, social-choice benchmark, Springer importer, OpenAlex importer, Crossref importer, source-specific audit route, source-specific CLI command, copied paper text, copied abstract, copied tables, copied examples, copied prompts, copied methodology, copied benchmark rows, or copied article metadata beyond minimal source facts were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1084-generative-ai-voting-posthoc-audit.md` did not exist; 4 post-hoc audit/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7128424040` returned OpenAlex metadata recorded above.
  - `curl -sSI https://doi.org/10.1140/epjds/s13688-025-00612-3` returned HTTP/2 `302` to Springer.
  - `curl -sS https://api.crossref.org/works/10.1140%2Fepjds%2Fs13688-025-00612-3` returned Crossref metadata recorded above.
  - `curl -sSI https://link.springer.com/10.1140/epjds/s13688-025-00612-3` returned HTTP/2 `301` to the article page.
  - `curl -sSL https://link.springer.com/10.1140/epjds/s13688-025-00612-3` returned Springer citation metadata including article title, DOI, journal, authors, institutions, and PDF URL.
- Focused test: `npx vitest run tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts --reporter=dot`
- Paired post-hoc audit regression: `npx vitest run tests/gap1084GenerativeAiVotingPosthocAuditBoundary.test.ts tests/gap1072OneTrustPosthocAuditBoundary.test.ts tests/gap1066FairlyAiPosthocAuditSamplingBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
