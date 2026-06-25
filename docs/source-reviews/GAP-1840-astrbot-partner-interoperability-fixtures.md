# GAP-1840 - AstrBot partner interoperability fixtures

- Gap: `GAP-1840`
- Dimension: Partner interoperability fixtures
- AMC surfaces requested: Fleet; Watch; Studio
- Source reviewed: `AstrBotDevs/AstrBot`
- Retrieval: Live GitHub repository metadata, language metadata, README URL, and README content review on `2026-06-25`
- Status: Done

## Relevance decision

AstrBot is relevant to AMC as a source-review signal because the live repository describes an AI Agent Assistant and development framework for agent chatbot workflows with mainstream instant messaging apps, LLM providers, MCP, Plugin Extensions, WebUI support, and an Agent Sandbox. Those facts map to AMC's need to prove that runtime lifecycle evidence can be exported into a partner-facing fixture without losing plan, tool, memory, handoff, retry, finalization, receipt, and unsupported-field context.

GAP-1840 is product-relevant through AMC's existing Fleet, Watch, and Studio surfaces. The closure is a generic partner interoperability fixture over AMC's signed runtime lifecycle graph. The fixture records a normalized export, a round-trip result, unsupported field decisions, an owner, source citations, hashes, and signed artifact paths. AstrBot metadata is source-review context only.

## Source retrieval

- GitHub repository: `https://github.com/AstrBotDevs/AstrBot`
- GitHub README: `https://raw.githubusercontent.com/AstrBotDevs/AstrBot/master/README.md`
- Homepage: `https://astrbot.app`
- Default branch from live GitHub metadata: `master`
- License from live GitHub metadata: `AGPL-3.0`
- Repository description from live GitHub metadata: AI Agent Assistant and development framework integrating IM platforms, LLMs, plugins, and AI features.
- Live repository count snapshot: 35,320 stars, 2,440 forks, 1,320 open issues, pushed at `2026-06-25T09:33:15Z`.
- Live language snapshot: Python, Vue, TypeScript, JavaScript, HTML, CSS, Shell, SCSS, Makefile, and Dockerfile.
- README source facts reviewed: mainstream instant messaging apps, LLM conversations, multimodal/Agent/MCP/skills/knowledge-base support, agent-platform integrations, multi-platform messaging support, Plugin Extensions, Agent Sandbox, WebUI, Docker deployment, supported messaging platforms, and supported LLM/LLMOps providers.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only; imported fixture evidence can support score reviews, but no scoring method changed. |
| Shield | Adjacent only; sandbox and plugin risk context can inform assurance, but no Shield pack changed. |
| Enforce | Adjacent only; unsupported partner fields can identify enforcement gaps, but no runtime policy route changed. |
| Vault | Out of scope; no partner secrets, credentials, plugin manifests, or message payloads are imported. |
| Watch | Relevant because Watch needs partner-visible runtime evidence and unsupported-field visibility. |
| Fleet | Relevant because Fleet needs comparable lifecycle evidence across agent runtimes and partner systems. |
| Passport | Out of scope for this gap; no portable trust token schema changed. |
| Comply | Out of scope; fixture evidence can support audits, but no compliance mapping changed. |

## Product closure

Added `src/integrations/partnerInteroperability.ts`, exported it through `src/integrations/index.ts` and `src/index.ts`, and added `partner-interoperability-fixture` as a signed artifact kind.

The generic fixture:

- normalizes an AMC signed runtime lifecycle graph into a partner-facing export;
- preserves graph hash, replay hash, run id, agent id, lifecycle id, surfaces, nodes, edges, receipts, event signatures, and evidence references;
- computes export, imported, round-trip, and fixture hashes;
- records a fixture, round-trip result, unsupported field list, and owner;
- writes a signed fixture under `.amc/integrations/partner-fixtures/`;
- fails closed when metadata or incomplete partner field review replaces signed lifecycle evidence.

`tests/gap1840AstrBotPartnerInteroperability.test.ts` proves the signed fixture path, round-trip result, unsupported field decisions, owner evidence, fail-closed metadata-only behavior, and no-bloat source boundary.

## Fail-closed rule

metadata-only source evidence fails closed. Repository stars, license, topics, language metadata, README claims, messaging-platform lists, plugin counts, MCP labels, sandbox labels, homepage metadata, or backlog text cannot prove interoperability.

A passing GAP-1840 claim requires a signed AMC runtime lifecycle graph, graph path, graph signature path, event signatures, plan/tool/memory/handoff/retry/finalization nodes, tool and handoff receipts, a partner export hash, a round-trip pass, field-review decisions, unsupported field decisions where applicable, owner evidence, fixture hash, fixture path, and fixture signature path. Missing graph evidence, missing owner evidence, missing field review, unsupported fields without owner/decision, export hash mismatch, replay hash mismatch, round-trip mismatch, or fixture hash mismatch fails closed.

## No-bloat boundary

No AstrBot adapter, AstrBot importer, AstrBot runtime bridge, IM-platform adapter, chatbot subsystem, plugin marketplace mirror, MCP adapter, Docker deployment wrapper, provider route importer, WebUI integration, source-specific API route, source-specific CLI command, methodology version bump, copied README prose, copied upstream config, copied screenshots, copied examples, copied plugin metadata, copied provider tables, or copied source code was added.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1840AstrBotPartnerInteroperability.test.ts --reporter=dot` failed first because `src/integrations/partnerInteroperability.ts` did not exist.
- After implementation, focused test failed only because this source-review document did not exist; the fixture behavior, fail-closed, and no-bloat checks passed.
- Live source checks:
  - `gh api repos/AstrBotDevs/AstrBot --jq '{nameWithOwner:.full_name, default_branch, description, homepage, html_url, stargazers_count, forks_count, open_issues_count, license:(.license.spdx_id // null), pushed_at, updated_at, topics}'` returned the repository metadata recorded above.
  - `gh api repos/AstrBotDevs/AstrBot/languages` returned the language metadata recorded above.
  - `gh api repos/AstrBotDevs/AstrBot/readme --jq '.download_url'` returned the README URL recorded above.
  - `curl -L --max-time 20 https://raw.githubusercontent.com/AstrBotDevs/AstrBot/master/README.md | rg -n "(?i)(platform|plugin|mcp|qq|telegram|discord|llm|agent|webui|docker|integrat|deploy|provider)"` confirmed the README source facts recorded above.
- Focused test: `npx vitest run tests/gap1840AstrBotPartnerInteroperability.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Related runtime/integration regression: `npx vitest run tests/gap1840AstrBotPartnerInteroperability.test.ts tests/gap1838RuntimeLifecycleGraphBoundary.test.ts tests/runtimeRunManager.test.ts tests/passportPublicApiAndCli.test.ts tests/integrationDispatch.test.ts tests/integrationDeliveryQueue.test.ts --reporter=dot` passed, 4 files / 25 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 952 files / 7,801 tests.
