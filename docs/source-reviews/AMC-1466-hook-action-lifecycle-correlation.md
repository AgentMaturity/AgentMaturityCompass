# AMC-1466 - Hook action lifecycle correlation

- Gap: `AMC-1466`
- Dimension: runtime lifecycle integrity, provider hook correlation, evidence usability
- AMC surfaces requested: Watch, Enforce, Vault, Passport, CLI, API, Docs
- Sources reviewed: Agent Event Protocol draft; Claude Code hooks; Gemini CLI hooks; Agent Control
- Retrieval: primary repositories and documentation reviewed 2026-07-11
- Status: Done; implementation, release, publication, and production verification passed

## Relevance decision

This gap is directly relevant. AMC already had a strict provider-neutral action ingress, immutable evidence events, signed receipts, provider-native pre-tool control, runtime runs, episodes, and lifecycle graphs. The missing product capability was a trustworthy projection that answers whether one requested action was allowed, denied, completed, or failed. The implementation extends those existing primitives; it does not add another event store or policy engine.

The Agent Event Protocol draft was reviewed at commit `2583cff9380f8f0a459d52c7112b6105c46496ed`. Its `action.id` correlation model is a source-review signal only; AMC makes no AEP conformance claim. Claude Code hook documentation was pinned by content SHA-256 `e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1`; its request, success, and failure tool hooks carry the same `tool_use_id`. Gemini CLI hook documentation was reviewed at commit `f354eebaf43b25bacb176007e449bb9a638fd101`, docs SHA-256 `103bab9f0f8fd7251b97d06c6b7c4e52752427bf23cbacd1379f2aecaaf26e4c`; the pinned contract exposes request and terminal tool fields but no general provider call ID. Agent Control was reviewed at commit `83188b62c63e2b4ff9ada87048fd99605184ee5a` as a usability signal for correlated action views, not as an implementation or compatibility target.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No maturity level, question, weight, threshold, or methodology change. Lifecycle metadata cannot raise a score. |
| Shield | Conflicting, reordered, cross-agent, or tampered action evidence fails closed; no new attack pack. |
| Enforce | Existing signed control decisions now correlate with the same stable action ID as request and terminal evidence. |
| Vault | Existing monitor keys, event chain, sealed sessions, and signed receipts remain authoritative. Raw provider payloads are not retained. |
| Watch | One verified lifecycle projection exposes requested, optional decision, and completed, failed, or denied state. |
| Fleet | Agent ID remains part of the lifecycle key; cross-agent collisions are rejected instead of merged. |
| Passport | Adapter capability receipts now declare terminal event coverage honestly; no new Passport format was created. |
| Comply | Auditors can follow receipt references and failure reasons; no legal compliance claim or framework mapping changed. |

## Product closure

One shared action-identity resolver now gives a Gemini request observation and its policy decision the same derived action ID. Claude Code request, success, and failure hooks reuse the provider `tool_use_id`. Gemini terminal hooks send only a combined SHA-256 correlation digest to the authenticated Bridge; the Bridge resolves the terminal event only when exactly one unmatched request exists. The raw session ID, tool input, output, and provider error message never enter retained evidence.

The signed hook manifest is version 2 and binds each AMC-owned native event name, lifecycle phase, and exact handler hash. Install, status, remove, dry-run, drift detection, rollback, and byte-idempotent reinstall continue to preserve unrelated user hooks. A signed version 1 single-handler installation remains verifiable as legacy drift and upgrades in place without rotating a valid lease.

`amc connect hooks lifecycle --agent <id> --action <id>` and `GET /api/v1/watch/hook-actions/{actionId}?agentId=<id>` return the same `2026-07-11` contract over the existing ledger. The projection verifies the complete event-chain prefix, each relevant event and receipt, sealed sessions, phase order, provider and agent binding, and decision/terminal consistency.

## Fail-closed rule

