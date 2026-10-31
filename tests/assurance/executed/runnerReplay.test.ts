import YAML from "yaml";
import { signAmcConfig } from "../../../src/workspace.js";
import { signingKeyId } from "../../../src/keys/algorithmPolicy.js";
import { awsKmsProvider } from "../../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey } from "../../../src/keys/purposeProviders.js";
import { withPins, workspaceSelfTrust } from "../../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey } from "../../keys/providerFakes.js";
import { envelopeForAssurancePack, envelopeForAssuranceReport } from "../../../src/claims/eligibility/adapters/results.js";
import { renderAssuranceMarkdown } from "../../../src/assurance/report.js";
/** Synthetic local HTTP/native-signature integration tests; never human calibration or production ASR. */
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../../src/workspace.js";
import { lockVault } from "../../../src/vault/vault.js";
import { initApprovalPolicy } from "../../../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../../../src/approvals/approvalEngine.js";
import { initUsersConfig } from "../../../src/auth/authApi.js";
import { initBudgets } from "../../../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../../../src/runtime/firewall.js";
import { loadCatalog } from "../../../src/catalog/loader.js";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { signPlan } from "../../../src/catalog/compiler/sign.js";
import { activateControlPlan, loadActiveCompiledPolicy, activeControlPlan } from "../../../src/catalog/compiler/activate.js";
import { initDestinationRegistry } from "../../../src/residency/destinationRegistry.js";
import { initGatewayConfig, type GatewayConfig } from "../../../src/gateway/config.js";
import { startGateway, type GatewayHandle } from "../../../src/gateway/server.js";
import { workspaceIdFromDirectory } from "../../../src/workspaces/workspaceId.js";
import { openLedger, verifyLedgerIntegrity, type Ledger } from "../../../src/ledger/ledger.js";
import { startAssuranceSession, writeScenarioPrompt, writeScenarioResponse } from "../../../src/assurance/evidenceWriters.js";
import { runAssurance, verifyAssuranceRun } from "../../../src/assurance/assuranceRunner.js";
import * as responders from "../../../src/assurance/agentResponder.js";
import * as grading from "../../../src/assurance/scenarioGrading.js";
import { getAssurancePack } from "../../../src/assurance/packs/index.js";
import { compileLegacyScenario } from "../../../src/assurance/executed/routes.js";
import { benignRegistryFor } from "../../../src/assurance/executed/routes.js";
import { runSeededScenario } from "../../../src/assurance/executed/harness.js";
import { writeSeededRunCaptures, replaySeededRunCaptures, type SeededRunReferences } from "../../../src/assurance/executed/captureAdapter.js";
import { loadExecutedEvidence, writeExecutedEvidence } from "../../../src/assurance/executed/evidence.js";
import { loadExecutedRunScope } from "../../../src/assurance/executed/scope.js";
import { validateExecutedReportRow } from "../../../src/assurance/executed/reportValidation.js";
import type { ExecutedRunScope } from "../../../src/assurance/executed/reportTypes.js";
import type { CompiledScenario, SeedContext, SeededScenarioRun } from "../../../src/assurance/executed/types.js";
import { REGULATED_SCENARIO_DISPOSITIONS } from "../../../src/assurance/executed/registry.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import type { EvaluableControl, EvaluationContext } from "../../../src/catalog/evidence/types.js";
import { canonicalize } from "../../../src/utils/json.js";
import type { AssuranceReport } from "../../../src/types.js";

const providerBoundary = vi.hoisted(() => ({ call: undefined as import("../../../src/keys/providers/awsKms.js").KmsCall | undefined }));
vi.mock("../../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: import("../../../src/keys/providers/awsKms.js").KmsCall) => actual.awsKmsProvider(call ?? (async (...args) => {
    if (providerBoundary.call === undefined) throw new Error("owned provider transport is unset");
    return providerBoundary.call(...args);
  })) };
});

const PASS = "p227-native-owned-fixture-passphrase";
const MODEL = "p227-native-fixture-model";
const PACK = "educationFERPA";
const SCENARIO = "edu-vendor-training-use";
const catalog = loadCatalog();
const roots: string[] = [];
const workspaces: string[] = [];
vi.setConfig({ testTimeout: 120_000 });
afterEach(() => vi.restoreAllMocks());

function workspaceAt(root: string, name: string): string {
  const workspace = join(root, name);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  workspaces.push(workspace);
  return workspace;
}

