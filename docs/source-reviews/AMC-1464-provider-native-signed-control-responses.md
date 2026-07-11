# AMC-1464 - Provider-native signed control responses

- Gap: `AMC-1464`
- Dimension: provider control, policy enforcement, signed evidence
- AMC surfaces requested: Enforce, Watch, Vault, CLI, API
- Sources reviewed: Claude Code hook contract; Gemini CLI hook contract; AEP draft; Agent Control controls documentation
- Retrieval: primary sources reviewed 2026-07-11
- Status: Done and published

## Relevance decision

This gap is directly relevant. AMC already had signed Action Policy evaluation, signed Approval Policy, ToolHub action classes and argument allowlists, budget and incident-freeze checks, maturity and assurance gates, least-privilege leases, and signed ledger receipts. AMC-1463 installed provider hooks, but those hooks still returned neutral output. The missing capability was one thin runtime projection from existing AMC decisions into provider-native pre-tool responses.

Claude Code is pinned to the project-local `PreToolUse` command-hook contract at `https://code.claude.com/docs/en/hooks.md`, retrieved with SHA-256 `e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1`. Gemini CLI is pinned to `BeforeTool` documentation at commit `f354eebaf43b25bacb176007e449bb9a638fd101`. The AEP draft remains pinned to commit `2583cff9380f8f0a459d52c7112b6105c46496ed`; its separation of immutable events from hook responses is a review signal, not an imported schema or conformance claim. Agent Control controls were reviewed at commit `83188b62c63e2b4ff9ada87048fd99605184ee5a`; AMC does not implement Agent Control compatibility.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score, question, threshold, trust-tier, or methodology change. Hook presence cannot raise maturity. |
| Shield | Existing fail-closed policy and tamper behavior is reused; no new attack pack or scanner. |
| Enforce | Existing signed ToolHub, Action Policy, Approval Policy, budget, freeze, trust, and assurance decisions now reach provider-native pre-tool responses. |
| Vault | Control uses a dedicated `hook:control` scope alongside `hook:observe`; the mode-0600 lease remains outside provider config. |
| Watch | Observation and control remain separate signed events. Exact provider response bytes are bound to a `guard_check` receipt. |
| Fleet | Agent identity is bound to the signed manifest and lease; no new fleet orchestrator is added. |
| Passport | Receipts remain verifiable with existing monitor keys; no new badge or portability claim. |
| Comply | Signed control evidence can support existing audits; no framework mapping or legal compliance claim changes. |

## Product closure

`amc connect hooks install --provider claude-code|gemini-cli --mode control --agent <id>` explicitly opts into control. The default remains `--mode observe`, preserving AMC-1463 behavior. Control installation requires a loopback Bridge, adds `hook:control` to the narrow lease, records the mode and exact provider capability set in the signed ownership manifest, and remains reversible through the same status/remove commands. Upgrading an observer rotates and revokes the prior lease once; repeated control installation is byte-idempotent. Missing shared Approval Policy files are initialized inside the installation transaction, shown in dry-run output, and restored if installation rolls back; partial or invalid signed policy state fails closed.

The local Bridge normalizes a bounded set of pinned native read, write, shell, and fetch fixtures into existing ToolHub identities. It validates the signed ToolHub config and arguments, then calls the existing signed Action Policy evaluator and Approval Policy. No second evaluator is present. Claude Code receives its documented `allow`, `deny`, or `ask` shape. Gemini CLI receives `allow` or `deny`; when AMC requests ask, the result is explicitly capability-lossy and denied because Gemini CLI `BeforeTool` has no native ask outcome.

Provider-local `ask` is a signed escalation request, not proof that AMC approval quorum was met. A policy requiring multiple or distinct users is denied and cannot be reduced to one provider-local prompt. The later approval-delivery backlog remains responsible for authenticated AMC quorum completion.

