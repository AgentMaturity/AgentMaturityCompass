# AMC-1473 - signed control version activation and rollback

- Issue: `AMC-1473`
- Dimension: control version integrity, activation safety, rollback safety, and operator clarity
- AMC surfaces requested: Enforce, Watch, Vault, Fleet, Passport, Comply, Studio, CLI, API, Docs
- Source reviewed: first-party Agent Control and AgentApprove/AEP material pinned by the competitive review
- Retrieval: public sites and repositories reviewed 2026-07-10; implementation review 2026-07-11
- Immutable source commits: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`; Agent Event Protocol `2583cff9380f8f0a459d52c7112b6105c46496ed`
- Status: Done - implemented, release-verified, published, and production-verified

## Relevance decision

The source signal is relevant because Agent Control makes versioned control changes easy to inspect and AgentApprove makes high-risk operator actions explicit. AMC already owned the stronger underlying primitives: strict Enforce resource manifests, signed snapshots, validation gates, apply and restore receipts, artifact signatures, CLI/API routes, and a Studio evidence panel. The correct closure is to make those primitives one trustworthy lifecycle, not to add a source-specific version store, policy editor, or compatibility layer.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring, maturity, question, weight, or badge change. Active resource versions remain evidence references only. |
| Shield | Tampered manifests, snapshots, signatures, symlinks, and resource bytes fail closed before mutation. |
| Enforce | Owns strict manifests, active/previous/rollback state, drift, activation, rollback, gates, and receipts. |
| Vault | Existing auditor keys sign manifests, snapshots, and successful lifecycle receipts; unsigned state is not active. |
| Watch | Status exposes bounded drift and integrity reasons without creating a telemetry store. |
| Fleet | Every selector is bound to the selected normalized agent; cross-agent manifests are rejected. |
| Passport | No Passport is issued, but signed version and receipt references remain available to existing proof flows. |
| Comply | No framework mapping changes; successful signed lifecycle receipts remain audit evidence. |

## Product closure

- Added strict manifest schema, resource count, duplicate ID/path, resource hash, manifest ID, signature, workspace, agent, contained-path, physical-path, and symlink checks.
- Added one status projection with `NOT_INITIALIZED`, `ACTIVE`, `DRIFTED`, or `BLOCKED`, plus signed active, previous, rollback target, pending diff, integrity reasons, and one next action.
- Bound active, previous, and rollback references to detached signed snapshots whose bundle manifest and every resource digest verify before projection.
- Added per-agent lifecycle locking and staged snapshot publication. Resource copies are digest-verified before active state changes.
- Made activation use one locked proposal and current-resource digest. Remote activation requires the exact preview `currentManifestId`; stale confirmation fails.
- Made rollback verify the selected canonical signed manifest, detached signed snapshot, bundle manifest equality, mutable boundary, and every selected resource digest before writes. It rechecks state, stages writes, post-verifies resources and the activated manifest, and restores prior bytes on failure.
- Made rollback remove mutable resources that exist only in the active version so the restored bytes and active manifest cannot diverge.
- Made successful apply and rollback receipts strictly signed. Failed integrity operations remove partial receipts and do not emit a success receipt.
- Added `amc resource status`; `amc resource activate` is an alias of dry-run-first apply. CLI diff now accepts canonical signed manifests only and lifecycle JSON uses bounded relative paths.
- Added bounded status, verify, apply, and rollback API/OpenAPI contracts. Owner mutations require exact manifest confirmation; all resource responses remove absolute workspace paths.
- Updated Studio's Enforce proof panel to show the shared lifecycle state and provide exact-confirmed activate and rollback actions. Uninitialized and drifted states no longer issue avoidable failing proof requests in the browser.

## Fail-closed rule

AMC rejects missing, malformed, hash-invalid, ID-invalid, count-invalid, duplicate, unsigned, scope-mismatched, noncanonical, outside-workspace, cross-agent, symlinked, missing-snapshot, snapshot-manifest-mismatched, snapshot-signature-invalid, resource-digest-invalid, stale-confirmation, concurrent-state, and busy-lock conditions. `force` cannot bypass these hard integrity failures. Drift is visible but never labeled active implicitly.

## Privacy boundary

Public API and CLI lifecycle projections expose agent IDs, content hashes, bounded status/reason enums, resource-relative paths, workspace-relative artifact references, counts, timestamps, and signed receipt references. They exclude absolute local paths, workspace roots, resource contents, secrets, credentials, provider payloads, and raw errors.

## No-bloat boundary

No competitor code, prose, examples, schemas, mappings, prompts, screenshots, configuration, UI assets, or generated output was copied. No Agent Control adapter, AEP version store, second manifest database, second receipt store, policy language, background daemon, scheduler, or source-specific subsystem was added. The implementation extends the existing Enforce resource manifest and lifecycle receipt ownership boundary.

## Verification

- Expected-red reproduction proved that a signature-invalid manifest could report `valid: true` and a tampered snapshot resource could be restored before this change.
- Dedicated contract and compatibility slice passes 5 files / 25 tests: `tests/amc1473SignedControlLifecycle.test.ts`, `tests/enforce/resourceManifest.test.ts`, `tests/fixerRca.test.ts`, `tests/governedOptimizer.test.ts`, and `tests/apiLifecycleEvidence.test.ts`.
- The focused slice covers strict manifest identity/hash/count/duplicate checks, tamper rejection, detached snapshot verification, cross-agent and symlink containment, force boundaries, stale confirmation, rollback removal/recovery, signed receipts, immutable rollback pointers, real CLI behavior, bounded API output, Studio parity, and generated/published OpenAPI contracts.
- `npm run typecheck`, `node --check src/console/assets/app.js`, `npm run build`, `npm run check:architecture-boundaries`, and `npm run check:docs-drift` pass. Architecture counts remain within policy at CLI 24,376 lines and Studio server 8,870 lines; docs drift scanned 1,491 files.
- Full Vitest passes at 1,069 files / 8,455 tests. The final release receipt at `tmp/release-gate/amc-1473-final.json` passed syntax, OpenAPI parse, typecheck, adversarial regression, full Vitest, build, 1,155-path CLI inventory, architecture, docs drift, zero-vulnerability runtime audit, CLI/domain smoke, and isolated install-persona QA.
- Desktop packaging and verification pass for package version `1.1.1` across macOS Universal, Windows x64, and Linux x64. The final macOS archive SHA-256 is `6005ab201943bb0f2e5bc9da1d6fdb2b8f58531dd3bcb268dc5ec3ca58621c25`; Windows is `55d5647677ecf9362fb251af363fb1ff0cf4592fa004d8b9488250641446a853`.
- Playwright passes 55 tests with 2 established i18n skips. A live disposable Studio run exercised snapshot, drift, exact-confirm activation, previous-version projection, exact-confirm rollback, and verification at 1280x720 and 390x844 with no overflow, button overlap, failed responses, console/page errors, or absolute workspace-path leakage.
- Implementation commit `601395c9d2258d7746c659ff5fc658ccda14765e` is pushed to synchronized `main` / `origin/main`.
- Exact-head workflows passed: CI `29162654316`, npm validation `29162654336`, Docker Runner Image `29162654309`, and Pages `29162654323`. CI passed Node 20/22, Helm, local E2E, security, Docker smoke, architecture, and release smoke; npm validation passed full Vitest, build, and prepack guardrails.
- Production `docs/content-manifest.json` reports exact source revision `601395c9d2258d7746c659ff5fc658ccda14765e` and 170 guides. The homepage exposes 1,155 CLI paths and 8,455 tests; public OpenAPI exposes status, verify, apply, and rollback paths.
- `https://agentmaturity.co/` returns HTTP 200 and `https://www.agentmaturity.co/` redirects to the apex. The valid Let's Encrypt certificate covers both names from 2026-06-26 through 2026-09-24.
- Production desktop and 390x844 mobile checks passed without overflow, failed responses, console errors, or page errors. Post-deploy quick release gate with live HTTP health passed at `tmp/release-gate/amc-1473-live.json`.
