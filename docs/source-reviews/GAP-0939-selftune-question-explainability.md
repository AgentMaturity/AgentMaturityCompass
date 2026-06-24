# GAP-0939 - selftune question-score explainability boundary

- Gap: `GAP-0939`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `selftune-dev/selftune`, `https://github.com/selftune-dev/selftune`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. Shell `curl` to `api.github.com` was blocked by DNS in this environment, so live verification used the web-accessible GitHub repository page.
- Status: Done

## Live source metadata

The live GitHub repository page showed branch `main`, Star 12, Fork 2, Issues 2, Pull requests 11, 142 Commits, README, code of conduct, contributing, MIT license, and security policy.

Visible folders included `.agent/ skills`, `.claude/ skills`, `.devcontainer`, `.github`, `apps/ local-dashboard`, `assets`, `bin`, `cli/ selftune`, `docs`, `images`, `packages`, `scripts`, `skill`, `templates`, and `tests`. Visible files included `.coderabbit.yaml`, `.gitignore`, `.gitkeep`, `.oxfmtrc.json`, `.oxlintrc.json`, `AGENTS.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `CLAUDE.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE`, `Makefile`, `PRD.md`, `README.md`, `ROADMAP.md`, `Research_trigger_eval.json`, `SECURITY.md`, `SelfTuneBlog_trigger_eval.json`, `bun.lock`, `lefthook.yml`, `lint-architecture.ts`, `llms.txt`, `package.json`, `risk-policy.json`, `tsconfig.json`, and `tsconfig.runtime.json`.

The README title was `selftune` and described Skill-level observability and self-improvement for AI agents. Source-review signals included Claude Code, Codex, OpenCode, Cline, OpenClaw, Pi, zero runtime dependencies, a Before/After image labeled `47% pass rate` to `89% pass rate`, creator lifecycle steps with eval sets, unit tests, replay validation, baseline, community signal review, proposals, and watched improvements.

Relevant commands and lifecycle labels included `selftune verify`, `selftune publish`, `selftune search-run`, `selftune improve`, `selftune run`, `selftune create replay`, `selftune create baseline`, `selftune create report`, `selftune grade baseline`, `selftune watch`, eval generation, unit tests, composability checks, family overlap checks, and external eval import. The README also described Observe, Detect, Evolve, Watch, `Seven real-time hooks`, structured telemetry, eval sets, majority voting, Post-deploy monitoring, automatic backup, auto-rollback, trigger rates, false negatives, and per-invocation-type scores.

The page listed topics including testing, agent, cli, automation, typescript, ai, monitoring, skill, evolution, opencode, devtools, telemetry, grading, developer-tools, eval, observability, codex, bun, llm, and claude-code. It showed 28 releases, latest `v0.2.32` on Apr 15, 2026, Packages 0, TypeScript 99.4%, Shell 0.2%, CSS 0.1%, Makefile 0.1%, Dockerfile 0.1%, and JavaScript 0.1%.

Those facts identify a relevant source-review signal for question-level score explainability, but they are not AMC score proof.

No upstream TypeScript, shell, CSS, Docker, JavaScript, CLI code, skill files, hooks, templates, workflows, config, telemetry schema, eval rows, screenshots, README prose beyond minimal metadata facts, release artifacts, generated outputs, model responses, dashboard assets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0939` is relevant because selftune's skill observability, eval generation, grading, baseline comparison, watched improvement, trigger-rate monitoring, false-negative monitoring, majority voting, and rollback language maps to AMC's existing question-level score explainability requirement: expose why each L0-L5 question moved, which evidence was accepted, which evidence was rejected, which gates were missing, and what repair hint should be followed.

This remains a Score, Shield, and Watch proof boundary, not a selftune integration. The accepted AMC proof is question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, row hash, source refs, and no-copy/no-parity proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through question-level score explainability and eval-score proof only. |
| Shield | Relevant because metadata-only grading or observability claims fail closed before increasing assurance. |
| Watch | Relevant because eval rows, trigger/failure context, thresholds, and repair status must bind to signed evidence before operator views can rely on them. |
| Enforce | No runtime policy changed. |
| Vault | No transcripts, hooks, telemetry rows, eval corpora, config, API keys, or upstream artifacts stored. |
| Fleet | No fleet topology changed. |
| Passport | No passport schema or portable trust-token semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

Added focused regression coverage showing selftune context is accepted only through existing AMC question-score explainability and eval-score pack primitives:

- Positive path: an AMC-owned question report includes question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, CI refs, row hash, and source refs.
- Negative path: selftune repository, README, command, grading, eval, observability, release, topic, language, and source-code metadata alone fails closed without AMC-owned question evidence.
- No-bloat path: source-specific identifiers stay out of diagnostic, guide, and passport implementation modules.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, Watch monitor, Shield verifier, methodology version, badge, diagnostic question bank, or scoring semantics changed.

## Fail-closed rule

Live GitHub repository page reachability, branch `main`, Star 12, Fork 2, Issues 2, Pull requests 11, 142 Commits, MIT license metadata, folder names, file names, README labels, skill observability labels, Claude Code/Codex/OpenCode/OpenClaw platform labels, `47% pass rate`, `89% pass rate`, eval sets, majority voting, Post-deploy monitoring, auto-rollback, command labels such as `selftune verify`, `selftune grade baseline`, `selftune watch`, topics, `v0.2.32`, TypeScript 99.4%, local backlog metadata, or source identity alone must fail closed for question-level score explainability claims.

Passing evidence requires AMC-owned question ID, accepted evidence IDs, rejected evidence reasons, repair hint, signed evidence rows, reproducible eval pack, fail-closed thresholds, CI or lifecycle gate proof, row hashes, source refs, and no-copy/no-parity proof.

## No-bloat boundary

No selftune adapter, skill importer, hook installer, transcript ingester, skill routing optimizer, dashboard integration, telemetry collector, eval corpus importer, SkillsBench importer, baseline runner, package publisher, cron installer, Codex hook wrapper, OpenCode hook wrapper, auto-rollback engine, CLI command, API route, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, package dependency, source-specific implementation module, or source-specific scoring path was added. No upstream TypeScript, shell, CSS, Docker, JavaScript, CLI code, skill files, hooks, templates, workflows, config, telemetry schema, eval rows, screenshots, README prose beyond minimal metadata facts, release artifacts, generated outputs, model responses, dashboard assets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0939SelftuneQuestionExplainabilityBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; question explainability, eval-score pack, metadata-only fail-closed, and implementation leakage checks already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0939SelftuneQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0938RagParamsFinderLiveDriftBoundary.test.ts tests/gap0939SelftuneQuestionExplainabilityBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
