# GAP-1086 - AI industry reviewer independence

- Gap: `GAP-1086`
- Dimension: Reviewer independence proof
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: OpenAlex work `https://openalex.org/W7127134078`, OpenAlex API `https://api.openalex.org/works/W7127134078`, DOI `https://doi.org/10.3389/fncom.2026.1780276`, Crossref API `https://api.crossref.org/works/10.3389%2Ffncom.2026.1780276`, Frontiers short article URL `https://www.frontiersin.org/articles/10.3389/fncom.2026.1780276/full`, Frontiers article page `https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/full`, and Frontiers PDF URL `https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/pdf`
- Retrieval: Live OpenAlex, DOI, Crossref, and Frontiers metadata review on `2026-06-25T08:56:00.000+05:30`
- Status: Done

## Relevance decision

`Editorial: The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research` is relevant to AMC only as high-risk deployment and human-system review context for reviewer independence proof. The source metadata concerns software deployment, cognition, cognitive science, human-computer interaction, scalability, and AI, which can contextualize why high-risk approvals require role separation, conflict checks, second review, and approval receipts.

The source does not justify a BCI subsystem, HMI subsystem, neuroscience research module, Frontiers importer, OpenAlex importer, source-specific review workflow, source-specific route, source-specific CLI command, or copied paper content. GAP-1086 maps to AMC's existing generic reviewer-independence receipt, which already records reviewer metadata, role separation, conflict flags, second-review requirements, approval receipt, source citations, signed evidence refs, row hash, and receipt hash.

## Live source metadata

- OpenAlex work: `https://openalex.org/W7127134078`
- OpenAlex API: `https://api.openalex.org/works/W7127134078`
- DOI: `https://doi.org/10.3389/fncom.2026.1780276`
- Crossref API: `https://api.crossref.org/works/10.3389%2Ffncom.2026.1780276`
- Frontiers short article URL: `https://www.frontiersin.org/articles/10.3389/fncom.2026.1780276/full`
- Frontiers article page: `https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/full`
- Frontiers PDF URL: `https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2026.1780276/pdf`
- Title: `Editorial: The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research`
- OpenAlex publication_year `2026`
- OpenAlex publication_date `2026-02-03`
- OpenAlex type `article`, language `en`
- Crossref type `journal-article`
- Crossref issued/online date `2026-02-03`
- Source: `Frontiers in Computational Neuroscience`
- OpenAlex host organization: `Frontiers Media`
- Crossref publisher: `Frontiers Media SA`
- Frontiers citation publisher metadata: `Frontiers`
- ISSN `1662-5188`
- OpenAlex open access status: `gold`; OpenAlex license `cc-by`
- Crossref license metadata includes `https://creativecommons.org/licenses/by/4.0/`.
- OpenAlex abstract available, but AMC did not copy the abstract text into product code or public methodology.
- Author/institutions:
  - Umer Asgher
  - `Czech Technical University in Prague`
  - `National University of Sciences and Technology`
- Concepts from OpenAlex include `Computer science`, `Software deployment`, `Cognition`, `Cognitive science`, `Human-computer interaction`, `Scalability`, `Implementation`, and `Artificial intelligence`.
- DOI request returned HTTP/2 `302` to the Frontiers short article URL.
- Frontiers short article URL returned HTTP/2 `301` to the journal article page.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Reviewer independence can support score evidence when high-risk approvals are cited. |
| Shield | Relevant when independent review is required for high-risk safety approvals. No BCI/HMI safety pack was added. |
| Enforce | Adjacent only; this gap closes approval-review proof rather than runtime enforcement. |
| Vault | Relevant because reviewer proof stores signed evidence refs and hashes without embedding sensitive approval payloads or paper content. |
| Watch | Adjacent only; deployment or monitoring context can be cited by evidence refs. No Watch monitor changed. |
| Fleet | Relevant when approvals are tied to high-risk agent deployment actions. |
| Passport | Relevant because the audit export preserves portable reviewer-independence proof and receipt hashes. |
| Comply | Relevant because high-risk approvals require role separation, conflict checks, second review, and owner/auditor traceability. |

## Product closure

No product code changed. Existing `src/audit/reviewerIndependence.ts` primitives already satisfy this gap:

- `buildReviewerIndependenceReceipt`
- `verifyReviewerIndependenceReceipt`
- `renderReviewerIndependenceAuditExport`

The receipt records approval ID, action ID, control ID, risk tier, requester metadata, reviewer metadata, role separation rule, decision, approval receipt, conflict check, conflict flags, second-review status, source citations, evidence refs, evidence-chain hash, row hash, and receipt hash.

`tests/gap1086AiIndustryReviewerIndependenceBoundary.test.ts` proves this existing primitive accepts source-cited high-risk deployment approvals and fails closed when paper metadata replaces reviewer separation, conflict checks, second review, approval receipts, or evidence lineage.

## Fail-closed rule

metadata-only AI industry editorial evidence must fail closed. Paper title, editorial label, OpenAlex concepts, OpenAlex abstract availability, DOI redirects, Frontiers citation metadata, journal label, author names, local backlog text, or source category labels cannot satisfy reviewer independence proof.

A valid reviewer-independence claim requires reviewer identity, requester identity, role separation rule, conflict check, conflict flags, signed conflict-check evidence, second review for high-risk approvals, approval receipt, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No BCI subsystem, HMI subsystem, neuroscience research module, neuroadaptive interface workflow, Frontiers importer, OpenAlex importer, Crossref importer, source-specific reviewer workflow, source-specific policy pack, source-specific route, source-specific CLI command, copied paper text, copied abstract, copied methodology, copied examples, copied prompts, or copied article content were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1086AiIndustryReviewerIndependenceBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1086-ai-industry-reviewer-independence.md` did not exist; 3 reviewer-independence/no-bloat tests passed.
- Live source checks:
  - `curl -sS https://api.openalex.org/works/W7127134078` returned OpenAlex metadata recorded above.
  - `curl -sSI https://doi.org/10.3389/fncom.2026.1780276` returned HTTP/2 `302` to Frontiers.
  - `curl -sS https://api.crossref.org/works/10.3389%2Ffncom.2026.1780276` returned Crossref metadata recorded above.
  - `curl -sSI https://www.frontiersin.org/articles/10.3389/fncom.2026.1780276/full` returned HTTP/2 `301` to the Frontiers journal article page.
  - `curl -sSL https://www.frontiersin.org/articles/10.3389/fncom.2026.1780276/full` returned Frontiers citation metadata including title, DOI, journal, ISSN, publisher, publication date, author, institution, and PDF URL.
- Focused test: `npx vitest run tests/gap1086AiIndustryReviewerIndependenceBoundary.test.ts --reporter=dot`
- Paired reviewer-independence regression: `npx vitest run tests/gap1086AiIndustryReviewerIndependenceBoundary.test.ts tests/gap1076ChildhoodSafetyReviewerIndependenceBoundary.test.ts tests/gap1064CredoAiReviewerIndependenceBoundary.test.ts tests/gap1058EpistemicFailureReviewerIndependenceBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
