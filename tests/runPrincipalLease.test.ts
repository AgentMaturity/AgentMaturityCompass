import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real signer, observed: which composition minted a lease, and for whom (P1-79).
vi.mock("../src/leases/leaseSigner.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/leases/leaseSigner.js")>();
  return { ...original, issueLeaseToken: vi.fn(original.issueLeaseToken) };
});

import { ACP_ERROR, AcpFailure } from "../src/acp/acpErrors.js";
import type { AcpForkSessionFactory, AcpForkSessionParams } from "../src/acp/acpRuntimeContracts.js";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import { checkLease } from "../src/actions/authorize.js";
import { openAgentSession, resumeAgentSession, type AgentSessionInit } from "../src/agent/agentSession.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { readSchedules, saveSchedules } from "../src/autonomy/scheduleStore.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { activateControlPlan } from "../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import { signPlan } from "../src/catalog/compiler/sign.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerNativeScheduleCommands } from "../src/cli-native-schedule-commands.js";
import { runComposedTurn } from "../src/kernel/agentLoopRunner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForPrincipal, LeasePrincipalRefused } from "../src/leases/leasePrincipal.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { runLease } from "../src/leases/runLease.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { initDestinationRegistry } from "../src/residency/destinationRegistry.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../src/workspace.js";
import { catalog } from "./catalog/l0/harness.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep, type ScriptedStream } from "./helpers/agentLoopHarness.js";

/**
 * P1-79: under an activated plan whose identity-binding requires a principal (L0-IDN-01), a CLI run (`amc agent-loop
 * run`) and an ACP session (`amc acp`, which the SDK native client spawns) with workspace tools mint the run's lease for
 * the active users.yaml user whose username is the OS account running them. None refuses PRINCIPAL_UNRESOLVED before any
 * session row or lease exists. An in-process openAgentSession or resumeAgentSession given no lease mints the same lease or
 * refuses; in-process delegated children and a native-schedule pass's children compose with the run's lease; a run that
 * could spawn in-process children without one is refused before its session opens. Without such a plan nothing changes.
 */
const OS_USER = userInfo().username;
const READ = JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/n.txt" } });
const READ_ARGS = JSON.stringify({ path: "workspace/n.txt" });
/** The scripted fixture provider (tests/helpers/agentLoopHarness.ts); its host is a signed provider destination. */
const FIXTURE_BASE_URL = "https://fixture.invalid";
const FIXTURE_ROUTE = { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } };
const minted = vi.mocked(issueLeaseToken);
// Workspace init, plan activation and a full session sign many records; a loaded machine needs more than the defaults.
const LOADED_MS = 120_000;
vi.setConfig({ testTimeout: LOADED_MS });
const originalCwd = process.cwd();
let workspace: string;
let home: string;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "run-principal-lease-test");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-run-lease-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-run-lease-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  initApprovalPolicy(workspace);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "n.txt"), "fixture");
  minted.mockClear();
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
}, LOADED_MS);

