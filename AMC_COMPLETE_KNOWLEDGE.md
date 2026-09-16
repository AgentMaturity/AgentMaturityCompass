# AMC Complete Knowledge Base
## Agent Maturity Compass — Full Codebase Reference

**Compiled:** April 2026; refreshed 2026-07-13 from repository, Codex archive, GitHub, npm, production, and Linear verification
**Repo:** /Users/sid/AgentMaturityCompass
**GitHub:** AgentMaturity/AgentMaturityCompass
**License:** MIT
**Author:** Sid (AgentMaturity)

**Evidence cutoff:** repository `main` at `6579367f7368d0e48b28873aac950b48fab6a858` (`Record AMC-1479 publication evidence`). The AMC-1479 implementation is the parent commit `0ce35bc1167e0dd554a29081378f3ecf630cc1f3`. Treat this as a dated snapshot: the persistent Codex product-improvement goal remains active and later commits can supersede counts and status.

**Post-cutoff work observed but not classified as shipped:** Codex opened Linear `AMC-1480` and made uncommitted local changes for read-only hook-health/last-event diagnostics. The draft joins signed hook-installation state to existing verified ledger evidence and distinguishes `not_installed`, `awaiting_first_event`, `observed`, and `fail_closed`; its output is historical, `recorded: false`, and `proofEligible: false`, not a heartbeat or current-provider-liveness claim. It was still dirty, unpublished, and under focused test/debug work when this snapshot was prepared.

---

## 1. WHAT AMC IS

AMC is an open-source, evidence-based framework for measuring, comparing, and communicating the operational maturity of AI agents. Think "credit score for AI agents." The core thesis: trust in autonomous systems must be earned through demonstrated behavior, not self-reported claims.

**Product promise:** "Run one command. Get the full score. Fix the gaps."
**Trust line:** "Evidence over claims."

**Key Stats:**
- 244 default diagnostic questions across 5 dimensions
- 142 assurance packs (red-team scenarios)
- 41 industry domain packs across 7 sectors
- 102 tracked TypeScript modules under `src/score/` at the evidence cutoff
- 14 framework adapters
- Test counts drift quickly; the final AMC-1479 release receipt and exact-SHA CI on 2026-07-13 recorded **1,075 Vitest files / 8,520 passing tests**
- **1,165** generated public `amc ...` command paths in `docs/CLI_COMMAND_INVENTORY.md`
- **173** allowlisted public Docs guides in the deployed Pages artifact
- Playwright release coverage: **55 passed / 2 intentional conditional i18n skips**
- Package source version **1.1.1**; verified GitHub release `v1.1.1` exists, while the public npm package and Homebrew channel remain unavailable

---

## 2. MATURITY MODEL

### 2.1 Six Levels (L0-L5)

| Level | Name | Score Range | Description |
|-------|------|-------------|-------------|
| L0 | Absent | 0-14 | No evidence, no governance |
| L1 | Initial | 15-34 | Sparse, unstructured evidence |
| L2 | Developing | 35-54 | Documented but inconsistent |
| L3 | Defined | 55-74 | Repeatable, measurable |
| L4 | Managed | 75-89 | Continuously monitored, OBSERVED evidence |
| L5 | Optimizing | 90-100 | Self-correcting, Merkle-anchored, OBSERVED-only |

### 2.2 Five Dimensions (Layers)

| Dim | Name | Questions |
|-----|------|-----------|
| 1 | Strategic Agent Operations | 19 |
| 2 | Leadership & Autonomy | 23 |
| 3 | Culture & Alignment | 95 |
| 4 | Resilience | 55 |
| 5 | Skills | 52 |
| **Total** | | **244** |

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

### 2.6 Artifact Validity and Evidence Readiness

AMC reports artifact status and evidence readiness independently:

- `VALID | INVALID | UNSIGNED` describes the diagnostic artifact and seal.
- `READY | LIMITED | INSUFFICIENT_EVIDENCE | UNVERIFIED` describes whether accepted evidence can support external claims.
- A signed or `VALID` artifact proves integrity, not evidence sufficiency.
- `READY` requires a verified artifact inside the trust boundary, non-zero accepted evidence, integrity index >= 0.60, and `HIGH TRUST` evidence.
- Only `READY` is claim-eligible. AMC maturity levels and compliance mappings are not legal certification.

### 2.7 Scoring Tiers

| Tier | Questions | Use Case |
|------|-----------|----------|
| Rapid | 5 sentinel | Ultra-fast pulse check |
| Quick | 10 (2/layer) | Quick maturity snapshot |
| Standard | 244 (default full) | Complete assessment |
| Deep | 264 (lifecycle-expanded) | Full with extended lifecycle, runtime, proof, memory, and fleet analysis |

### 2.7 Risk Tiers (with auto-escalation)

| Risk | Questions | Trigger |
|------|-----------|---------|
| Low | 50 | Default for low-risk agents |
| Med | 100 | Score regression detected |
| High | 150 | + security incidents |
| Critical | 244 | Full default assessment required |

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

