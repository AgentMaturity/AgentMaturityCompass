# GAP-0664 — Medea omics Studio drilldown boundary

- Gap: `GAP-0664`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7125151103` / DOI `10.64898/2026.01.16.696667`
- Retrieval: `2026-06-21`; browser search for the exact title/DOI and title fragments returned no matching primary page, and shell network remains DNS-restricted in this environment.
- Status: skipped as unverified/metadata-limited source-review context; no Studio route, biomedical subsystem, or evidence-drilldown behavior changed.

## Relevance decision

The local backlog describes `Medea: An omics AI agent for therapeutic discovery`, mapped to Studio evidence drilldown. The topic is adjacent to AMC because biomedical agent claims would need inspectable evidence: trace rows, receipt hashes, policy decisions, source artifact links, evidence previews, and empty/error states.

The source cannot be accepted as product evidence here. The exact title/DOI could not be verified from a primary page through browser search, and local OpenAlex/backlog metadata alone does not supply an AMC-owned Studio route, evidence-preview manifest, trace artifact, receipt bundle, policy-rule artifact, artifact link, empty state, error state, signed evidence, or row hash. GAP-0664 is therefore a documented skip: no Studio feature, route, clinical/omics claim, or biomedical agent subsystem is added.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Only relevant when an AMC score finding has owned evidence rows and drilldown-ready artifacts. |
| Shield | Only relevant when rejected biomedical/omics claims are shown with signed evidence and repair guidance. |
| Watch | Only relevant through existing evidence drilldown/trace/receipt primitives; metadata alone cannot create a Watch view. |
| Enforce | No policy-enforcement change. |
| Vault | No protected biomedical data, secrets, storage, privacy, or data-residency change. |
| Fleet | No orchestration or trust-topology implementation. |
| Passport | No portable proof-bundle field or credential change. |
| Comply | No healthcare, biomedical, clinical, or regulatory compliance claim. |

## Product closure

No `src/studio`, `src/console`, `src/watch`, API, CLI, diagnostic, guide, passport, or scoring behavior changed for GAP-0664. Existing Studio/evidence drilldown primitives remain the only accepted path: an AMC-owned UI route, source artifact links, evidence previews, trace/receipt references, empty state, error state, signed evidence refs, row hashes, and no-copy/source-review proof.

## Fail-closed rule

Local backlog metadata, OpenAlex work id, DOI, title string, biomedical/omics/therapeutic-discovery framing, unverified search results, citation metadata, model/agent labels, and any metadata-only source identity must fail closed for Studio drilldown claims. Passing evidence requires an AMC-owned drilldown route, trace and receipt artifacts, source artifact links, evidence preview, empty/error states, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No Medea subsystem, omics agent, biomedical discovery workflow, clinical/therapeutic claim, paper importer, dataset mirror, model adapter, benchmark runner, Studio route, Console panel, Watch integration, source artifact schema, evidence-preview clone, or parity layer was added. No upstream paper prose, abstract text, figures, tables, prompts, biomedical datasets, model outputs, benchmark rows, screenshots, configs, source code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0664MedeaOmicsStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: attempted with `npm test -- --reporter=dot`; blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
