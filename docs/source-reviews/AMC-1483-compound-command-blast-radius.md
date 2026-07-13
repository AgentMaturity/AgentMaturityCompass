# AMC-1483 - Compound-command blast radius

- Issue: `AMC-1483`
- Dimension: bounded shell decomposition and fail-closed action blast radius
- AMC surfaces requested: Enforce, Watch evidence, provider hook control, Docs
- Sources reviewed: [AgentApprove changelog](https://www.agentapprove.com/changelog) and [Prevent destructive actions](https://www.agentapprove.com/use-cases/prevent-destructive-actions)
- Retrieval: live first-party pages reviewed 2026-07-13
- Status: Implemented and locally release-verified; publication verification pending

## Relevance decision

This item is directly relevant. AMC already had provider-native pre-tool control, signed ToolHub action classes, Action and Approval Policy checks, corrective steer, immutable receipts, and a basic execution guard. The hook path reduced each shell call to one generic `process.spawn` request, however, so a compound call could hide a more consequential later segment and a known `git.push` could lose its existing `DEPLOY` class.

The AgentApprove changelog response was retrieved with SHA-256 `6fe500c3269870bb47fd9bb0967dc02801bd79c06ed36756c30ddeb2e5c44639`. Its relevant product signal is quote-aware review of compound shell commands as distinct actions. The destructive-action use-case response was retrieved with SHA-256 `3fcdece3f0682489d27cd9e5f1a59cc3481eac8835abb3de12ca7bb34fda9ed1`. Its relevant product signal is presenting the full action blast radius before consequential execution.

AMC takes only those product lessons. It retains AMC-owned syntax bounds, canonical tools, action classes, signed authorities, decision semantics, provider mappings, receipt format, privacy boundary, and fail-closed behavior.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, maturity, diagnostic, or methodology change. |
| Shield | No detector, attack pack, or threat score change. |
| Enforce | Primary. Every supported shell segment is evaluated through existing signed ToolHub and policy controls before one aggregate outcome is materialized. |
| Vault | Raw commands and argument values remain transient and are excluded from signed evidence. |
| Watch | The existing audit event carries a bounded privacy-safe review under the same receipt and integrity chain. |
| Fleet | No orchestration, topology, or fleet policy change. |
| Passport | The review is not a portable trust claim or badge input. |
| Comply | No framework mapping, retention schedule, or compliance claim changes. |

## Product closure

- Replaced the private simple-command parser with one shared bounded parser used by provider hook control and `checkExec`.
- Recognizes `&&`, `||`, pipe, semicolon, and newline outside quotes while preserving quoted and escaped literal values.
- Rejects substitution, expansion, redirection, grouping, background execution, malformed separators, unsupported pathname expansion, overlong input, excess segments, and excess tokens before returning any segment.
- Maps recognized Git status, commit, and push segments to their existing `READ_ONLY`, `WRITE_LOW`, and `DEPLOY` ToolHub definitions. Git global options fail closed to steer, unknown aliases are conservatively classified as `DEPLOY`, and other bounded binaries remain existing `process.spawn` requests.
- Verifies all signed authorities before exposing step results, evaluates every segment through existing controls, and applies `deny`, then `steer`, then `ask`, then `allow` precedence.
- Seals the review in the existing version 2 control audit event and returns it additively from the existing hook route. Immutable version 1 evidence remains verifiable.
- Corrected ToolHub workspace-root normalization so an explicit `./**` allow pattern includes the root it declares.

## Fail-closed rule

Missing or invalid signed Action Policy, Approval Policy, ToolHub config, or budget policy returns an untrusted aggregate deny with zero partial steps. Invalid or unsupported shell syntax returns zero parsed segments. A missing canonical tool, rejected arguments, denied action class, unsupported approval quorum, internal evaluation failure, provider capability gap, replay conflict, receipt failure, or ledger tamper cannot become allow.

The stored review contains only schema status, trust status, segment count, connector, canonical tool name, action class, outcome, stable reason code, aggregate counts, and decisive step index. It explicitly records `rawCommandStored: false` and `argumentValuesStored: false`. The raw command, arguments, provider payload, paths, branch names, secrets, and outputs are not stored.

## No-bloat boundary

No shell runtime, executor, second parser, policy engine, tool registry, approval queue, database, route, command, Studio page, methodology version, scoring rule, receipt kind, provider subsystem, or source-specific adapter was added.

No competitor code, parser, schema, policy rule, configuration, examples, tests, prose, screenshots, visual assets, generated output, or implementation details were copied.

## Verification

- Expected red: the dedicated contract failed because `src/enforce/shellCommandPlan.ts` did not exist.
- Security-boundary red: unquoted pathname expansion initially parsed; the parser was tightened to reject runtime-expanded arguments.
- Dedicated contract passes 10 tests covering parser semantics and bounds, invalid provider input, hidden destructive segments, action-class preservation, conservative Git alias/global-option handling, aggregate precedence, Claude/Gemini capability mapping, privacy, replay, tamper, untrusted authorities, and public documentation.
- Combined hook-control, provider-mapping, lifecycle, onboarding, and Enforce regression passes 7 files / 107 tests.
- Focused coverage over the shared parser and execution guard reaches 91.21% statements, 85.47% branches, 100% functions, and 93.6% lines.
- Typecheck, clean build, OpenAPI parse, console JavaScript syntax, architecture boundaries, signed policy fixtures, 1,502-file Docs drift, and zero-vulnerability runtime audit pass.
- The full release gate passes 1,079 files / 8,553 tests, CLI/domain smoke, and all isolated install personas. After the final regression was added, the exact final tree independently passes 1,079 files / 8,554 tests.
- Full local release receipt `tmp/release-gate/amc-1483-precommit.json` passes with SHA-256 `5eda586d98dfed986ca6b25e74b2d224056002457204fdc864ccf22df268ba67`.
- Exact-final-tree quick receipt `tmp/release-gate/amc-1483-final.json` passes syntax, OpenAPI, typecheck, build, adversarial regression, command inventory, architecture, Docs drift, runtime audit, and CLI/domain smoke with SHA-256 `7ec949d0fcd2d065cf906d4f82755edbfa80398f090abb55ba1521efc3e0dfb4`. It skips only the full suite and install personas already covered by the stronger runs; live-deploy health is correctly deferred until publication.
- Current website, README, contribution guide, launch copy, internal positioning, and whitepaper proof surfaces now report 1,079 files / 8,554 tests. The drift regression rejects the prior 8,544 count; the AMC-1483 plus public-stats slice passes 2 files / 13 tests, website JavaScript syntax passes, and Docs drift still passes over 1,502 files.
- Exact-SHA CI and production publication verification will be recorded after the implementation commit is pushed.
