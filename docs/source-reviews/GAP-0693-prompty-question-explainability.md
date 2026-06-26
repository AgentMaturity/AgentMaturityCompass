# GAP-0693 - Prompty question-explainability boundary

- Gap: `GAP-0693`
- Dimension: `eval-score-explainability`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/microsoft/prompty`
- Retrieval: `2026-06-21` via browser access to the live GitHub repository page; shell network remains DNS-restricted in this environment.
- Status: relevant only through existing question-level score explainability; no Prompty format, runtime, trace viewer, or extension integration added.

## Live source metadata

The live GitHub page identifies `microsoft/prompty` as a public repository on branch `main`, with approximately `1.2k stars`, `118 forks`, `8` issues, `7` pull requests, `15` watchers, `1,216 commits`, MIT license, and `9` releases including `0.2.3-beta` from July 24, 2025. The visible language mix includes TypeScript, C#, Python, Rust, MDX, and TypeSpec.

The live page describes `Prompty` as a `.prompty` markdown prompt format and notes the current `v2 Alpha` status. Relevant explainability signals include running a prompt from VS Code, Python, or TypeScript; live preview; a connections sidebar; chat mode; a `.tracy trace file` for inspecting render, parse, execute, process stages with timing and payloads; YAML frontmatter for model config, inputs, and tools; role markers; template syntax; and scoped variable references. These facts identify prompt observability and trace context only. No upstream README prose beyond short metadata facts, code samples, prompt examples, schema files, trace files, screenshots, extension assets, config snippets, package metadata, or implementation details were copied into AMC.

## Relevance decision

Prompty is relevant to AMC as source-review context for question-level score explainability. Prompt-format and trace tooling can help developers debug prompt behavior, but AMC maturity labels still need per-question proof: question ID, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and Score/Shield/Watch surface mapping.

The accepted AMC primitive is already question-score explainability. Prompty repository metadata, `.prompty` format labels, trace-viewer labels, template labels, connection labels, chat labels, language stats, release labels, or prompt examples are not accepted evidence by themselves.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through existing AMC question rows with accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes. |
| Shield | Relevant only when unsupported prompt/tooling claims are rejected with signed evidence and repair guidance. |
| Watch | Relevant only when caller-owned traces, receipts, and threshold results are hash-bound through AMC evidence. |
| Enforce | No prompt runtime, model-connection guardrail, or policy-enforcement change. |
| Vault | No prompt files, model connection secrets, trace payloads, API keys, or secure-storage behavior changed. |
| Fleet | Prompt tooling context only; no Prompty runtime or trust topology was added. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | No compliance mapping or regulated-domain claim. |

## Product closure

GAP-0693 is closed by documenting the source-review boundary and adding regression coverage over the existing `questionScoreExplainability` primitive. The positive path proves that Prompty context can be cited only after AMC-owned question evidence exists. The negative path proves metadata-only source identity fails closed.

No `src/diagnostic/questionScoreExplainability.ts`, `src/guide/guideGenerator.ts`, `src/passport/passportArtifact.ts`, API, CLI, Studio, diagnostic question bank, Passport field, Watch monitor, Prompty parser, `.prompty` schema loader, trace viewer, model-connection adapter, prompt runtime, extension integration, or scoring behavior changed for GAP-0693.

## Fail-closed rule

GitHub repository metadata, v2 Alpha status, `.prompty` format labels, live-preview labels, connections-sidebar labels, chat-mode labels, `.tracy` trace labels, render/parse/execute/process labels, timing/payload labels, YAML frontmatter labels, role-marker labels, template-syntax labels, variable-reference labels, star/fork/issue counts, language stats, MIT license, release labels, local backlog metadata, or source identity alone must fail closed for question-score explainability claims. Passing evidence requires AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed evidence refs, thresholds, row hashes, and no-copy proof.

## No-bloat boundary

No Prompty parser, `.prompty` schema loader, prompt runtime, VS Code extension integration, trace viewer, `.tracy` importer, model-connection adapter, provider connector, YAML frontmatter importer, role-marker parser, template renderer, prompt example importer, package dependency, source-specific question lens, API route, CLI command, Studio panel, Passport field, methodology version bump, or parity layer was added. No upstream README prose beyond short metadata facts, code samples, prompt examples, schema files, trace files, screenshots, extension assets, config snippets, package metadata, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0693PromptyQuestionExplainabilityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
