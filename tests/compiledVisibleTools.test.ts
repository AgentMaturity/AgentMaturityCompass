import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import type { SubagentRunContext, SubagentRunner } from "../src/agent/subagentSpawn.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { compileCatalogPlan } from "../src/catalog/catalogCli.js";
import { activateControlPlan } from "../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import type { MergedParameter } from "../src/catalog/compiler/merge.js";
import { buildRuntimePolicy } from "../src/catalog/compiler/runtimePolicy.js";
import { planWeakenings } from "../src/catalog/compiler/sign.js";
import { issueLeaseToken } from "../src/leases/leaseSigner.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { initDestinationRegistry } from "../src/residency/destinationRegistry.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { signToolsConfig, toolsConfigPath, toolsConfigSigPath } from "../src/toolhub/toolhubValidators.js";
import { defaultToolsConfig, type ToolsConfig } from "../src/toolhub/toolsSchema.js";
import { sha256Hex } from "../src/utils/hash.js";
import { catalog } from "./catalog/l0/harness.js";
import { newWorkspace } from "./catalog/l0/workspaces.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * P1-10F: the compiled `toolPipeline.visibleTools` are the tools the workspace's VERIFIED signed tools.yaml allows,
 * intersected with what the plan's controls permit; without a verified tools.yaml they stay the built-in default list.
 * The plan records the tools.yaml digest it used, and the compiled-policy guard refuses every call once that file
 * changes, until the plan is recompiled and reactivated. Plans are compiled and activated through `amc catalog
 * compile`'s own composition (compileCatalogPlan), the caller that reads and verifies tools.yaml.
 */
const LOADED_MS = 120_000;
vi.setConfig({ testTimeout: LOADED_MS });

const PROFILE = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")!.envelope!.setup as { profile: unknown }).profile;
const DEFAULT_NAMES = defaultToolsConfig().tools.allowedTools.map((t) => t.name).sort();
const SESSION = "p1-10f-session";

/** The default allowlist plus `extra` READ_ONLY tools. */
function toolsWith(extra: string[]): ToolsConfig {
  const config = defaultToolsConfig();
  return { tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, ...extra.map((name) => ({ name, actionClass: "READ_ONLY" as const }))] } };
}

/** Writes and signs `.amc/tools.yaml` as the default allowlist plus `extra`. */
function signTools(ws: string, extra: string[]): void {
  writeFileSync(toolsConfigPath(ws), YAML.stringify(toolsWith(extra)));
  signToolsConfig(ws);
}

function governedWorkspace(): string {
  const ws = newWorkspace("amc-p1-10f-");
  initApprovalPolicy(ws);
  initBudgets(ws, "default");
  writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
  writeFileSync(join(ws, "deployment-profile.json"), JSON.stringify(PROFILE));
  return ws;
}

const compile = (ws: string, flags: { requestReview?: boolean; activate?: string; allowWeakening?: boolean } = {}) =>
  compileCatalogPlan(ws, { profile: "deployment-profile.json", ...flags });

/** `amc catalog compile --request-review`, two distinct owners approve, then `--activate`. */
function activate(ws: string, allowWeakening = false) {
  const approvalId = compile(ws, { requestReview: true }).signed.review.approvalRequestId!;
  for (const userId of ["owner-1", "owner-2"]) {
    decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
      reason: "P1-10F fixture plan review", userId, username: userId, userRoles: ["OWNER"] });
  }
  const result = compile(ws, { activate: approvalId, allowWeakening });
  expect(result.plan.status).toBe("ready");
  expect(result.activated?.revision).toBeGreaterThan(0);
  return result.plan;
}

/** A lease naming the workspace's owner, as a run under an L0-IDN-01 plan mints one (P1-79). */
function ownerLease(ws: string): { token: string; leaseId: string; ownerId: string } {
  const { owner } = initUsersConfig({ workspace: ws, username: "p1-10f-owner", password: "p1-10f-fixture-password" });
  const lease = issueLeaseToken({ workspace: ws, agentId: "default", ttlMs: 3_600_000, scopes: ["toolhub:execute"], routeAllowlist: ["/"],
    modelAllowlist: ["*"], maxRequestsPerMinute: 1000, maxTokensPerMinute: 1_000_000, maxCostUsdPerDay: null, principal: { userId: owner.userId } });
  return { token: lease.token, leaseId: lease.payload.leaseId, ownerId: owner.userId };
}

