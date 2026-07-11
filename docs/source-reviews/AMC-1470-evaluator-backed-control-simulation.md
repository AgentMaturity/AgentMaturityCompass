# AMC-1470 - evaluator-backed control simulation

- Issue: `AMC-1470`
- Dimension: control explainability and safe preview
- AMC surfaces requested: Enforce, Watch, Vault, Studio/API/CLI, Docs
- Source reviewed: first-party control-model material and repository already pinned by the competitive review
- Retrieval: public material reviewed 2026-07-10; implementation review 2026-07-11
- Immutable source commit: `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Verified locally; publication pending

## Relevance decision

The source signal is relevant because AMC already owns several signed control evaluators but lacked one simple, non-mutating way to answer what a selected control would do and why. The gap maps directly to existing Enforce and Watch behavior. It does not justify a new policy language, evaluator, store, editor, or compatibility layer.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring or methodology semantic change. |
| Shield | Runtime Firewall matches may identify Shield-owned prompt-injection conditions; no new Shield engine. |
| Enforce | Primary surface. Existing evaluators return the previewed outcome and exact conditions. |
| Vault | Raw input and secrets are excluded; only a SHA-256 input digest is returned. |
| Watch | Simulation explains runtime matches but creates no Watch event or receipt. |
| Fleet | Existing agent identity can supply action context; no Fleet subsystem change. |
| Passport | Simulation is explicitly not portable proof. |
| Comply | Exact reasons support later audit review, but simulation itself is not compliance evidence. |

## Product closure

`amc policy simulate <controlId> [--json]` and `POST /api/v1/policy/simulate` expose one schema-versioned result for the three control families introduced by AMC-1469.

- Runtime controls call `evaluateRuntimeFirewall` with `record: false`.
- Action controls call `runGovernorCheck`, which invokes `evaluateActionPermission`; that evaluator now returns structured condition results on both runtime and simulation paths.
- Approval controls call `evaluateApprovalRequestPolicy`; real approval-request creation calls the same pure function before persisting a request.
- The result carries exact matched rule and control IDs, structured conditions, safe outcome, source integrity, input hash, and explicit non-proof flags.
- POST authorization is classified as a human-role analysis operation, not a policy mutation.

## Fail-closed rule

Missing, malformed, unsigned, or tampered Runtime Firewall or Guardrails evidence yields `BLOCK`. Untrusted Action Policy state yields `SIMULATE`. Untrusted Approval Policy state yields `DENY`. Candidate rules from unsigned defaults or tampered files may be diagnosed, but they are not reported as matched effective controls.

Unknown or catalog-only control IDs fail input validation. Runtime content is required only for runtime controls; risk and requested mode are required only for action controls; approval controls reject unrelated fields.

## No-bloat boundary

AMC did not add a second evaluator, policy AST, policy language, store, editor, template system, simulator runtime, source-specific module, or compatibility claim. No external code, prose, examples, schemas, policies, screenshots, mappings, assets, or generated output were copied.

## Verification

- Expected-red: the focused suite failed because `src/enforce/controlSimulation.ts` and least-privilege POST authorization did not exist.
- Typecheck and production build passed after implementation.
- Focused owner regression passed: 8 files / 93 tests.
- The dedicated AMC-1470 contract passed: 1 file / 9 tests, including evaluator parity, no-match, tamper, malformed state, redaction, strict API validation, CLI parity, OpenAPI validation, and filesystem invariance.
- Direct and release-gate full suites passed: 1,066 files / 8,413 tests each.
- The consolidated release gate passed at `tmp/release-gate/amc-1470-final.json`, including 1,153 public CLI paths, the 24,373-line architecture ceiling, 1,487-file Docs drift, 0 runtime vulnerabilities, and all 10 clean-install personas at 10/10.
- Playwright passed 55 browser tests with 2 intentional i18n skips.
- Desktop packaging and verification passed for macOS universal (`18a6df7b2211d2756cbdae1bf2f02e1d160895676076ad238876e880d1f07911`), Linux x64 (`6500d996c9588960b9f129c926df54a3960c92011b2c1e1dc405ff3bdeaf1e75`), and Windows x64 (`2b3eb7c1c3de78fe8a418b3a2de88391508f8415a8ce7e3eb6c715b739847221`).
- Prepack archive, SBOM, license inventory, secret scan, signed release pack, and offline verification passed.
- Commit, exact-head CI, deployment, and production receipts will be appended only after they pass.
