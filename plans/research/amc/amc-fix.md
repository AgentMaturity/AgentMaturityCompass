# AMC Remediation & Fleet — Exploration Report

## 1. STRUCTURE

- **`src/guide/`** — user-facing fix lane:
  - `oneClickFix.ts` (293 ln) — engine behind `amc fix` (plan → apply → receipt).
  - `fixCli.ts` (183) — `registerFixCommand(program)`, wired at `src/cli.ts:2349`.
  - `guideGenerator.ts` (1273) — gap-driven improvement guides; `KNOWN_AGENT_CONFIGS` (15 config locations), `applyGuardrails`, `guideToGuardrails`, `guideToComplianceGuardrails`, `diffGuides`, `detectFramework`, `FRAMEWORK_HINTS` (langchain/crewai/autogen/openai/llamaindex/semantickernel...).
  - `frameworkGuide.ts` (644) — separate per-framework governance-pattern guide (`generateFrameworkGuide`), wired via `src/cli-late-stage-commands.ts:1305`.
- **`src/mechanic/`** — signed, approval-gated remediation workbench: `targetsStore/targetSchema` (per-question target levels), `tuningStore/tuningSchema` (knobs: budgets, quorums, provider/model/tool allowlists, cadence), `profiles.ts` (7 signed archetype profiles), `gapAnalysis.ts`, `upgradePlanner.ts` + `upgradePlanSchema.ts` (4-phase plan), `executionEngine.ts` (approvals + execution), `simulator.ts` + `simulatorModels.ts` + `simulatorEvidenceGates.ts`, `planStore/planDiff`, `mechanicApi.ts` (studio HTTP surface), `mechanicCli.ts` (`amc mechanic ...`, cli.ts:17923+), `mechanicSse.ts`, `tuneExport.ts` (reward-fn/DSPy/fine-tune exports), `fixerRca.ts` (`amc mechanic rca`, cli.ts:18235), `agentFixPlan.ts` (unified-run grades → fix steps, cli.ts:5396), `autoFixer.ts` (**dead code**), `ui/` (dashboard model + knob explainers).
- **`src/doctor/`** — `doctorRules.ts` (env/signature/gateway checks), `doctorCli.ts` (thin wrapper), `doctorFix.ts` (`amc doctor --fix` auto-repair, cli.ts:2335), `doctorFixHints.ts`, `doctorReport.ts`.
- **`src/fleet/`** — multi-agent model: `paths.ts` (per-agent dir layout), `registry.ts` (fleet.yaml + agent.config.yaml, signed), `fleetScoring.ts` (`amc fleet score`), `governance.ts` (env tags, SLOs, policies, health dashboard), `fleetLifecycle.ts` (cascade-failure detection on scoring results), `typedGraph.ts` (typed multi-agent graph + invariant validation), `orchestrationDag.ts` (signed, hash-chained call DAGs), `trustComposition.ts`, `trustInheritance.ts` (STRICT/WEIGHTED/FLOOR), `handoffPacket.ts` (signed A2A delegation), `cascadeSimulator.ts` (fault-injection simulation), `contradictionDetector.ts`, `multiTenant.ts` (federated anonymized benchmarking), `report.ts`.
- **`src/workspace.ts`** (772) — single-workspace init: `initWorkspace` seeds ~20 signed configs (action policy, tools, budgets, adapters, bridge, trust, canon, diagnostic bank, mechanic, bench, prompt, assurance, audit...), `quickstartWizard`, legacy `runDoctor`.
- **`src/workspaces/`** — multi-tenant host: `workspaceRouter.ts` (1792 ln HTTP front door: `/host/api/*` auth incl. OIDC/SAML/SCIM, workspace CRUD, memberships, portfolio endpoints; proxies `/w/<id>/api/*` to per-workspace studio servers via `ensureWorkspaceApi`/`proxyToWorkspace`), `workspaceManager.ts` (lazy per-workspace init + readiness verification), `hostDb.ts` (better-sqlite3: users/memberships/workspaces/audit + db sha256 sidecar), `hostAuth.ts` (scrypt password envelopes), `hostBootstrap.ts`, `hostCli.ts` (`amc host ...`), `workspaceId/Paths/Resolver/Context/Schema/Sse`.
- **`src/leases/`** — capability tokens: `leaseSchema.ts` (scoped payload: routes/models/rate/cost caps), `leaseSigner.ts` (Ed25519 `payload.sig` base64url token), `leaseVerifier.ts` (key-history verify, wildcard route/model match), `leaseCarriers.ts` (extract lease from Authorization/x-api-key/query...), `leaseStore.ts` (revocations), `leaseCli.ts`.
- **`src/budgets/budgets.ts`** — signed per-agent budgets YAML (daily/perMinute caps per action class; consequences DOWNGRADE_TO_SIMULATE/FREEZE_EXECUTE/ALERT_OWNER), usage snapshots from ledger, `evaluateBudgetStatus`, `resetBudgetDay`.