afterEach(() => {
  process.chdir(originalCwd);
  // The CLI closes its toolset on process exit; release only what this in-process run added.
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
  }
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

/**
 * users.yaml with `owner` as its first ACTIVE OWNER, then the L0-IDN-01 fixture plan compiled, reviewed by two test
 * approvers and activated, with the signed destination registry an active plan's sessions need for storage and the stub
 * provider (P2-01). Returns the owner's user id.
 */
function activatePlan(owner: string): string {
  const { owner: user } = initUsersConfig({ workspace, username: owner, password: "run-lease-fixture-password" });
  const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: unknown }).profile;
  writeFileSync(join(workspace, "deployment-profile.json"), JSON.stringify(profile));
  const us = { jurisdiction: "US", code: "us-fixture" };
  initDestinationRegistry(workspace, { schemaVersion: "amc.residency-destinations/v1",
    profile: { path: "deployment-profile.json", storageUrl: "https://storage.example.test/amc" },
    destinations: [
      { destinationId: "fixture-storage", match: { hosts: ["storage.example.test"] }, channels: ["storage"], region: us, transferBasis: null },
      { destinationId: "stub-provider", match: { hosts: ["stub.invalid", "fixture.invalid"] }, channels: ["provider"], region: us, transferBasis: null }],
    rules: [{ ruleId: "fixture-us", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
  expect(plan.status).toBe("ready");
  const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
  const approvalId = signed.review.approvalRequestId!;
  for (const userId of ["approver-1", "approver-2"]) {
    decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
      reason: "P1-79 fixture plan review", userId, username: userId, userRoles: ["OWNER"] });
  }
  activateControlPlan({ workspace, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
  return user.userId;
}

async function cliRun(): Promise<AgentRunSummary> {
  const output: string[] = [];
  const errors: string[] = [];
  let failed = false;
  const program = new Command().exitOverride();
  registerAgentCommands(program, { log: (line) => output.push(line), error: (line) => errors.push(line), fail: () => { failed = true; } });
  await program.parseAsync(["agent-loop", "run", READ, "--provider", "stub", "--tools", "workspace", "--credentials-home", home, "--json"],
    { from: "user" });
  expect(failed, errors.join("\n")).toBe(false);
  return JSON.parse(output.at(-1)!) as AgentRunSummary;
}

type Frame = { id?: number; result?: unknown; error?: { code: number; message: string; data?: { reason?: string } } };

/**
 * One ACP session over in-memory stdio: session/new, then the fs.read prompt when it opened. With `fork`, the operator's
 * fork factory is composed in and the call is session/fork instead (AMC itself ships no fork factory).
 */
async function acpRun(options: { tools?: "none" | "workspace"; leaseToken?: string; fork?: AcpForkSessionFactory } = {}):
  Promise<{ created: Frame; sessionId?: string }> {
  const stdin = new EventEmitter();
  const frames: Frame[] = [];
  const handle = startAcpStdio({ workspace, agentId: "default", providerId: "stub", systemPrompt: "s", tools: options.tools ?? "workspace",
    ...(options.leaseToken === undefined ? {} : { leaseToken: options.leaseToken }),
    ...(options.fork === undefined ? {} : { forkSessionFactory: options.fork }),
    credentialsMode: "operator-only", credentialsHome: home, stdin,
    stdout: { write: (bytes) => { frames.push(JSON.parse(bytes.toString("utf8")) as Frame); return true; } },
    stderr: { write: () => true } });
  const call = async (id: number, method: string, params: unknown): Promise<Frame> => {
    stdin.emit("data", Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find((frame) => frame.id === id)).toBeDefined(), { timeout: LOADED_MS });
    return frames.find((frame) => frame.id === id)!;
  };
  try {
    expect((await call(1, "initialize", { protocolVersion: 1, clientCapabilities: {} })).error).toBeUndefined();
    if (options.fork !== undefined) return { created: await call(2, "session/fork", { sessionId: randomUUID(), cwd: workspace, mcpServers: [] }) };
    const created = await call(2, "session/new", { cwd: workspace, mcpServers: [] });
    const sessionId = (created.result as { sessionId?: string } | undefined)?.sessionId;
    if (sessionId !== undefined) {
      const prompted = await call(3, "session/prompt", { sessionId, prompt: [{ type: "text", text: READ }] });
      expect(prompted.error).toBeUndefined();
    }
    return { created, ...(sessionId === undefined ? {} : { sessionId }) };
  } finally { await handle.close(); }
}

function ledgerState() {
  const ledger = openLedger(workspace, { readonly: true });
  try { return { sessions: ledger.getAllSessions(), events: ledger.getAllEvents() }; } finally { ledger.close(); }
}

/** The authorization records and tool decisions the session's governed calls committed. */
function governed(sessionId: string) {
  const rows = readNativeSessionEvents(workspace, sessionId).map((row) => {
    const payload = readEventPayload(workspace, row);
    return { meta: JSON.parse(row.meta_json) as Record<string, unknown>, payload: payload.status === "ok" ? payload.bytes.toString("utf8") : null };
  });
  return {
    allowed: rows.filter((row) => row.meta.auditType === "TOOL_CALL_ALLOWED").length,
    denied: rows.filter((row) => row.meta.auditType === "TOOL_CALL_DENIED").map((row) => row.payload),
    records: rows.filter((row) => row.meta.auditType === "AUTHORIZATION_RECORD").map((row) => (JSON.parse(row.payload!) as {
      record: { principal: Record<string, string>; delegation: { leaseId: string | null; allowedActionClasses: string[] } } }).record)
  };
}

/** The one lease the run minted names the owner, and every record binds that lease and resolves that owner. */
function expectLeaseNamesOwner(sessionId: string, ownerId: string): void {
  expect(minted, "one lease for the run").toHaveBeenCalledTimes(1);
  const lease = minted.mock.results[0]!.value as ReturnType<typeof issueLeaseToken>;
  expect(lease.payload.principal).toEqual({ userId: ownerId });
  expect(lease.payload.scopes).toEqual(["toolhub:execute"]);
  const { allowed, denied, records } = governed(sessionId);
  expect(denied, "no governed call was denied").toEqual([]);
  expect(allowed, "the fs.read call ran").toBeGreaterThan(0);
  expect(records.length).toBeGreaterThan(0);
  for (const record of records) {
    expect(record.principal).toEqual({ principalId: ownerId, kind: "human", authenticatedVia: "lease" });
    expect(record.delegation.leaseId).toBe(lease.payload.leaseId);
  }
}

/** The fixture provider's route, replaying `steps` in order across every session composed from it. */
function fixtureRoute(steps: readonly ScriptedStream[]) {
  return { providerId: LOOP_PROVIDER, baseUrl: FIXTURE_BASE_URL, credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...scriptedAdapter(steps), capabilities: ANTHROPIC_CAPABILITIES } };
}

/** An in-process workspace-tools session (P7.1a) over the fixture provider, given no lease. */
function agentSessionInit(steps: readonly ScriptedStream[]): AgentSessionInit {
  const registry = new AdapterRegistry();
  registry.register(fixtureRoute(steps));
  return { workspace, agentId: "default", tools: "workspace", route: FIXTURE_ROUTE, systemPrompt: "Use only approved tools.",
    harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture",
    makeLlm: (session) => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }) };
}

