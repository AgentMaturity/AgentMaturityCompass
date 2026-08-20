I have enough to write the report.

# AMC Enforcement & Defense — Architecture Map

## 1. STRUCTURE

- **`src/runtime/firewall.ts` (1650 LOC)** — the *only* real inline content-interception engine. Signed policy, rules, thresholds, redaction, decision receipts, rollout counters. Entry point `evaluateRuntimeFirewall()`.
- **`src/enforce/` (~58 modules, 11.7k LOC)** — mostly *advisory* pure functions. Substantive: `resourceManifest.ts` (2033, signed resource governance), `formalVerification.ts` (994, proof trees/TLA+), `guardrailControlState.ts`+`guardrailProfiles.ts`+`guardrailRuntimeBindings.ts` (the only enforce pieces wired into runtime — they toggle firewall rules), `safetyDSL.ts` (418, AgentSpec-style DSL), `semanticGuardrails.ts` (510), `controlProjection.ts`/`controlSimulation.ts` (read-only projections), `evidenceEmitter.ts` (SQLite guard-event sink used everywhere), `scopeTemplates.ts`, `toolSandboxLimits.ts` (receipt builder, not an enforcer), `policyFirewall.ts` (regex tool-policy, advisory), `execGuard.ts` (blocklist), `stubs.ts` (12 one-liner "modules": mdns, geoFence, temporalControls, clipboardGuard, secretBlind, phishing, evidenceContract, templateEngine).
- **`src/shield/` (~40 modules, 6.2k LOC)** — prompt-injection/threat detection. Real: `detector.ts` (regex injection patterns), `validators/index.ts` (PII/secret/toxicity validators), `mcpSecurityAnalyzer.ts`, `agentConfigScanner.ts`, `exploitConfirmation.ts` (gated exploit ledger), `continuousRedTeam.ts` (evolutionary generator), `mcpTrustLedger.ts`. Orchestrator `shieldGuardOrchestrator.ts` (686). Many advisory stubs in `stubs.ts`.
- **`src/leases/` (6 files)** — Ed25519-signed capability tokens; `leaseVerifier.ts`, `leaseSchema.ts` (scopes, route/model allowlists, rate/cost caps), `leaseStore.ts` (revocations).
- **`src/budgets/budgets.ts` (433)** — signed per-agent daily/per-minute usage + per-action-class caps with `evaluateBudgetStatus()`.
- **`src/approvals/` (18 files)** — dual-control HITL: `approvalEngine.ts`, `approvalChainStore.ts` (hash-chained), `approvalQuorum.ts`, `approvalPolicyEngine.ts`, `approvalDelivery.ts` (Slack/webhook via integrationDispatcher).
- **`src/watch/` (~50 files, 30k LOC)** — `continuousMonitor.ts` (real interval scorer), `observabilityBridge.ts` (OTLP/Langfuse/Helicone/Datadog adapters), `realtimeAssurance.ts`, `behavioralProfiler.ts`, `siemExporter.ts`. **~26 `*LiveDrift.ts` / `*ProviderDrift.ts` files** are pure receipt-builders atop `liveDriftAlerts.ts` (**15,979 LOC single file**).
- **`src/redteam/` (12 + jailbreak/)** — `runner.ts` (synthetic engine), `mcpAgentProvider.ts` (evil-MCP harness), `attackPlugins.ts`, `jailbreak/` (attacks/detector/normalizer/tap), `promptInjectionRegressionSuite.ts`, `exploitLedger.ts`.
- **`src/sandbox/sandbox.ts` (251)** — real Docker exec. **Traffic-path enforcers**: `src/gateway/server.ts` (reverse proxy) + `src/bridge/bridgeServer.ts` (LLM proxy) + `src/toolhub/toolhubServer.ts` (tool execution).

## 2. HOW IT ACTUALLY WORKS

