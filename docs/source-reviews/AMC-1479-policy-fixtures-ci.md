# AMC-1479 - deterministic policy fixtures in CI

- Issue: `AMC-1479`
- Dimension: policy behavior regression and CI enforcement
- AMC surfaces requested: Enforce, CLI, CI, Docs
- Source reviewed: [Agent Control repository](https://github.com/agentcontrol/agent-control)
- Retrieval: live first-party repository reviewed 2026-07-12
- Immutable source commit: Agent Control `83188b62c63e2b4ff9ada87048fd99605184ee5a`
- Status: Implemented; publication verification pending

## Relevance decision

Policy fixtures are relevant because AMC already exposes three production control evaluators and a read-only simulator, but users had no bounded way to commit expected decisions and block a regression in CI. The gap maps directly to the existing Enforce and CLI surfaces. It does not justify a second policy engine, remote test service, fixture registry, or new API/Studio surface.

The source signal is limited to the usability of exercising control behavior in CI. AMC keeps its own policies, evaluators, request schema, signatures, trust rules, fixture contract, report, and workflow.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score, methodology, question, or evidence-gate change. Fixture reports are non-proof. |
| Shield | Existing Runtime Firewall conditions may be exercised; no detector, attack pack, or Shield subsystem is added. |
| Enforce | Primary surface. Suites call the existing Runtime Firewall, Action Policy, and Approval Policy simulation path. |
| Vault | Raw inputs, secrets, absolute paths, signature bytes, and credentials are excluded from reports. No key or signature is created. |
| Watch | No event, monitor, telemetry store, or receipt is created. |
| Fleet | Existing agent context may be supplied to Action Policy cases; no fleet fixture or inheritance behavior is added. |
| Passport | Reports are not signed, portable, or claim eligible. |
| Comply | CI status may support engineering review, but it is not audit or compliance evidence. |

## Product closure

- Added one strict schema-versioned YAML/JSON suite and `amc policy test <file> [--json]`.
- Reused `simulateControlDecision` for Runtime Firewall, Action Policy, and Approval Policy requests instead of implementing another evaluator.
- Canonicalized case order and expected/matched ID sets, then bound the normalized suite and deterministic report with SHA-256.
- Projected only stable expected/actual outcomes, match state, fail-closed state, matched IDs, source integrity, input hash, and mismatch codes. Simulation timestamps, raw requests, evaluator reasons, condition bodies, paths, signatures, and secrets are absent.
- Added stable exit codes: 0 for pass, 1 for expectation mismatch, and 2 for invalid fixture or untrusted current control source.
- Added one small AMC-authored fixture with benign runtime, runtime intervention, and approval-quorum cases.
- Added `npm run check:policy-fixtures`, which creates an isolated temporary workspace, initializes existing defaults, runs the built CLI twice, requires byte-identical output, and writes one uploadable JSON report.
- Wired the Node 20 CI build to block on that report and upload it even when the gate fails.

## Fail-closed rule

Duplicate YAML/JSON keys, aliases, unknown fields, duplicate case IDs or expected IDs, unsupported schema versions, malformed or mixed-family requests, oversized files/suites/content, unreadable files, and invalid expectations are rejected before evaluation. Schema errors use bounded messages; unknown control values and unrecognized field names are never echoed back.

An expectation mismatch is a normal failed test. A current control source whose integrity is not `trusted` makes the entire suite `fail_closed`, even when the fixture expected the same safe outcome. A trusted evaluator may still produce an expected fail-closed policy decision; this does not bypass the separate source-integrity gate.

## Proof boundary

Every report states `simulationOnly: true`, `recorded: false`, and `proofEligible: false`. It is not runtime or maturity evidence and cannot satisfy Score, Passport, audit, compliance, or maturity evidence gates. Use the owning runtime path and its signed lifecycle evidence when execution proof is required.

## No-bloat boundary

No second policy engine, policy AST, selector/evaluator DSL, fixture service, fixture database, registry, remote runner, policy mutation, event, approval request, receipt, transparency entry, signing path, API endpoint, Studio page, daemon, scheduler, source-specific adapter, compatibility layer, methodology change, or score claim was added.

No upstream test, fixture, schema, policy, example, prose, config, output, screenshot, or asset was copied. The committed suite and implementation are AMC-authored and source independent.

## Verification

- Expected-red: the dedicated suite failed only because `src/enforce/policyFixtureRunner.ts` did not exist.
- First typecheck found and closed the legitimate `observe` Runtime Firewall outcome and an aggregate-status type widening.
- Core green slice: 6 of 8 dedicated tests passed; the only remaining failures were the intentionally absent docs/source-review closure.
- Final dedicated contract: 1 file / 9 tests passed, including the post-review non-regular-file guard and source-fail-closed count boundary.
- New-module coverage passed at 95.45% statements, 87.09% branches, 100% functions, and 95.91% lines.
- Focused owner/metadata regression passed 5 files / 37 tests.
- Manual privacy review reproduced an unknown-field-name leak in the invalid-fixture envelope, added parser and built-CLI regressions, and closed it with a bounded `unknown field` error. The final focused control slice passed 2 files / 18 tests.
- `npm run check:policy-fixtures` passed three cases through the built CLI twice with byte-identical report SHA-256 `bf869e5375c15b7e14bfbd8b1cb797a272fbfe7d3f94fc87e2de3c8a4eaa88cd`.
- Typecheck, clean build, the 1,165-command CLI/API inventories, architecture boundaries, 1,497-file Docs drift, and diff hygiene passed.
- The authoritative post-fix release receipt at `tmp/release-gate/amc-1479-final.json` passed on 2026-07-13: 12 steps passed, only the intentionally unset pre-publication live URL was skipped, and full Vitest passed 1,075 files / 8,520 tests. Runtime dependency audit reported zero vulnerabilities and all install personas passed.
- `npm run release:prepack-check` passed npm packing, SBOM, license inventory, release scan, release bundle creation, and bundle verification.
- Desktop packaging and manifest verification passed for macOS universal, Linux x64, and Windows x64. Final SHA-256 values: npm `b8395232cbab8f83b8825823b9e68b8e1613cef507ffaf3921a709680b21e329`; macOS `680b39cfdb5562441ac5a8a1d66b390d045728d83c65d1e5e9e681ad0c5f5f0a`; Linux `d12442b40bc530f8914ca0131bcaeaae1c5e18ef007bfb5e380bba47b1e3b7fb`; Windows `85c117470a7a6860a1883e6aa92c15f859875e5e28e41f31d0f48b3bb55f1504`.
- Playwright passed 55 tests with the same 2 intentional i18n skips, and the Pages artifact built with 173 public guides.
- Exact-SHA GitHub workflows and production evidence will be appended before Done.
