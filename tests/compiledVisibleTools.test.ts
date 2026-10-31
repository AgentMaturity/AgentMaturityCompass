import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { describe, expect, it, vi } from "vitest";

/** Counts reads of one file made inside a tool-guard pass (ToolRegistry.guardReason); every other read passes through. */
const guardReads = vi.hoisted(() => ({ path: null as string | null, count: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((...args: Parameters<typeof real.readFileSync>) => {
    if (guardReads.path !== null && args[0] === guardReads.path && (new Error().stack ?? "").includes("guardReason")) guardReads.count += 1;
    return real.readFileSync(...args);
  }) as typeof real.readFileSync;
  return { ...real, readFileSync, default: { ...real, readFileSync } };
});

import { driftedSlots, RESOURCE_SLOTS } from "../src/a4/a4Gates.js";
import type { A4GateRow, A4ReadinessState } from "../src/a4/a4Readiness.js";
import { activationExecutionId, openPlanReview, signAdaptPlan, understandAdapt } from "../src/a4/adaptPolicy.js";
import { ACTIVATE_PLAN_EFFECT_ID, ADAPT_SPEC_SCHEMA, type AdaptBuild } from "../src/a4/spec/adapt.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import type { SubagentRunContext, SubagentRunner } from "../src/agent/subagentSpawn.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { compileCatalogPlan } from "../src/catalog/catalogCli.js";
import { compileInputs } from "../src/catalog/compileInputs.js";
import { compilePlan, parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import type { MergedParameter } from "../src/catalog/compiler/merge.js";
import { buildRuntimePolicy } from "../src/catalog/compiler/runtimePolicy.js";
import { planWeakenings } from "../src/catalog/compiler/sign.js";
import type { CompiledPlan } from "../src/catalog/compiler/types.js";
import { signHexDigest } from "../src/crypto/keys.js";
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
 * intersected with what the plan's controls permit; with no tools.yaml they stay the built-in default list, and one that
 * does not verify refuses the compile (TOOLS_CONFIG_UNVERIFIED) for `amc catalog compile` and A4 Adapt alike.
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
  mkdirSync(join(ws, "workspace"), { recursive: true });
  writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
  return ws;
}

/** What a compile throws (or undefined), with its code. */
function refusal(run: () => unknown): { code?: unknown; message: string } | undefined {
  try { run(); } catch (error) { return error as { code?: unknown; message: string }; }
  return undefined;
}

const compile = (ws: string, flags: { requestReview?: boolean; activate?: string; allowWeakening?: boolean } = {}) =>
  compileCatalogPlan(ws, { profile: "deployment-profile.json", ...flags });

/** `amc catalog compile --request-review`, two distinct owners approve, then `--activate` (agentId: the profile's first agent). */
function activate(ws: string, allowWeakening = false, agentId = "default") {
  const approvalId = compile(ws, { requestReview: true }).signed.review.approvalRequestId!;
  for (const userId of ["owner-1", "owner-2"]) {
    decideApprovalForIntent({ workspace: ws, agentId, approvalId, decision: "APPROVED", mode: "EXECUTE",
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

  it("binding tools.yaml or narrowing it is not a weakening; widening it or dropping the binding is", () => {
    const profile = parseDeploymentProfile(PROFILE);
    const asOf = new Date().toISOString();
    const plain = compilePlan({ profile, catalog, asOf });
    const pinned = compilePlan({ profile, catalog, asOf, signedTools: { config: defaultToolsConfig(), sha256: "01".repeat(32) } });
    const wider = compilePlan({ profile, catalog, asOf, signedTools: { config: toolsWith(["delegate"]), sha256: "02".repeat(32) } });
    expect(pinned.digest, "the digest binds into the plan").not.toBe(plain.digest);
    expect(planWeakenings(plain, pinned), "binding a tools.yaml").toEqual([]);
    expect(planWeakenings(wider, pinned), "a new digest that only narrows").toEqual([]);
    expect(planWeakenings(pinned, wider).join("\n")).toMatch(/toolPipeline\.visibleTools/);
    // A plan compiled without tools.yaml (the default list) replacing one that binds it: the binding would vanish silently.
    expect(planWeakenings(pinned, plain).join("\n")).toMatch(/toolPipeline\.toolsConfigSha256 "(01){32}" -> absent/);
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

  it("no tools.yaml: the built-in default list, byte-identical to a compile without signedTools", () => {
    const ws = governedWorkspace();
    rmSync(toolsConfigPath(ws));
    rmSync(toolsConfigSigPath(ws), { force: true });
    const { plan, visibleToolsSource } = compile(ws);
    expect(visibleToolsSource).toEqual({ source: "defaults" });
    expect(plan.runtimePolicy.toolPipeline.visibleTools).toEqual(DEFAULT_NAMES);
    expect(plan.runtimePolicy.toolPipeline).not.toHaveProperty("toolsConfigSha256");
    expect(plan.digest).toBe(compilePlan({ profile: parseDeploymentProfile(PROFILE), catalog, asOf: new Date().toISOString() }).digest);
  });

  /** Puts a signed tools.yaml listing delegate into a state that does not verify; returns the reason verification gives. */
  const unverified: Record<string, (ws: string) => string> = {
    "its signature removed": (ws) => { rmSync(toolsConfigSigPath(ws)); return "tools config signature missing"; },
    "edited after signing": (ws) => { writeFileSync(toolsConfigPath(ws), YAML.stringify(toolsWith(["delegate", "workflow"]))); return "digest mismatch"; },
    "signed by a key this workspace does not hold": (ws) => {
      const bytes = readFileSync(toolsConfigPath(ws));
      const foreign = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      writeFileSync(toolsConfigSigPath(ws), JSON.stringify({ digestSha256: sha256Hex(bytes), signature: signHexDigest(sha256Hex(bytes), foreign), signedTs: 0, signer: "auditor" }));
      return "signature verification failed";
    }
  };
  it("an unreadable tools.yaml (chmod 000): the compile refuses with its error class and no host path", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    chmodSync(toolsConfigPath(ws), 0o000);
    try {
      const error = refusal(() => compile(ws));
      expect(error?.code).toBe("TOOLS_CONFIG_UNVERIFIED");
      expect(error?.message).toContain(".amc/tools.yaml does not verify (tools config unreadable (EACCES))");
      expect(error?.message, "no host path").not.toContain(ws);
    } finally { chmodSync(toolsConfigPath(ws), 0o644); }
  });

  for (const [state, breakIt] of Object.entries(unverified)) {
    it(`a tools.yaml ${state}: the compile refuses TOOLS_CONFIG_UNVERIFIED, naming the file, the reason and the fix`, () => {
      const ws = governedWorkspace();
      signTools(ws, ["delegate"]);
      const reason = breakIt(ws);
      const error = refusal(() => compile(ws));
      expect(error?.code).toBe("TOOLS_CONFIG_UNVERIFIED");
      expect(error?.message).toContain(".amc/tools.yaml");
      expect(error?.message).toContain(reason);
      expect(error?.message).toMatch(/amc tools sign.*remove it/);
      expect(error?.message, "no host path").not.toContain(ws);
    });
  }
});

/** P1-46's station profiles: the synthetic finance-ops sample with one station (agent finance-ops-agent). */
const FINANCE = JSON.parse(readFileSync("tests/fixtures/catalog/compiler/finance-ops-us.profile.json", "utf8")) as Record<string, any>;
const stationProfile = (station: string) => ({ ...FINANCE, profileId: `station-${station}`, primaryStation: { ...FINANCE.primaryStation, value: station },
  stations: { ...FINANCE.stations, value: [station] } });

/** A plan compiled as Adapt compiles it: the profile plus compileInputs(workspace), the CLI's own inputs. */
const adaptCompile = (ws: string, profile: unknown = PROFILE) =>
  compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString(), ...compileInputs(ws) });

/** The slice of an A4 project's state Adapt's Build and Review read: adapt revisions (plan and build) and the chain. */
function a4State(revisions: Array<{ plan: CompiledPlan; build?: AdaptBuild }>, inForce: CompiledPlan[] = []): A4ReadinessState {
  return { project: { agent_id: "default" },
    revisions: revisions.map((row, i) => ({ revision_no: i + 1, stage: "adapt",
      spec_json: JSON.stringify({ schema: ADAPT_SPEC_SCHEMA, plan: row.plan, ...(row.build ? { build: row.build } : {}) }) })),
    chain: inForce.map((plan) => ({ kind: "EFFECT_FINISHED", body: { effect: ACTIVATE_PLAN_EFFECT_ID, executionId: activationExecutionId(plan) } })) } as unknown as A4ReadinessState;
}

/** Adapt's Build (signAdaptPlan), then a Review that opens the effect gate's plan review (openPlanReview) on that revision. */
function built(ws: string, plan: CompiledPlan): () => string {
  const state = a4State([{ plan, build: signAdaptPlan(ws, a4State([]), plan) }]);
  return () => openPlanReview({ workspace: ws, state, gate: { revision_no: 1 } as unknown as A4GateRow, quorumFloor: undefined });
}

type A4Refusal = { status?: number; code?: string; message: string; detail?: { reasonCodes?: string[] } };
const TOOLS_WIDER = "The plan's tools.yaml binding is missing or wider than the active plan's; re-sign tools.yaml or rebuild the plan.";

describe("A4 Adapt compiles from the same verified tools.yaml (P1-10F)", () => {
  const adapt = (ws: string) => understandAdapt({ workspace: ws, projectId: "a4p_p110f", workspaceId: "ws-p110f", agentId: "default", answers: [],
    now: Date.parse("2026-10-18T00:00:00Z") });

  it("the same workspace and profile give the same plan digest from amc catalog compile and from Adapt's Understand", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    const understood = understandAdapt({ workspace: ws, projectId: "a4p_p110f", workspaceId: "ws-p110f", agentId: "default", answers: [], now: Date.now() });
    writeFileSync(join(ws, "adapt-profile.json"), JSON.stringify(understood.profile));
    const cli = compileCatalogPlan(ws, { profile: "adapt-profile.json" }).plan;
    expect(cli.runtimePolicy.toolPipeline.toolsConfigSha256).toBe(sha256Hex(readFileSync(toolsConfigPath(ws))));
    expect(understood.plan!.digest).toBe(cli.digest);
  });

  it("Review refuses TOOLS_CONFIG_CHANGED when tools.yaml was re-signed since Build; with the same bytes it opens", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    const review = built(ws, adaptCompile(ws));
    signTools(ws, ["delegate", "workflow"]);
    const refused = refusal(review) as A4Refusal | undefined;
    expect(refused).toMatchObject({ status: 409, code: "TOOLS_CONFIG_CHANGED", detail: { reasonCodes: ["TOOLS_CONFIG_CHANGED"] } });
    expect(refused?.message).toMatch(/tools\.yaml changed since Build/);
    signTools(ws, ["delegate"]);
    expect(review()).toMatch(/^apprreq_/);
  });

  it("absent counts as a value: no tools.yaml at Build and at Review opens; one signed after Build refuses", () => {
    const ws = governedWorkspace();
    rmSync(toolsConfigPath(ws));
    rmSync(toolsConfigSigPath(ws), { force: true });
    const plan = adaptCompile(ws);
    expect(plan.runtimePolicy.toolPipeline).not.toHaveProperty("toolsConfigSha256");
    const review = built(ws, plan);
    expect(review()).toMatch(/^apprreq_/);
    signTools(ws, []);
    expect(refusal(review)).toMatchObject({ code: "TOOLS_CONFIG_CHANGED" });
  });

  it("Build's widening refusal names tools.yaml when the weakening is the tools binding, and keeps its text otherwise", () => {
    const ws = governedWorkspace();
    signTools(ws, []);
    const inForce = adaptCompile(ws);
    const state = a4State([{ plan: inForce, build: signAdaptPlan(ws, a4State([]), inForce) }], [inForce]);
    signTools(ws, ["delegate"]);
    const wider = refusal(() => signAdaptPlan(ws, state, adaptCompile(ws))) as A4Refusal | undefined;
    expect(wider).toMatchObject({ code: "POLICY_WIDENING_REFUSED", detail: { reasonCodes: ["POLICY_WIDENING_REFUSED", "TOOLS_CONFIG_CHANGED"] } });
    expect(wider?.message).toBe(`POLICY_WIDENING_REFUSED: ${TOOLS_WIDER}`);
    // A weakening that is not the tools binding: the in-force plan is Wealth's, this one Technology's, with the same tools.yaml.
    const wealth = adaptCompile(ws, stationProfile("wealth"));
    const wealthState = a4State([{ plan: wealth, build: signAdaptPlan(ws, a4State([]), wealth) }], [wealth]);
    const other = refusal(() => signAdaptPlan(ws, wealthState, adaptCompile(ws, stationProfile("technology")))) as A4Refusal | undefined;
    expect(other).toMatchObject({ code: "POLICY_WIDENING_REFUSED", detail: { reasonCodes: ["POLICY_WIDENING_REFUSED"] } });
    expect(other?.message).toBe("POLICY_WIDENING_REFUSED: The plan weakens the plan this project put in force; change the answers.");
  });

  it("Review's refusal against the active plan names tools.yaml when the weakening is the tools binding, and keeps its text otherwise", () => {
    const ws = governedWorkspace();
    signTools(ws, []);
    activate(ws);
    signTools(ws, ["delegate"]);
    const wider = refusal(built(ws, adaptCompile(ws))) as A4Refusal | undefined;
    expect(wider).toMatchObject({ code: "PLAN_WEAKENS_ACTIVE_PLAN", detail: { reasonCodes: ["PLAN_WEAKENS_ACTIVE_PLAN", "TOOLS_CONFIG_CHANGED"] } });
    expect(wider?.message).toBe(`PLAN_WEAKENS_ACTIVE_PLAN: ${TOOLS_WIDER}`);

    const other = governedWorkspace();
    signTools(other, []);
    writeFileSync(join(other, "deployment-profile.json"), JSON.stringify(stationProfile("wealth")));
    activate(other, false, "finance-ops-agent");
    const narrower = refusal(built(other, adaptCompile(other, stationProfile("technology")))) as A4Refusal | undefined;
    expect(narrower).toMatchObject({ code: "PLAN_WEAKENS_ACTIVE_PLAN", detail: { reasonCodes: ["PLAN_WEAKENS_ACTIVE_PLAN"] } });
    expect(narrower?.message).toMatch(/^PLAN_WEAKENS_ACTIVE_PLAN: Activation would weaken the active plan/);
  });

  it("a tools.yaml that does not verify: Understand reports TOOLS_CONFIG_UNVERIFIED, not COMPILE_FAILED", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    writeFileSync(toolsConfigPath(ws), YAML.stringify(toolsWith(["delegate", "workflow"])));
    const facts = adapt(ws);
    expect(facts.plan).toBeNull();
    expect(facts.compileError?.code).toBe("TOOLS_CONFIG_UNVERIFIED");
  });

  it("tools.yaml changed after Propose: Understand compiles another plan digest, and the revision's tools slot reads drifted", () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    const proposed = adapt(ws).plan!;
    expect(proposed.runtimePolicy.toolPipeline.toolsConfigSha256).toBe(sha256Hex(readFileSync(toolsConfigPath(ws))));
    expect(proposed.runtimePolicy.toolPipeline.visibleTools).toContain("delegate");
    // What a revision binds at Propose; Build, decide, complete and the effect preamble refuse RESOURCE_DRIFTED on it.
    const bound = { "signedConfigs.tools": RESOURCE_SLOTS["signedConfigs.tools"]!(ws, "default") };
    expect(driftedSlots(ws, bound, "default")).toEqual([]);
    signTools(ws, ["delegate", "workflow"]);
    expect(adapt(ws).plan!.digest).not.toBe(proposed.digest);
    expect(driftedSlots(ws, bound, "default")).toEqual(["signedConfigs.tools"]);
  });
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

  it("one verified read of tools.yaml per guard pass decides the plan's pin, the allowlist and the native tool identity", async () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    activate(ws);
    const run = compose(ws, ownerLease(ws).token);
    try {
      guardReads.path = toolsConfigPath(ws);
      guardReads.count = 0;
      const text = await run.call("fs.read", { path: "workspace/n.txt" });
      expect(text).toContain('"outcome":"OK"');
      expect(guardReads.count, "tools.yaml reads inside the guard pass").toBe(1);
    } finally { guardReads.path = null; run.toolset.close(); }
  });

  it("tools.yaml changed after activation: every call refused until the plan is recompiled and reactivated", async () => {
    const ws = governedWorkspace();
    signTools(ws, ["delegate"]);
    activate(ws);
    const lease = ownerLease(ws);
    const first = compose(ws, lease.token);
    try {
      expect(await first.call("delegate", DELEGATE)).toContain('"outcome":"OK"');
      chmodSync(toolsConfigPath(ws), 0o000);
      try {
        const text = await first.call("fs.read", { path: "workspace/n.txt" });
        expect(text).not.toContain('"outcome":"OK"');
        expect(text).toContain("EACCES");
        expect(text, "a model-visible denial names no host path").not.toContain(ws);
      } finally { chmodSync(toolsConfigPath(ws), 0o644); }
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