/** One due signed schedule whose single round asks the stub for one fs.write, and the digests a pass pins. */
function signWriteSchedule(): { readonly schedules: string; readonly tools: string } {
  const goal = JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/scheduled.txt", content: "scheduled" } });
  saveSchedules(workspace, [{ id: "lease-write", runAs: "writer", goal, maxRounds: 1, everyMs: 60_000, enabled: true, scope: ["WRITE_LOW"] }]);
  const schedules = readSchedules(workspace);
  const tools = loadVerifiedToolsConfigSnapshot(workspace);
  if (!schedules.ok || !tools.signatureValid || !tools.digestSha256) throw new Error("the fixture requires signed schedules and a signed tools policy");
  return { schedules: schedules.digest, tools: tools.digestSha256 };
}

/** A test approver, as an operator answering the CLI's printed instructions would (WRITE_LOW needs one approval). */
function approveAsTester(approvalRequestId: string): void {
  decideApprovalForIntent({ workspace, agentId: "default", approvalId: approvalRequestId, decision: "APPROVED", mode: "EXECUTE",
    reason: "P1-79 fixture schedule review", userId: "approver-1", username: "approver-1", userRoles: ["OWNER"] });
}

describe("CLI and ACP native runs under an activated identity-binding plan (P1-79)", () => {
  it("amc agent-loop run mints a lease naming the OS user's users.yaml user, and the ledger rows carry it", async () => {
    const ownerId = activatePlan(OS_USER);
    const summary = await cliRun();
    expect(summary.driverStatus).toBe("idle");
    expectLeaseNamesOwner(summary.sessionId, ownerId);
  });

  it("amc agent-loop run refuses PRINCIPAL_UNRESOLVED before any session row or lease when the OS user is not active", async () => {
    activatePlan(`not-${OS_USER}`);
    const before = ledgerState();
    await expect(cliRun()).rejects.toThrow(/PRINCIPAL_UNRESOLVED/);
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });

  it("an ACP session (the SDK native client's runtime) mints the lease at session/new and binds it to every call", async () => {
    const ownerId = activatePlan(OS_USER);
    const { created, sessionId } = await acpRun();
    expect(created.error).toBeUndefined();
    expectLeaseNamesOwner(sessionId!, ownerId);
  });

  it("an ACP session/new is refused PRINCIPAL_UNRESOLVED, coded, before any session row or lease", async () => {
    activatePlan(`not-${OS_USER}`);
    const before = ledgerState();
    const { created, sessionId } = await acpRun();
    expect(sessionId).toBeUndefined();
    expect(created.error?.message).toMatch(/^PRINCIPAL_UNRESOLVED: /);
    expect(created.error?.data?.reason).toBe("PRINCIPAL_UNRESOLVED");
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });
});