Zero or multiple unmatched Gemini request candidates produce no terminal evidence. Missing request, duplicate request, duplicate or conflicting decision, duplicate or conflicting terminal, decision or terminal before request, denied-then-executed state, provider mismatch, correlation mismatch, cross-agent action ID collision, invalid receipt, unsealed session, payload tamper, event-chain tamper, and unsafe lookup identifiers fail closed. A fail-closed projection is diagnostic evidence of an invalid lifecycle, not proof that the provider executed or blocked an action.

## No-bloat boundary

No second event store, lifecycle graph, policy engine, daemon, queue, SDK, provider wrapper, copied mapping, copied schema, copied control value, raw-payload archive, methodology version, Score increase, or generic provider-parity claim was added. No upstream code, configs, payloads, examples, datasets, screenshots, or prose were copied.

## Verification

- TDD red reproduced five concrete defects: missing terminal handlers, unsupported terminal mapping, unsafe Gemini terminal identity, and mismatched Gemini observation/control IDs.
- Provider hook, control, lifecycle, surface, and provider-neutral ingress regression: 5 files / 72 tests passed.
- Adapter capability receipt regression: 1 file / 8 tests passed.
- Final focused hook/control/lifecycle/capability/OpenAPI regression: 10 files / 123 tests passed; documentation regression: 1 file / 3 tests passed; public count and desktop metadata regression: 3 files / 12 tests passed.
- Typecheck and build passed after narrowing shared `action.denied` unions explicitly.
- Full Vitest suite passed twice on the final implementation: 1,063 files / 8,393 tests, including the consolidated release gate.
- Playwright passed 55 tests with 2 intentional i18n skips across desktop/mobile layout, accessibility, Docs routing, Playground, theme, typography, and brand surfaces.
- Desktop packaging and checksum verification passed for macOS universal, Windows x64, and Linux x64.
- All 10 clean-install personas passed at 10/10.
- Prepack, SBOM, licenses, package scan, release pack, release verification, OpenAPI parse, command inventory, 1,484-file Docs drift, architecture boundaries, and runtime dependency audit with 0 vulnerabilities passed.
- Consolidated full release gate passed; receipt `tmp/release-gate/amc-1466-final.json` includes the full 1,063-file / 8,393-test suite and all ten install personas.
- Feature commit `1e958d615723e3b8f8010ed19706da8c088bc726` (`Correlate provider hook action lifecycles`) was pushed to `origin/main`.
- Exact-head GitHub Actions passed: [CI 29145382683](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29145382683), [npm validation 29145382700](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29145382700), [Docker Runner Image 29145382714](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29145382714), and [Pages 29145382716](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/29145382716). CI passed Node 20 and 22 build/test/release-smoke matrices, local E2E smoke, Helm, security, and Docker smoke. npm validation passed typecheck, the full suite, build, prepack guardrails, and release preflight; registry publication was intentionally skipped because `NPM_TOKEN` is not configured.
- Production verification passed at `https://agentmaturity.co/`: apex returned HTTP 200; `www` redirected to the apex; the certificate covered both names and was valid from 2026-06-26 through 2026-09-24; the homepage published 1,151 CLI paths and 8,393 tests; lifecycle CLI/docs and both OpenAPI routes were present.
- The post-deploy quick release gate passed live HTTPS health with HTTP 200; receipt `tmp/release-gate/amc-1466-live.json`, created `2026-07-11T08:07:47.351Z`. Its full-suite and install-persona steps were intentionally skipped because the non-quick release gate had already passed both.
- Desktop and 390 px mobile browser verification found no horizontal overflow, overlap, warning, or error on the homepage and adapter documentation. Visual receipts: `tmp/visual-proof/amc-1466-home-desktop.png`, `tmp/visual-proof/amc-1466-home-mobile.png`, `tmp/visual-proof/amc-1466-adapters-desktop.png`, and `tmp/visual-proof/amc-1466-adapters-mobile.png`.
