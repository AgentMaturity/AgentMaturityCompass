# AMC-1474 - reusable action-class scope templates

- Issue: `AMC-1474`
- Dimension: policy reuse, bounded authoring, signed mutation, and operator clarity
- AMC surfaces requested: Enforce, Fleet, Watch, Studio, CLI, API, Docs
- Source reviewed: [Agent Control controls](https://docs.agentcontrol.dev/concepts/controls), [Agent Control repository](https://github.com/agentcontrol/agent-control), and the existing AMC competitive review
- Retrieval: live first-party docs and immutable repository source reviewed 2026-07-11
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Shipped and production verified

## Relevance decision

The source signal is relevant because reusable scope and template UX reduces control-authoring friction. AMC already owns the runtime vocabulary and stronger integrity primitives: nine action classes, built-in Policy Packs, signed Action and Approval Policies, one verified control projection, atomic writes, file locks, transparency evidence, and ledger receipts.

The AMC-native closure is a small immutable action-class catalog and deterministic selected-rule compiler. It does not reproduce Agent Control's step types, step names, regular expressions, template parameters, evaluator model, bindings, API, or storage.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score, maturity, question, weight, badge, or methodology change. |
| Shield | Malformed, duplicate, incomplete, unsigned, tampered, stale, or raced policy state fails closed. |
| Enforce | Owns the catalog, selected-rule compiler, exact confirmation, signed write, rollback, CLI, API, and Studio flow. |
| Vault | Existing auditor keys sign the same Action and Approval Policy artifacts; no new secret or key store exists. |
| Watch | Existing transparency and ledger evidence record a successful apply; no new telemetry store exists. |
| Fleet | Workspace policies remain fleet-wide. The product explicitly rejects any per-agent or per-environment claim. |
| Passport | No Passport schema or trust-token change. Existing audit evidence can reference policy hashes. |
| Comply | No framework mapping change. Signed policy and audit evidence remain available to existing binders. |

## Product closure

- Added four AMC-owned templates that partition the existing nine action classes without overlap.
- Added deterministic compilation from one built-in Policy Pack into the current signed Action and Approval Policy baselines.
- Selected rules come from the pack; every unselected rule and policy-level default remains unchanged.
- Preview creates no files or evidence and returns a content-bound compile ID, per-class change booleans, and policy hashes without returning policy bodies.
- Apply requires the exact current compile ID, rechecks state under the existing control lock, writes through existing atomic helpers and signers, post-verifies both policies, and restores prior bytes on write/sign/verify failure.
- Semantic no-ops write no policy and no success evidence. Successful apply uses existing transparency and ledger receipt primitives.
- Added CLI list/compile/apply, authenticated API routes, generated/public OpenAPI, Studio Policy Packs controls, and control-projection template attribution.

## Fail-closed rule

AMC rejects unknown templates, unknown Policy Packs, missing or symlinked baselines, invalid signatures, malformed schemas, duplicate action rules, incomplete selected scopes, changed baseline bytes, stale compile confirmation, busy locks, write/sign failures, and failed post-write verification. Remote apply also rejects invalid signed identity or trust configuration.

## Privacy boundary

Public output is limited to AMC template/pack identifiers, selected action classes, workspace scope, the fleet-wide boundary, compile IDs, booleans, hashes, bounded reason codes, transparency hashes, and audit event IDs. It excludes raw policy bodies, absolute paths, workspace roots, secrets, credentials, signing material, prompts, tool inputs, and provider payloads.

## No-bloat boundary

No competitor code, prose, examples, schemas, mappings, prompts, policies, screenshots, configuration, UI assets, or generated output was copied. No template database, user-defined template language, regex or step-name selector engine, policy DSL, evaluator, per-agent policy override, daemon, scheduler, marketplace, importer, compatibility layer, or source-specific subsystem was added.

## Verification

- Expected-red contract initially failed only because `src/enforce/scopeTemplates.ts` did not exist.
- Focused scope/projection slice passes at 2 files / 21 tests; the wider API, public-count, docs-artifact, onboarding, and desktop contract slice passes at 7 files / 47 tests.
- The focused contract covers catalog partitioning, bounded metadata, read-only deterministic compile, selected/unselected preservation, exact candidate bytes, signed apply, transparency/ledger evidence binding, stale confirmation, signature/trust tamper, malformed/duplicate/incomplete policies, semantic no-op, Vault-locked rollback, writer contention, CLI, API roles/errors/read-only mode, generated/public OpenAPI status sets and schema validation, Studio exact confirmation/single-flight invalidation, projection attribution, unique provenance, path redaction, adoption docs, and no-copy boundaries.
- `node --check src/console/assets/app.js`, public OpenAPI YAML parse, `npm run typecheck`, `npm run build`, `npm run check:architecture-boundaries`, and `npm run check:docs-drift` pass.
- Full Vitest passes at 1,070 files / 8,468 tests. Full Playwright passes 55 with two intentionally conditional i18n cases skipped. Desktop packaging and verification pass for macOS universal, Linux x64, and Windows x64.
- Authenticated disposable-workspace Studio proof passed real preview and apply with exact confirmation, transparency and ledger IDs, 1280px and 390px overflow checks, and zero console, page, or failed-network errors.
- `tmp/release-gate/amc-1474-final.json` records a passed full release gate, including a second 1,070-file / 8,468-test run, zero runtime dependency vulnerabilities, architecture/docs checks, CLI/domain smoke, and install-persona QA.
- Implementation commit `6a86dc849a23eb5b0c3af2b190d3081bf93442cb` is pushed to `main`. Exact-SHA CI (`29165525358`), Docker Runner Image (`29165525363`), Pages (`29165525377`), and npm validation (`29165525386`) completed successfully.
- Production publishes exact source revision `6a86dc849a23eb5b0c3af2b190d3081bf93442cb`, 171 public guides, `SCOPE_TEMPLATES` at 3,612 bytes with SHA-256 `c4d73b5e2412280489d92e5b5cb74803dda94544c860cf18776581d3b022e8d3`, 1,159 CLI paths, 8,468 tests, the three scope-template OpenAPI paths, and the current Enforce command copy.
- Desktop and 390px production-browser checks passed the homepage and `docs/#SCOPE_TEMPLATES` with HTTP 200, expected guide content, no horizontal overflow, and zero console, page, or failed-network errors.
- The apex returns HTTP 200 and `www` returns HTTP 301 to the apex. The Let's Encrypt certificate verifies with return code 0, covers both hostnames, and is valid from 2026-06-26 through 2026-09-24.
- `tmp/release-gate/amc-1474-live.json` records a passed quick live release gate at 2026-07-11T19:54:14.155Z, including typecheck, focused adversarial regression, build, architecture/docs checks, zero runtime dependency vulnerabilities, CLI/domain smoke, and live HTTP 200.
