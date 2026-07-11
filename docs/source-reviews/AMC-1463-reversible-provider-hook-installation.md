# AMC-1463 - Reversible provider hook installation

- Gap: `AMC-1463`
- Dimension: adoption, provider hooks, evidence capture
- AMC surfaces requested: Watch, Vault, CLI, Studio
- Sources reviewed: Claude Code hooks documentation; Gemini CLI hooks documentation; AgentApprove product setup; pinned AEP draft
- Retrieval: primary sources reviewed 2026-07-10
- Status: shipped and release-verified locally; remote CI/deploy verification pending commit

## Relevance decision

This gap is directly relevant. AMC already had adapter discovery, a Connect wizard, least-privilege leases, a provider-neutral observed hook ingress, signed receipts, encrypted evidence, and Watch timelines. The missing product capability was safe project setup. AMC adds one shared hook integration primitive instead of provider-specific subsystems.

Claude Code support is bounded to the documented project-local `PreToolUse` command-hook contract retrieved from `https://code.claude.com/docs/en/hooks.md` with SHA-256 `e94e721874efc802248a7808e35ac917306088c5eaada2aa21e1def3fecc32e1`. Gemini CLI support is bounded to the `BeforeTool` command-hook contract at source commit `f354eebaf43b25bacb176007e449bb9a638fd101`. The observed AEP subset remains pinned to `2583cff9380f8f0a459d52c7112b6105c46496ed`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No score or methodology change; hook presence is not maturity proof. |
| Shield | No new attack or red-team subsystem. |
| Enforce | Observation only; provider control responses remain a separate backlog item. |
| Vault | Dedicated bearer lease is kept out of provider config with mode `0600`; install ownership is signed. |
| Watch | Native tool requests become privacy-minimal observed events and signed Watch receipts. |
| Fleet | Agent identity is explicit, but no fleet orchestrator or cross-agent claim is added. |
| Passport | No capability badge or portable proof claim is added. |
| Comply | Signed evidence can support existing audits; no framework mapping changes. |

## Product closure

`amc connect hooks install/status/remove` now provides dry-run file plans, structured JSON merging, a managed `.gitignore` block for `.amc/hooks/`, idempotent reinstall, signed ownership metadata, least-privilege lease issuance and revocation, status diagnostics, and ownership-aware removal for Claude Code and Gemini CLI. The existing Connect wizard suggests the installer only when one of those verified adapters is selected.

The internal forwarder maps only `action.requested`. It sends tool identity, provider surface, event time, and a hashed session correlation. It omits tool arguments, cwd, transcript paths, and raw session IDs. Delivery refuses redirects and remote plaintext HTTP and retries a transient server failure with byte-identical event bytes.

The hidden forwarder accepts only the exact managed lease path, agent identity, Bridge origin, provider source, handler hash, and ignore-file protection bound by the signed installation manifest. A project hook cannot repurpose it to read an arbitrary workspace secret or send that secret to an unsigned destination. Hidden commands are excluded from the public command inventory; the four public lifecycle paths bring the verified inventory to 1,149 paths.

## Fail-closed rule

Unsupported providers, malformed or duplicate-key config, malformed or oversized provider input, symlinked managed paths, invalid agent IDs, remote plaintext Bridge origins, missing or tampered signed manifests, duplicate or modified ownership markers, missing Git ignore protection, permissive token modes, invalid leases, redirects, and invalid ingress responses fail closed. Removal does not guess when ownership proof is missing or altered.

## No-bloat boundary

No AgentApprove adapter, Agent Control compatibility layer, AEP mapping importer, copied mapping, copied schema, copied fixture, copied provider config, daemon, queue, second event database, second policy engine, control-response translator, approval UI, methodology version, or Score gate was added. Codex, Cursor, OpenCode, and other providers are explicitly unsupported until primary contracts are pinned and fixture-tested.

## Verification

- Focused cross-surface regression: 8 files / 78 tests passed, covering install/status/remove, hidden forwarder authorization, real Bridge-to-ledger receipt verification, provider ingress, Studio guidance, public command inventory, desktop copy, and public stats.
- Full Vitest suite: 1,055 files / 8,348 tests passed both directly and inside the full release gate.
- Browser E2E: 55 passed / 2 intentional language-feature skips.
- Typecheck, build, architecture boundaries, docs drift, and runtime dependency audit: passed; runtime audit found zero vulnerabilities.
- Install persona QA: all 10 isolated personas passed at 10/10.
- Release gate: `tmp/release-gate/amc-1463-final.json` passed; URL-enabled gate `tmp/release-gate/amc-1463-live.json` also verified `https://agentmaturity.co` at HTTP 200.
- Package verification: npm tarball, SBOM, license inventory, release scan, release bundle, and release bundle verification passed.
- TLS verification: `agentmaturity.co` presented a Let's Encrypt certificate valid from 2026-06-26 through 2026-09-24 and returned HTTP/2 200.
- Remote GitHub CI and deployed-content verification: pending commit and push.