describe("ACP session/fork under an activated identity-binding plan (P1-79)", () => {
  /** An operator fork factory that records what AMC handed it, then composes no child. */
  const recording = (handed: AcpForkSessionParams[]): AcpForkSessionFactory => (params) => {
    handed.push(params);
    throw new AcpFailure(ACP_ERROR.invalidParams, "fixture fork factory composes no child");
  };

  it("hands the fork factory the child's own lease, naming the OS user's users.yaml user", async () => {
    const ownerId = activatePlan(OS_USER);
    const handed: AcpForkSessionParams[] = [];
    const { created } = await acpRun({ fork: recording(handed) });
    expect(created.error?.message, "the factory ran").toBe("fixture fork factory composes no child");
    expect(handed).toHaveLength(1);
    expect(minted, "one lease, minted before the factory ran").toHaveBeenCalledTimes(1);
    const lease = checkLease({ workspace, agentId: "default", actionClass: "READ_ONLY" }, handed[0]!.leaseToken!);
    expect("ok" in lease, JSON.stringify(lease)).toBe(false);
    expect(!("ok" in lease) && lease.payload.principal).toEqual({ userId: ownerId });
    expect(!("ok" in lease) && lease.payload.leaseId).toBe(minted.mock.results[0]!.value.payload.leaseId);
  });

  it("refuses session/fork PRINCIPAL_UNRESOLVED, coded, before the factory runs and before any lease or session row", async () => {
    activatePlan(`not-${OS_USER}`);
    const before = ledgerState();
    const handed: AcpForkSessionParams[] = [];
    const { created } = await acpRun({ fork: recording(handed) });
    expect(created.error?.message).toMatch(/^PRINCIPAL_UNRESOLVED: /);
    expect(created.error?.data?.reason).toBe("PRINCIPAL_UNRESOLVED");
    expect(handed, "the operator's factory never ran").toEqual([]);
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });
});