1. **Entry/Control** — CLI (`src/cli.ts` plus split registration files `src/cli-domain-product-commands.ts` and `src/cli-late-stage-commands.ts`), Studio
2. **Trust/Identity/Auth** — Vault, Notary, Leases, RBAC, OIDC/SAML/SCIM
3. **Evidence/Verifiability** — Ledger (SQLite), Receipts, Transparency/Merkle
4. **Agent Traffic/Integration** — Gateway, Bridge, 14 Adapters
5. **Governance/Policy** — Governor, Approvals, Policy Packs, Work Orders
6. **Assurance/Audit/Compliance** — 142 packs, 9 compliance frameworks
7. **Operations/Reliability** — Circuit breakers, retention, backup
8. **Data/State** — SQLite stores, YAML configs, JSONL logs
9. **Deployment** — Docker, Compose, Helm, K8s, Vercel
10. **Feature Engines** — Scoring, Forecast, Experiments, Federation

### 3.3 Eight Product Surfaces

| Surface | Purpose |
|---------|---------|
| **Score** | 244-question default diagnostic, 264-question lifecycle expansion, quickscore, maturity levels |
| **Shield** | 142 assurance packs, red-team testing |
| **Enforce** | Runtime guardrails, circuit breakers, sandboxing |
| **Vault** | Secrets, DLP, privacy, data residency |
| **Watch** | Monitoring, observability, behavioral profiling |
| **Comply** | EU AI Act, ISO 42001, NIST AI RMF, SOC 2, OWASP |
| **Fleet** | Multi-agent orchestration, trust composition |
| **Passport** | Agent identity, trust tokens, cross-platform portability |

**Domain Proof Lane (cross-surface, not a ninth surface):** `src/domainProof/` separates evidence integrity, runtime policy, and domain correctness proof. It adds fail-closed `correctnessProofStatus`, `amcproof` artifacts, source-to-rule manifests, a local toy governance checker, `amc proof check`, and `/api/v1/proof/check`. The HTTP route prefers inline schema-validated objects, requires the canonical AMC toy manifest rather than shape-only substitutes, prohibits caller-selected server output files, realpath-confines deprecated fixture paths, and redacts filesystem errors; the local CLI retains file input/output. It maps to Score, Shield, Enforce, Vault, Watch, Comply, Fleet, and Passport without inflating score when correctness is `unsupported`.

**Studio module API authorization:** protected `/api/v1` routes use signed Studio sessions or the bootstrap admin token and reject agent/lease principals. `src/api/accessPolicy.ts` applies one least-privilege matrix before router dispatch: all human roles may read ordinary reports and use explicitly side-effect-free analyzers; operators run workflows; approvers issue execution tickets; auditors verify or attest; owners control secrets, identity, signing, keys, policy, certificates, and control-plane changes. Unknown mutations fail to operator/owner and unsupported methods fail to owner.

### 3.3a July 2026 distribution, brand, and trust-boundary changes

Before the control-plane wave, Codex shipped a release-readiness and public-identity sequence that changed how AMC is installed, presented, and allowed to make claims:

- `8f444151` hardened the native desktop/Studio path and unified the AMC identity; follow-up dependency and GitHub Action fixes (`51c9d76f` through `a333ecaa`) stabilized packaging and CI.
- `8812324a` separated artifact validity from evidence readiness. A valid signature is no longer allowed to imply sufficient, claim-eligible evidence.
- `ce21fade` contained the Domain Proof API filesystem boundary while preserving local CLI file workflows.
- `4c65a89a` centralized least-privilege Studio module authorization.
- `e71d1373` shipped the verified `v1.1.0` public distribution; release repairs through `ff539022` produced the `v1.1.1` GitHub release and context-aware fresh-install doctor behavior.
- `df0acac2` through `ee8f98b9` unified website, README, Docs, Playground, comparison, maturity taxonomy, changelog, link graph, mobile accessibility, copy controls, commit-pinned Docs artifacts, and first-party typography.

These changes establish one identity across CLI, Studio, desktop, website, and Docs while preserving the rule that public comparison and maturity claims must bind to observed evidence.

### 3.4 Current Connect → Control → Prove architecture (AMC-1461 through AMC-1479)

The July 2026 competitor-response wave did **not** add an Agent Control compatibility engine, a second approval system, or a generic policy language. It connected existing signed AMC primitives into a shorter operator path: connect a provider, observe one action, inspect one control decision, approve or deny it, and export evidence.

