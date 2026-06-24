# GAP-0902 - Prompting Blueprints live-drift boundary

- Gap: `GAP-0902`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `TomasHer/prompting-blueprints`, `https://github.com/TomasHer/prompting-blueprints`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 18, Fork 4, Issues 0, Pull requests 0, 134 Commits, README.md, MIT license, No releases published, Packages 0, HTML 83.5%, Python 16.5%, repository folders `.agent`, `.vscode`, `01-about-author`, `02-ai-agents`, `03-prompts-and-patterns`, `04-guides`, `05-tools`, `06-models-and-evaluations`, `07-use-cases-and-research`, `08-requirements-engineering`, `09-conferences`, `assets`, `docs`, `scripts`, and `website`, and files including `.gitignore`, `BACKLOG.md`, `CHANGELOG.md`, `CITATION.cff`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, `agents.md`, `external-sources.md`, `mkdocs.yml`, `source-index.md`, and `structure.txt`.
- Status: Done

## Live source metadata

The live README identifies Prompting Blueprints as a guide to the Agentic AI evolution with concepts and tactics for building autonomous AI workflows. Relevant source-review signals include structured prompt packs, rigorous evaluations, AI agents, MCP/A2A protocols, context engineering, prompts and patterns, NotebookLM, Perplexity Comet, Copilot Agents, LangChain, models and evaluations, promptfoo configs, Requirements engineering, GAISE 2026, external sources, source index, changelog, docs site navigation, prompt packs, playbooks, use cases, research tutorials, and conference notes.

Those facts are relevant to AMC only as live score and behavior drift context for prompt-workflow agents. They do not allow AMC to import Prompting Blueprints prompt packs, mirror its docs site, cite its external-source index as product evidence, run promptfoo configs, adopt conference notes, or claim support for its playbook catalog. For Score, Shield, and Watch, the relevant AMC requirement remains baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof.

No upstream Markdown content, prompt packs, playbooks, website assets, external-source lists, source-index rows, changelog content, docs navigation, examples, promptfoo configs, scripts, images, diagrams, README prose beyond minimal metadata facts, or implementation details were copied into AMC.

## Relevance decision

`GAP-0902` is relevant to AMC as a live score and behavior drift alert boundary. Prompt and playbook catalogs are plausible sources of production behavior drift when operators change agent instructions or model guidance, but AMC should alert only from AMC-owned baseline/live trace distributions and signed evidence.

The closure uses existing AMC Watch live-drift primitives only. It does not add a Prompting Blueprints importer, prompt pack catalog, docs crawler, promptfoo runner, LangChain integration, NotebookLM integration, Perplexity Comet integration, Copilot Agents integration, requirements-engineering guide adapter, website mirror, or source-specific drift monitor.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score distribution changes between baseline and live samples. |
| Shield | Relevant when signed evidence proves behavior drift instead of trusting prompt metadata. |
| Watch | Relevant through existing live-drift alert receipts and Watch alert projections. |
| Enforce | No runtime prompt or model policy changed. |
| Vault | No prompt packs, external sources, user prompts, website assets, or playbook content stored. |
| Fleet | Prompt-workflow context only; no fleet topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with synthetic AMC-owned prompt-workflow baseline and live windows. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof. The negative path proves that GitHub, README, Agentic AI evolution, autonomous AI workflows, structured prompt packs, rigorous evaluations, MCP/A2A protocols, context engineering, NotebookLM, Perplexity Comet, Copilot Agents, LangChain, promptfoo configs, Requirements engineering, GAISE 2026, external sources, source index, and source identity alone fail closed without signed live-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license, Star 18, Fork 4, Issues 0, Pull requests 0, 134 Commits, No releases published, Packages 0, HTML 83.5%, Python 16.5%, folder names, file names, Agentic AI evolution labels, autonomous AI workflows labels, structured prompt packs labels, rigorous evaluations labels, MCP/A2A protocols labels, context engineering labels, NotebookLM labels, Perplexity Comet labels, Copilot Agents labels, LangChain labels, promptfoo configs labels, Requirements engineering labels, GAISE 2026 labels, external sources labels, source index labels, local backlog metadata, or source identity alone must fail closed for live drift. Passing live-drift proof requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof.

## No-bloat boundary

No Prompting Blueprints importer, prompt pack catalog, docs crawler, external-source index parser, source-index importer, promptfoo runner, LangChain integration, NotebookLM integration, Perplexity Comet integration, Copilot Agents integration, requirements-engineering guide adapter, website mirror, source-specific Watch monitor, API route, CLI command, Studio panel, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Markdown content, prompt packs, playbooks, website assets, external-source lists, source-index rows, changelog content, docs navigation, examples, promptfoo configs, scripts, images, diagrams, README prose beyond minimal metadata facts, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0902PromptingBlueprintsLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the live-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0902PromptingBlueprintsLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0901MsmarcoGenqaQuestionExplainabilityBoundary.test.ts tests/gap0902PromptingBlueprintsLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