describe("in-process delegated children under an activated identity-binding plan (P1-79)", () => {
  // Under an activated plan the compiled visible tools come from the default tools config, which has no `delegate`, so a
  // root turn's delegate call is refused (toolPipeline.visibleTools) before any child exists. The child is spawned through
  // the driver runner directly, as the delegate tool does once the call is permitted.
  it("a child spawned with the run's lease binds the OS user's principal, that lease id and the delegation scope; without it, the child is denied", async () => {
    const ownerId = activatePlan(OS_USER);
    // The lease `amc agent-loop run` mints once and hands to both its toolset and the kernel.
    const { leaseToken } = runLease({ workspace, agentId: "default", model: LOOP_MODEL, tools: "workspace" });
    expect(minted, "one lease for the run").toHaveBeenCalledTimes(1);
    const leaseId = minted.mock.results[0]!.value.payload.leaseId;
    const { makeLlm } = agentSessionInit([toolStep("child_read", "fs.read", READ_ARGS), textStep("child done"),
      toolStep("bare_read", "fs.read", READ_ARGS), textStep("bare done")]);
    const recorder = { recordLoopEvent: () => undefined, recordProjectedEvidence: () => undefined };
    const spawn = async (inherit: boolean) => {
      const runner = createDriverRunner({ workspace, makeLlm, route: FIXTURE_ROUTE, systemPrompt: "Use only approved tools.",
        harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture", ...(inherit ? { leaseToken } : {}) });
      const childSessionId = randomUUID();
      const outcome = await spawnSubagent({ workspace, parent: rootIdentity("default"), session: recorder, runner,
        request: { runAs: inherit ? "child" : "bare", goal: READ, delegationScope: ["READ_ONLY"] }, mintSessionId: () => childSessionId });
      return { outcome, ...governed(childSessionId) };
    };

    const child = await spawn(true);
    expect(child.outcome.ok, JSON.stringify(child.outcome)).toBe(true);
    expect(minted, "the child mints nothing: it inherits").toHaveBeenCalledTimes(1);
    expect(child.denied, "no child call was denied").toEqual([]);
    expect(child.allowed, "the child's fs.read ran").toBeGreaterThan(0);
    expect(child.records.length).toBeGreaterThan(0);
    for (const record of child.records) {
      expect(record.principal).toEqual({ principalId: ownerId, kind: "human", authenticatedVia: "lease" });
      expect(record.delegation.leaseId).toBe(leaseId);
      expect(record.delegation.allowedActionClasses).toEqual(["READ_ONLY"]);
    }

    const bare = await spawn(false);
    expect(bare.allowed, "a child without the run's lease runs nothing").toBe(0);
    expect(bare.denied.length, "its call is denied under L0-IDN-01").toBeGreaterThan(0);
  });

  it("runComposedTurn refuses in-process delegation without a lease, before any session row or lease", async () => {
    activatePlan(OS_USER);
    const before = ledgerState();
    await expect(runComposedTurn({ workspace, agentId: "default", prompt: "Delegate.",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 128 } },
      routes: [stubProviderRoute()], transport: stubProviderTransport(),
      delegation: { grant: () => undefined } })).rejects.toThrow(LeasePrincipalRefused);
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });

  it("runComposedTurn refuses a schedule pass without a lease, before any session row or lease", async () => {
    activatePlan(OS_USER);
    const pin = signWriteSchedule();
    const before = ledgerState();
    await expect(runComposedTurn({ workspace, agentId: "default", prompt: "",
      route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 128 } },
      routes: [stubProviderRoute()], transport: stubProviderTransport(),
      approvalGate: { actionClass: "WRITE_LOW", riskTier: "high" },
      schedulePass: { now: Date.now(), expectedSchedulesDigest: pin.schedules, expectedToolsDigest: pin.tools } })).rejects.toThrow(LeasePrincipalRefused);
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });
});

describe("a native-schedule pass under an activated identity-binding plan (P1-79)", () => {
  it("amc native-schedule run-due mints the pass's lease, and the scheduled child's calls bind it", async () => {
    activatePlan(OS_USER);
    const pin = signWriteSchedule();
    const output: string[] = [];
    const errors: string[] = [];
    let failed = false;
    const program = new Command().exitOverride();
    registerNativeScheduleCommands(program, { log: (line) => output.push(line), error: (line) => errors.push(line), fail: () => { failed = true; } }, {
      workspace: () => workspace,
      // The real kernel; the test approver answers where the CLI's own onRaised prints the operator's instructions.
      loadRuntime: async () => ({ runComposedTurn: (options) => runComposedTurn({ ...options,
        approvalGate: { ...options.approvalGate!, onRaised: ({ approvalRequestId }) => approveAsTester(approvalRequestId) } }) })
    });
    await program.parseAsync(["native-schedule", "run-due", "--agent", "default", "--provider", "stub", "--approve-tools", "WRITE_LOW",
      "--expect-digest", pin.schedules, "--expect-tools-digest", pin.tools, "--credentials-home", home], { from: "user" });
    expect(failed, errors.join("\n")).toBe(false);
    const pass = JSON.parse(output.at(-1)!) as { scheduleResults: { ok: boolean; childSessionIds: string[] }[] };
    expect(pass.scheduleResults).toHaveLength(1);
    expect(pass.scheduleResults[0]!.ok).toBe(true);
    expect(minted, "one lease for the pass; its child mints none").toHaveBeenCalledTimes(1);
    const leaseId = minted.mock.results[0]!.value.payload.leaseId;
    const { allowed, denied, records } = governed(pass.scheduleResults[0]!.childSessionIds[0]!);
    expect(denied, "the scheduled child's call was not denied").toEqual([]);
    expect(allowed, "its fs.write ran").toBeGreaterThan(0);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.delegation.leaseId).toBe(leaseId);
      expect(record.delegation.allowedActionClasses).toEqual(["WRITE_LOW"]);
    }
  });
});

