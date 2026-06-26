# GAP-0921 - jobclaw public-methodology boundary

- Gap: `GAP-0921`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Eldin162/jobclaw`, `https://github.com/Eldin162/jobclaw`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 1, Pull requests 0, 14 Commits, README.md, README_EN.md, MIT license, repository folders `assets`, `docs`, `jobclaw`, `profiles`, `src`, and `tests`, and files including `.env.example`, `.eslintrc.json`, `.gitignore`, `LICENSE`, `PLAN.md`, `README.md`, `README_EN.md`, `components.json`, `next-env.d.ts`, `next.config.ts`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `pyproject.toml`, `tailwind.config.ts`, and `tsconfig.json`. The page also showed No releases published, Packages 0, and language mix Python 74.9%, TypeScript 23.7%, CSS 1.3%, and JavaScript 0.1%.
- Status: Done - skipped as public-methodology implementation evidence

## Live source metadata

The live README title is `jobclaw - Simplify Hiring with Smart Agents`. It describes jobclaw as a hiring platform that connects agents on both sides of the recruitment process, manages communication and tasks between hiring and recruiting agents, and supports faster job matching. Relevant source-review signals include Windows 10 installation guidance, 4 GB RAM minimum, installer/release workflow, home-screen options to Create a new hiring project, Manage agent contacts, Track candidates between agents, View messages and tasks, starting a New Project with job role, location, and timeline, adding candidates, assigning tasks to agents, dashboard status updates, chat-like messages, local data storage, secure connections, and topics including react, redux, nodejs, resume, open-source, automation, extension, ai, self-hosted, career, openai, headhunter, cover-letter, job-application, job-search, job-hunting, autonomous-agent, llm, and anthropic.

Those facts are useful source-review context, but they do not change AMC public methodology versioning. jobclaw is a hiring workflow application with agent-adjacent product claims, not an AMC scoring-methodology specification. jobclaw hiring-agent metadata alone cannot justify a public methodology version bump, methodology version, changelog, deprecation notice, or migration guidance because it does not alter AMC scoring semantics, evidence taxonomy, badge semantics, maturity levels, diagnostic question bank, or public methodology contract.

No upstream Python, TypeScript, CSS, JavaScript, Next.js code, installer assets, docs, profiles, job data, candidate data, README prose beyond minimal metadata facts, UI copy, screenshots, package metadata, environment examples, configs, prompts, workflows, task definitions, agent definitions, or implementation details were copied into AMC.

## Relevance decision

`GAP-0921` is relevant only as a public-methodology no-op and source-review boundary. Hiring agents, recruiting agents, job matching, candidate tracking, agent contacts, message/task workflow, OpenAI/Anthropic topic labels, and autonomous-agent topic labels are relevant to Score, Shield, and Watch as market context, but they do not provide an AMC-owned scoring-methodology change.

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed. No public methodology version bump was made.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed; hiring workflow metadata is not methodology-versioning proof. |
| Shield | No new safety methodology claim; source metadata remains fail-closed. |
| Watch | No Watch methodology, monitoring, or drift behavior changed. |
| Enforce | No runtime policy changed. |
| Vault | No jobclaw data, profiles, candidate data, environment files, installer assets, or upstream artifacts stored. |
| Fleet | Hiring-agent workflow context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No employment, HR, privacy, or compliance mapping changed. |

## Product closure

No product code changed. The focused regression documents the live source metadata and asserts that jobclaw metadata remains absent from AMC public methodology semantics and implementation modules.

This closure is a documented skip for implementation: jobclaw, hiring platform, hiring and recruiting agents, Windows 10, 4 GB RAM, Create a new hiring project, Manage agent contacts, Track candidates between agents, View messages and tasks, New Project, job role, location, timeline, candidates, status updates, secure connections, OpenAI, Anthropic, autonomous-agent, job-search, and resume metadata are not public methodology versioning evidence.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, README_EN.md presence, MIT license metadata, Star 14, Fork 1, Pull requests 0, 14 Commits, folder names, file names, branch name, Python 74.9%, TypeScript 23.7%, hiring platform labels, hiring and recruiting agents labels, Windows 10 labels, 4 GB RAM labels, Create a new hiring project labels, Manage agent contacts labels, Track candidates between agents labels, View messages and tasks labels, New Project labels, job role labels, location labels, timeline labels, candidates labels, status updates labels, secure connections labels, OpenAI topic labels, Anthropic topic labels, autonomous-agent topic labels, local backlog metadata, or source identity alone must fail closed for public methodology versioning. Passing public methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, evidence-taxonomy change, and scoring-semantics rationale.

## No-bloat boundary

No jobclaw adapter, hiring workflow module, recruiting-agent module, candidate tracker, agent-contact manager, message/task workflow, installer workflow, Windows app integration, OpenAI wrapper, Anthropic wrapper, resume parser, cover-letter generator, job-search connector, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python, TypeScript, CSS, JavaScript, Next.js code, installer assets, docs, profiles, job data, candidate data, README prose beyond minimal metadata facts, UI copy, screenshots, package metadata, environment examples, configs, prompts, workflows, task definitions, agent definitions, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0921JobclawPublicMethodologyBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the public-methodology implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0921JobclawPublicMethodologyBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0920MultiAgentBenchmarkToolProviderDriftBoundary.test.ts tests/gap0921JobclawPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
