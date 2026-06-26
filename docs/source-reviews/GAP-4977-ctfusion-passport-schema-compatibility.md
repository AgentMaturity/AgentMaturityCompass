# GAP-4977 — CTFusion Passport schema compatibility

- Gap: `GAP-4977`
- Dimension: Passport schema compatibility
- AMC surfaces requested: Passport; API; Fleet
- Source reviewed: CTFusion: A CTF-based Benchmark for LLM Agent Evaluation
- Retrieval: Live OpenAlex API, DOI/arXiv landing page, arXiv Atom API, and arXiv HTML metadata retrieved on 2026-06-25.
- Status: Done

## Relevance decision

This is relevant to AMC because agent benchmark and protocol ecosystems expose the same exchange problem AMC Passport solves: portable evidence must survive import, export, partner validation, and schema evolution. Live metadata confirms `CTFusion: A CTF-based Benchmark for LLM Agent Evaluation` by Dongjun Lee, Ga-eun Bae, and Insu Yun; OpenAlex identifies DOI `https://doi.org/10.48550/arxiv.2605.11504`, publication date 2026-05-12, primary location arXiv, and concepts including Computer science, Protocol, and Computer security. The arXiv metadata confirms Live CTFs, Model Context Protocol, CTFd, multiple LLMs and agents, and a cybersecurity-agent benchmark context.

AMC should not add a CTF benchmark runner. The AMC-native closure is a versioned Passport schema compatibility report that proves `.amcpass` import, export, and round-trip behavior against a fixture corpus and compatibility matrix.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant because score summaries carried in Passport must remain exchange-compatible. |
| Shield | Relevant indirectly because security posture claims need portable schema proof before external exchange. |
| Enforce | Relevant indirectly because policy and governance status fields are part of `.amcpass` compatibility. |
| Vault | Not changed; no new secret storage or key lifecycle was required. |
| Watch | Relevant indirectly because schema drift can affect evidence exchange visibility. |
| Fleet | Relevant because partner and fleet systems need import/export compatibility across agents. |
| Passport | Primary surface: Passport now has a versioned schema compatibility report contract. |
| Comply | Relevant indirectly for audit-ready proof that exported credentials keep their expected shape. |

## Product closure

Added `src/passport/passportSchemaCompatibility.ts` and exported it from `src/index.ts`. The module provides:

- `PASSPORT_SCHEMA_COMPATIBILITY_VERSION`
- `PASSPORT_SCHEMA_ID`
- `CURRENT_PASSPORT_SCHEMA_VERSION`
- `passportSchemaCompatibilityDirections`
- `buildPassportSchemaCompatibilityReport`
- `verifyPassportSchemaCompatibilityReport`

The report binds schema version, fixture corpus, import/export result, and compatibility matrix. It validates current `.amcpass` payloads with the existing Passport schema, computes deterministic row/report hashes, and requires at least one matrix row with import, export, and round-trip compatibility.

Updated `docs/AGENT_PASSPORT.md` and `docs/OPEN_STANDARD.md` to document the public compatibility-report boundary.

Acceptance closure: Schema version, fixture corpus, import/export result, and compatibility matrix are covered by the versioned report builder, verifier, docs, and regression test.

## Fail-closed rule

metadata-only evidence fails closed. Paper title, DOI, OpenAlex record, arXiv page, authors, abstract claims, Live CTFs, Model Context Protocol, CTFd, benchmark labels, local backlog text, and source identity are not enough. AMC requires a versioned report, fixture corpus id, concrete passport payload fixtures, import/export results, round-trip results, compatibility matrix, evidence refs, source citations, and deterministic report hash.

## No-bloat boundary

No CTFusion adapter, CTF benchmark runner, CTFd integration, MCP server bridge, cybersecurity challenge fixture, paper importer, arXiv/OpenAlex importer, agent benchmark subsystem, copied paper prose, copied benchmark data, copied prompts, copied agent traces, screenshots, figures, new API route, new CLI command, Studio screen, or methodology bump was added.

## Source evidence

- OpenAlex work: `https://openalex.org/W7161035179`
- OpenAlex API: `https://api.openalex.org/works/W7161035179`
- DOI: `https://doi.org/10.48550/arxiv.2605.11504`
- arXiv abstract: `https://arxiv.org/abs/2605.11504`
- arXiv Atom API: `https://export.arxiv.org/api/query?id_list=2605.11504`
- arXiv HTML: `https://arxiv.org/html/2605.11504`
- Live metadata observed: title `CTFusion: A CTF-based Benchmark for LLM Agent Evaluation`, authors Dongjun Lee, Ga-eun Bae, and Insu Yun, 2026-05-12 publication/submission date, arXiv primary location, `cs.LG` and `cs.CR` categories, 14 pages and 8 figures, Live CTFs, Model Context Protocol, CTFd, C++ absent from source metadata, and cybersecurity-agent benchmark context.

## Verification

- Expected-red focused test: `npx vitest run tests/gap4977CtfusionPassportSchemaCompatibilityBoundary.test.ts --reporter=dot` failed because `src/passport/passportSchemaCompatibility.ts` did not exist.
- Product-focused rerun failed only on missing docs and a test fixture using `promptEnforcement: "ENFORCE"` instead of the existing Passport schema value `ON`.
- Focused final: `npx vitest run tests/gap4977CtfusionPassportSchemaCompatibilityBoundary.test.ts --reporter=dot` passed 1 file / 5 tests.
- Related regression: `npx vitest run tests/gap4977CtfusionPassportSchemaCompatibilityBoundary.test.ts tests/agentPassportOpenStandard.test.ts tests/passportPublicApiAndCli.test.ts tests/openCompassAmcProofStandard.test.ts tests/gap4964Esp32CamReceiptInterchangeBoundary.test.ts --reporter=dot` passed 5 files / 32 tests.
- Diff hygiene: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed 970 files / 7,885 tests.
