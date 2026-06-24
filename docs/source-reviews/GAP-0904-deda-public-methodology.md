# GAP-0904 - DEDA public-methodology boundary

- Gap: `GAP-0904`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `drug-discovery-ai/deda-drug-evaluation-and-discovery-agent`, `https://github.com/drug-discovery-ai/deda-drug-evaluation-and-discovery-agent`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 17, Fork 6, Issues 19, Pull requests 3, 170 Commits, README.md, No releases published, Packages 0, Python 71.2%, JavaScript 21.8%, CSS 4.8%, HTML 2.0%, Other 0.2%, repository folders `.github/ workflows`, `assets`, `electron-app`, `snapshots`, `src/ drug_discovery_agent`, and `tests`, and files including `.env.example`, `.gitignore`, `.pre-commit-config.yaml`, `BUILD_INSTRUCTIONS.md`, `CI_CD_SETUP.md`, `CONTRIBUTING.md`, `Dockerfile`, `README.md`, `SNAPSHOT_TESTING_PLAN.md`, `UNIFIED_SNAPSHOT_SYSTEM.md`, `entrypoint.sh`, `pyproject.toml`, `pytest.ini`, and `requirements.txt`.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README identifies Bio-informatics AI agent for Drug discovery Research and DEDA as a lightweight tool for bioinformatics researchers exploring drug discovery and proteins. Relevant source-review signals include known binding pockets for the SARS-CoV-2 virus, UniProt, AlphaFold, OpenTargets, hallucinations, domain experts, Boltz-2 collaboration plans, MCP server, Claude Desktop, Chat on CLI, Electron-based chat interface, Docker, OpenAI API key setup, RAG chatbot, LangChain, snapshots, unified snapshot system, CI/CD setup, and build instructions.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. DEDA drug-discovery metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python source, JavaScript/CSS/HTML source, Electron assets, snapshots, bioinformatics data, prompts, RAG chatbot flows, MCP server code, Dockerfile content, environment examples, OpenAI API key examples, build instructions, CI/CD configuration, README prose beyond minimal metadata facts, screenshots, examples, command snippets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0904` is relevant only as a public-methodology no-op and source-review boundary. The drug-discovery and bioinformatics context may be useful for future domain-specific evaluation examples, but it is not an AMC-owned public scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; source metadata is not a methodology-versioning proof. |
| Shield | No new safety methodology claim; domain metadata remains fail-closed. |
| Watch | No Watch methodology or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No drug-discovery data, secrets, snapshots, prompts, or API keys stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that DEDA drug-discovery metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: drug-discovery, protein, UniProt, AlphaFold, OpenTargets, hallucination, MCP server, Claude Desktop, Chat on CLI, Electron app, Docker, OpenAI API key, LangChain, RAG chatbot, snapshot, CI/CD, and build metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 17, Fork 6, Issues 19, Pull requests 3, 170 Commits, No releases published, Packages 0, Python 71.2%, JavaScript 21.8%, CSS 4.8%, HTML 2.0%, Other 0.2%, folder names, file names, DEDA labels, bioinformatics researchers labels, drug discovery labels, proteins labels, SARS-CoV-2 labels, UniProt labels, AlphaFold labels, OpenTargets labels, hallucinations labels, domain experts labels, Boltz-2 labels, MCP server labels, Claude Desktop labels, Chat on CLI labels, Electron-based chat interface labels, OpenAI API key labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No DEDA adapter, drug-discovery agent, bioinformatics workflow, protein-data importer, UniProt integration, AlphaFold integration, OpenTargets integration, hallucination detector, MCP server runner, Claude Desktop integration, CLI chat command, Electron app integration, Docker runner, OpenAI wrapper, LangChain/RAG chatbot path, snapshot verifier, CI/CD workflow, build script, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, JavaScript/CSS/HTML source, Electron assets, snapshots, bioinformatics data, prompts, RAG chatbot flows, MCP server code, Dockerfile content, environment examples, OpenAI API key examples, build instructions, CI/CD configuration, README prose beyond minimal metadata facts, screenshots, examples, command snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0904DedaPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0904DedaPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0903AzureLlmAgentOpsQuestionExplainabilityBoundary.test.ts tests/gap0904DedaPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