## 2. HOW IT ACTUALLY WORKS

**`amc fix` pipeline** (`fixCli.ts` → `runOneClickFix`): (1) *Look* — `detectFramework` + scan `KNOWN_AGENT_CONFIGS` for instruction files; (2) *Score* — `scoreRapidAssessment(answers ?? {})` — the 5-question rapid quiz, defaulting to empty answers ("fresh-agent baseline"), **not** real evidence; (3) *Explain* — `generateGuide` builds sections for questions below target (default L3); (4) *Fix* — `guideToGuardrails` rendered between `<!-- AMC-GUARDRAILS-START/END -->` markers, `applyGuardrails` creates/replaces/appends idempotently into the chosen config (first existing known config else `AGENTS.md`); optional `--ci` writes `.github/workflows/amc-trust-gate.yml` (create-only); (5) *Receipt* — canonicalized JSON hash-sealed to `.amc/fix/receipt-<ts>.json`. Dry-run plan always computed first; TTY confirm unless `--yes`.

**Mechanic pipeline** (the "real" evidence-driven lane): `createMechanicUpgradePlan` (`upgradePlanner.ts`) loads signed targets + diagnostic bank + canon, runs `runAutoAnswer` (evidence-derived 244-question measurement), `buildGapAnalysis` computes per-question gap/status (OK/UNKNOWN/BLOCKED) + readiness (READY/NEEDS_EVIDENCE/UNTRUSTED via integrityIndex≥0.85, correlationRatio≥0.9). Bank `upgradeHints` map to 10 `MechanicActionKind`s bucketed into 4 phases (P1-INSTRUMENTATION, P2-GOVERNANCE, P3-CAPABILITIES, P4-CHECKPOINT). Plan ID is a content hash of targets/measured/bank/canon shas; plan saved signed (`planStore.ts`, latest + snapshot, auditor signatures).

**Approvals & execution** (`executionEngine.ts`): `requestPlanApprovals` creates an approval request per `requiresApproval` action via `createApprovalForIntent` (actionClass SECURITY, tool `mechanic.plan.execute`, intent payload binds planSha256), logs `MECHANIC_PLAN_APPROVAL_REQUESTED` to the transparency chain. `executeMechanicPlan` **pre-validates every approval** (`verifyApprovalForExecution`) before any mutation, then executes actions: budgets/tools/bridge/approval-policy rewritten *from signed tuning knobs* and re-signed; policy-pack apply; plugin install through its own approval flow; assurance run; transform plan; freeze incident; bench/forecast checkpoints. Approvals consumed one-shot (`consumeApprovedExecution`); failures logged to transparency and plan persisted mid-flight.

**Simulator** (`simulator.ts`): evidence gate first — if integrity/correlation insufficient, emits `INSUFFICIENT_EVIDENCE` simulation with honesty notes instead of numbers; else aggregates hard-coded per-action effect bands (`simulatorModels.ts`). Output signed.

**Fleet**: identity = `.amc/fleet.yaml` + per-agent dirs `.amc/agents/<id>/` (`paths.ts`; root-level legacy fallback for "default"). Current agent from arg → `AMC_AGENT_ID` → `.amc/current-agent` → "default". `evaluateFleet` scores agents concurrently with SLA/progress streaming, aggregates, weak links, pairwise comparisons; `fleetLifecycle.detectFleetCascadeFailures` post-processes. Governance: env tags, SLO parse/evaluate, policy apply across agents, health dashboard, compliance report. Trust: composition (weakest-link bounded), inheritance modes, signed handoff packets with receiver receipts + contract verification, typed graph invariant validation, DAG capture, cascade simulation with fault templates/scenarios.

