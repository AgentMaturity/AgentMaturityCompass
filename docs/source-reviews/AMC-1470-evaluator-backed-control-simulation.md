# AMC-1470 - evaluator-backed control simulation

- Issue: `AMC-1470`
- Dimension: control explainability and safe preview
- AMC surfaces requested: Enforce, Watch, Vault, Studio/API/CLI, Docs
- Source reviewed: first-party control-model material and repository already pinned by the competitive review
- Retrieval: public material reviewed 2026-07-10; implementation review 2026-07-11
- Immutable source commit: `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Published; Linear closeout pending

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

## Publication defect found and fixed

The first production check found that the new Control Simulation guide and AMC-1469 Control Projection guide were linked from repository docs but absent from the deterministic public Docs allowlist, so their canonical `/docs/content/*.md` routes returned 404. Both guides now use the existing same-origin Docs artifact and Governance & Policy category. The allowlisted artifact increased from 168 to 170 guides; graph and artifact tests prevent either guide from silently disappearing again.

Browser verification then found an existing-client cache defect: the server and manifest were current, but the service worker still served the old `docs.js?v=12`, erased the new route, and displayed stale 168-guide / 1,144-command counts. The Docs shell key is now `v13`, the worker cache is rotated to `amc-v9`, and same-origin scripts and styles use network-first delivery with cached offline fallback.

## Verification

- Expected-red: the focused suite failed because `src/enforce/controlSimulation.ts` and least-privilege POST authorization did not exist.
- Typecheck and production build passed after implementation.
- Focused owner regression passed: 8 files / 93 tests.
- The dedicated AMC-1470 contract passed: 1 file / 9 tests, including evaluator parity, no-match, tamper, malformed state, redaction, strict API validation, CLI parity, OpenAPI validation, and filesystem invariance.
- Direct and release-gate full suites passed: 1,066 files / 8,413 tests each.
- The consolidated release gate passed at `tmp/release-gate/amc-1470-final.json`, including 1,153 public CLI paths, the 24,373-line architecture ceiling, 1,487-file Docs drift, 0 runtime vulnerabilities, and all 10 clean-install personas at 10/10.
- Playwright passed 55 browser tests with 2 intentional i18n skips.
- After the Docs publication repair, the focused control/Docs suite passed 4 files / 26 tests, focused Docs browser routing and brand checks passed 11 tests, and the full suite passed again at 1,066 files / 8,413 tests.
- After the release-shell cache repair, focused service-worker/Docs/control verification passed 4 files / 22 tests, focused Docs browser checks passed 11 tests, and the full suite passed again at 1,066 files / 8,413 tests.
- Desktop packaging and verification passed for macOS universal (`18a6df7b2211d2756cbdae1bf2f02e1d160895676076ad238876e880d1f07911`), Linux x64 (`6500d996c9588960b9f129c926df54a3960c92011b2c1e1dc405ff3bdeaf1e75`), and Windows x64 (`2b3eb7c1c3de78fe8a418b3a2de88391508f8415a8ce7e3eb6c715b739847221`).
- Prepack archive, SBOM, license inventory, secret scan, signed release pack, and offline verification passed.

## Publication evidence

- Implementation commit `329a1f65908500aa59b10aa0802429e0c5f14d5d` (`Simulate AMC control decisions`) is pushed to `origin/main`; exact-head CI `29151292732`, npm validation `29151292748`, Docker `29151292741`, and Pages `29151292734` passed.
- Public Docs repair commit `bf1767fbf2d67494871897c53f94f17d1a46fdaa` (`Publish AMC control guides`) is pushed; exact-head CI `29151721268`, npm validation `29151721276`, and Pages `29151721263` passed.
- Release-shell repair commit `9b39033c157673cc2f9e324184471f9c6a7acfa7` (`Refresh AMC Docs release shell`) is pushed; exact-head CI `29151970204`, npm validation `29151970209`, and Pages `29151970190` passed.
- Production `content-manifest.json` reports source revision `9b39033c157673cc2f9e324184471f9c6a7acfa7`, 170 guides, and both `CONTROL_PROJECTION` and `CONTROL_SIMULATION`. Both live guide SHA-256 hashes equal their repository sources.
- Production returned HTTP 200 at the apex and HTTP 301 from `www` to the apex. The valid Let's Encrypt certificate covers both hostnames from 2026-06-26 through 2026-09-24.
- The live homepage exposes 1,153 CLI paths and 8,413 tests; public OpenAPI contains `/v1/policy/simulate`, `ControlSimulationRequest`, and `ControlSimulationResponse`.
- A stale existing browser session upgraded to the new shell and resolved `#CONTROL_SIMULATION` without console warnings or errors. Desktop had no overflow; the 390x844 production render had a 384-pixel document width and no horizontal overflow.
- The post-deploy quick release gate passed typecheck, build, OpenAPI parsing, architecture boundaries, 1,488-file Docs drift, runtime audit with 0 vulnerabilities, smoke checks, and live HTTP health. Receipt: `tmp/release-gate/amc-1470-live.json`.