**Real runtime interception lives in three proxies, not in `enforce/`.** `bridgeServer.ts` is an HTTP LLM proxy: per-request it verifies the lease (`verifyLeaseToken`), checks budget (`evaluateBudgetStatus`), then calls `evaluateRuntimeFirewall()` on request body, streaming chunks, and response; on `action === "block"` it seals the ledger session and returns **HTTP 403 `RUNTIME_FIREWALL_BLOCKED`** (bridgeServer.ts:950/1088/1244). `gateway/server.ts` is a signed reverse proxy enforcing lease scopes, route/model allowlists, and budgets before forwarding upstream. `toolhubServer.ts` gates real tool executors (fs/git/http/process) through action-policy + blast-radius consent + approval consumption.

**Firewall mechanism** (firewall.ts): `resolveEffectiveRuntimeFirewallPolicy()` loads the signed policy (`inspectRuntimeFirewallPolicy`), merges signed guardrail control state (`GUARDRAIL_RUNTIME_BINDINGS`) — control state can only *strengthen* rules, never weaken. `collectMatches()` applies regex rules (promptInjection, secretExposure, destructiveAction, piiLeakage, payloadAnomaly), sums `scoreImpact`, then `candidateActionFor()`→`actionFor()` maps score to allow/warn/block under mode (observe never blocks; warn downgrades block→warn). Fail-closed if `AMC_FIREWALL_ENABLED=1` and policy missing/invalid. Every decision writes a signed event + optional run-manager event.

**Everything in `enforce/*` is advisory.** `checkExec`, `PolicyFirewall.evaluate`, `SafetyEngine`, `SemanticGuardrails`, `TaintTracker`, `blindSecrets` are only called from `cli.ts`, `api/*Router.ts`, and the `mechanic`/`product` auto-fixers — never from the live proxy path (grep-confirmed). They emit `guard_events` via `emitGuardEvent()` (fail-safe SQLite, never throws) but don't gate anything. `guardEngine.guardCheck()` and `shieldGuardOrchestrator` similarly run only from CLI/`shieldRouter`.

**Watch/drift**: `continuousMonitor.ts` is a genuine `EventEmitter` that re-runs diagnostics on an interval and dispatches alerts. `observabilityBridge` polls external platforms. The `*LiveDrift` family are **deterministic report generators** — `runLiveScoreBehaviorDrift()` ingests sample rows and produces hash-canonicalized receipts/alerts; no live interception.

**Redteam**: `runner.ts:syntheticResponse()` and `mcpAgentProvider.ts:syntheticAgentResponse()` model a *cautious* agent deterministically — **no real model is called**; scoring is offline. Sandbox (`runSandboxCommand`) really shells to `docker run --network internal` with gateway rewriting.

## 3. CAPABILITY INVENTORY

- **CLI**: `amc firewall {enable|status|check|events|export|migrate-signature}`; `amc lease {issue|verify|revoke}`; `amc budgets {init|...}`; `amc enforce {check|exec-guard|ato-detect|numeric-check|taint|blind-secrets|formal-verify|tla-spec|verify-certificate|resource(s)/resource-manifest snapshot|list|diff|restore|status|propose|evaluate|apply|rollback|history}`; `amc shield {sandbox|detect-injection|red-team|red-team-status|confirm}`; `amc redteam <agentId>`; `amc watch {attest|explain|safety-test|host-hardening|start|status|alerts}`; `amc monitor {start|status|events|metrics}`; `amc sandbox`; `amc approve`, `amc policy {controls|simulate|approval}`.
- **APIs**: `enforceRouter`, `firewallRouter`, `shieldRouter`, `watchRouter`, `scoreRouter`, `securityRouter`; approvals via `approvalApi` (Studio HTTP).
- **Behaviors**: signed lease scopes (`gateway:llm`,`proxy:connect`,`toolhub:*`,`hook:*`,`governor:check`…) with route/model allowlists + TPM/RPM/cost caps; per-agent budgets w/ consequences (`DOWNGRADE_TO_SIMULATE`,`FREEZE_EXECUTE`,`ALERT_OWNER`); DSL (`WHEN … THEN DENY/REQUIRE_APPROVAL/ESCALATE/SANITIZE/RATE_LIMIT`); CVSS v4 base scoring; jailbreak detection signals; MCP L0–L5 scoring; SIEM/Splunk export; hook control decisions `allow|deny|ask` + bounded steer.
- **Config**: `.amc/budgets.yaml(.sig)`, runtime-firewall policy + signed control journal, approval policy, gateway config, resource manifests — all Ed25519-signed and hash-chained.