The exact canonical provider response is hashed into a signed `guard_check` receipt and a sealed ledger event. Byte-identical retries recover the original response and receipt. An empty unsealed session left by an interrupted writer is safely reused; sealed, metadata-mismatched, or contaminated sessions fail closed. The forwarder verifies the complete result against the current request's deterministic action and session IDs plus the matching sealed local ledger event, so an older valid allow receipt cannot be replayed for a different request. Reuse of a stable action ID with different input bytes returns a conflict.

## Fail-closed rule

Control fails closed for unsupported providers, non-loopback control origins, malformed, duplicate-key, or oversized input, unknown or unsafe tool mappings, signed ToolHub argument denial, missing or invalid Action Policy, Approval Policy, ToolHub, or budget signatures, maturity or assurance downgrade to simulation, active freeze or budget denial, multi-user quorum that cannot be represented natively, stale or tampered leases, unsigned or drifted manifests, conflicting action replay, invalid Bridge responses, receipt verification failure, redirects, timeouts, and Bridge outage. The hidden CLI emits a provider-native deny on control outage instead of relying on provider hook-error behavior.

## No-bloat boundary

No second policy engine, second approval store, event database, Agent Control compatibility layer, copied AEP mapping, copied provider code, copied config, generic provider SDK, remote raw-input transport, argument rewriting, steer outcome, daemon, queue, methodology version, Score increase, or unsupported provider claim was added. Shared ToolHub argument validation was extracted once and remains the authority for ToolHub and provider hooks.

## Verification

- TDD red: focused tests initially failed because the control module, mode, docs, and route did not exist.
- Focused runtime, installer, policy, ingress, CLI, and no-copy regression: 6 files / 77 tests passed.
- OpenAPI, Studio authorization, integration scaffold, webhook schema, hook ingress, and brand contracts: 7 files / 110 tests passed.
- Canonical public-stat and AMC-1464 documentation guards: 2 files / 6 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run check:docs-drift`: passed at 1,481 files in the release gate and 1,482 after the final AMC OS handoff was added.
- `npm run check:architecture-boundaries`: passed with no failures.
- Full Vitest after remote-failure hardening: 1,057 files / 8,366 tests passed.
- Remote npm validation `29139877125` exposed a pre-existing process-monitor race: delayed parent input could reach an already closed child stdin, emit an unhandled `EPIPE`, and lose the expected stdout event. The success fixture now waits for input, the monitor guards ended streams, expected closed-pipe codes are handled, and unexpected stream errors remain visible after session sealing.
- Process-monitor regression: 1 file / 7 tests passed, including early child stdin closure; the same file passed 10 consecutive stress runs.
- Playwright E2E: 55 passed / 2 intentionally skipped.
- Install-persona QA: all 10 personas passed at 10/10; receipt at `tmp/persona-install-qa/latest.json`.
- Runtime dependency audit: 0 vulnerabilities.
- Prepack verification: npm archive, SBOM, license inventory, archive scan, release bundle, and release signature checks passed.
- Final consolidated release gate passed at the 8,366-test boundary, including all 10 install personas and live HTTP 200; receipt at `tmp/release-gate/amc-1464-final-v2.json`.
- Replacement remote workflows passed after the monitored-stdin fix: Pages `29140459439`, Docker Runner Image `29140459426`, npm validation `29140459417`, and CI `29140459424`.

## Publication

- Feature commit: `40899a3ede3984832bced4d35eb1112f667eb771` (`Add provider-native signed hook controls`).
- Release-blocker fix: `1affdc8db70863bb3d3a20a4e657eb1f2388652d` (`Handle monitored child stdin closure`).
- `main` and `origin/main` are synchronized at the release-blocker fix commit.
- Production serves the 8,366-test proof, Watch + Enforce control copy, adapter setup, and `/bridge/hooks/control/v1` OpenAPI route.
- `https://agentmaturity.co` returns HTTP 200; `www` redirects to the apex; the Let's Encrypt certificate covers both names and is valid through 2026-09-24.