| Issue | Implemented capability | Important boundary |
|------|-------------------------|--------------------|
| AMC-1461 | Signed, immutable Guardrails and Runtime Firewall state shared by CLI, API, Dashboard, and runtime | Only 3 of 14 Guardrails entries have real Runtime Firewall bindings; 11 are catalog-only and cannot be presented as active |
| AMC-1462 | Lease-scoped provider-neutral action ingress with encrypted projection, signed receipt, replay protection, and Watch visibility | AMC observes a pinned AEP 0.1 subset; it does not claim AEP conformance or retain raw hook bodies |
| AMC-1463 | Reversible `amc connect hooks install|status|remove` for project-local Claude Code and Gemini CLI hooks | Observe mode is default; ownership, handler bytes, lease, destination, and ignore protection must verify |
| AMC-1464 | Provider-native allow/deny/ask projection from existing ToolHub, Action Policy, Approval Policy, budget, and freeze evaluators | Control is explicit and loopback-only; Gemini's missing native ask capability fails closed to deny; provider-local ask cannot satisfy AMC quorum |
| AMC-1465 | Signed adapter capability receipts binding declared capabilities to runtime probe, selected adapter, hook state, lossiness, and verification state | Valid receipts can prove limitations; plugin and partial probes cannot self-claim AMC verification or maturity |
| AMC-1466 | Verified requested → decision → completed/failed/denied action lifecycle over the existing ledger | Ambiguous Gemini terminal correlation, impossible ordering, cross-agent collision, replay, or tamper fails closed |
| AMC-1467 | Docker Actions upgraded to native Node 24 majors | CI/release maintenance only; no AMC runtime or methodology change |
| AMC-1468 | Current public test proof synchronized to the then-current inventory | Publication-only count repair; historical receipts keep the counts they actually observed |
| AMC-1469 | Read-only `amc policy controls` Scope / When / Then / Status projection over Runtime Firewall, Guardrails, Action Policy, and Approval Policy | Missing owners remain uninitialized; untrusted owners project safe outcomes and CLI exits 2; no runtime evaluator imports the projection |
| AMC-1470 | `amc policy simulate` and API simulation through the production evaluators | Read-only, `record: false`, input-hash-only, no Watch event, receipt, Passport proof, or compliance evidence |
| AMC-1471 | Canonical signed approval inbox plus metadata-only lifecycle delivery, SSE refresh, retry/dead-letter evidence, and strict session revalidation | Notification is `notificationOnly` and `proofEligible: false`; it never grants quorum, a lease, or execution authority |
| AMC-1472 | Four outcome-based activation milestones: connected agent, observed action, control decision, signed proof | Signed setup can be `READY`; configuration alone cannot complete onboarding |
| AMC-1473 | Signed Enforce resource version status, diff, activation, previous version, rollback, drift, and receipts | Exact manifest confirmation, canonical paths, detached snapshot verification, locks, CAS, and rollback are mandatory; `force` cannot bypass integrity failures |
| AMC-1474 | Four immutable action-class scope templates compiled from existing Policy Pack rules into signed Action and Approval policies | Fleet-wide only; no per-agent scope, template DSL, editor, marketplace, or second policy language |
| AMC-1475 | Bounded `gate` / `all` / `any` evidence logic over requirements already declared by an Action Policy rule | No `not`, selector language, custom evaluator, cross-family substitution, or bypass of signature/trust/ticket/budget/freeze/work-order gates |
| AMC-1476 | Capability-gated provider `steer` for trusted ToolHub argument failures | Current call remains blocked; Claude can return bounded corrective context, Gemini records requested steer but effective fail-closed deny; no argument rewrite |
| AMC-1477 | Signed observe/warn/block Runtime Firewall rollout binding and exact-current-policy counters | Caller-supplied simulation cannot produce rollout proof; invalid, legacy, disabled, or historical-policy evidence is excluded or labeled non-claimable |
| AMC-1478 | Signed evaluator registry metadata for existing deterministic metrics, LLM judges, assurance packs, and unverified custom metrics | Registry identity/fingerprints do not prove evaluator execution, success, or claim support |
| AMC-1479 | Strict deterministic YAML/JSON policy fixtures and `amc policy test` CI gate using `simulateControlDecision` | Reports are `simulationOnly`, `recorded: false`, and `proofEligible: false`; exits are 0 pass, 1 mismatch, 2 invalid fixture or untrusted control source |

**Cross-cutting trust rule:** signed configuration, simulation, registry metadata, delivery notifications, and CI fixtures are different artifact classes. None can be silently promoted into observed execution evidence or a maturity/compliance claim.

---

## 4. SOURCE CODE MAP

### 4.1 Core Engine — src/diagnostic/ (47 tracked TypeScript modules)

**questionBank.ts** (5,071 lines at the evidence cutoff) — THE default question database. 244 questions with 6-level gates. QuestionSeed → buildQuestion() with escalating evidence requirements per level. Question IDs: AMC-1.x through AMC-7.x plus AMC-COST, AMC-SPORT, AMC-OPS, AMC-EUAI, AMC-HOQ prefixes.

**runner.ts** (2,265 lines at the evidence cutoff) — Main diagnostic orchestrator. Interactive inquirer-based flow. Multi-model comparison. Imports from nearly every subsystem.

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

### 4.2 Scoring Engine — src/score/ (102 tracked TypeScript modules)

**Foundation:**
- **formalSpec.ts** — Core formula: computeMaturityScore(), evidenceDecay(), improvementVelocity()
- **scoringScale.ts** — 0-1 internal ↔ 0-100 display conversion
- **scoreHistory.ts** — SQLite-backed score snapshots, regression detection
- **scoreExplainer.ts** — Score decomposition into contributing factors
- **statisticalAnalysis.ts** — Confidence intervals, A/B testing, sample size estimation

**Evidence Management (7 files):**
- evidenceCollector, evidenceIngestion (TRUST_WEIGHTS), evidenceConflict, evidenceCoverageGap, claimProvenance (tier promotion), claimExpiry (TTL), densityMap

**Dimension Scorers:**
- **operationalIndependence.ts** (1,297 lines) — External dependency tracking, drift, SPoF, graceful degradation, vendor lock-in. Weighted composite of 7 sub-scores.
- **memoryMaturity.ts** (643 lines) — Hash-chain integrity, persistence probes, poisoning detection
- **humanOversightQuality.ts** (784 lines) — Approval theater detection, reviewer concentration risk
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

### 4.3 Assurance — src/assurance/ (175 tracked TypeScript modules; 142 packs)

**assuranceRunner.ts** (805 lines) — Orchestrates pack loading, scenario generation, prompt building, validation, scoring. Parallel execution with concurrency control.