type GovernedRecord = { principal: Record<string, string>; delegation: { leaseId: string | null } };

/**
 * The real child runner (P1-79's createDriverRunner) with the run's lease, over the scripted fixture provider: the child
 * reads workspace/n.txt once and answers. A plan's sessions store and call providers only at signed destinations
 * (P2-01), so the fixture's storage and provider hosts are registered.
 */
function driverRunner(ws: string, leaseToken: string): SubagentRunner {
  const us = { jurisdiction: "US", code: "us-fixture" };
  initDestinationRegistry(ws, { schemaVersion: "amc.residency-destinations/v1",
    profile: { path: "deployment-profile.json", storageUrl: "https://storage.example.test/amc" },
    destinations: [
      { destinationId: "fixture-storage", match: { hosts: ["storage.example.test"] }, channels: ["storage"], region: us, transferBasis: null },
      { destinationId: "fixture-provider", match: { hosts: ["fixture.invalid"] }, channels: ["provider"], region: us, transferBasis: null }],
    rules: [{ ruleId: "fixture-us", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  mkdirSync(join(ws, "workspace"), { recursive: true });
  writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL],
    adapter: { ...scriptedAdapter([toolStep("child_read", "fs.read", JSON.stringify({ path: "workspace/n.txt" })), textStep("child done")]),
      capabilities: ANTHROPIC_CAPABILITIES } });
  return createDriverRunner({ workspace: ws, route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    makeLlm: (session) => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }),
    systemPrompt: "Use only approved tools.", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture", leaseToken });
}

/** What a child session's governed calls committed: allowed calls, denials and authorization records. */
function childCalls(ws: string, sessionId: string) {
  const rows = readNativeSessionEvents(ws, sessionId).map((row) => {
    const payload = readEventPayload(ws, row);
    return { meta: JSON.parse(row.meta_json) as Record<string, unknown>, payload: payload.status === "ok" ? payload.bytes.toString("utf8") : null };
  });
  return {
    allowed: rows.filter((row) => row.meta.auditType === "TOOL_CALL_ALLOWED").length,
    denied: rows.filter((row) => row.meta.auditType === "TOOL_CALL_DENIED").map((row) => row.payload),
    records: rows.filter((row) => row.meta.auditType === "AUTHORIZATION_RECORD").map((row) => (JSON.parse(row.payload!) as { record: GovernedRecord }).record)
  };
}

/**
 * A native toolset under the active plan with the delegation capability composed in. The default runner records each
 * child without running it.
 */
function compose(ws: string, leaseToken: string, runner?: SubagentRunner) {
  const children: SubagentRunContext[] = [];
  const rows: Array<{ payload: string; meta: Record<string, unknown> }> = [];
  const toolset = agentToolset({ workspace: ws, agentId: "default", sessionId: SESSION, leaseToken,
    recorder: { recordProjectedEvidence: (row) => { rows.push(row as (typeof rows)[number]); return null; } },
    subagents: { identity: rootIdentity("default"), session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null },
      mintSessionId: () => `p1-10f-child-${children.length + 1}`,
      runner: async (ctx) => { children.push(ctx); return runner ? runner(ctx) : { ok: true, text: "the delegate's answer" }; } } });
  let n = 0;
  const call = async (toolName: string, args: Record<string, unknown>) => JSON.stringify(await toolset.seam.execute({
    callId: `p1-10f-${(n += 1)}`, toolName, rawArguments: JSON.stringify(args), sessionId: SESSION, turn: 1, step: n, parentToken: null,
    dispatch: "native", signal: new AbortController().signal }));
  const offered = () => (toolset.seam.schemas() ?? []).map((schema) => schema.name);
  const records = () => rows.filter((row) => row.meta.auditType === "AUTHORIZATION_RECORD")
    .map((row) => (JSON.parse(row.payload) as { record: GovernedRecord }).record);
  return { toolset, children, call, offered, records };
}

const DELEGATE = { runAs: "helper", goal: "summarise workspace/n.txt" };
const HIDDEN = 'compiled policy denied this call (toolPipeline.visibleTools): \\"delegate\\" is not a visible tool';