/** Same native sign/review/activate flow used by runPrincipalLease and catalog/l0/identity. */
function activateFixture(workspace: string): void {
  initUsersConfig({ workspace, username: "p227-fixture-owner", password: "p227-owned-fixture-password" });
  initApprovalPolicy(workspace);
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  const raw = catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown };
  const profile = parseDeploymentProfile(structuredClone(raw.profile));
  // An authored synthetic profile fact, signed below; runtime only compares the native binding.
  profile.deployment.workspaceId = workspaceIdFromDirectory(workspace);
  writeFileSync(join(workspace, "deployment-profile.json"), JSON.stringify(profile));
  const us = { jurisdiction: "US", code: "us-owned-fixture" };
  initDestinationRegistry(workspace, { schemaVersion: "amc.residency-destinations/v1",
    profile: { path: "deployment-profile.json", storageUrl: "https://storage.example.test/amc" },
    destinations: [
      { destinationId: "owned-storage", match: { hosts: ["storage.example.test"] }, channels: ["storage"], region: us, transferBasis: null },
      { destinationId: "owned-loopback", match: { hosts: ["127.0.0.1"] }, channels: ["bridge", "provider"], region: us, transferBasis: null }
    ],
    rules: [{ ruleId: "owned-us", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  const plan = compilePlan({ profile, catalog, asOf: new Date().toISOString() });
  expect(plan.status).toBe("ready");
  const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId!;
  for (const userId of ["p227-fixture-reviewer-1", "p227-fixture-reviewer-2"]) {
    decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
      reason: "Owned synthetic plan activation contract", userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
}

interface OwnedUpstream { server: Server; origin: string; bodies: Array<Record<string, unknown>> }
async function startOwnedUpstream(): Promise<OwnedUpstream> {
  const bodies: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method !== "POST") { res.statusCode = 404; res.end(); return; }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        bodies.push(body);
        const tools = body.tools as Array<{ function: { name: string; description: string } }>;
        const offered = tools.find(tool => tool.function.name === "fixture_action");
        if (!offered) throw new Error("No actual fixture tool was offered");
        const description = offered.function.description;
        const context = JSON.parse(description.slice(description.indexOf("\n") + 1)) as {
          assignedOperations: Array<{ operation: string; resourceId: string; arguments?: Record<string, unknown> }>;
        };
        const calls = context.assignedOperations.map((assigned, index) => ({ id: `owned_call_${index}`, type: "function",
          function: { name: "fixture_action", arguments: JSON.stringify({
            ...(assigned.operation === "export_record" ? { recipientInstitutionId: "school-a",
              ...(assigned.resourceId === "record-b" ? { exceptionId: "exception-a" } : {}), purpose: "education" } : {}),
            operation: assigned.operation, resourceId: assigned.resourceId, ...assigned.arguments
          }) } }));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "owned-fixture-completion", model: MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: "FERPA. Consent. Redaction. Authorization. Compliant.", tool_calls: calls }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
      } catch { res.statusCode = 400; res.end("owned fixture request was invalid"); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Owned upstream did not bind");
  return { server, origin: `http://127.0.0.1:${address.port}`, bodies };
}
function gatewayConfig(origin: string, port = 0): GatewayConfig {
  return { listen: { host: "127.0.0.1", port },
    redaction: { headerKeysDenylist: ["authorization", "x-api-key"], jsonPathsDenylist: [], textRegexDenylist: [] },
    upstreams: { openai: { baseUrl: origin, auth: { type: "none" }, allowLocalhost: true } },
    routes: [{ prefix: "/openai", upstream: "openai", stripPrefix: true, openaiCompatible: true }],
    streamPassthrough: false, proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true },
    lease: { allowQueryCarrier: false } };
}
const changedDigest = (value: string): string => `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`;

/** A single real gateway and native signed capture fixture; all network traffic stays on loopback. */
describe.sequential("P2-27 native runner and stored replay", () => {
  let root: string, workspace: string, ledger: Ledger, upstream: OwnedUpstream, gateway: GatewayHandle;
  let gatewayClosed = false;
  let scope: ExecutedRunScope, compiled: CompiledScenario, seedContext: SeedContext;
  let sessionId: string, run: SeededScenarioRun, references: SeededRunReferences;
  let publicReport: Promise<AssuranceReport> | undefined;
  const ordinaryRun = () => publicReport ??= runAssurance({ workspace, agentId: "default", packId: PACK,
    mode: "sandbox", window: "1d", model: MODEL, executedAttempts: 1 });

  beforeAll(async () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p227-native-replay-"))); roots.push(root);
    mkdirSync(join(root, "operator"), { mode: 0o700 });
    vi.stubEnv("AMC_HOME", join(root, "operator"));
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
    vi.stubEnv("AMC_AGENT_BASE_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AMC_NO_SIGN", "0");
    workspace = workspaceAt(root, "workspace");
    activateFixture(workspace);
    upstream = await startOwnedUpstream();
    initGatewayConfig(workspace, gatewayConfig(upstream.origin));
    gateway = await startGateway({ workspace, logger: { log() {}, error() {} } });
    // The native resolver reads the configured port, not GatewayHandle.
    initGatewayConfig(workspace, gatewayConfig(upstream.origin, gateway.port));
    const active = loadActiveCompiledPolicy(workspace);
    const plan = activeControlPlan(workspace);
    if (!active?.deployment || !plan) throw new Error("Fixture plan did not activate");
    scope = { tenantId: active.deployment.tenantId, workspaceId: workspaceIdFromDirectory(workspace),
      deploymentId: active.deployment.deploymentId, agentId: "default", policyDigest: active.runtimePolicy.policyDigest,
      runId: randomUUID(), planDigest: active.planDigest, profileSha256: active.profileSha256,
      controlApplicability: Object.fromEntries(plan.requirements.map(requirement => [requirement.controlId, requirement.applicability])) };
    const compilation = compileLegacyScenario(PACK, SCENARIO, catalog, 1);
    if (!compilation.ok) throw new Error(compilation.reason);
    compiled = compilation.compiled;
    seedContext = { seed: "owned-native-roundtrip", now: new Date().toISOString(), scope: {
      tenantId: scope.tenantId, workspaceId: scope.workspaceId, deploymentId: scope.deploymentId, agentId: scope.agentId,
      policyDigest: scope.policyDigest, runId: scope.runId, controlId: compiled.controlId, controlVersion: compiled.controlVersion } };
    const responder = await responders.resolveAgentResponder({ workspace, agentId: "default", model: MODEL });
    expect(responder.target.transport).toBe("gateway");
    expect(responder.target.endpoint).toBe(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`);
    const respond = vi.spyOn(responder, "respond"); // Native call-through, no injected return.
    ledger = openLedger(workspace);
    sessionId = startAssuranceSession({ ledger, mode: "sandbox", agentId: "default", packIds: [PACK], trustTier: "SELF_REPORTED" });
    const before = upstream.bodies.length;
    run = await runSeededScenario(compiled, responder, seedContext, benignRegistryFor(compiled));
    expect(upstream.bodies.length - before).toBe(2);
    const answers = await Promise.all(respond.mock.results.map(result => result.value));
    for (const answer of answers) { expect(answer.target.transport).toBe("gateway"); expect(answer.receiptId).toBeTruthy(); }
    respond.mockRestore();
    references = writeSeededRunCaptures(ledger, sessionId, compiled, run);
    ledger.sealSession(sessionId);
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (gateway && !gatewayClosed) await gateway.close();
    if (upstream) await new Promise<void>((resolve, reject) => upstream.server.close(error => error ? reject(error) : resolve()));
    ledger?.close();
    for (const ownedWorkspace of workspaces.splice(0)) { try { lockVault(ownedWorkspace); } catch { /* Fixture may already be locked. */ } }
    vi.unstubAllEnvs();
    for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  test("unsupported-only rows need neither a model nor responder resolution", async () => {
    const isolated = workspaceAt(root, "unsupported-only");
    const resolve = vi.spyOn(responders, "resolveAgentResponder").mockImplementation(async () => { throw new Error("UNSUPPORTED_RESOLVED_TARGET"); });
    const before = upstream.bodies.length;
    const report = await runAssurance({ workspace: isolated, agentId: "default", packId: "safetyCriticalSIL",
      mode: "sandbox", window: "1d", executedAttempts: 1 });
    expect(resolve).not.toHaveBeenCalled(); expect(upstream.bodies).toHaveLength(before);
    const pack = report.packResults[0]!;
    expect(pack.scenarioResults.map(row => row.scenarioId)).toEqual(getAssurancePack("safetyCriticalSIL").scenarios.map(row => row.id));
    expect(pack).toMatchObject({ passCount: 0, failCount: 0, score0to100: 0, regulatedEligible: false });
    for (const row of pack.scenarioResults) expect(row).toMatchObject({ inconclusive: true, pass: false, score0to5: 0, score0to100: 0 });
    expect(report.target).toBeUndefined(); expect(report.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    const native = openLedger(isolated);
    try {
      expect(native.getSessionById(report.sessionId!)?.session_seal_sig).toBeTruthy();
      expect(native.getAllEvents().filter(event => JSON.parse(event.meta_json).testType === "ASSURANCE_EXECUTED_CAPTURE")).toEqual([]);
    } finally { native.close(); lockVault(isolated); }
  });

  test("missing trusted scope refuses compiled rows before responder resolution", async () => {
    const isolated = workspaceAt(root, "missing-scope");
    const resolve = vi.spyOn(responders, "resolveAgentResponder").mockImplementation(async () => { throw new Error("MISSING_SCOPE_RESOLVED_TARGET"); });
    const report = await runAssurance({ workspace: isolated, agentId: "default", packId: PACK,
      mode: "sandbox", window: "1d", model: MODEL, executedAttempts: 1 });
    expect(resolve).not.toHaveBeenCalled(); expect(report.target).toBeUndefined();
    for (const row of report.packResults[0]!.scenarioResults) expect(row).toMatchObject({ inconclusive: true, pass: false, score0to5: 0, score0to100: 0 });
    expect(loadExecutedRunScope({ workspace: isolated, agentId: "default", runId: randomUUID() })).toBeNull();
    lockVault(isolated);
  });

  test("trusted scope derives exact native pins rather than manufacturing subject IDs", () => {
    expect(loadExecutedRunScope({ workspace, agentId: "default", runId: scope.runId })).toMatchObject(scope);
    expect(scope.policyDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loadExecutedRunScope({ workspace, agentId: "not-in-plan", runId: scope.runId })).toBeNull();
  });

  test("native gateway effects round-trip through the real sealed writer and semantic replay", () => {
    expect(run).toMatchObject({ localOutcome: "pass", claimKind: "synthetic_example", regulatedEligible: false,
      result: { outcome: "not_evaluated", attackSuccessRate: null }, fixtureAttemptRate: null, fixtureWilson95: null });
    const replay = replaySeededRunCaptures(ledger, sessionId, compiled, seedContext.scope, references);
    expect(replay.ok).toBe(true); if (!replay.ok) throw new Error(replay.reason);
    expect(replay.authenticationErrors).toEqual([]);
    expect(replay.attack.map(a => [a.outcome, a.invocationComplete])).toEqual(run.attemptResults.map(a => [a.outcome, a.invocationComplete]));
    expect(replay.benign.map(a => [a.outcome, a.invocationComplete])).toEqual(run.benignAttemptResults.map(a => [a.outcome, a.invocationComplete]));
    const entries = [...references.attack, ...references.benign];
    expect(new Set(entries.map(entry => entry.binding.attemptId)).size).toBe(2);
    expect(new Set(entries.map(entry => entry.reference!.eventId)).size).toBe(2);
    expect(new Set(entries.map(entry => entry.reference!.receiptId)).size).toBe(2);
    expect(entries.every(entry => entry.binding.policyDigest === scope.policyDigest)).toBe(true);
  });

  test.each(["eventSha256", "payloadSha256", "receiptSha256"] as const)("native replay exposes an authentication failure for tampered %s", field => {
    const changed = structuredClone(references); changed.attack[0]!.reference![field] = changedDigest(changed.attack[0]!.reference![field]);
    const replay = replaySeededRunCaptures(ledger, sessionId, compiled, seedContext.scope, changed);
    expect(replay.ok).toBe(true); if (!replay.ok) throw new Error(replay.reason);
    expect(replay.authenticationErrors).toHaveLength(1); expect(replay.attack[0]!.outcome).toBe("not_evaluated");
    const control = replaySeededRunCaptures(ledger, sessionId, compiled, seedContext.scope, references);
    expect(control.ok && control.authenticationErrors.length === 0).toBe(true);
  });

  test("role-swapped, duplicate and cross-session references cannot borrow genuine signatures", () => {
    const swapped = structuredClone(references); [swapped.attack, swapped.benign] = [swapped.benign, swapped.attack];
    const roleReplay = replaySeededRunCaptures(ledger, sessionId, compiled, seedContext.scope, swapped);
    expect(roleReplay.ok).toBe(true); if (!roleReplay.ok) throw new Error(roleReplay.reason);
    expect(roleReplay.authenticationErrors).toHaveLength(2);
    const duplicate = structuredClone(references); duplicate.benign[0] = structuredClone(duplicate.attack[0]!);
    expect(replaySeededRunCaptures(ledger, sessionId, compiled, seedContext.scope, duplicate)).toEqual({ ok: false, reason: "stored_capture_duplicate_or_cross_scope" });
    const otherSession = startAssuranceSession({ ledger, mode: "sandbox", agentId: "default", packIds: [PACK], trustTier: "SELF_REPORTED" });
    ledger.sealSession(otherSession);
    const sessionReplay = replaySeededRunCaptures(ledger, otherSession, compiled, seedContext.scope, references);
    expect(sessionReplay.ok).toBe(true); if (!sessionReplay.ok) throw new Error(sessionReplay.reason);
    expect(sessionReplay.authenticationErrors).toHaveLength(2);
  });

  test("P1-11 rejects an authenticated local pass through the actual synthetic producer cap", () => {
    const entry = references.attack[0]!, reference = entry.reference!;
    const loaded = loadExecutedEvidence(ledger, reference, { sessionId, scenarioId: SCENARIO, packId: PACK,
      fixture: compiled.scenario.fixture, binding: entry.binding });
    expect(loaded.ok).toBe(true); if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.item.provenance).toMatchObject({ verified: true, trustTier: null });
    expect(loaded.item.attributes.claimKind).toBe("synthetic_example");
    expect(run.attemptResults[0]!.outcome).toBe("pass");
    expect(catalog.producers.find(producer => producer.id === "amc.assurance.executed")?.maxClaimKind).toBe("synthetic_example");
    const source = catalog.controls.get(compiled.controlId)!;
    // Test-only evidence contract makes the producer cap, rather than absent catalog wiring, load-bearing.
    const control: EvaluableControl = { ...source, evidence: [{ id: "p227-native-cap-contract", producer: "amc.assurance.executed",
      bindingFields: ["tenantId", "workspaceId", "deploymentId", "agentId", "controlId", "controlVersion", "policyDigest"],
      freshness: { maxAgeDays: 1 }, sampling: { method: "all", ratePercent: null, minItems: 1 },
      retention: { mode: "regime_max" }, residency: { mode: "inherit_deployment" } }] };
    const context: EvaluationContext = { subject: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      deploymentId: scope.deploymentId, agentId: scope.agentId, subjectId: null },
      window: { start: loaded.item.recordedAt, end: loaded.item.recordedAt },
      plan: { digest: scope.planDigest, policyDigest: scope.policyDigest, applicability: { state: "applicable" }, mode: "enforce" },
      reviews: [], invalidations: [], producers: catalog.producers };
    const result = evaluateControl(control, [{ ...loaded.item, verdict: "conforms" }], context);
    expect(result.admitted).toEqual([]); expect(result.rejected).toMatchObject([{ reason: "producer_unverified" }]);
    expect(result.dimensions.result).toBe("not_evaluated"); expect(result.dimensions.review).toBe("pending"); expect(result.claimKind).not.toBe("observed");
  });

  test("public smoke runner preserves inventory and native NE despite real local denial and benign effects", async () => {
    const grade = vi.spyOn(grading, "gradeScenarioReply"); const resolve = vi.spyOn(responders, "resolveAgentResponder");
    const before = upstream.bodies.length; const report = await ordinaryRun();
    expect(upstream.bodies.length - before).toBe(4); expect(resolve).toHaveBeenCalledTimes(1); expect(grade).not.toHaveBeenCalled();
    expect(report.target).toMatchObject({ transport: "gateway", model: MODEL });
    expect(report.executedScope).toMatchObject({ ...scope, runId: report.assuranceRunId });
    const pack = report.packResults.find(value => value.packId === PACK)!;
    expect(pack.scenarioResults.map(row => row.scenarioId)).toEqual(getAssurancePack(PACK).scenarios.map(row => row.id));
    expect(pack).toMatchObject({ passCount: 0, failCount: 0, score0to100: 0, regulatedEligible: false });
    const executed = pack.scenarioResults.filter(row => row.executed);
    expect(executed.map(row => row.scenarioId).sort()).toEqual(["edu-record-isolation", "edu-vendor-training-use"]);
    for (const row of executed) {
      expect(row).toMatchObject({ inconclusive: true, pass: false, score0to5: 0, score0to100: 0 });
      expect(row.executed).toMatchObject({ v: 1, attempts: 1, diagnostics: { localOutcome: "pass", regulatedEligible: false,
        claimKind: "synthetic_example", fixtureAttemptRate: null, fixtureWilson95: null, result: { outcome: "not_evaluated", attackSuccessRate: null } } });
      expect(row.executed!.references.attack).toHaveLength(1); expect(row.executed!.references.benign).toHaveLength(1);
      expect(row.executed!.controlResults.length).toBeGreaterThan(0);
      for (const result of row.executed!.controlResults) {
        expect(result.admitted).toEqual([]); expect(result.claimKind).not.toBe("observed");
        expect(["not_evaluated", "not_applicable"]).toContain(result.dimensions.result);
      }
    }
  });

  test("real row verification rejects capture authentication errors before the inconclusive skip", async () => {
    const report = await ordinaryRun(); const actualScope = report.executedScope;
    if (!actualScope || !report.sessionId) throw new Error("Public run did not retain native scope/session");
    const original = report.packResults.find(pack => pack.packId === PACK)!.scenarioResults.find(row => row.scenarioId === SCENARIO)!;
    if (!original.executed) throw new Error("Public run did not retain executed captures");
    const validate = (row: typeof original, currentScope = actualScope) => validateExecutedReportRow({ ledger,
      sessionId: report.sessionId!, scope: currentScope, row, packId: PACK, catalog });
    expect(validate(original)).toEqual({ ok: true, errors: [] });
    const changed = structuredClone(original);
    const reference = changed.executed!.references.attack[0]!.reference!;
    reference.payloadSha256 = changedDigest(reference.payloadSha256);
    const rejected = validate(changed);
    expect(rejected.ok).toBe(false); expect(rejected.errors.length).toBeGreaterThan(0);
    const diagnostic = structuredClone(original); diagnostic.executed!.diagnostics.completedAttempts += 1;
    expect(validate(diagnostic).ok).toBe(false);
    expect(validate(original, { ...actualScope, runId: "other-native-run" }).ok).toBe(false);
    expect(validateExecutedReportRow({ ledger, sessionId: "", scope: actualScope, row: original, packId: PACK, catalog }).ok).toBe(false);
  });

  test("station selection executes a separate partial aspect without changing the legacy119 inventory", async () => {
    const inventory = canonicalize(REGULATED_SCENARIO_DISPOSITIONS); const before = upstream.bodies.length;
    const report = await runAssurance({ workspace, agentId: "default", packId: "safetyCriticalSIL", stationQuestionIds: ["ENV-FF-16"],
      mode: "sandbox", window: "1d", model: MODEL, executedAttempts: 1 });
    expect(upstream.bodies.length - before).toBe(1);
    expect(canonicalize(REGULATED_SCENARIO_DISPOSITIONS)).toBe(inventory); expect(REGULATED_SCENARIO_DISPOSITIONS).toHaveLength(119);
    const pack = report.packResults.find(value => value.packId === "station-question-conversions")!;
    expect(pack).toMatchObject({ scenarioCount: 1, passCount: 0, failCount: 0, score0to100: 0, regulatedEligible: false });
    expect(pack.scenarioResults[0]).toMatchObject({ scenarioId: "ENV-FF-16", inconclusive: true, pass: false, score0to5: 0, score0to100: 0 });
    const row = pack.scenarioResults[0]!;
    const verified = validateExecutedReportRow({ ledger, sessionId: report.sessionId!, scope: report.executedScope!, row,
      packId: "station-question-conversions", catalog });
    expect(verified).toEqual({ ok: true, errors: [] });
  });

  test("historical NE accepts only genuine same-session native prompt/reply refs", () => {
    const legacySession = startAssuranceSession({ ledger, mode: "sandbox", agentId: "default", packIds: [PACK], trustTier: "SELF_REPORTED" });
    const row = { scenarioId: SCENARIO, title: "Historical ungraded exchange", category: "education_ferpa", riskTier: "all" as const,
      prompt: "Historical synthetic request", response: "Historical ungraded reply", pass: false, score0to5: 0, score0to100: 0,
      reasons: ["historical_not_evaluated"], correlatedRequestIds: [], evidenceEventIds: [] as string[], auditEventTypes: [], inconclusive: true };
    const promptId = writeScenarioPrompt({ ledger, sessionId: legacySession, runtime: "sandbox", trustTier: "SELF_REPORTED",
      packId: PACK, scenarioId: SCENARIO, prompt: row.prompt, agentId: "default" });
    const replyId = writeScenarioResponse({ ledger, sessionId: legacySession, runtime: "sandbox", trustTier: "SELF_REPORTED",
      packId: PACK, scenarioId: SCENARIO, response: row.response, agentId: "default" });
    const entry = references.attack[0]!, loaded = loadExecutedEvidence(ledger, entry.reference!, { sessionId,
      scenarioId: SCENARIO, packId: PACK, fixture: compiled.scenario.fixture, binding: entry.binding });
    if (!loaded.ok) throw new Error(loaded.reason);
    // The real capture writer signs the same previously verified synthetic body; it is not another target execution.
    const captureRef = writeExecutedEvidence(ledger, legacySession, loaded.record);
    ledger.sealSession(legacySession);
    const otherSession = startAssuranceSession({ ledger, mode: "sandbox", agentId: "default", packIds: [PACK], trustTier: "SELF_REPORTED" });
    const otherPrompt = writeScenarioPrompt({ ledger, sessionId: otherSession, runtime: "sandbox", trustTier: "SELF_REPORTED",
      packId: PACK, scenarioId: SCENARIO, prompt: row.prompt, agentId: "default" });
    ledger.sealSession(otherSession);
    const check = (ids: string[], agentId = "default") => validateExecutedReportRow({ ledger, sessionId: legacySession,
      scope: undefined, agentId, row: { ...row, evidenceEventIds: ids }, packId: PACK, catalog });
    expect(check([promptId, replyId])).toEqual({ ok: true, errors: [] });
    expect(check([promptId])).toEqual({ ok: true, errors: [] });
    expect(check(["unknown-native-event"]).ok).toBe(false);
    expect(check([otherPrompt]).ok).toBe(false);
    expect(check([captureRef.eventId]).ok).toBe(false);
    expect(check([promptId, promptId]).ok).toBe(false);
    expect(check([promptId, replyId], "another-report-agent").ok).toBe(false);
    expect(row).not.toHaveProperty("executed"); expect(row).not.toHaveProperty("gradingMethod");
    expect(row).toMatchObject({ pass: false, score0to5: 0, score0to100: 0, inconclusive: true });
  });
  test("a genuine report seal never promotes synthetic executed fixtures to observed claims", async () => {
    const report = await ordinaryRun();
    for (const sealVerified of [true, false, null]) {
      const options = { sealVerified, now: report.ts };
      expect(envelopeForAssuranceReport(report, options)).toMatchObject({ claimKind: "synthetic_example",
        eligibleLevel: null, statusDimensions: { result: "not_evaluated", review: "pending" } });
      for (const pack of report.packResults) expect(envelopeForAssurancePack(report.assuranceRunId, pack, options))
        .toMatchObject({ claimKind: "synthetic_example", eligibleLevel: null, statusDimensions: { result: "not_evaluated" } });
    }
  });

  test("Markdown distinguishes local fixture diagnostics from native and production results", async () => {
    const markdown = renderAssuranceMarkdown(await ordinaryRun(), true);
    expect(markdown).toContain("Local fixture diagnostics");
    expect(markdown).toContain("Native result: not evaluated");
    expect(markdown).toContain("Production attack success rate: not measured");
    expect(markdown).toContain("1-attempt smoke");
    expect(markdown).toContain("Wilson 95%: not measured");
    expect(markdown).not.toContain("**Result:** pass");
  });

  test("actual provider-bound public report verification replays compiled captures with the independent operator pin", async () => {
    const isolated = workspaceAt(root, "provider-outer-report"), key = fakeKey("p256"), id = AWS_ARN(`outer-assurance-${randomUUID()}`);
    const fake = awsFake({ [id]: key }), publicKeyPem = key.publicKey.export({ format: "pem", type: "spki" }).toString();
    const operatorPins = withPins(workspaceKeyTrust(isolated), [{ keyId: signingKeyId(publicKeyPem)!, purposes: ["ledger-row"], origin: "owned independent assurance operator" }]);
    activateFixture(isolated);
    const configPath = join(isolated, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8"));
    config.keys = { refs: { "ledger-row": { provider: "aws-kms", id } } };
    writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(isolated);
    providerBoundary.call = fake.call;
    const previousExpected = process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
    let owned: OwnedUpstream | undefined, localGateway: GatewayHandle | undefined, stopped = false;
    try {
      const binding = await bindPurposeProviderKey(isolated, "ledger-row", { passphrase: PASS, provider: awsKmsProvider(fake.call), delegation: { maxEvents: 10_000 } });
      vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "");
      owned = await startOwnedUpstream();
      initGatewayConfig(isolated, gatewayConfig(owned.origin));
      localGateway = await startGateway({ workspace: isolated, logger: { log() {}, error() {} } });
      initGatewayConfig(isolated, gatewayConfig(owned.origin, localGateway.port));
      const report = await runAssurance({ workspace: isolated, agentId: "default", packId: PACK,
        mode: "sandbox", window: "1d", model: MODEL, executedAttempts: 1 });
      expect(owned.bodies, JSON.stringify(report)).toHaveLength(4);
      const diagnostic = openLedger(isolated, { readonly: true });
      let sessions;
      try { sessions = diagnostic.db.prepare("SELECT session_id, binary_path, ended_ts, session_final_event_hash FROM sessions WHERE ended_ts IS NULL OR session_final_event_hash IS NULL").all(); }
      finally { diagnostic.close(); }
      // A live legacy gateway session is deliberately unsealed. Do not promote this signed report to VALID.
      expect(sessions).toHaveLength(1);
      expect(sessions).toEqual([expect.objectContaining({ binary_path: join(isolated, "dist", "cli.js"), ended_ts: null, session_final_event_hash: null })]);
      expect(verifyLedgerIntegrity(isolated, { trust: workspaceSelfTrust(isolated) }).chain.errors).toEqual([
        `Session ${(sessions as Array<{ session_id: string }>)[0]!.session_id} missing seal`
      ]);
      expect(report).toMatchObject({ status: "INVALID", verificationPassed: false, overallScore0to100: 0, evidenceStatus: "INSUFFICIENT_EVIDENCE" });
      const executed = report.packResults[0]!.scenarioResults.filter(row => row.executed !== undefined);
      expect(executed.map(row => row.scenarioId).sort()).toEqual(["edu-record-isolation", SCENARIO]);
      for (const row of executed) {
        expect(row).toMatchObject({ inconclusive: true, pass: false, score0to5: 0, score0to100: 0, gradingMethod: "executed" });
        expect(row.executed!.references.attack).toHaveLength(1); expect(row.executed!.references.benign).toHaveLength(1);
        expect(row.executed!.controlResults).toHaveLength(1);
      }
      const native = openLedger(isolated);
      try {
        const captureRows = native.getAllEvents().filter(row => JSON.parse(row.meta_json).testType === "ASSURANCE_EXECUTED_CAPTURE");
        expect(captureRows).toHaveLength(4);
        expect(captureRows.every(row => JSON.parse(row.meta_json).amcKeyDelegation?.sha256 === binding.delegationSha256)).toBe(true);
        expect(native.getAssuranceRun(report.assuranceRunId)).toMatchObject({ report_json_sha256: report.reportJsonSha256, run_seal_sig: report.runSealSig, status: "INVALID" });
      } finally { native.close(); }
      await localGateway.close(); stopped = true; // Verification consumes stored signed captures, without reaching a responder.
      const grade = vi.spyOn(grading, "gradeScenarioReply"), resolve = vi.spyOn(responders, "resolveAgentResponder");
      const pinned = { ...operatorPins, asOf: new Date() }, absent = { ...pinned, explicitPins: [] };
      const input = { workspace: isolated, agentId: "default", assuranceRunId: report.assuranceRunId };
      expect(await verifyAssuranceRun({ ...input, trust: pinned })).toEqual({ ok: true, errors: [] });
      for (const trust of [absent, undefined]) {
        const refused = await verifyAssuranceRun({ ...input, ...(trust === undefined ? {} : { trust }) });
        expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toMatch(/issuer.*not-pinned/);
      }
      expect(await verifyAssuranceRun({ ...input, trust: { ...operatorPins, asOf: new Date() } })).toEqual({ ok: true, errors: [] });
      expect(grade).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled(); expect(owned.bodies).toHaveLength(4);
    } finally {
      try {
        if (localGateway && !stopped) await localGateway.close();
        const server = owned?.server;
        if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally {
        providerBoundary.call = undefined; vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", previousExpected);
      }
    }
  });

  test("stored public reports verify native regulated captures without reply regrading", async () => {
    const report = await ordinaryRun(); await gateway.close(); gatewayClosed = true;
    const grade = vi.spyOn(grading, "gradeScenarioReply");
    expect(await verifyAssuranceRun({ workspace, agentId: "default", assuranceRunId: report.assuranceRunId })).toEqual({ ok: true, errors: [] });
    expect(grade).not.toHaveBeenCalled();
  });
});
