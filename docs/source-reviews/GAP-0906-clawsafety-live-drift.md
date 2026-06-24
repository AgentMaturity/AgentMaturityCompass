# GAP-0906 - ClawSafety live-drift boundary

- Gap: `GAP-0906`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `weibowen555/ClawSafety`, `https://github.com/weibowen555/ClawSafety`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 17, Fork 2, Issues 2, Pull requests 0, 19 Commits, README.md, License, Security policy, No releases published, Packages 0, Python 100.0%, repository folders `docs` and `scenarios/ s2_financial`, and files including `LICENSE`, `README.md`, `SECURITY.md`, `s2_workspace.tar.gz`, and `scenario_template.py`.
- Status: Done

## Live source metadata

The live README identifies ClawSafety: "Safe" LLMs, Unsafe Agents as a safety benchmark for personal AI agents under realistic prompt injection. Relevant source-review signals include personal AI agents, OpenClaw, elevated privileges, leak credentials, redirect financial transactions, destroy files, 120 adversarial test cases, 5 professional domains, 3 injection vectors, 5 harmful action types, 40-75% indirect-injection compliance under some conditions, scaffold effects up to 8.6pp, a 0% ASR boundary for the strongest model on credential forwarding and destructive actions, DevOps exploitability, declarative phrasing bypasses, Software Engineering, Financial Ops, Healthcare, Legal, DevOps, Skill injection, Email injection, Web injection, Data exfiltration, Config modification, Destination substitution, Credential forwarding, Destructive action, 50+ files, 64-turn multi-phase conversation, Scenario S2, scenario templates, email setup, responsible disclosure, MIT License for code, and CC-BY-4.0 for scenario narratives, paper text, and figures.

Those facts are relevant to AMC only as live score and behavior drift context for prompt-injection safety. They do not allow AMC to import ClawSafety scenarios, extract workspaces, run prompt-injection attacks, ingest model ASR tables, use harmful action narratives, mirror responsible-use text, or claim benchmark compatibility. For Score, Shield, and Watch, the relevant AMC requirement remains baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof.

No upstream scenario code, workspace tarballs, scenario narratives, benchmark rows, model result tables, attack cases, email setup instructions, security policy text, paper text, figures, README prose beyond minimal metadata facts, command snippets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0906` is relevant to AMC as a live score and behavior drift alert boundary. Prompt-injection safety can degrade after prompt, scaffold, model, tool, or workspace changes, but AMC should alert only from AMC-owned baseline/live trace distributions and signed evidence.

The closure uses existing AMC Watch live-drift primitives only. It does not add a ClawSafety importer, scenario runner, workspace extractor, prompt-injection generator, model-ASR evaluator, OpenClaw scaffold adapter, email setup flow, web-injection host, security-policy workflow, or source-specific drift monitor.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score distribution changes between baseline and live prompt-injection safety samples. |
| Shield | Relevant when signed evidence proves safety drift instead of trusting benchmark metadata. |
| Watch | Relevant through existing live-drift alert receipts and Watch alert projections. |
| Enforce | No runtime prompt-injection policy or red-team guardrail changed. |
| Vault | No scenario narratives, workspaces, credentials, harmful actions, or benchmark data stored. |
| Fleet | Prompt-injection safety context only; no fleet topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior with synthetic AMC-owned prompt-injection safety baseline and live windows. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof. The negative path proves that GitHub, README, ClawSafety, Safe LLMs, Unsafe Agents, realistic prompt injection, personal AI agents, OpenClaw, elevated privileges, 120 adversarial test cases, 5 professional domains, 3 injection vectors, 5 harmful action types, Skill injection, Email injection, Web injection, 50+ files, 64-turn multi-phase conversation, MIT License, CC-BY-4.0, and source identity alone fail closed without signed live-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, License metadata, Security policy metadata, Star 17, Fork 2, Issues 2, Pull requests 0, 19 Commits, No releases published, Packages 0, Python 100.0%, folder names, file names, MIT License labels, CC-BY-4.0 labels, Safe LLMs, Unsafe Agents labels, realistic prompt injection labels, personal AI agents labels, OpenClaw labels, elevated privileges labels, leak credentials labels, redirect financial transactions labels, destroy files labels, 120 adversarial test cases labels, 5 professional domains labels, 3 injection vectors labels, 5 harmful action types labels, 40-75% labels, 8.6pp labels, 0% ASR labels, Software Engineering labels, Financial Ops labels, Healthcare labels, Legal labels, DevOps labels, Skill injection labels, Email injection labels, Web injection labels, Data exfiltration labels, Config modification labels, Destination substitution labels, Credential forwarding labels, Destructive action labels, 50+ files labels, 64-turn multi-phase conversation labels, local backlog metadata, or source identity alone must fail closed for live drift. Passing live-drift proof requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, source refs, row hashes, and Watch alert proof.

## No-bloat boundary

No ClawSafety importer, scenario runner, workspace extractor, prompt-injection generator, model-ASR evaluator, OpenClaw scaffold adapter, email setup flow, web-injection host, sandbox provisioner, Docker setup, security-policy workflow, source-specific Watch monitor, API route, CLI command, Studio panel, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream scenario code, workspace tarballs, scenario narratives, benchmark rows, model result tables, attack cases, email setup instructions, security policy text, paper text, figures, README prose beyond minimal metadata facts, command snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0906ClawSafetyLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the live-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0906ClawSafetyLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0905AwesomeOpenClawPublicMethodologyBoundary.test.ts tests/gap0906ClawSafetyLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