**assuranceStore.ts** — SQLite persistence for runs/scenarios/results.

**assuranceScoring.ts** — pass=100, fail=70-(reasons*20) clamped [0,100]. Severity penalties: CRITICAL=40, HIGH=20, MEDIUM=10.

**microCanary.ts** (904 lines) — Canary deployment system with regression detection.

**falsePositiveTracker.ts** — FP tracking with future scoring adjustment.

**142 Packs** including: injectionPack, hallucinationPack, toolMisusePack, sandboxBoundaryPack, configLintPack, dlpExfiltrationPack.

### 4.4 Enforce — src/enforce/ (signed runtime and policy control plane)

**Policy & Access:** policyFirewall (E1), abac, stepUpAuth, twoPersonAuth (E19)
**Execution Guards:** execGuard (E2), browserGuardrails (E3), sandboxOrchestrator, circuitBreaker (E5, threshold=5, reset=30s)
**Network:** egressProxy (E4), schemaGate (E6), webhookGateway (E14, HMAC-SHA256)
**Security:** taintTracker (E9), secretBlind (E3), antiPhishing (E16)
**Safety:** safetyDSL (E15, inspired by AgentSpec/NeMo Colang), formalVerification (E34, 994 lines), semanticGuardrails
**Operational:** dryRun (E17), idempotency (E29), temporalControls (E27), geoFence (E28)
**Evidence:** evidenceEmitter (SQLite guard_events), evidenceContract (E24), consensus, modeSwitcher
**Signed runtime truth:** Guardrails journals and Runtime Firewall policy state distinguish requested, effective, bound, trusted, and catalog-only controls. Three Guardrails entries bind to real Runtime Firewall rules; eleven remain non-effective catalog metadata.
**Control inspection and preview:** `controlProjection.ts` creates the shared read-only control view; `controlSimulation.ts` calls the production Runtime Firewall, Action Policy, and Approval Policy evaluators with no recording; `controlInspectionCli.ts` exposes `amc policy controls|simulate|test`.
**Deterministic CI fixtures:** `policyFixtureRunner.ts` strictly parses bounded YAML/JSON suites, rejects duplicate/unknown structures, invokes only `simulateControlDecision`, and returns privacy-safe stable hashes and mismatch codes. The committed fixture is `fixtures/policy/amc-ci-policy-fixtures.yaml`; CI runs it twice through the built CLI and compares output bytes.
**Reusable scopes:** `scopeTemplates.ts` groups the nine existing action classes into four immutable workspace-wide templates. It compiles selected rules from existing built-in Policy Packs into the signed Action and Approval Policy schemas, preserves unselected rules, previews without writes, requires an exact content-bound compile ID, restores prior policy/signature bytes on write/sign/verification failure, and emits existing transparency plus ledger evidence. CLI, API, Studio, OpenAPI, and the verified control projection share the same compiler; no second policy language or per-agent scope exists.
**Nested evidence logic:** `actionEvidenceLogic.ts` adds a strict bounded `gate` / `all` / `any` tree over maturity and assurance requirements already declared by one Action Policy rule. Every declared gate appears exactly once; alternatives cannot cross evidence families; mandatory signature/trust/sandbox/ticket/budget/freeze/work-order/`allowExecute` gates remain outside the tree.
**Version lifecycle:** existing Enforce resource manifests now own signed active/previous/rollback state, detached snapshots, exact-confirm activation, drift status, atomic rollback, and signed lifecycle receipts across CLI/API/Studio.

### 4.5 Shield — src/shield/ (28 tracked TypeScript modules, S-codes)

**Core:** analyzer (S1), detector (S2), signing (S3), sanitizer (S4), ingress (S5)
**Advanced Threats:** advancedThreats (616 lines, multi-vector), continuousRedTeam (611 lines, evolutionary CrescendoStrategy), dynamicAttackGenerator
**Trust Pipeline:** trustPipeline (shield gate → formal verification → ZK proof → trust token), shieldGuardOrchestrator (686 lines, PreActionTrustGate)
**Specialized:** oauthScope (S12), mcpSecurityAnalyzer (520 lines, L0-L5 scoring), attachmentDetonation (S11), conversationIntegrity (S14)
**Validators:** PII, competitors, blocklist, financial/medical advice validators

### 4.6 Vault — src/vault/ (21 tracked TypeScript modules)

**vault.ts** (528 lines) — VaultSession with 30min TTL, 4 key kinds, RSA key pairs
**secretsBroker.ts** — AES-256-GCM encryption, full access audit log
**zkPrivacy.ts** (730 lines) — Schnorr protocol, Sigma range proofs, Pedersen commitments, Merkle selective disclosure, Shamir secret sharing (secp256k1)
**dlp.ts** — 8 regex patterns: email, phone, SSN, credit card, API keys
**dataResidency.ts** — Region-based data compliance

### 4.7 Watch — src/watch/ (46 tracked TypeScript modules)

