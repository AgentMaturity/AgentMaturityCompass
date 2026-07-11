# AMC-1469 - Verified control projection

- Gap: `AMC-1469`
- Dimension: control discoverability, signed-policy integrity, operator adoption
- AMC surfaces requested: Enforce, Shield, Watch, Vault, CLI, API, Docs
- Source reviewed: Agent Control repository and public product documentation
- Retrieval: primary source reviewed 2026-07-11 at commit `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: implementation and local release verification passed; publication verification pending

## Relevance decision

Agent Control presents controls as a concise operator-facing scope, condition, action, and status model. That usability pattern is relevant to AMC, but its implementation and compatibility model are not AMC product requirements. AMC already owns stronger signed Runtime Firewall, Guardrails, Action Policy, Approval Policy, ToolHub, evidence-ledger, and lifecycle primitives. The missing capability was one trustworthy read-only view over those owners.

AMC therefore implements a shared projection, not an importer, adapter, parity layer, or new policy engine. There is no Agent Control compatibility claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No question, weight, threshold, maturity level, methodology version, or score changes. Configuration metadata cannot raise maturity. |
| Shield | Invalid Runtime Firewall or Guardrails evidence is disclosed and projects block; no new assurance pack. |
| Enforce | Existing runtime, action, and approval controls receive one verified Scope / When / Then / Status view. |
| Vault | Existing signatures and host-local checkpoints remain authoritative; the projection exposes no signature bytes, secrets, or passphrases. |
| Watch | Operators can inspect trusted, partial, uninitialized, or fail-closed posture without mutating policy. |
| Fleet | No fleet inheritance, bulk edit, or second control registry is added. |
| Passport | No portable credential or compatibility attestation is issued. |
| Comply | The projection can support review, but it makes no certification or legal compliance claim. |

## Product closure

`amc policy controls [--json]` and `GET /api/v1/policy/controls` expose the same schema-versioned read-only projection. It covers five concrete Runtime Firewall rules, combines the three Guardrails with real runtime bindings instead of duplicating them, identifies eleven catalog-only guardrails as unbound, and projects every configured Action Policy and Approval Policy action class.

The output includes relative source paths, integrity state, revision metadata where available, conditions, requested action, effective action, status, and remediation. It excludes absolute workspace paths, raw payloads, signatures, and secrets. No mutation method exists for the API route.

## Fail-closed rule

Missing optional owners are `uninitialized`, not invented defaults. When Runtime Firewall is explicitly required by `AMC_FIREWALL_ENABLED=1`, a missing signed policy is invalid. Invalid Runtime Firewall or Guardrails state projects every runtime rule to `BLOCK`; invalid Action Policy cannot project `EXECUTE` and resolves to `SIMULATE`; invalid Approval Policy resolves to `DENY`. A malformed configured policy still emits one fail-closed row for every action class with the untrusted requested state marked `unavailable`. The CLI prints diagnostics but exits 2 whenever any family is `fail_closed`.

Catalog metadata, a policy file without trusted signature/checkpoint evidence, and built-in defaults without an initialized signed artifact cannot pass as an effective trusted control.

## No-bloat boundary

No second policy engine, evaluator, store, generic policy language, rule editor, simulator, daemon, compatibility adapter, Agent Control schema, source-specific module, copied upstream code, copied prose, copied examples, or methodology change was added. The projection does not write policy or receipts and is not imported by any runtime evaluation path.

## Verification

- The first expected-red regression failed because `src/enforce/controlProjection.ts` did not exist. A second expected-red regression then exposed a real side effect: the original Guardrails reader created lock scaffolding in an empty workspace. The projection now uses a lock-free owner inspection path and the empty directory remains unchanged.
- Focused projection and owner-state regression passed: 2 files / 20 tests. The final focused projection, Guardrails, router, least-privilege, OpenAPI, public-count, and desktop contract run passed: 8 files / 76 tests.
- Coverage includes uninitialized, partial, trusted, and fail-closed status; missing required Runtime Firewall policy; trusted and malformed Action/Approval policies; Guardrails and Runtime Firewall journal tamper; secret/error redaction; CLI/API parity; CLI exit 2 after diagnostics; real-response OpenAPI validation; relative paths; catalog-only exclusions; and static no-evaluator/no-write boundaries.
- Typecheck, build, generated 1,152-command inventory and API reference, OpenAPI parse, architecture boundaries, 1,486-file Docs drift, and diff checks passed.
- Full Vitest passed twice on the final implementation, directly and inside the consolidated release gate: 1,065 files / 8,404 tests.
- Playwright passed 55 browser tests with 2 intentional i18n skips across desktop/mobile layout, accessibility, Docs routing, Playground, theme, typography, and brand surfaces.
- Desktop packaging and checksum verification passed for macOS universal, Windows x64, and Linux x64.
- Prepack npm archive, SBOM, licenses, secret scan, signed release pack, and offline release verification passed.
- All 10 isolated install personas passed at 10/10. Runtime dependency audit found 0 vulnerabilities.
- Consolidated release gate passed every local step; receipt `tmp/release-gate/amc-1469-final.json`. Live deploy health was correctly skipped until the implementation commit is published.
- Exact-head CI, Pages, Docker, npm validation, production HTTPS, and post-deploy browser/API checks remain pending and will be recorded before Linear is marked Done.
