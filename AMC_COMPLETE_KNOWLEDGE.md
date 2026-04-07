# AMC Complete Knowledge Base
## Agent Maturity Compass — Full Codebase Reference

**Compiled:** April 2026
**Repo:** /Users/sid/AgentMaturityCompass
**GitHub:** AgentMaturity/AgentMaturityCompass
**License:** MIT
**Author:** Sid (AgentMaturity)

---

## 1. WHAT AMC IS

AMC is an open-source, evidence-based framework for measuring, comparing, and communicating the operational maturity of AI agents. Think "credit score for AI agents." The core thesis: trust in autonomous systems must be earned through demonstrated behavior, not self-reported claims.

**Tagline:** "Score your agent. Red-team it. Ship it with proof."

**Key Stats:**
- 235 core diagnostic questions across 5 dimensions
- 147 assurance packs (red-team scenarios)
- 40 industry domain packs across 7 sectors
- 94 scoring modules
- 14 framework adapters
- 4,400+ tests (291 TS + 93 Python + 7 E2E)
- 842 CLI commands
- ~700+ TypeScript source files

---

## 2. MATURITY MODEL

### 2.1 Six Levels (L0-L5)

| Level | Name | Score Range | Description |
|-------|------|-------------|-------------|
| L0 | Undocumented | 0-14 | No evidence, no governance |
| L1 | Awareness | 15-34 | Sparse, unstructured evidence |
| L2 | Defined | 35-54 | Documented but inconsistent |
| L3 | Operational | 55-74 | Repeatable, measurable |
| L4 | Managed | 75-89 | Continuously monitored, OBSERVED evidence |
| L5 | Optimizing | 90-100 | Self-correcting, Merkle-anchored, OBSERVED-only |

### 2.2 Five Dimensions (Layers)

| Dim | Name | Questions |
|-----|------|-----------|
| 1 | Strategic Agent Operations | 16 |
| 2 | Agent Leadership | 20 |
| 3 | Agent Culture | 94 |
| 4 | Agent Resilience | 52 |
| 5 | Agent Skills | 53 |
| **Total** | | **235** |

### 2.3 Scoring Formula

```
M(a,d,t) = Σ w_i(kind) · s_i · decay(t - t_i) / Σ w_i(kind) · decay(t - t_i)
```

Internal scores: 0-1 (canonical). Display scores: 0-100 (configurable).

**Level Thresholds:** L5≥0.9, L4≥0.75, L3≥0.55, L2≥0.35, L1≥0.15

### 2.4 Evidence Trust Tiers

| Tier | Weight | Description |
|------|--------|-------------|
| OBSERVED_HARDENED | 1.1x | Hardware-attested observation |
| OBSERVED | 1.0x | Captured by AMC gateway in real-time |
| ATTESTED | 0.8x | Elevated via auditor attestation |
| SELF_REPORTED | 0.4x | Agent/operator declaration |

**Evidence Decay:** Exponential with 90-day half-life. Evidence >90 days drops one trust tier.

### 2.5 Evidence Gates (per level)

| Level | Evidence Types | Min Events | Min Sessions | Min Days | Trust Required |
|-------|---------------|------------|--------------|----------|----------------|
| L0 | none | 0 | 0 | 0 | any |
| L1 | stdout | 2 | 1 | 1 | any |
| L2 | +review | 4 | 2 | 2 | any |
| L3 | +audit+metric | 8 | 3 | 3 | any |
| L4 | +artifact | 12 | 5 | 7 | any |
| L5 | +test | 16 | 8 | 10 | OBSERVED only |

### 2.6 Scoring Tiers

| Tier | Questions | Use Case |
|------|-----------|----------|
| Rapid | 5 sentinel | Ultra-fast pulse check |
| Quick | 10 (2/layer) | Quick maturity snapshot |
| Standard | 235 (full) | Complete assessment |
| Deep | 235 (full) | Full with extended analysis |

### 2.7 Risk Tiers (with auto-escalation)

| Risk | Questions | Trigger |
|------|-----------|---------|
| Low | 50 | Default for low-risk agents |
| Med | 100 | Score regression detected |
| High | 150 | + security incidents |
| Critical | 235 | Full assessment required |

---

## 3. ARCHITECTURE

### 3.1 Runtime Topology

```
CLI (amc) → Studio API + Console → Workspace (.amc) + Ledger + Merkle
  → Bridge/Gateway (provider routes + lease auth)
  → Notary (optional external signing)
  → Ops subsystems (retention, backup, maintenance, metrics)
  → Feature engines (assurance, audit, compliance, value, forecast)
```

