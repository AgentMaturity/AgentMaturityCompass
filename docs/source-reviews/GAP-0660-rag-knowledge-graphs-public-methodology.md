# GAP-0660 — RAG knowledge-graphs public-methodology boundary

- Gap: `GAP-0660`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7128601153` / DOI `10.1016/j.cosrev.2026.100925`
- Retrieval: `2026-06-21`; browser search for the exact title/DOI did not return a matching primary page, and shell retrieval for OpenAlex, Crossref, and DOI is blocked by DNS resolution errors in this environment.
- Status: skipped as metadata-limited public-methodology evidence; no AMC methodology version bump or product code change.

## Relevance decision

The local backlog describes a paper titled `From vectors to knowledge graphs: A comprehensive analysis of modern retrieval-augmented generation architectures`, classified as public methodology versioning for Score, Shield, and Watch. The topic is adjacent to AMC's evidence taxonomy because RAG and knowledge-graph architecture choices can affect retrieval quality, grounding, evaluation, and observability.

The gap is not implementation-relevant by itself. The exact source could not be verified from a primary live page in the current environment, and the available local metadata does not define an AMC scoring-methodology change, public question-set migration, report-binding policy, badge comparability rule, Shield threshold, Watch drift policy, validation artifact, or deprecation/changelog requirement. GAP-0660 is therefore closed as a documented skip: source-review context only, no public methodology change.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background RAG/KG architecture context only; no accepted public scoring-methodology proof without AMC-owned versioned scoring evidence. |
| Shield | Background robustness context only; no new safety threshold or assurance rule. |
| Watch | Background retrieval/observability context only; no new drift methodology, monitor integration, or live evidence requirement. |
| Enforce | No policy-enforcement change. |
| Vault | No secrets, storage, privacy, or data-residency scope. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, or scoring code changed for GAP-0660. Existing AMC methodology-versioning primitives remain the only path for a public methodology claim: methodology id/version/hash, changelog, deprecation notice, migration guidance, validation proof, badge/report binding, signed evidence refs, row hashes, and no-copy proof.

## Fail-closed rule

Local backlog metadata, OpenAlex work id, DOI, title string, browser search result absence, source category, RAG/KG terminology, citation metadata, survey framing, and unverified DOI/OpenAlex/Crossref fields must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## No-bloat boundary

No RAG knowledge-graph subsystem, graph database, vector store, retriever, importer, paper parser, architecture taxonomy, benchmark mirror, dataset mirror, methodology version bump, badge query parameter, CLI/API route, Studio panel, parity layer, or source-specific scoring path was added. No upstream paper prose, abstract text, figures, tables, prompts, datasets, benchmark rows, configs, examples, screenshots, source code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0660RagKnowledgeGraphsPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