**Host/multi-workspace**: `workspaceRouter` terminates auth (local users, OIDC, SAML, SCIM) against `hostDb`, maps `/w/<workspaceId>/...` to lazily-booted per-workspace studio API servers (each workspace a full `.amc` tree, auto-`initWorkspace` on first touch, path-traversal-guarded inside hostDir). Leases and budgets are the runtime enforcement companions: gateway/toolhub verify lease scopes/allowlists per request; budgets evaluated from the evidence ledger.

## 3. CAPABILITY INVENTORY

- `amc fix` (`--yes/--dry-run/--interactive/--target L1-5/--framework/--file/--ci/--json`); guardrail injection into 15 known agent-config locations; hash-sealed receipts; CI trust-gate workflow generation.
- `amc guide` (+ `--interactive` mechanic-mode gap checkbox picker, `--export`, `--diff`); human/agent/JSON/compliance-guardrail renderings; framework detection + per-framework snippets; `amc <framework-guide>` governance patterns.
- `amc mechanic init|targets init/set/apply/print/verify|profile list/apply/verify|tuning init/set/apply/print/verify|gap|plan create/show/diff/request-approval/execute|simulate|simulation latest|tune-export (reward|dspy|finetune)|verify|rca run/list/show`; owner-mode asserted on mutating commands; SSE events; full mirror in `mechanicApi.ts` for studio + `/api/v1/fixer/*` routes.
- `amc doctor [--strict|--json]` (runtime/signature/gateway checks) and doctor fix mode (create `.amc` dirs, remove broken symlinks, clear cache; signatures flagged MANUAL_REQUIRED).
- `amc fleet init|report|score (--stream/--sla/--concurrency/--max-comparisons)|health|graph write/validate/...|lifecycle list/show|policy apply|slo define/status`; plus `compliance fleet` and `indices fleet`.
- Agent registry: `amc agent add/list/use/remove`, signed fleet + agent configs, provider update, scaffolding, interactive add.
- Trust: composition reports, inheritance graph, handoff create/verify/accept/contract-verify, DAG create/append/query/visualize, cascade simulate (fault templates + scenarios), contradiction detection, multi-tenant federated aggregates.
- Host: `amc host init/user add/disable/workspace create/delete/purge/membership grant/revoke/list/migrate`; router endpoints for login/logout/OIDC/SAML/SCIM/portfolio forecast/bench/audit; per-workspace proxying.
- Leases: issue (TTL, scopes, route/model allowlists, rate/cost caps), verify (key history, revocations), carrier extraction; budgets: init/sign/verify/evaluate/reset with exceed-consequences.
- Config surface: `.amc/mechanic/{targets,tuning,profiles,plans,simulations,reports}` all signed (auditor/owner keys); `.amc/fleet.yaml`; `.amc/budgets.yaml`; transparency log entries for mechanic lifecycle events.

## 4. REUSE VERDICTS