### 3.2 Ten Architectural Planes

1. **Entry/Control** — CLI (src/cli.ts ~21K lines), Studio
2. **Trust/Identity/Auth** — Vault, Notary, Leases, RBAC, OIDC/SAML/SCIM
3. **Evidence/Verifiability** — Ledger (SQLite), Receipts, Transparency/Merkle
4. **Agent Traffic/Integration** — Gateway, Bridge, 14 Adapters
5. **Governance/Policy** — Governor, Approvals, Policy Packs, Work Orders
6. **Assurance/Audit/Compliance** — 147 packs, 9 compliance frameworks
7. **Operations/Reliability** — Circuit breakers, retention, backup
8. **Data/State** — SQLite stores, YAML configs, JSONL logs
9. **Deployment** — Docker, Compose, Helm, K8s, Vercel
10. **Feature Engines** — Scoring, Forecast, Experiments, Federation

### 3.3 Eight Product Surfaces

| Surface | Purpose |
|---------|---------|
| **Score** | 235-question diagnostic, quickscore, maturity levels |
| **Shield** | 147 assurance packs, red-team testing |
| **Enforce** | Runtime guardrails, circuit breakers, sandboxing |
| **Vault** | Secrets, DLP, privacy, data residency |
| **Watch** | Monitoring, observability, behavioral profiling |
| **Fleet** | Multi-agent orchestration, trust composition |
| **Passport** | Agent identity, trust tokens, cross-platform portability |
| **Comply** | EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP |

---

## 4. SOURCE CODE MAP

### 4.1 Core Engine — src/diagnostic/ (37 files, ~8,500 lines)

**questionBank.ts** (4,755 lines) — THE question database. 235 questions with 6-level gates. QuestionSeed → buildQuestion() with escalating evidence requirements per level. Question IDs: AMC-1.x through AMC-7.x plus AMC-COST, AMC-SPORT, AMC-OPS, AMC-EUAI, AMC-HOQ prefixes.

**runner.ts** (1,688 lines) — Main diagnostic orchestrator. Interactive inquirer-based flow. Multi-model comparison. Imports from nearly every subsystem.

**quickScore.ts** — 10-question scoring (2 per layer). ASCII radar chart.

**rapidQuickscore.ts** — 5 sentinel questions (AMC-1.1, 2.1, 3.1.1, 4.1, 5.1).

**gates.ts** — Evidence gate evaluation. STALE_EVIDENCE_DAYS=90. Trust tier degradation for old evidence.

**audits.ts** — 30+ deterministic audit finding types (CONTRADICTION_FOUND, UNSUPPORTED_HIGH_CLAIM, HALLUCINATION_ADMISSION, etc.).

**calibration.ts / selfCalibration.ts / selfModelCalibration.ts** — ECE, MCE, Brier score, unknown-unknown detection.

**identityStability.ts** — Behavioral consistency tracking (STYLE_SHIFT, DECISION_REVERSAL, VALUE_INVERSION, PERSONA_BREAK, SAFETY_DRIFT).

