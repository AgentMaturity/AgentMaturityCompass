# AMC-1475 - bounded nested Action Policy evidence logic

- Issue: `AMC-1475`
- Dimension: policy authoring, evidence alternatives, signed mutation, and operator clarity
- AMC surfaces requested: Enforce, Score, Shield, Watch, Studio, CLI, API, Docs
- Source reviewed: [Agent Control controls](https://docs.agentcontrol.dev/concepts/controls), [Agent Control quickstart](https://docs.agentcontrol.dev/core/quickstart), and [Agent Control repository](https://github.com/agentcontrol/agent-control)
- Retrieval: live first-party docs and immutable repository source reviewed 2026-07-11
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Implemented and locally verified; commit, publication, and production proof pending

## Relevance decision

Recursive condition authoring is relevant because AMC's signed Action Policy previously supported only an implicit conjunction of declared maturity and assurance requirements. A bounded alternative evidence path can make legitimate policy intent easier to express and review.

The source's selector/evaluator condition model is not an AMC runtime primitive. AMC therefore implements only a strict tree over requirement IDs already owned by the selected Action Policy rule.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Existing maturity requirements can be grouped; scoring, weights, levels, and methodology do not change. |
| Shield | Existing assurance-pack requirements can be grouped; no new pack, detector, or evaluator exists. |
| Enforce | Owns the canonical tree, production evaluation, signed compile/apply transaction, CLI, API, and Studio builder. |
| Vault | Existing auditor key signs the same Action Policy artifact; no new key or secret store exists. |
| Watch | Existing transparency and ledger primitives record successful mutation; no telemetry store exists. |
| Fleet | Action Policy remains workspace-wide. No per-agent or provider scope is introduced. |
| Passport | No Passport schema or trust-token change. Existing audit proof can reference policy hashes. |
| Comply | No framework mapping change. Signed policy and evidence remain available to existing binders. |

## Product closure

- Added one strict `gate` / `all` / `any` AST over declared maturity and assurance requirements.
- Added exact coverage, family isolation, depth/node/child/byte bounds, deterministic canonicalization, full-branch fail-closed evaluation, and blocker-only denial reasons.
- Kept signature/trust, trust tier, sandbox, ticket, budget, freeze, work-order, and `allowExecute` gates outside the tree.
- Preserved implicit all-requirements semantics for every existing rule without `evidenceLogic`.
- Added read-only inspection/compile and exact-confirm signed apply with explicit alternative acknowledgement, one shared lock across every canonical Action Policy writer, final baseline compare-and-swap, comment-preserving YAML-node mutation, write-ahead recovery retained until both rollback stores are durable, rollback compensation, transparency evidence, and ledger receipt.
- Encoded legacy policy requirement IDs that do not fit the public grammar as deterministic bounded opaque gate IDs without changing their underlying Action Policy keys.
- Added CLI, authenticated API, Studio visual grouping, generated/public OpenAPI, control projection, simulation explanation, and adoption docs. Studio fails closed to read-only for valid deeper trees that its compact builder cannot round-trip.

## Fail-closed rule

AMC rejects unknown fields, mixed node shapes, `not`, arbitrary selectors/evaluators, empty or single-child groups, duplicate or undeclared gates, omitted requirements, cross-family alternatives, oversized trees, untrusted or changed policy bytes, stale confirmation, missing acknowledgement, busy locks, signing failures, failed post-write verification, and incomplete evidence finalization. Missing runtime gate results evaluate false.

## Privacy boundary

Public inspection, preview, and apply responses contain action class, gate IDs and labels, canonical logic, compile IDs, booleans, and hashes. They exclude policy bodies, absolute paths, workspace roots, credentials, signing material, prompts, tool payloads, provider payloads, and competitor content.

## No-bloat boundary

No competitor code, prose, examples, schemas, policies, selectors, evaluators, regex, step names, mappings, screenshots, configuration, UI assets, or generated output was copied. No `not`, payload query language, custom evaluator, policy database, second runtime evaluator, provider adapter, compatibility layer, daemon, scheduler, marketplace, or source-specific subsystem was added. AMC's unused legacy Safety DSL and ABAC helper were not expanded or presented as effective signed controls.

## Verification

- Expected-red failed only because the AMC-owned implementation module did not exist.
- An independent adversarial audit found eight concrete transaction, locking, clean-checkout, compatibility, OpenAPI, explanation, and release-runner defects. Every finding was reproduced, fixed with focused coverage, and independently re-reviewed with no remaining findings.
- Dedicated AMC-1475 coverage passes 12 tests; the latest Action Policy, governor, API, OpenAPI, Studio, release-runner cross-surface slice passes 10 files / 108 tests.
- Schema coverage includes strict node shapes, exact gate coverage, duplicate and undeclared rejection, same-family alternatives, child/depth/node/gate-ID/byte bounds, hostile deep input preflight, deterministic canonicalization, complete branch explanation, and unknown-gate failure.
- Transaction coverage includes legacy implicit-ALL and opaque-ID compatibility, mandatory gate preservation, read-only deterministic preview, exact-byte semantic no-op, exact-confirm apply, alternatives acknowledgement, shared-writer exclusion, final compare-and-swap, stale/tampered/race rejection, comment preservation, policy/evidence rollback, signature verification, transparency/ledger binding, API roles, read-only trust mode, CLI parity, and path redaction.
- Generated and public OpenAPI publish exact bounded response sets and pass recursive AJV validation. The public OpenAPI 3.0.3 document uses compatible nullable schemas and advertises the enforced 60-gate ceiling. Studio invalidates stale previews, is single-flight, requires exact confirmation and acknowledgement, uses no generic confirm dialog, and makes deeper trees read-only when the compact builder cannot round-trip them.
- Browser QA passes 55 Playwright tests with 2 intentionally conditional i18n cases skipped. A stale 171-guide assertion was corrected to the verified 172-guide artifact.
- Authenticated disposable-workspace Studio proof passed signed OWNER login, four-gate preview, exact-confirm apply, transparency hash `9fc2ce3ab15429cd906340b3daa6253cb5f190bc2acd690bce2bec5aedc33fc0`, audit event `b61873ac-2a92-4530-a201-a8acfa322b19`, 1280px/390px overflow checks, and zero console, page, failed-request, or 4xx responses.
- That proof exposed and closed an existing Studio authorization defect: signed human workspace roles can now read `/agents/:id/status`, while agent tokens remain ID-scoped. The server-level regression passes in `tests/studioVaultModeLoop.test.ts`.
- `npm run typecheck`, `npm run build`, `node --check`, public OpenAPI parsing, architecture boundaries at 24,380 CLI lines / 8,874 Studio lines, and 1,493-file Docs drift pass.
- Full Vitest passes directly and inside the consolidated gate at 1,071 files / 8,481 tests. The public command inventory contains 1,163 paths and the same-origin Docs artifact contains 172 guides.
- `tmp/release-gate/amc-1475-final.json` records the final post-audit passed consolidated gate: syntax, executable OpenAPI contracts, typecheck, clean build before `dist`-dependent tests, adversarial regression, 1,071 files / 8,481 Vitest tests, 1,163-command inventory, architecture, 1,493-file Docs drift, zero runtime dependency vulnerabilities, CLI/domain smoke, and all 10 isolated install personas at 10/10.
- Release-gate timeout handling now uses asynchronous child processes, kills the whole process group from the timeout callback, records explicit timeout errors, builds before tests that use `dist`, and invokes Vitest directly after that build. This keeps clean checkouts valid and prevents a timed-out child from deleting `dist` or corrupting downstream checks.
- Final post-audit packaging and archive verification pass for macOS universal, Linux x64, and Windows x64. The npm tarball SHA-256 is `fa4f2d16decc32f7dd82d7feccecb9a5d9aca16ab09d4ea9810d3b0b682c02d5`.