## 4. REUSE VERDICTS

- **Runtime Firewall (`runtime/firewall.ts`)** — **KEEP-AS-SERVICE**: clean `evaluateRuntimeFirewall(input)→decision` boundary, already the real interception primitive; wrap directly as the plugin's guard service.
- **Leases + Budgets** — **KEEP-AS-SERVICE**: self-contained signed-token verify + usage-cap evaluators; ideal plugin capability/quota layer.
- **Gateway/Bridge/Toolhub proxies** — **REFACTOR**: real enforcement is entangled with AMC ledger, receipts, Studio; extract the enforce-decision core from the HTTP plumbing before reuse.
- **`enforce/*` advisory modules (DSL, semanticGuardrails, detector, validators, execGuard, policyFirewall)** — **KEEP-AS-SERVICE** as *pure evaluators* (stateless, testable), but **REPLACE their "enforcement" framing** — they gate nothing today.
- **`enforce/resourceManifest`, `formalVerification`, `controlProjection/Simulation`** — **REFACTOR**: valuable but heavyweight and AMC-lifecycle-coupled.
- **`enforce/stubs.ts` + `shield/stubs.ts`** — **REPLACE**: toy one-liners; harness-native controls should supersede.
- **Redteam engine** — **REFACTOR→REPLACE**: harness for evil-MCP/jailbreak scenarios is reusable, but the *synthetic response* core must be replaced with a real target-model driver to have meaning.
- **Watch `continuousMonitor` + `observabilityBridge`** — **KEEP-AS-SERVICE**. **`*LiveDrift` family + 16k-line `liveDriftAlerts.ts`** — **REPLACE**: report-only, disproportionate surface.
- **Approvals** — **KEEP-AS-SERVICE**: coherent HITL subsystem with pluggable delivery.
- **Sandbox** — **KEEP-AS-SERVICE**: thin real Docker wrapper.

## 5. SURPRISES & DEBT

- **Advisory-as-enforcement gap**: the name `src/enforce/` implies runtime blocking, but ~55 of 58 modules never touch the traffic path — only `guardrailControlState` bindings do. The real enforcer is `src/runtime/firewall.ts`, filed outside `enforce/`.
- **Redteam calls no model**: `runner.ts`/`mcpAgentProvider.ts` score a *hardcoded cautious synthetic agent*; a "red-team pass" says nothing about the real target — potentially contradicts marketing of adversarial testing.
- **Massive single file**: `liveDriftAlerts.ts` at **15,979 lines** (violates the 800-line ceiling ~20×), with ~26 near-clone `*LiveDrift` satellites — heavy duplication/vendor-name sprawl (garage, bisheng, lmnr, helm, promptfoo, patronus…).
- **Duplicated drift files**: `src/drift/bishengObservabilityLiveDrift.ts` (12 LOC re-export shim) vs `src/watch/bishengObservabilityLiveDrift.ts` (495 LOC) — split-brain across `drift/`, `watch/`, `score/`.
- **Stub modules shipped as features**: `enforce/stubs.ts` geoFence returns allowed unless regions listed; temporalControls hardcodes 06:00–22:00; secretBlind/clipboard are 4-regex toys — yet exported through `enforce/index.ts` as first-class controls.
- **Two overlapping red-team engines**: `redteam/` (offline) and `shield/continuousRedTeam.ts` (evolutionary) with independent generators — no shared taxonomy.
- **Overlapping guard surfaces**: `policyFirewall` (regex), `runtime/firewall` (regex), `shield/detector` (regex), and `validators/` all re-implement prompt-injection matching separately, so patterns drift between them.
- **Naming inconsistency**: `enforce/circuitBreaker.ts` (per-session, advisory) vs `ops/circuitBreaker.ts` (the one the gateway/bridge actually use) — two unrelated breakers.