- **oneClickFix + guideGenerator (guardrails/apply/diff/KNOWN_AGENT_CONFIGS)** — **KEEP-AS-SERVICE**: self-contained, injectable IO, marker-idempotent, receipt-sealed; ideal plugin surface.
- **Mechanic executionEngine + approvals integration** — **KEEP-AS-SERVICE**: the pre-validate→execute→consume→transparency loop is the strongest governed-mutation primitive in the repo.
- **upgradePlanner/gapAnalysis** — **REFACTOR**: sound flow, but hard-coded qid-prefix→dimension maps duplicated across ≥3 files and heuristic hint→action mapping should move into the diagnostic bank data.
- **Mechanic simulator** — **REFACTOR**: evidence-gating is good; effect numbers are invented constants — keep the gate, replace the effect model or label it explicitly heuristic.
- **tuningStore/targetsStore/profiles/planStore** — **KEEP-AS-SERVICE**: clean signed-config stores.
- **fixerRca + agentFixPlan** — **REFACTOR**: useful outputs but overlapping "fix plan" vocabulary with oneClickFix/mechanic; unify schemas before wrapping.
- **autoFixer.ts** — **REPLACE/DELETE**: dead code, Python-era `gov_1`-style QIDs incompatible with the AMC-x.y bank, zero consumers.
- **doctorRules/doctorFix** — **KEEP-AS-SERVICE** (doctorFix: REFACTOR — catch-all regex rules and unconditional cache-clear are blunt).
- **fleet/paths + registry** — **KEEP-AS-SERVICE**: canonical agent identity/layout; everything routes through it.
- **fleetScoring, governance, lifecycle, trust*, handoffPacket, typedGraph, orchestrationDag** — **KEEP-AS-SERVICE** individually; **cascadeSimulator/multiTenant** — REFACTOR (simulation constants and anonymization assumptions need review before external exposure).
- **workspaces/ host stack** — **REFACTOR**: workspaceRouter.ts is a 1792-line monolith mixing auth (OIDC/SAML/SCIM), tenancy, and proxying; hostDb/hostAuth/workspaceManager are clean and wrappable.
- **leases + budgets** — **KEEP-AS-SERVICE**: small, signed, schema-first enforcement primitives.
- **workspace.ts initWorkspace** — **REFACTOR**: 20+ subsystem init calls hard-wired; decompose into an init registry before pluginizing.
- **frameworkGuide.ts** — **REPLACE or merge**: parallel framework-guide system duplicating guideGenerator's framework hints and even exporting a second, shape-incompatible `listSupportedFrameworks`.

## 5. SURPRISES & DEBT

- **`amc fix` "score" is not a measurement**: non-interactive default scores `{}` (all-lowest 5-question baseline), so every fresh run reports identical gaps; only `amc` full-run uses real evidence. Marketing says "scores your agent."
- **CI workflow contradiction**: `ciWorkflowContent` comment claims "canonical pinned, SHA-256-verified installer — never registry fallback," but emits `curl -fsSL https://agentmaturity.co/install.sh | sh` with no pin or checksum (`src/guide/oneClickFix.ts:130-163`).
- **`amc fix-signatures`** referenced by doctorFix hint (`doctorFix.ts:99`) — no such command exists in cli.ts.
- **autoFixer.ts is orphaned** — ported from a Python platform (`platform/python/amc/agents/fix_generator.py`) that isn't in this repo; QID scheme (`gov_3`, `sec_2`) matches nothing else; no imports anywhere.
- **Five overlapping "fix" systems** (oneClickFix, mechanic plans, doctorFix, agentFixPlan, fixerRca) with three distinct receipt/schema conventions (`amc.fix.v1`, `amc.agent-fix-plan/1`, mechanic zod schemas).
- **FREEZE_SET is degenerate**: `previousRunId = currentRunId` and all deltas zero (`executionEngine.ts:203-221`) — freeze incidents carry no real drift data.
- **Duplicated qid-prefix→dimension maps** in `upgradePlanner.ts`, `gapAnalysis.ts`, `profiles.ts` — divergence risk when new question families land.
- **Simulator effect bands are fabricated constants** presented as numeric projections (mitigated by honesty notes + evidence gate, but still pseudo-quantitative).
- **Two doctors**: legacy `runDoctor` in `workspace.ts:417` (still exported from `src/index.ts`) vs the doctor/ module actually wired to the CLI.
- **Three `fleet` command registrations** in cli.ts (`compliance fleet`, `indices fleet`, top-level `fleet`) — works but confusing; cli.ts is ~18k+ lines, itself the biggest refactor target.
- **agentFixPlan's Enforce template hardcodes `--pack clinical-trials`** as the auto-apply command for any agent (`agentFixPlan.ts` SURFACE_FIXES) — domain-inappropriate default.
- README claims "1,171 CLI command paths" and 244 questions; 244 checks out (`questionBank.ts`), but the mechanic/fleet surface is far ahead of documentation — mechanic UI files (`ui/mechanicModel.ts`) are types-only, suggesting a dashboard that was never finished.