describe("visibleTools derive from the verified signed tools.yaml (buildRuntimePolicy)", () => {
  const param = (value: string[]): [string, MergedParameter] =>
    ["toolPipeline.visibleTools", { name: "toolPipeline.visibleTools", strictness: "intersection", value, controlIds: ["TEST-TOOLS-01"] }];

  it("without tools.yaml: today's default-derived set, and no digest", () => {
    const policy = buildRuntimePolicy(new Map(), ["default"]);
    expect(policy.toolPipeline.visibleTools).toEqual(DEFAULT_NAMES);
    expect(policy.toolPipeline).not.toHaveProperty("toolsConfigSha256");
    expect(policy.toolPipeline.visibleTools).not.toContain("delegate");
  });

  it("with tools.yaml: its tools, its digest, and the caller's config left as it was", () => {
    const config = toolsWith(["delegate"]);
    const before = structuredClone(config);
    const policy = buildRuntimePolicy(new Map([param(["delegate", "fs.read"])]), ["default"], { config, sha256: "ab".repeat(32) });
    expect(policy.toolPipeline.visibleTools).toEqual(["delegate", "fs.read"]);
    expect(policy.toolPipeline.toolsConfigSha256).toBe("ab".repeat(32));
    expect(config, "the compiler never edits the verified config it was handed").toEqual(before);
    const all = buildRuntimePolicy(new Map(), ["default"], { config, sha256: "ab".repeat(32) });
    expect(all.toolPipeline.visibleTools).toEqual([...DEFAULT_NAMES, "delegate"].sort());
  });

  it("the plan's controls still narrow: delegate stays hidden when the plan's visibleTools omit it", () => {
    const policy = buildRuntimePolicy(new Map([param(["fs.read"])]), ["default"], { config: toolsWith(["delegate"]), sha256: "cd".repeat(32) });
    expect(policy.toolPipeline.visibleTools).toEqual(["fs.read"]);
  });

  it("a narrower tools.yaml narrows the default set", () => {
    const narrow: ToolsConfig = { tools: { ...defaultToolsConfig().tools, allowedTools: toolsWith(["delegate"]).tools.allowedTools.filter((t) => ["fs.read", "delegate"].includes(t.name)) } };
    expect(buildRuntimePolicy(new Map(), ["default"], { config: narrow, sha256: "ef".repeat(32) }).toolPipeline.visibleTools).toEqual(["delegate", "fs.read"]);
  });

  it("the digest alone is not a weakening; a tool tools.yaml adds is", () => {
    const profile = parseDeploymentProfile(PROFILE);
    const asOf = new Date().toISOString();
    const plain = compilePlan({ profile, catalog, asOf });
    const pinned = compilePlan({ profile, catalog, asOf, signedTools: { config: defaultToolsConfig(), sha256: "01".repeat(32) } });
    expect(pinned.digest, "the digest binds into the plan").not.toBe(plain.digest);
    expect(planWeakenings(plain, pinned)).toEqual([]);
    const wider = compilePlan({ profile, catalog, asOf, signedTools: { config: toolsWith(["delegate"]), sha256: "02".repeat(32) } });
    expect(planWeakenings(pinned, wider).join("\n")).toMatch(/toolPipeline\.visibleTools/);
  });
});

describe("amc catalog compile reads tools.yaml only when it verifies (compileCatalogPlan)", () => {
  it("a signed tools.yaml with delegate: visible, and the plan records its digest", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    const { plan } = compile(ws);
    expect(plan.runtimePolicy.toolPipeline.visibleTools).toContain("delegate");
    expect(plan.runtimePolicy.toolPipeline.toolsConfigSha256).toBe(sha256Hex(readFileSync(toolsConfigPath(ws))));
  });

  it("a signed tools.yaml without delegate: not visible", () => {
    const ws = governedWorkspace();
    signTools(ws, []);
    const { plan } = compile(ws);
    expect(plan.runtimePolicy.toolPipeline.visibleTools).toEqual(DEFAULT_NAMES);
    expect(plan.runtimePolicy.toolPipeline.toolsConfigSha256).toBe(sha256Hex(readFileSync(toolsConfigPath(ws))));
  });

  for (const state of ["unsigned", "tampered"] as const) {
    it(`tools.yaml ${state}, with delegate: the built-in default list, byte-identical to a compile without tools.yaml`, () => {
      const ws = governedWorkspace();
      signTools(ws, ["delegate"]);
      if (state === "unsigned") rmSync(toolsConfigSigPath(ws));
      else writeFileSync(toolsConfigPath(ws), YAML.stringify(toolsWith(["delegate", "workflow"])));
      const { plan, visibleToolsSource } = compile(ws);
      expect(plan.runtimePolicy.toolPipeline.visibleTools).toEqual(DEFAULT_NAMES);
      expect(plan.runtimePolicy.toolPipeline).not.toHaveProperty("toolsConfigSha256");
      expect(visibleToolsSource).toMatchObject({ source: "defaults" });
      const plain = compilePlan({ profile: parseDeploymentProfile(PROFILE), catalog, asOf: new Date().toISOString() });
      expect(plan.digest).toBe(plain.digest);
    });
  }
});

