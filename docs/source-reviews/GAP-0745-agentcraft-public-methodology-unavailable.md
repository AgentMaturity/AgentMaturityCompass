# GAP-0745 - AgentCraft public-methodology unavailable-source boundary

- Gap: `GAP-0745`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7134257403`, DOI `10.1145/3742414.3794957`, and title `AgentCraft: Workshop on Developing Trustworthy Agentic AI Systems`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title, DOI, OpenAlex, ACM publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment, and the ACM DOI page returned `403`. Shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, workshop importer, agent-building framework, or trustworthiness workflow added.

## Live source metadata

The local backlog identifies a paper titled `AgentCraft: Workshop on Developing Trustworthy Agentic AI Systems`, DOI `10.1145/3742414.3794957`, OpenAlex work `W7134257403`, improvement dimension public methodology versioning, category `Agent evaluation and benchmarks`, and concepts including workflow, debugging, trustworthiness, computer science, knowledge management, intelligent agent, human-computer interaction, and engineering ethics. The backlog abstract snippet frames the source around AI agents powered by LLMs across multiple domains. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title, DOI, OpenAlex, ACM publisher-domain, and quoted-title searches did not surface a reachable primary source in this environment, and the ACM DOI page returned `403`.

These metadata facts are useful as source-review context only. They do not by themselves define an AMC methodology version, scoring rule, changelog, deprecation notice, migration guidance, validation artifact, signed evidence receipt, badge rule, or public comparability contract. No upstream workshop prose, abstract text beyond local backlog metadata, figures, tables, workflows, workshop program material, prompts, examples, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0745 is relevant to AMC only as public-methodology boundary evidence. Trustworthy agentic systems, workflow design, debugging, knowledge management, human-computer interaction, and engineering ethics can inform future evidence taxonomy work, but an unavailable metadata-only source cannot change public Score, Shield, or Watch methodology semantics.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the DOI/OpenAlex/title metadata and backlog abstract snippet do not provide AMC-owned methodology proof. A source citation to the workshop can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background trustworthy-agent/evidence-taxonomy context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background trustworthiness, debugging, and ethics context only; no new safety threshold or assurance rule. |
| Watch | Background workflow/debugging context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime workflow policy, debugging guardrail, or enforcement behavior changed. |
| Vault | No datasets, traces, workshop materials, prompts, outputs, or secure-storage behavior changed. |
| Fleet | Agentic-systems workshop context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | Ethics context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, workshop importer, agent-building framework, trustworthiness workflow, debugging workflow, knowledge-management adapter, or public methodology docs changed for GAP-0745.

The closure is an unavailable-source no-bloat source-review boundary: AgentCraft, trustworthy agentic systems, workflow, debugging, knowledge management, intelligent-agent, human-computer interaction, engineering-ethics, DOI, OpenAlex, ACM, and title labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

OpenAlex work ID, DOI, title, AgentCraft labels, workshop labels, trustworthy-agentic-system labels, workflow labels, debugging labels, trustworthiness labels, knowledge-management labels, intelligent-agent labels, human-computer-interaction labels, engineering-ethics labels, ACM labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No workshop importer, agent-building framework, trustworthy-agent workflow, debugging workflow, knowledge-management adapter, HCI evaluator, ethics evaluator, ACM importer, OpenAlex importer, paper importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream workshop prose, abstract text beyond local backlog metadata, figures, tables, workflows, workshop program material, prompts, examples, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0745AgentCraftPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
