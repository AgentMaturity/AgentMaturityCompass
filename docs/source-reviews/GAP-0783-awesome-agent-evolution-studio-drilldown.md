# GAP-0783 - Awesome Agent Evolution Studio evidence drilldown boundary

- Gap: `GAP-0783`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub repository `https://github.com/Shiyao-Huang/awesome-agent-evolution`, `https://github.com/Shiyao-Huang/awesome-agent-evolution/blob/main/README-EN.md`, and `https://github.com/Shiyao-Huang/awesome-agent-evolution/blob/main/site/package.json`
- Retrieval: `2026-06-21` via GitHub connector. Root `README.md`, `README-EN.md`, and `site/package.json` were reachable; root `LICENSE` and root `package.json` returned 404.
- Status: closed through existing AMC Studio/Console/Watch evidence drilldown receipts; no Awesome Agent Evolution UI, survey index, repository mirror, or source-specific drilldown added.

## Live source metadata

The live repository identifies `Awesome Self-Evolving AI Agents` as a survey-first map for judging whether AI agents improve from feedback or only look impressive in a demo. The English README links to the website `https://agent-evolution.com/`, paper PDF, Evolve-AGI Index, and Project Index. It lists topics including `agent-evolution`, `self-evolving-agents`, `agent-swarm`, `memory-system`, `harness-engineering`, and `benchmark`.

Relevant source-review signals include a checklist around what changed, why it changed, who verified it, whether it was retained, and whether it can roll back; an `Observe -> Interpret -> Modify -> Verify -> Retain` loop; a provisional Evolve-AGI Index; and recent public metadata repair notes timestamped `2026-06-21 17:05 +0800`. Root `LICENSE` and root `package.json` returned 404 during connector fetch. The reachable `site/package.json` describes an Astro site using React and Three dependencies.

These facts are relevant to AMC as Studio evidence drilldown context only. They are not product requirements to copy the survey, import the repository index, build an Evolve-AGI scorer, mirror project reports, or claim parity with the source. An Awesome Agent Evolution source can support AMC only when the drilldown response is AMC-owned and contains a score route, source artifact links, accepted/rejected evidence previews, trace/receipt/evidence preview hashes, empty/error-state receipts, source refs, signed evidence refs, row hashes, and fail-closed behavior.

## Relevance decision

GAP-0783 is relevant to AMC because the backlog asks for Studio evidence drilldown across Score, Shield, and Watch, and AMC already has the generic `buildScoreEvidenceDrilldown` primitive plus Watch-side source artifact links. The source strengthens the operator-facing evidence-navigation boundary: repository survey evidence can be linked as source artifacts, but only AMC-owned signed receipts can drive a score finding or operator-visible proof.

The accepted AMC primitive is an existing observability Studio drilldown row with `sourceKind: "repository"`. The Awesome Agent Evolution repository is context for source artifact links and source metadata; the actual trace preview, reasoning trace preview, receipt preview, evidence preview, empty state, error state, signed evidence, and fail-closed result must come from AMC evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through the existing score evidence drilldown route that opens a question-level finding and shows accepted/rejected evidence previews. |
| Shield | Relevant through fail-closed handling for unsupported repository claims, missing evidence refs, empty preview state, and incomplete receipt hashes. |
| Watch | Relevant through source artifact links and trace/receipt/evidence preview hashes that connect operator drilldown to live evidence context. |
| Enforce | No runtime self-evolution policy, repository governance policy, or enforcement behavior changed. |
| Vault | No repository files, reports, project cards, prompts, site assets, or secure-storage behavior changed. |
| Fleet | Agent-swarm and self-evolving-agent context only; no orchestration topology or survey importer added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No compliance mapping changed. |

## Product closure

GAP-0783 is closed by documenting the live-repository boundary and adding regression coverage over the existing evidence drilldown primitive. The positive path proves that Awesome-Agent-Evolution-style repository context is accepted only when AMC-owned drilldown rows carry a valid route, source artifact links, preview hashes, ready evidence state, signed evidence refs, row hashes, and empty/error-state receipts. The negative path proves repository README, topic, website, Evolve-AGI Index, site package, or backlog metadata alone fails closed. The empty path proves missing question receipts return an explicit empty state rather than a partial proof.

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console`, `src/studio`, API, CLI, Studio panel, Watch monitor, Shield verifier, Awesome Agent Evolution UI, survey index, Evolve-AGI scorer, repository mirror, project-report importer, topic crawler, website crawler, Astro site integration, methodology version, diagnostic question bank, package dependency, or scoring behavior changed for GAP-0783.

## Fail-closed rule

Repository name, README title, topics, stars, website link, paper link, Evolve-AGI Index link, Project Index link, topic evidence date, public metadata repair timestamp, root 404s, site package metadata, Astro/React/Three dependency labels, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown claims. Passing evidence requires AMC-owned UI route proof, source artifact links, evidence previews, trace preview hash, reasoning trace preview hash, receipt preview hash, evidence preview hash, source-artifact preview hash, empty-state hash, error-state hash, signed evidence refs, row hashes, and no-copy proof.

## No-bloat boundary

No Awesome Agent Evolution UI, self-evolving-agent survey importer, repository mirror, README parser, website crawler, Evolve-AGI scorer, project-report importer, topic crawler, GitHub metadata monitor, Astro site integration, paper parser, dataset importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, topic lists, site assets, figures, screenshots, project reports, indexes, paper drafts, code, configs, generated outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0783AwesomeAgentEvolutionStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