describe("in-process openAgentSession and resumeAgentSession under an activated identity-binding plan (P1-79)", () => {
  it("a caller that passes no lease gets the run's lease for the OS user's users.yaml user, bound to every call", async () => {
    const ownerId = activatePlan(OS_USER);
    const session = openAgentSession(agentSessionInit([toolStep("session_read", "fs.read", READ_ARGS), textStep("done")]));
    try {
      const result = await session.prompt("Read the note.");
      expect(result.ok, JSON.stringify(result)).toBe(true);
    } finally { await session.close(); }
    expectLeaseNamesOwner(session.sessionId, ownerId);
  });

  it("refuses PRINCIPAL_UNRESOLVED before any session row, recovery or lease when the OS user is not active", () => {
    activatePlan(`not-${OS_USER}`);
    const before = ledgerState();
    const init = agentSessionInit([textStep("unreachable")]);
    expect(() => openAgentSession(init)).toThrow(/^PRINCIPAL_UNRESOLVED: /);
    expect(() => resumeAgentSession({ ...init, sessionId: randomUUID(),
      claimant: { pid: process.pid, hostId: hostname(), bootId: randomUUID(), startedAt: Date.now() } })).toThrow(/^PRINCIPAL_UNRESOLVED: /);
    expect(minted, "no lease was minted").not.toHaveBeenCalled();
    expect(ledgerState(), "no session row and no evidence row").toEqual(before);
  });
});

describe("what a run lease never replaces or requires (P1-79)", () => {
  it("an ACP process Studio handed a lease keeps it: no second lease, and the task's principal, not the OS user's", async () => {
    const ownerId = activatePlan(`not-${OS_USER}`);
    // As Studio mints a native task's lease for its signed-in user (P1-67, P1-78) and hands it to the amc acp child.
    const studio = issueLeaseForPrincipal({ workspace, agentId: "default", ttlMs: 3_600_000, scopes: ["toolhub:execute"], routeAllowlist: ["/native-task"],
      modelAllowlist: ["stub"], maxTokensPerMinute: 1024, maxRequestsPerMinute: 8, maxCostUsdPerDay: null, principalKey: `LOCAL_USER:${ownerId}` });
    const { created, sessionId } = await acpRun({ leaseToken: studio.token });
    expect(created.error).toBeUndefined();
    expectLeaseNamesOwner(sessionId!, ownerId);
  });

  it("an ACP session without workspace tools mints no lease and is not refused", async () => {
    activatePlan(`not-${OS_USER}`);
    const { created, sessionId } = await acpRun({ tools: "none" });
    expect(created.error).toBeUndefined();
    expect(sessionId).toBeDefined();
    expect(minted).not.toHaveBeenCalled();
  });
});

describe("without an identity-binding plan nothing changes (P1-79)", () => {
  it("CLI and ACP runs mint no lease, and their tool calls run as before", async () => {
    initUsersConfig({ workspace, username: OS_USER, password: "run-lease-fixture-password" });
    const cli = governed((await cliRun()).sessionId);
    const acp = governed((await acpRun()).sessionId!);
    expect(minted).not.toHaveBeenCalled();
    for (const run of [cli, acp]) {
      expect(run.allowed).toBeGreaterThan(0);
      for (const record of run.records) {
        expect(record.principal.authenticatedVia).toBe("cli-os-user");
        expect(record.delegation.leaseId).toBeNull();
      }
    }
  });
});