**Subdirectories:**
- **autoAnswer/** (5 files) — Automated evidence-based scoring, trace-to-score mapping
- **contextualizer/** (4 files) — Agent-type-specific diagnostics (code/support/ops/research/sales)
- **bank/** (7 files) — Diagnostic bank persistence with YAML + crypto signing

### 4.2 Scoring Engine — src/score/ (94 files)

**Foundation:**
- **formalSpec.ts** — Core formula: computeMaturityScore(), evidenceDecay(), improvementVelocity()
- **scoringScale.ts** — 0-1 internal ↔ 0-100 display conversion
- **scoreHistory.ts** — SQLite-backed score snapshots, regression detection
- **scoreExplainer.ts** — Score decomposition into contributing factors
- **statisticalAnalysis.ts** — Confidence intervals, A/B testing, sample size estimation

**Evidence Management (7 files):**
- evidenceCollector, evidenceIngestion (TRUST_WEIGHTS), evidenceConflict, evidenceCoverageGap, claimProvenance (tier promotion), claimExpiry (TTL), densityMap

**Dimension Scorers:**
- **operationalIndependence.ts** (885 lines) — LARGEST. External dependency tracking, drift, SPoF, graceful degradation, vendor lock-in. Weighted composite of 7 sub-scores.
- **memoryMaturity.ts** (643 lines) — Hash-chain integrity, persistence probes, poisoning detection
- **humanOversightQuality.ts** (476 lines) — Approval theater detection, reviewer concentration risk
- **ragMaturity.ts** (602 lines) — 6 dimensions: retrieval quality, chunking, freshness, production readiness, provenance, security
- **multiAgentDimension.ts** — 8th dimension: MA-1 through MA-8

**Trust & Identity (8 files):**
- crossAgentTrust (HMAC-SHA256 identity, transitive trust with BFS), mutualVerification (agent-to-agent protocol), outputAttestation (signed outputs), networkTransparencyLog (Merkle tree), identityContinuity, runtimeIdentityMaturity, reputationPortability, communityGovernance

**Safety & Security (15 files):**
- adversarial/antiGaming/gamingResistance — Goodhart's Law resistance, 5 attack vectors
- safetyMetrics — Dual-layer: deterministic classifiers + LLM-as-judge
- sleeperDetection — Behavioral inconsistency across contexts (deceptive alignment)
- processDeceptionDetection (AMC-7.1-7.12) — Alignment faking, sandbagging, scheming
- oversightIntegrity (AMC-7.13-7.18) — Prevents AI undermining oversight
- capabilityGovernance (AMC-7.19-7.30) — CBRN, autonomous replication resistance
- organizationalSafetyPosture (AMC-7.31-7.40) — RSP compliance, safety culture
- monitorBypassResistance, failSecureGovernance, kernelSandboxMaturity, adaptiveAccessControl, memorySecurityArchitecture, agentProtocolSecurity

**Compliance (6 files):**
- crossFrameworkMapping — Auto-maps to 9 frameworks (NIST, ISO 42001, EU AI Act, SOC2, GDPR, MITRE ATLAS, OWASP)
- domainPacks (763 lines) — 9 domain packs: Healthcare/FDA/HIPAA, Financial/SR 11-7, Safety-Critical/IEC 61508, Education/FERPA, Environment/NERC CIP, Mobility/ISO 26262, Governance, Technology, Wealth

**Simulation & Forecast Lane (5 files):**
- forecastLegitimacy (AMC-6.1-6.10), factSimulationBoundary (AMC-6.11-6.17), syntheticIdentityGovernance (AMC-6.18-6.25), simulationValidity (AMC-6.30-6.36), scenarioProvenance (AMC-6.26-6.29)

**Prediction (4 files):**
- predictiveMaturity — Linear regression on M(a,d,t) trajectories, 30-day predictions
- predictiveValidity (928 lines) — ECE/MCE/Brier, inter-rater reliability (ICC), longitudinal drift

**Architecture & Operational (10 files):**
- architectureTaskAlignment, productionReadiness, agentVsWorkflow (classify: workflow→agent), orchestrationDAG, leanAMC (team-size-aware), platformDependency, testProdParity, costPredictability, autonomyDuration, graduatedAutonomy (SUPERVISED→GUIDED→AUTONOMOUS→FULL_AUTO)

**Quality & Explainability (10 files):**
- decisionExplainability, interpretability, behavioralTransparency, calibrationGap, faithfulness, factuality (3 axes), alignmentIndex, pauseQuality, reasoningEfficiency, capabilityElicitation

### 4.3 Assurance — src/assurance/

**assuranceRunner.ts** (761 lines) — Orchestrates pack loading, scenario generation, prompt building, validation, scoring. Parallel execution with concurrency control.

**assuranceStore.ts** — SQLite persistence for runs/scenarios/results.

**assuranceScoring.ts** — pass=100, fail=70-(reasons*20) clamped [0,100]. Severity penalties: CRITICAL=40, HIGH=20, MEDIUM=10.

**microCanary.ts** (904 lines) — Canary deployment system with regression detection.

**falsePositiveTracker.ts** — FP tracking with future scoring adjustment.

**147 Packs** including: injectionPack, hallucinationPack, toolMisusePack, sandboxBoundaryPack, configLintPack, dlpExfiltrationPack.

### 4.4 Enforce — src/enforce/ (30+ modules, E1-E34)

**Policy & Access:** policyFirewall (E1), abac, stepUpAuth, twoPersonAuth (E19)
**Execution Guards:** execGuard (E2), browserGuardrails (E3), sandboxOrchestrator, circuitBreaker (E5, threshold=5, reset=30s)
**Network:** egressProxy (E4), schemaGate (E6), webhookGateway (E14, HMAC-SHA256)
**Security:** taintTracker (E9), secretBlind (E3), antiPhishing (E16)
**Safety:** safetyDSL (E15, inspired by AgentSpec/NeMo Colang), formalVerification (E34, 994 lines), semanticGuardrails
**Operational:** dryRun (E17), idempotency (E29), temporalControls (E27), geoFence (E28)
**Evidence:** evidenceEmitter (SQLite guard_events), evidenceContract (E24), consensus, modeSwitcher

### 4.5 Shield — src/shield/ (23+ modules, S-codes)

**Core:** analyzer (S1), detector (S2), signing (S3), sanitizer (S4), ingress (S5)
**Advanced Threats:** advancedThreats (616 lines, multi-vector), continuousRedTeam (611 lines, evolutionary CrescendoStrategy), dynamicAttackGenerator
**Trust Pipeline:** trustPipeline (shield gate → formal verification → ZK proof → trust token), shieldGuardOrchestrator (686 lines, PreActionTrustGate)
**Specialized:** oauthScope (S12), mcpSecurityAnalyzer (520 lines, L0-L5 scoring), attachmentDetonation (S11), conversationIntegrity (S14)
**Validators:** PII, competitors, blocklist, financial/medical advice validators

### 4.6 Vault — src/vault/ (8 modules)

**vault.ts** (528 lines) — VaultSession with 30min TTL, 4 key kinds, RSA key pairs
**secretsBroker.ts** — AES-256-GCM encryption, full access audit log
**zkPrivacy.ts** (730 lines) — Schnorr protocol, Sigma range proofs, Pedersen commitments, Merkle selective disclosure, Shamir secret sharing (secp256k1)
**dlp.ts** — 8 regex patterns: email, phone, SSN, credit card, API keys
**dataResidency.ts** — Region-based data compliance

### 4.7 Watch — src/watch/ (15 modules)

**continuousMonitor.ts** (432 lines) — Real-time scoring on intervals (scoring=5min, drift=15min, anomaly=1hr). Score drop >10% triggers alert.
**observabilityBridge.ts** (1,157 lines) — LARGEST. Normalizes traces from OTLP, Langfuse, Helicone, Datadog, Webhooks. 20-model cost table.
**realtimeAssurance.ts** (708 lines) — 9 built-in live checks: cost-spike, budget-exceeded, high-latency, error-rate, tool-failure, model-misuse, hallucination-pattern, data-leakage, governance-bypass.
**behavioralProfiler.ts** — Online learning (Welford's algorithm), anomaly detection (2.5σ threshold)
**siemExporter.ts** — CEF, LEEF, JSON-LD, Splunk HEC, Elastic ECS. MITRE ATT&CK mapping.

### 4.8 Fleet — src/fleet/ (12 files)

**governance.ts** (963 lines) — Environment-aware policies, SLO definitions with NL parsing, fleet health dashboard, compliance reports.
**cascadeSimulator.ts** (942 lines) — Fault injection, cascade propagation, 5 patterns: trust_erosion_chain, silent_corruption_chain, blast_radius_exceeded, MiroFish gap, handoff_decay.
**registry.ts** (658 lines) — Agent lifecycle (scaffold/add/remove/list), provider template system.
**trustComposition.ts** — Composite trust for multi-agent topology.
**trustInheritance.ts** — Trust decay per delegation hop.

### 4.9 Bridge — src/bridge/ (22 files)

**bridgeServer.ts** (952 lines) — Full LLM request lifecycle: lease verification → prompt pack enforcement → gateway forwarding → truthguard validation → receipt generation. Streaming support.
**Provider Compat:** openaiCompat, anthropicCompat, geminiCompat, openrouterCompat, xaiCompat, localMockCompat.
**modelTaxonomy.ts** — Model classification by capabilities.

### 4.10 Gateway — src/gateway/ (3 files)

**server.ts** (1,831 lines) — HTTP/HTTPS proxy with CONNECT tunneling. Lease verification per request. CIDR allowlisting. Rate limiting. Circuit breaker.

### 4.11 MCP Server — src/mcp/ (2 files)

**amcMcpServer.ts** (731 lines) — MCP server with 4 tools + 1 resource:
- amc_score, amc_list_evidence, amc_query_diagnostic, amc_get_recommendations
- Resource: amc://agent/{agentId} (transparency report)
- Compatible with: Claude Code, Cursor, Copilot, Windsurf, Kiro, Codex

### 4.12 SDK — src/sdk/ (19 files)

**autoInstrument.ts** (951 lines) — Monkey-patches 9 LLM clients at runtime: OpenAI, Anthropic, Google, Groq, Cohere, Mistral, Azure, OpenRouter, Together AI.
**Integrations:** openai, anthropic, gemini, langchainJs, langgraphJs, vercelAiSdk, openaiAgentsSdk.

### 4.13 Adapters — src/adapters/ (27 files)

14 built-in adapters: langchainNode, langchainPython, langgraphPython, llamaindexPython, crewaiCli, autogenCli, openaiAgentsSdk, semanticKernel, claudeCli, geminiCli, openhandsCli, openclawCli, genericCli, pythonAmcSdk.
3-tier standardization: basic (pass-through), standard (normalized), advanced (full AMC).

### 4.14 API — src/api/ (35 files, 200+ REST endpoints)

Raw Node.js HTTP server (no Express). Zod validation. 31 domain routers:
scoreRouter (677 lines), fleetRouter, gatewayRouter, adaptersRouter, evidenceRouter, securityRouter, configRouter, driftRouter, sandboxRouter, incidentRouter, shieldRouter, enforceRouter, watchRouter, vaultRouter, productRouter, assuranceRouter (617 lines), agentTimelineRouter, passportRouter, ciRouter, benchmarkRouter, workflowRouter, governorRouter, toolsRouter (405 lines), identityRouter, cryptoRouter (320 lines), canaryRouter, complianceRouter (464 lines), bomRouter, metricsRouter, exportRouter, memoryRouter.

### 4.15 Claims — src/claims/ (13 files)

Claim lifecycle: QUARANTINE → PROVISIONAL → PROMOTED → EXPIRED/DEPRECATED/REVOKED.
ClaimProvenanceTag: OBSERVED_FACT, DERIVED_PATTERN, HYPOTHESIS, SESSION_LOCAL, REFERENCE_ONLY.
SHA256 hash chains + Ed25519 signatures. Quarantine policy: minDistinctSessions=3, minDistinctDays=2, minEvidenceEvents=5.
Contradiction detection: LEVEL_CONFLICT (delta≥2), EVIDENCE_CONFLICT, ASSERTION_CONFLICT.

### 4.16 Compliance — src/compliance/ (12 files)

Built-in mappings: SOC2, ISO 27001, NIST, EU AI Act.
EU AI Act classifier: UNACCEPTABLE/HIGH/LIMITED/MINIMAL risk levels.
Data residency: region policies, key custody modes (local/notary/external-kms/hsm), legal-hold.
FedRAMP integration with impact levels and control families.
Regulatory automation: RSS/API/web scrape feeds, change detection, impact scoring.

### 4.17 Governor — src/governor/ (12 files)

**actionPolicyEngine.ts** — Core policy enforcement with YAML loading + signature verification.
**nlPolicy.ts** — Natural language → AMC Governor YAML (deterministic, no LLM).
**policyCanary.ts** — A/B enforcement rollout with rollback packs.
**emergencyOverride.ts** — TTL-limited governance bypass, mandatory 48h postmortem.
**confidenceGovernor.ts** — Meta-confidence × autonomy decisions (L4 @ 0.3 confidence ≠ L4 @ 0.9).
**policyDebt.ts** — Tracks waivers/overrides/exceptions with hash-chained entries.

### 4.18 Identity — src/identity/ (12+ files)

OIDC: JWT verification with JWKS discovery, PKCE (S256) auth flow.
SAML: Response handling with Ed25519 verification.
SCIM: Full REST API for user/group provisioning (create/get/list/patch/replace/disable).

### 4.19 Incidents — src/incidents/ (7 files)

IncidentState: OPEN → INVESTIGATING → MITIGATED → RESOLVED → POSTMORTEM.
CausalRelationship: CAUSED, ENABLED, BLOCKED, MITIGATED, FIXED, CORRELATED.
Signed causal edges with confidence + evidence refs. Auto-assembly from drift/freeze events.

### 4.20 Passport — src/passport/ (14 files)

PassportJson v1: passportId, scope (WORKSPACE/NODE/AGENT), trust metrics, governance/maturity status.
**trustInterchange.ts** — Universal Trust Interchange Protocol: AMCTrustToken for cross-platform portability (langsmith, langfuse, custom).

### 4.21 Forecast — src/forecast/ (16 files)

**forecastEngine.ts** — Signal collection, Theil-Sen regression, EWMA, drift/anomaly/change point detection.
**anomalyDetector.ts** — Suspicious maturity jumps via robust Z-scores.
**changePoint.ts** — CUSUM change point detection.
5 risk indices, 5 value dimensions. Advisory categories: DRIFT, ANOMALY, RISK_INDEX, VALUE_REGRESSION, INTEGRITY, GOVERNANCE, BUDGET, NOTARY.

### 4.22 Experiments — src/experiments/ (7 files)

"Same model, different policy/prompt architecture" experiments.
ArchitectureSpec kinds: POLICY_FRAME, PROMPT_STRUCTURE, IDENTITY_DOC, GUARDRAIL_SET.
Bootstrap CI + effect size. Gate presets: strict (3% uplift), balanced (1%), exploratory (0%).

### 4.23 Federation — src/federation/ (6 files)

Cross-org trust federation via Ed25519 signed tar.gz bundles.
Share policies: benchmarks, certs, BOM, transparency roots, plugins. Merkle proofs for bundle integrity.

### 4.24 Other Modules

**Ledger** (src/ledger/) — Core SQLite evidence ledger. Hash-chained + signed. Central persistence backbone.
**Notary** (src/notary/) — Ed25519 attestation service with HMAC-SHA256 request auth.
**Crypto** (src/crypto/) — Ed25519 key management (4 key kinds: monitor, auditor, lease, session).
**Trust** (src/trust/) — Temporal decay with configurable half-lives (behavioral=14d, assurance=30d, cryptographic=90d, selfReported=7d).
**Transparency** (src/transparency/) — JSONL append-only log + Merkle tree + signed seals.
**Domains** (src/domains/) — 7 domains with regulation-specific questions and 5-level rubrics.
**Values** (src/values/) — Kendall's tau preference consistency, empowerment scoring (Anthropic research).
**Learning** (src/learning/) — Closed-loop trace learning from corrections.
**Corrections** (src/corrections/) — Correction lifecycle with effectiveness verification.
**Lab** (src/lab/) — Model cognition research, task decomposition attack pack.
**Mechanic** (src/mechanic/) — Auto-fixer mapping question IDs → typed fix plans with rollback.
**Product** (src/product/) — Autonomy dial, metering, loop detection, retry engine, workflow engine.

---

## 5. TYPE SYSTEM — src/types.ts (556 lines)

**Key Type Unions:**
- RuntimeName: claude | gemini | openclaw | unknown | mock | any | gateway | sandbox
- EvidenceEventType: 26 values (stdin, stdout, stderr, artifact, metric, test, audit, review, llm_request/response, tool_action/result, agent_process_*, agent_handoff_*, agent_delegation_*)
- RiskTier: low | med | high | critical
- TrustTier: OBSERVED | OBSERVED_HARDENED | ATTESTED | SELF_REPORTED
- ActionClass: 9 values (READ_ONLY, WRITE_LOW, WRITE_HIGH, DEPLOY, SECURITY, FINANCIAL, NETWORK_EXTERNAL, DATA_EXPORT, IDENTITY)
- LayerName: 5 dimensions
- TrustLabel: HIGH TRUST → UNRELIABLE

**Key Interfaces:**
- EvidenceEvent (with chain hashing, blob refs)
- DiagnosticQuestion, Gate, GateConstraint
- QuestionScore, LayerScore, DiagnosticReport
- AMCConfig (runtimes, security, supervise)
- GatePolicy (minIntegrityIndex, minOverall, experiment requirements)
- OutcomeEvent/Contract/MetricResult/Report

---

## 6. CLI ENTRY POINT — src/cli.ts (~21,000 lines)

Commander-based CLI importing from 100+ internal modules. Binary: `amc`.

**Key Commands:**
- `amc quickscore` — Quick 10-question assessment (--rapid for 5q, --auto for evidence-based)
- `amc init` — Initialize workspace
- `amc doctor` — Health check
- `amc studio start` — Start Studio API + Console
- `amc gateway start` — Start API gateway proxy
- `amc bridge start` — Start LLM bridge
- `amc fleet init/add/list` — Fleet management
- `amc assurance run` — Run red-team packs
- `amc comply init/report` — Compliance assessment
- `amc badge export` — Generate maturity badge SVG
- `amc passport issue/verify` — Agent passport management
- `amc mcp serve` — Start MCP server for IDE integration

---

## 7. WORKSPACE STRUCTURE — src/workspace.ts (772 lines)

`initWorkspace()` creates the `.amc/` directory tree:

```
.amc/
├── keys/           (Ed25519 key pairs: monitor, auditor, lease, session)
├── blobs/          (encrypted binary storage)
├── targets/        (target profiles per question)
├── runs/           (diagnostic run results)
├── reports/        (generated reports)
├── bundles/        (evidence bundles)
├── fleet/          (multi-agent registry)
├── governor/       (action policies, debt)
├── diagnostic/     (bank YAML)
├── forecast/       (predictions)
├── transparency/   (JSONL log + Merkle)
├── guard_events.sqlite  (enforce evidence)
├── amc.config.yaml
├── guardrails.yaml
├── trust.yaml
├── tools.yaml
├── budgets.yaml
├── gateway.yaml
├── bridge.yaml
└── fleet.yaml
```

**Profiles:** dev (relaxed), ci (strict), prod (production hardened).

---

## 8. TRUST PROTOCOL

### Agent-to-Agent Trust Flow

```
Request Token → Present Token → Verify (signature, expiry, claims)
  → Apply Policy → Task Execution (scoped) → Record Trust Edge
```

**Trust Levels by Score:**
- ≥0.80: full (read, write, execute, delegate)
- ≥0.60: conditional (read, write)
- ≥0.40: limited (read)
- <0.40: untrusted (none)

**Trust Graph:** BFS traversal, max 3 hops, 30% attenuation per hop.

**Industry Presets:**
- Healthcare: 4h half-life, min L4, TTL 6h
- Finance: 8h half-life, min L3, TTL 12h
- Defense: step decay at 4h, L5 required, TTL 4h

---

## 9. TEST SUITE

### 9.1 Scale
- 291 TypeScript test files (~68,449 lines)
- 93 Python test files (~21,187 lines)
- 7 Playwright E2E specs
- 4,400+ total tests

### 9.2 Framework
- TypeScript: Vitest (describe/it/expect)
- Python: pytest with fixtures
- E2E: Playwright
- Coverage thresholds: lines 70%, functions 70%, branches 60%, statements 70%

### 9.3 Test Patterns
- Filesystem-based workspace isolation (mkdtempSync)
- Score boundary testing (0 for empty, 100 for all artifacts)
- Property-based testing (seeded RNG, shuffled inputs)
- Minimal mocking — real SQLite, real filesystem
- Event-driven testing (EventEmitter)

### 9.4 Coverage Areas
23 test directories: assurance, badge, benchmarks, compliance, diagnostic, dx, e2e, evaluation, guide, hallucination, integration, integrations, lint, mirofish, observability, outcomes, performance, redteam, score (60+), security, telemetry, watch.

---

## 10. CI/CD & DEPLOYMENT

### 10.1 GitHub Actions (9 workflows)
- **ci.yml** — PR/push: lint, typecheck, test, build, Docker smoke, Helm lint, security scan
- **npm-publish.yml** — Changesets-based release to npm with provenance
- **release.yml** — Full release: Docker push (ghcr.io), SEA binary, npm publish, Homebrew tap
- **docker-build.yml** — Docker image build + smoke tests
- **docker-runner.yml** — Runner image (ghcr.io/agentmaturity/amc-runner)
- **nightly-compatibility-matrix.yml** — Cross-platform (ubuntu/macos × Node 20/22)
- **pages.yml** — GitHub Pages deployment
- **amc-score.yml** — Reusable scoring workflow
- **amc-pr-gate.yml** — PR quality gate (target L3, fail on drop)

### 10.2 Docker
- Image: ghcr.io/agentmaturity/amc-studio
- Ports: 3210 (gateway), 3211 (proxy), 3212 (studio API), 3213 (toolhub), 4173 (dashboard)
- Security: read_only, no-new-privileges, cap_drop ALL, tmpfs /tmp (noexec, 64m)

### 10.3 Kubernetes/Helm
- Chart: deploy/helm/amc/
- PVC: 10Gi workspace, 2Gi notary
- Resources: 200m-1000m CPU, 512Mi-2Gi memory
- NetworkPolicy enabled, PDB minAvailable=1
- SecurityContext: runAsNonRoot, user 10001, readOnlyRootFilesystem

### 10.4 Configuration Defaults

**Gateway:** 6 upstream routes (openai, anthropic, gemini, grok, openrouter, local)
**Budgets:** 500 LLM requests/day, 5M tokens/day, $50/day max
**Tools:** denyByDefault=true, allowlist with action classes
**Fleet:** mandatoryTrustTierForLevel5=OBSERVED, 90-day retention

---

## 11. PRICING MODEL

**Core: FREE forever (MIT)**
- Full trust stack (Score, Shield, Enforce, Vault, Watch, Fleet, Passport, Comply)
- All 14 framework adapters
- All 376+ CLI commands
- 235 diagnostic questions
- 147 assurance packs

**Paid: Industry Packs only (40 domain packs)**

| Tier | Content |
|------|---------|
| Free/OSS | Full trust stack, all adapters |
| Pro | + Selected industry packs for your verticals |
| Enterprise | All 40 industry packs + priority support + custom |

**Promise:** MIT-licensed features will never become paid.

---

## 12. COMPETITIVE LANDSCAPE

**Category:** "Trust scorecard for AI agents" — GREENFIELD position.

**Primary Threat:** Promptfoo (300K+ devs)
- Promptfoo = "test your prompts" / AMC = "trust your agents"

**AMC Unique Moats vs Promptfoo:**
- Cryptographic evidence chains (Ed25519, Merkle)
- L0-L5 maturity model (not just pass/fail)
- Evidence trust tiers (weighted scoring)
- Gateway behavioral capture (transparent proxy)
- Agent-level assessment (vs prompt-level)

**Adjacent Competitors:**
- Eval/Red-Team: Promptfoo, DeepEval, Giskard
- Observability: LangSmith, Langfuse, Helicone, Arize Phoenix
- Compliance: Credo AI, Holistic AI, IBM AI FactSheets
- Security: Lakera Guard, Robust Intelligence, NVIDIA NeMo Guardrails

**Timeline:** EU AI Act enforcement Aug 2026 makes AMC compliance features critical.

---

## 13. KEY WHITEPAPER FINDINGS

- Keyword-based scoring inflated by **84 points** vs execution-verified scoring
- Human-guided agent reached **94/100**; autonomous agent reached **80/100** from identical L0 baselines
- Novel modules: Bloom-inspired behavioral eval, METR task horizons, Google FACTS factuality
- Autonomous self-improvement loop: Diagnose → Fix → Re-Score
- Compliance coverage: EU AI Act (12 articles), ISO 42001, NIST AI RMF, SOC 2

---

## 14. CROSS-CUTTING PATTERNS

1. **Cryptographic Integrity:** SHA256 hash chaining + Ed25519 signatures throughout
2. **Persistence:** SQLite (better-sqlite3) for data, YAML for config, JSONL for logs
3. **Validation:** Zod schemas everywhere for runtime type safety
4. **Trust Tiers:** OBSERVED > ATTESTED > SELF_REPORTED is foundational
5. **Transparency:** JSONL + Merkle tree referenced by claims, experiments, forecasts, federation
6. **Governance Chain:** governor → claims → transparency → ledger
7. **Evidence Chain:** All modules emit to SQLite stores and/or append-only ledger
8. **Layered API Pattern:** Schema → Generator → Loader → API → CLI
9. **Event-Driven:** Heavy EventEmitter for loose coupling (monitor → profiler → dashboard → alerting)
10. **Backward Compat:** Every module has wrapper functions and stubs.ts for legacy APIs

---

## 15. BLOCKED ITEMS (Require Sid)

1. **npm publish** — Sid must `npm login` + `npm publish`
2. **Stripe payment links** — For Pro/Enterprise tiers
3. **LinkedIn outreach** — Marketing
4. **Podbean** — Cancel after Apr 6
5. **Giggr** — ON HOLD
6. **Sales** — ON HOLD (POLARIS sprint blocked)

---

## 16. QUICK REFERENCE

```bash
# Install
npm install -g agent-maturity-compass

# Quick score
amc quickscore
amc quickscore --rapid     # 5 questions
amc quickscore --auto      # evidence-based

# Initialize workspace
amc init

# Health check
amc doctor

# Start studio
amc studio start

# Run assurance packs
amc assurance run

# Generate badge
amc badge export

# Start MCP server
amc mcp serve

# Fleet management
amc fleet init
amc fleet add
amc fleet list

# Compliance report
amc comply init
amc comply report

# Build & test
npm run build
npm test                    # 4,400+ tests
npm run typecheck
npm run test:e2e            # Playwright
```