**continuousMonitor.ts** (523 lines) — Real-time scoring on intervals (scoring=5min, drift=15min, anomaly=1hr). Score drop >10% triggers alert.
**observabilityBridge.ts** (1,157 lines) — LARGEST. Normalizes traces from OTLP, Langfuse, Helicone, Datadog, Webhooks. 20-model cost table.
**realtimeAssurance.ts** (708 lines) — 9 built-in live checks: cost-spike, budget-exceeded, high-latency, error-rate, tool-failure, model-misuse, hallucination-pattern, data-leakage, governance-bypass.
**behavioralProfiler.ts** — Online learning (Welford's algorithm), anomaly detection (2.5σ threshold)
**siemExporter.ts** — CEF, LEEF, JSON-LD, Splunk HEC, Elastic ECS. MITRE ATT&CK mapping.
**overrideNearMissAnalytics.ts** — Generic Watch/Studio/API receipt path for human overrides, ignored escalations, near misses, repeated approvals, reason codes, trend-window proof, action taken, evidence refs, row hashes, clusters, and Watch alert projection.
**traceFailureIndex.ts** — Trace failure classes include prompt errors, retrieval/tool/policy failures, latency/cost spikes, and human-review gaps; maps clusters into remediation/fixer RCA paths.
**Provider-hook lifecycle:** the existing evidence ledger now projects verified requested → decision → terminal hook actions with agent/provider/correlation binding. Impossible ordering, conflicting replay, ambiguous terminal correlation, cross-agent collision, invalid receipt, or chain tamper fails closed.
**Runtime Firewall rollout:** signed decision artifacts bind exact policy hash/revision/mode/thresholds, candidate full-enforcement action, actual action, and suppression state. `amc firewall status` and the existing status API count only integrity-verified current-policy evidence and label legacy/historical/disabled evidence separately.

### 4.7a Observability — src/observability/

**sessionCorrelator.ts** — Builds cross-surface session-correlation receipts from AMC-owned normalized traces: stable session ID, surface event list, timestamp chain, missing-event checks, failure/risk counts, cost totals, p95 latency, evidence refs, hashes, and no-copy proof.
**riskCostLatencySlo.ts** — Builds operating SLO receipts across Watch/Studio/API/Fleet: reliability objectives, risk incidents, token cost, latency, escalation rate, time windows, breach evidence, and alert routing.

### 4.8 Fleet — src/fleet/ (14 tracked TypeScript modules)

**governance.ts** (963 lines) — Environment-aware policies, SLO definitions with NL parsing, fleet health dashboard, compliance reports.
**cascadeSimulator.ts** (942 lines) — Fault injection, cascade propagation, 5 patterns: trust_erosion_chain, silent_corruption_chain, blast_radius_exceeded, MiroFish gap, handoff_decay.
**registry.ts** (658 lines) — Agent lifecycle (scaffold/add/remove/list), provider template system.
**trustComposition.ts** — Composite trust for multi-agent topology.
**trustInheritance.ts** — Trust decay per delegation hop.

### 4.9 Bridge — src/bridge/

**bridgeServer.ts** — Full LLM request lifecycle: lease verification → prompt pack enforcement → gateway forwarding → truthguard validation → receipt generation. Streaming support.
**Provider Compat:** openaiCompat, anthropicCompat, geminiCompat, openrouterCompat, xaiCompat, localMockCompat.
**modelTaxonomy.ts** — Model classification by capabilities.
**Hook ingress/control:** `hookIngress.ts` accepts a strict pinned provider-neutral action subset under least-privilege `hook:observe`, validates timestamps/IDs/replay/correlation, stores a privacy-safe projection, and signs receipts without claiming full AEP conformance. `hookControl.ts` maps existing AMC control decisions to pinned Claude Code and Gemini CLI hook responses under explicit `hook:control`, preserving provider capability loss and exact response hashes.

### 4.10 Gateway — src/gateway/ (3 files)

**server.ts** (1,831 lines) — HTTP/HTTPS proxy with CONNECT tunneling. Lease verification per request. CIDR allowlisting. Rate limiting. Circuit breaker.

### 4.11 MCP Server — src/mcp/ (3 tracked TypeScript modules)

**amcMcpServer.ts** (744 lines) — MCP server with 4 tools + 1 resource:
- amc_score, amc_list_evidence, amc_query_diagnostic, amc_get_recommendations
- Resource: amc://agent/{agentId} (transparency report)
- Compatible with: Claude Code, Cursor, Copilot, Windsurf, Kiro, Codex

### 4.12 SDK — src/sdk/ (20 tracked TypeScript modules)

**autoInstrument.ts** (951 lines) — Monkey-patches 9 LLM clients at runtime: OpenAI, Anthropic, Google, Groq, Cohere, Mistral, Azure, OpenRouter, Together AI.
**Integrations:** openai, anthropic, gemini, langchainJs, langgraphJs, vercelAiSdk, openaiAgentsSdk.

### 4.13 Adapters — src/adapters/ (30 tracked TypeScript modules)

14 built-in adapters: langchainNode, langchainPython, langgraphPython, llamaindexPython, crewaiCli, autogenCli, openaiAgentsSdk, semanticKernel, claudeCli, geminiCli, openhandsCli, openclawCli, genericCli, pythonAmcSdk.
3-tier standardization: basic (pass-through), standard (normalized), advanced (full AMC).

`hookIntegration.ts` owns reversible project-local Claude Code and Gemini CLI observation/control installation with signed ownership manifests, exact handler hashes, narrow leases, drift/expiry status, dry-run plans, idempotent reinstall, and ownership-aware removal. `adapterCapabilities.ts` issues signed per-agent capability receipts that separate declared, detected, effective, lossy, partial, and fail-closed state; plugin self-claims are not AMC verification.

### 4.13a Approvals — src/approvals/ (13 tracked TypeScript modules)

The canonical approval inbox projects the signed quorum chain rather than the legacy producerless store. CLI and Studio decisions share identity/role validation, distinct-user policy, terminal replay protection, and execution binding. Lifecycle delivery sends a strict metadata-only envelope through the existing Vault-backed Integrations queue with signed routing/payload binding, retries, dead-letter evidence, SSE refresh, and session revalidation. Delivery is notification-only and never grants quorum or execution.

### 4.13b Evaluator Registry — src/eval/evaluatorRegistryMetadata.ts

`amc eval registry [--refresh] [--json]` projects existing deterministic metrics, LLM judges, assurance packs, and unverified custom metrics into one package-relative, implementation/definition-fingerprinted manifest. Refresh writes `.amc/evaluators/registry.json` atomically under the existing control lock and signs it with the domain-separated `evaluator-registry-manifest` artifact kind. States are `uninitialized`, `trusted`, `partial`, `stale`, or `invalid`; default inspection does not auto-repair drift. Metadata identity is not evaluator-result evidence.

### 4.14 API — src/api/ (45 tracked TypeScript modules)

Raw Node.js HTTP server (no Express) with Zod validation. At the evidence cutoff it had 39 local `*Router.ts` files, 41 `API_ROUTE_REGISTRY` IDs, and 302 public OpenAPI paths / 316 operations. Major domain routers include:
scoreRouter (957 lines), fleetRouter, gatewayRouter, adaptersRouter, evidenceRouter, securityRouter, configRouter, driftRouter, sandboxRouter, incidentRouter, shieldRouter, enforceRouter, watchRouter, vaultRouter, productRouter, assuranceRouter (617 lines), agentTimelineRouter, passportRouter, ciRouter, benchmarkRouter, workflowRouter, governorRouter, toolsRouter (479 lines), identityRouter, cryptoRouter (323 lines), canaryRouter, complianceRouter (657 lines), bomRouter, metricsRouter, exportRouter, memoryRouter.

### 4.15 Claims — src/claims/ (13 files)

Claim lifecycle: QUARANTINE → PROVISIONAL → PROMOTED → EXPIRED/DEPRECATED/REVOKED.
ClaimProvenanceTag: OBSERVED_FACT, DERIVED_PATTERN, HYPOTHESIS, SESSION_LOCAL, REFERENCE_ONLY.
SHA256 hash chains + Ed25519 signatures. Quarantine policy: minDistinctSessions=3, minDistinctDays=2, minEvidenceEvents=5.
Contradiction detection: LEVEL_CONFLICT (delta≥2), EVIDENCE_CONFLICT, ASSERTION_CONFLICT.

### 4.16 Compliance — src/compliance/ (16 tracked TypeScript modules)

Built-in mappings: SOC2, ISO 27001, NIST, EU AI Act.
EU AI Act classifier: UNACCEPTABLE/HIGH/LIMITED/MINIMAL risk levels.
Data residency: region policies, key custody modes (local/notary/external-kms/hsm), legal-hold.
FedRAMP integration with impact levels and control families.
Regulatory automation: RSS/API/web scrape feeds, change detection, impact scoring.

### 4.17 Governor — src/governor/ (13 tracked TypeScript modules)

**actionPolicyEngine.ts** — Core policy enforcement with YAML loading + signature verification.
**nlPolicy.ts** — Natural language → AMC Governor YAML (deterministic, no LLM).
**policyCanary.ts** — A/B enforcement rollout with rollback packs.
**emergencyOverride.ts** — TTL-limited governance bypass, mandatory 48h postmortem.
**confidenceGovernor.ts** — Meta-confidence × autonomy decisions (L4 @ 0.3 confidence ≠ L4 @ 0.9).
**policyDebt.ts** — Tracks waivers/overrides/exceptions with hash-chained entries.

### 4.18 Identity — src/identity/ (21 tracked TypeScript modules)

OIDC: JWT verification with JWKS discovery, PKCE (S256) auth flow.
SAML: Response handling with Ed25519 verification.
SCIM: Full REST API for user/group provisioning (create/get/list/patch/replace/disable).

### 4.19 Incidents — src/incidents/ (8 tracked TypeScript modules)

IncidentState: OPEN → INVESTIGATING → MITIGATED → RESOLVED → POSTMORTEM.
CausalRelationship: CAUSED, ENABLED, BLOCKED, MITIGATED, FIXED, CORRELATED.
Signed causal edges with confidence + evidence refs. Auto-assembly from drift/freeze events.
**incidentRegression.ts** — Generic incident-to-regression closure receipts requiring incident trace rows, generated regression-test receipts, validation-run receipts, passing validation status, closure evidence refs, computed closure status, receipt hash, and Watch alert projection when closure is blocked.

### 4.20 Passport — src/passport/ (18 tracked TypeScript modules)

PassportJson v1: passportId, scope (WORKSPACE/NODE/AGENT), trust metrics, governance/maturity status.
**trustInterchange.ts** — Universal Trust Interchange Protocol: AMCTrustToken for cross-platform portability (langsmith, langfuse, custom).

### 4.21 Forecast — src/forecast/ (18 tracked TypeScript modules)

**forecastEngine.ts** — Signal collection, Theil-Sen regression, EWMA, drift/anomaly/change point detection.
**anomalyDetector.ts** — Suspicious maturity jumps via robust Z-scores.
**changePoint.ts** — CUSUM change point detection.
5 risk indices, 5 value dimensions. Advisory categories: DRIFT, ANOMALY, RISK_INDEX, VALUE_REGRESSION, INTEGRITY, GOVERNANCE, BUDGET, NOTARY.

### 4.22 Experiments — src/experiments/ (8 tracked TypeScript modules)

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

## 5. TYPE SYSTEM — src/types.ts (4,317 lines at the evidence cutoff)

**Key Type Unions:**
- RuntimeName: claude | gemini | openclaw | unknown | mock | any | gateway | sandbox
- EvidenceEventType: 23 values (stdin/stdout/stderr, artifact, metric, test, audit, review, LLM request/response, output validation, gateway, tool action/result, outcome, agent process/stdout/stderr/exit, handoff, and delegation events)
- RiskTier: low | med | high | critical
- TrustTier: OBSERVED | OBSERVED_HARDENED | ATTESTED | SELF_REPORTED
- ActionClass: 9 values (READ_ONLY, WRITE_LOW, WRITE_HIGH, DEPLOY, SECURITY, FINANCIAL, NETWORK_EXTERNAL, DATA_EXPORT, IDENTITY)
- LayerName: 5 dimensions
- TrustLabel: HIGH TRUST → UNRELIABLE
- EvidenceReadinessStatus: READY | LIMITED | INSUFFICIENT_EVIDENCE | UNVERIFIED

**Key Interfaces:**
- EvidenceEvent (with chain hashing, blob refs)
- DiagnosticQuestion, Gate, GateConstraint
- QuestionScore, LayerScore, DiagnosticReport, DiagnosticEvidenceReadiness
- AMCConfig (runtimes, security, supervise)
- GatePolicy (minIntegrityIndex, minOverall, experiment requirements)
- OutcomeEvent/Contract/MetricResult/Report

---

## 6. CLI ENTRY POINT — `src/cli.ts` + split command registration files

Commander-based CLI. Large late-stage/domain product registrations are split into `src/cli-domain-product-commands.ts` and `src/cli-late-stage-commands.ts`; binary remains `amc`.

**Key Commands:**
- `amc` — Primary task-first full-score lifecycle entry point; fast pulse checks are optional
- `amc quickscore` — Quick 10-question assessment (`--rapid` for 5 questions, `--auto` for evidence-based)
- `amc init` / `amc setup --demo` — Production or demo workspace setup
- `amc doctor` / `amc doctor --strict` — Install or initialized-workspace health checks
- `amc studio start` — Start Studio API + Console
- `amc gateway start` — Start the public API gateway; the generated public inventory has no separate public Bridge command at this cutoff
- `amc connect --status --agent <id>` — Read-only four-milestone activation status
- `amc connect hooks install|status|remove|lifecycle` — Reversible provider hook ownership and lifecycle verification
- `amc adapters capabilities` — Signed declared/effective/lossy adapter capability receipt
- `amc guardrails list|enable|disable|profile` — Signed requested/effective Runtime Firewall bindings
- `amc firewall status` — Exact-policy observe/warn/block rollout counters
- `amc policy controls` — Verified read-only control projection
- `amc policy simulate <controlId>` — Non-recorded production-evaluator preview
- `amc policy test <file>` — Deterministic CI fixtures; simulation-only and non-proof
- `amc policy scope list|compile|apply` — Immutable action-class scope templates
- `amc policy action logic show|compile|apply` — Bounded nested evidence logic
- `amc eval registry [--refresh]` — Signed evaluator identity/fingerprint metadata
- `amc approvals list|show|approve|deny` — Canonical signed approval inbox operations
- `amc resource status|diff|apply|rollback|validate` — Signed resource/control version lifecycle
- `amc fleet init`, `amc agent add|list`, `amc fleet status` — Fleet initialization, agent registry, and fleet overview
- `amc assurance run` — Run red-team packs
- `amc compliance init|report` (`amc comply ...` alias) — Compliance assessment
- `amc export badge --run <runId> --out <path>` — Export maturity badge SVG
- `amc passport create|verify` — Create or verify `.amcpass` artifacts
- `amc mcp serve` — Start MCP server for IDE integration

`docs/CLI_COMMAND_INVENTORY.md` is generated from the live Commander registry and is the command-path source of truth; public documentation and website examples are drift-checked against it.

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
- Counts drift quickly because source-review and control-plane waves add boundary suites.
- The authoritative AMC-1479 release receipt, public drift guards, and exact-SHA CI on 2026-07-13 agree on **1,075 Vitest files / 8,520 passing tests**.
- Playwright release coverage passed **55 tests** with **2 intentional conditional i18n skips**.
- Documentation drift verification scanned **1,497 files** and the Pages artifact contained **173 public guides**.
- These are dated release-receipt values, not timeless constants; rerun live gates before the next release claim.

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

### 10.5 Release and Distribution Truth (2026-07-13)

- `package.json` is version `1.1.1`; Node engine is `>=20`, with CI on Node 20 and 22.
- GitHub release [`v1.1.1`](https://github.com/AgentMaturity/AgentMaturityCompass/releases/tag/v1.1.1) was published 2026-07-10 with npm-format, macOS universal, Linux x64, Windows x64, SEA, manifest, verification, and `SHA256SUMS` assets. Its annotated tag peels to commit `ff53902225ff276c55558d5ca17a8fc60b780655`.
- Hosted Unix and PowerShell installers are pinned to `1.1.1`, fetch GitHub Release archives and `SHA256SUMS`, reject checksum or archive-path violations, and then install the packaged tarball.
- The public npm registry lookup for `agent-maturity-compass` returns `E404`; `website/install-channel.json` correctly marks npm and Homebrew unavailable. Do not advertise `npm install -g` or `npx` until registry availability is independently confirmed.
- The `v1.1.1` release states that a signed release bundle was **not** produced because the release signing key was not configured. Checksums and a release manifest exist, but that is a different guarantee.
- Exact final AMC-1479 SHA workflows succeeded: CI `29226835994`, Pages `29226835997`, and npm validation `29226836001`. In the npm workflow, test/build/prepack passed and `Create Release PR or Publish` was skipped; workflow success is not npm publication.
- The deployed Pages artifact was independently recorded as exact final evidence SHA `6579367f`, 173 guides, byte-matched AMC-1479 surfaces, HTTP 200, responsive/no-error browser checks, and valid apex/`www` TLS through 2026-09-24.

---

## 11. PRICING MODEL

**Core: FREE forever (MIT)**
- Full trust stack (Score, Shield, Enforce, Vault, Watch, Fleet, Passport, Comply)
- All 14 framework adapters
- 1,165 public `amc ...` command paths as of 2026-07-13
- Public question framing: 244 default questions plus 600 sector-specific questions across 41 industry packs, for 844 total; Docs also describe an optional 264-question lifecycle-expanded assessment
- 142 assurance packs

**Paid: Industry Packs only (41 domain packs containing 600 sector-specific questions)**

| Tier | Content |
|------|---------|
| Free/OSS | Full trust stack, all adapters |
| Pro | + Selected industry packs for your verticals |
| Enterprise | All 41 industry packs + priority support + custom |

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
7. **Evidence Chain:** Evidence-bearing runtime paths use scoped SQLite stores and/or append-only ledgers; pure calculations, read-only projections, and metadata inspection can remain deliberately non-recording
8. **Layered API Pattern:** Schema → Generator → Loader → API → CLI
9. **Event-Driven:** Heavy EventEmitter for loose coupling (monitor → profiler → dashboard → alerting)
10. **Backward Compat:** Compatibility is selective through aliases, wrappers, migrations, or explicit legacy adapters; it is not a universal per-module `stubs.ts` pattern

---

## 15. CURRENT OPERATOR BLOCKERS AND TRACKING DEBT

### Verified external/operator blockers

1. **Public npm publication:** the registry returns `E404`. Publishing the current package requires npm-owner authentication and a configured release credential; an npm-named workflow, prepack success, or GitHub release does not satisfy this blocker.
2. **Industry Packs paid activation:** repository-side checkout, signed license, expiry/cancellation, and webhook paths exist, but Linear `AMC-450` remains In Review pending production payment-provider URL, production signing/admin secrets, and webhook-to-license issuance verification. Its description still says 40 packs; cutoff source and tests enforce 41 packs / 600 sector-specific questions.
3. **Independent clean-machine experience:** automated install personas and packaged desktop checks pass, but Linear `AMC-93` still requires Sid to exercise the actual install and user flows on a different clean machine. Its npm/npx instructions are stale until publication.
4. **Public release-bundle signing:** `v1.1.1` includes checksums and manifests, but the release signing key was not configured, so the release body explicitly disclaims a signed AMC release bundle.

### Tracker/repository reconciliation debt

- `AMC-49` still requests a `v1.0.0` GitHub release even though `v1.0.0`, `v1.1.0`, and `v1.1.1` exist.
- `AMC-5` still names package version `1.0.0`; the source and latest release are `1.1.1`, while npm remains unavailable.
- `AMC-27` still carries obsolete test-count and coverage-install context.
- `AMC-450` still says “all 40 Industry Domain Packs”; repository source and public-count tests enforce 41 packs / 600 sector-specific questions.
- Several dependency/source-review PRs remain open or stale even though the Dependabot alerts API returned zero open security alerts. Zero alerts is not zero maintenance work.
- LinkedIn and sales outreach are manual GTM work, not evidence that AMC runtime or distribution is ready.

---

## 16. QUICK REFERENCE

```bash
# Install from the checksum-verifying GitHub Release channel
curl -fsSL https://agentmaturity.co/install.sh | sh

# Windows PowerShell
irm https://agentmaturity.co/install.ps1 | iex

# Do not advertise npm/npx until registry publication is independently verified

# Quick score
amc quickscore
amc quickscore --rapid     # 5 questions
amc quickscore --auto      # evidence-based

# Initialize workspace
amc init

# Health check
amc doctor

# Connect, inspect signed controls, and verify proof boundaries
amc connect --status --agent <agent-id>
amc connect hooks status --provider claude-code
amc adapters capabilities --agent <agent-id>
amc policy controls
amc policy simulate <control-id>
amc policy test fixtures/policy/amc-ci-policy-fixtures.yaml --json
amc eval registry --json

# Start studio
amc studio start

# Run assurance packs
amc assurance run

# Share badge
amc export badge --run <run-id> --out badge.svg

# Start MCP server
amc mcp serve

# Multi-agent fleet
amc fleet init
amc agent add
amc agent list
amc fleet status

# Compliance report
amc comply init
amc comply report

# Build & test
npm run build
npm test                    # AMC-1479 receipt: 1,075 files / 8,520 tests; counts drift
npm run typecheck
npm run test:e2e            # Playwright
```