describe("delegate under an activated plan (P1-10F)", () => {
  it("allowed in the signed tools.yaml: offered, and the delegate call and its child's call run under the run's lease", async () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    activate(ws);
    const lease = ownerLease(ws);
    const run = compose(ws, lease.token, driverRunner(ws, lease.token));
    try {
      expect(run.offered()).toContain("delegate");
      const text = await run.call("delegate", DELEGATE);
      expect(text).toContain('"outcome":"OK"');
      expect(run.children, "one child").toHaveLength(1);
      const child = childCalls(ws, run.children[0]!.childSessionId);
      expect(child.denied, "no child call was denied").toEqual([]);
      expect(child.allowed, "the child's fs.read ran").toBeGreaterThan(0);
      expect(run.records().length, "the delegate call was bound to an authorization record").toBeGreaterThan(0);
      expect(child.records.length, "so was the child's call").toBeGreaterThan(0);
      for (const record of [...run.records(), ...child.records]) {
        expect(record.delegation.leaseId, "the run's lease, reused by the child").toBe(lease.leaseId);
        expect(record.principal).toEqual({ principalId: lease.ownerId, kind: "human", authenticatedVia: "lease" });
      }
    } finally { run.toolset.close(); }
  });

  it("a signed tools.yaml without delegate: not offered, and the call is refused", async () => {
    const ws = governedWorkspace();
    signTools(ws, []);
    activate(ws);
    const run = compose(ws, ownerLease(ws).token);
    try {
      expect(run.offered()).not.toContain("delegate");
      expect(await run.call("delegate", DELEGATE)).toContain(HIDDEN);
      expect(run.children).toEqual([]);
    } finally { run.toolset.close(); }
  });

  it("an unsigned tools.yaml at compile: the activated plan keeps the default list, and delegate stays refused once it is signed", async () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    rmSync(toolsConfigSigPath(ws));
    const { signed, visibleToolsSource } = compile(ws, { requestReview: true });
    expect(visibleToolsSource).toEqual({ source: "defaults", reason: "tools config signature missing" });
    // The approval engine refuses decisions while tools.yaml does not verify, so it is signed before the review.
    signToolsConfig(ws);
    const approvalId = signed.review.approvalRequestId!;
    for (const userId of ["owner-1", "owner-2"]) {
      decideApprovalForIntent({ workspace: ws, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE",
        reason: "P1-10F fixture plan review", userId, username: userId, userRoles: ["OWNER"] });
    }
    activateControlPlan({ workspace: ws, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
    const run = compose(ws, ownerLease(ws).token);
    try {
      expect(run.offered()).not.toContain("delegate");
      expect(await run.call("delegate", DELEGATE)).toContain(HIDDEN);
      expect(run.children).toEqual([]);
    } finally { run.toolset.close(); }
  });

  it("tools.yaml changed after activation: every call refused until the plan is recompiled and reactivated", async () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    activate(ws);
    const lease = ownerLease(ws);
    const first = compose(ws, lease.token);
    try {
      expect(await first.call("delegate", DELEGATE)).toContain('"outcome":"OK"');
      signTools(ws, ["delegate", "workflow"]);
      for (const [tool, args] of [["delegate", DELEGATE], ["fs.read", { path: "workspace/n.txt" }]] as const) {
        const text = await first.call(tool, args);
        expect(text, tool).not.toContain('"outcome":"OK"');
        expect(text, tool).toContain("compiled policy denied this call (toolPipeline.toolsConfigSha256): the signed tools.yaml changed");
      }
      expect(first.children, "only the call before the change ran a child").toHaveLength(1);
    } finally { first.toolset.close(); }
    // The recompiled plan shows workflow too: a widening, refused at activation without --allow-weakening.
    expect(() => activate(ws)).toThrow(/weakens .*visibleTools/);
    activate(ws, true);
    const second = compose(ws, lease.token);
    try {
      expect(second.offered()).toEqual(expect.arrayContaining(["delegate", "workflow"]));
      expect(await second.call("delegate", DELEGATE)).toContain('"outcome":"OK"');
    } finally { second.toolset.close(); }
  });
});
