# GAP-0917 - PocketFlow-Zig live-drift boundary

- Gap: `GAP-0917`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `The-Pocket/PocketFlow-Zig`, `https://github.com/The-Pocket/PocketFlow-Zig`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 15, Fork 1, Pull requests 0, 28 Commits, README.md, Contributing, MIT license, Security, repository folders `.github/ workflows`, `docs`, `examples`, and `src`, files `.gitignore`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `README.md`, `SECURITY.md`, `build.zig`, and `build.zig.zon`, Releases 2, latest release `v0.3.1` on Jan 26, 2026, Packages 0, and Zig 100.0%.
- Status: Done

## Live source metadata

The live README identifies PocketFlow-Zig as a Zig implementation of PocketFlow, a minimalist flow-based programming framework for building LLM-powered workflows. Relevant source-review signals include Compile-time polymorphism, Explicit memory management, Thread-safe context, Zero dependencies, Node-based architecture, type-erased node interfaces, Flow execution engine, Ollama integration, Action-based routing, node prep/exec/post phases, document_generator.zig examples, Zig 0.15.0 or later, and optional Ollama for LLM integration.

Those facts are relevant to AMC only through existing Watch live score and behavior drift receipts. PocketFlow-Zig shows why workflow and routing changes, local LLM integrations, thread-safe context behavior, node execution, and generated document examples need baseline distribution, live sample, drift statistic, and alert receipt proof before Score, Shield, or Watch can accept live drift claims.

No upstream Zig code, build files, package hashes, vtable implementation details, README prose beyond minimal metadata facts, examples, document generation flows, API reference text, installation commands, release contents, changelog entries, security policy text, or implementation details were copied into AMC.

## Relevance decision

`GAP-0917` is relevant to AMC as a Watch live-drift boundary. The source maps to Score, Shield, and Watch through generic AMC drift receipts, not through a PocketFlow-Zig runtime or Zig package dependency.

The closure uses existing `runLiveScoreBehaviorDrift`, `verifyLiveDriftReceipt`, and `buildLiveDriftWatchAlerts` behavior. It does not add a PocketFlow-Zig adapter, Zig runtime, flow engine, node runner, Ollama client, document generator, package dependency, source-specific Watch monitor, or source-specific scoring implementation.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score distribution drift over signed baseline and live rows. |
| Shield | Relevant because missing signed evidence fails closed before accepting live behavior drift. |
| Watch | Relevant through drift statistics, alert receipts, and Watch alert projection. |
| Enforce | No runtime policy changed. |
| Vault | No PocketFlow-Zig source, build files, generated content, or LLM outputs stored. |
| Fleet | Agent/workflow framework context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing Watch live-drift primitives with a synthetic AMC-owned PocketFlow-Zig-style baseline and live window. The positive path requires baseline distribution, live sample, drift statistic, alert receipt, source refs, signed evidence refs, and Watch alert projection. The negative path proves that PocketFlow-Zig, minimalist flow-based programming framework, LLM-powered workflows, Compile-time polymorphism, Explicit memory management, Thread-safe context, Zero dependencies, Node-based architecture, Flow execution engine, Ollama integration, Action-based routing, document_generator.zig, GitHub metadata, and README labels alone fail closed without signed live-drift evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 15, Fork 1, Pull requests 0, 28 Commits, folder names, file names, Releases 2, `v0.3.1`, Jan 26, 2026, Packages 0, Zig 100.0%, minimalist flow-based programming framework labels, LLM-powered workflows labels, Compile-time polymorphism labels, Explicit memory management labels, Thread-safe context labels, Zero dependencies labels, Node-based architecture labels, Flow execution engine labels, Ollama integration labels, Action-based routing labels, document_generator.zig labels, local backlog metadata, or source identity alone must fail closed for live drift. Passing live-drift evidence requires baseline distribution, live sample, drift statistic, alert receipt, signed evidence refs, row hashes, and Watch alert proof.

## No-bloat boundary

No PocketFlow-Zig adapter, Zig runtime, flow execution engine, node runner, vtable interface, thread-safe context implementation, Ollama client, document generator, `zig fetch` wrapper, build.zig integration, build.zig.zon dependency, release importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Zig code, build files, package hashes, vtable implementation details, README prose beyond minimal metadata facts, examples, document generation flows, API reference text, installation commands, release contents, changelog entries, security policy text, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0917PocketFlowZigLiveDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the live-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0917PocketFlowZigLiveDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0916AiSecListsPublicMethodologyBoundary.test.ts tests/gap0917PocketFlowZigLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
