import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initPresets, savePresets } from "../src/presets/agentPresets.js";
import { initUsersConfig } from "../src/auth/authApi.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { activateControlPlan } from "../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import { signPlan } from "../src/catalog/compiler/sign.js";
import { initDestinationRegistry } from "../src/residency/destinationRegistry.js";
import { catalog } from "./catalog/l0/harness.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runComposedTurn, type ComposedToolSession } from "../src/kernel/agentLoopRunner.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { approvalModeGatedClasses } from "../src/approvals/approvalModes.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";

/**
 * SH-SANDBOX-04 end to end: `--approval-mode` on the real `agent-loop run` surface with the stub provider.
 * The stub calls the tool a user text spells out as `{"tool", "arguments"}`, so each run scripts one governed call.
 */
const originalCwd = process.cwd();
let workspace: string;
let credentialsHome: string;
let priorPassphrase: string | undefined;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  priorPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "approval-mode-cli-test";
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-approval-mode-")));
  credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-approval-mode-home-")));
  // "Not configured" Action Policy (AXR-02): the signed default policy would narrow every write to SIMULATE on its own,
  // which is exactly what the plan case must be shown to do by itself.
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
  }
  if (priorPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = priorPassphrase;
  rmSync(workspace, { recursive: true, force: true });
  rmSync(credentialsHome, { recursive: true, force: true });
});

type Captured = { out: string[]; errors: string[]; failed: boolean };

async function runCli(prompt: string, extra: string[]): Promise<{ captured: Captured; summary: AgentRunSummary | null }> {
  const captured: Captured = { out: [], errors: [], failed: false };
  const program = new Command().exitOverride();
  const io: AgentLoopCliIo = { log: line => captured.out.push(line), error: line => captured.errors.push(line), fail: () => { captured.failed = true; } };
  registerAgentCommands(program, io);
  await program.parseAsync(["agent-loop", "run", prompt, "--provider", "stub", "--credentials-home", credentialsHome, "--json", ...extra], { from: "user" });
  const last = captured.out.at(-1);
  return { captured, summary: captured.failed || last === undefined ? null : JSON.parse(last) as AgentRunSummary };
}

function toolAudits(sessionId?: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.getAllEvents().filter(row => row.event_type === "audit" && (sessionId === undefined || row.session_id === sessionId))
      .map(row => JSON.parse(row.meta_json ?? "{}") as Record<string, unknown>).filter(meta => typeof meta["toolName"] === "string");
  } finally { ledger.close(); }
}

const scripted = (tool: string, args: Record<string, unknown>): string => JSON.stringify({ tool, arguments: args });

describe("amc agent-loop run --approval-mode", () => {
  it("plan runs nothing: a scripted fs.write enters as SIMULATE and the file is never written", async () => {
    const { captured, summary } = await runCli(scripted("fs.write", { path: "workspace/output/planned.txt", content: "hello" }), ["--tools", "workspace", "--approval-mode", "plan"]);
    expect(captured.failed, captured.errors.join("\n")).toBe(false);
    expect(summary?.toolCalls).toBe(1);
    expect(existsSync(join(workspace, "workspace", "output", "planned.txt"))).toBe(false);
    const call = toolAudits(summary!.sessionId).find(meta => meta["toolName"] === "fs.write");
    expect(call).toMatchObject({ effectiveMode: "SIMULATE" });
    expect(captured.errors.join("\n")).toContain("approval mode plan");
  });

  it("without a mode the same call executes (the control for the plan case)", async () => {
    const { captured, summary } = await runCli(scripted("fs.write", { path: "workspace/output/written.txt", content: "hello" }), ["--tools", "workspace"]);
    expect(captured.failed, captured.errors.join("\n")).toBe(false);
    expect(existsSync(join(workspace, "workspace", "output", "written.txt"))).toBe(true);
    expect(toolAudits(summary!.sessionId).find(meta => meta["toolName"] === "fs.write")).toMatchObject({ effectiveMode: "EXECUTE" });
  });

  it("plan reaches a delegated child: the child's fs.write is simulated too", async () => {
    const config = loadToolsConfig(workspace);
    initToolsConfig(workspace, { tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
    const childTask = scripted("fs.write", { path: "workspace/output/child-planned.txt", content: "from the child" });
    const { captured, summary } = await runCli(scripted("delegate", { runAs: "child", goal: childTask }), ["--tools", "workspace", "--approval-mode", "plan", "--delegate"]);
    expect(captured.failed, captured.errors.join("\n")).toBe(false);
    expect(summary?.toolCalls).toBe(1);
    expect(existsSync(join(workspace, "workspace", "output", "child-planned.txt"))).toBe(false);
    const childWrite = toolAudits().filter(meta => meta["toolName"] === "fs.write");
    expect(childWrite.length).toBeGreaterThan(0);
    for (const row of childWrite) expect(row).toMatchObject({ effectiveMode: "SIMULATE" });
  });

  it("each delegated child's signed hook-control row names the mode, and the gate's classes and exempt tools", async () => {
    const config = loadToolsConfig(workspace);
    initToolsConfig(workspace, { tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
    for (const mode of ["plan", "default"]) {
      const { captured } = await runCli(scripted("delegate", { runAs: `child-${mode}`, goal: "hello" }), ["--tools", "workspace", "--approval-mode", mode, "--delegate"]);
      expect(captured.failed, captured.errors.join("\n")).toBe(false);
    }
    const ledger = openLedger(workspace, { readonly: true });
    let rows: Array<Record<string, unknown>>;
    try {
      rows = ledger.getAllEvents().filter(row => row.event_type === "audit").map(row => JSON.parse(row.meta_json ?? "{}") as Record<string, unknown>)
        .filter(meta => meta["kind"] === "delegation/hook-control");
    } finally { ledger.close(); }
    expect(rows.find(meta => meta["runAs"] === "child-plan")).toMatchObject({ approvalMode: "plan", approvalGate: null });
    expect(rows.find(meta => meta["runAs"] === "child-default")).toMatchObject({ approvalMode: "default",
      approvalGate: { gatesClasses: [...approvalModeGatedClasses("default")!].sort(), exemptToolNames: [] } });
  });

  it("refuses every mode with an out-of-process delegate provider, from the flag and from a signed preset", async () => {
    const config = loadToolsConfig(workspace);
    initToolsConfig(workspace, { tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
    for (const mode of ["plan", "default", "accept-edits", "untrusted"]) {
      const { captured } = await runCli("hello", ["--tools", "workspace", "--approval-mode", mode, "--delegate", "--delegate-provider", "claude-cli"]);
      expect(captured.failed, mode).toBe(true);
      expect(captured.errors.join("\n"), mode).toContain(`--approval-mode ${mode} cannot govern an out-of-process delegate (claude-cli)`);
    }
    initPresets(workspace);
    savePresets(workspace, [{ id: "foreign", description: "delegates to a foreign child", model: STUB_PROVIDER_MODEL, providerId: STUB_PROVIDER_ID,
      tools: "workspace", delegate: { enabled: true, provider: "claude-cli" } }]);
    const viaPreset = await runCli("hello", ["--preset", "foreign", "--approval-mode", "plan"]);
    expect(viaPreset.captured.failed).toBe(true);
    expect(viaPreset.captured.errors.join("\n")).toContain("cannot govern an out-of-process delegate (claude-cli)");
    // The control: in-process delegation under a mode composes (the plan case above writes nothing through its child).
    const inProcess = await runCli("hello", ["--tools", "workspace", "--approval-mode", "plan", "--delegate"]);
    expect(inProcess.captured.failed, inProcess.captured.errors.join("\n")).toBe(false);
  });

  it("the signed composition digest tells the modes apart from each other, from the expert gate and from no gate", async () => {
    const digestOf = async (extra: string[]): Promise<string> => {
      const { captured, summary } = await runCli("hello", ["--tools", "none", ...extra]);
      expect(captured.failed, captured.errors.join("\n")).toBe(false);
      const ledger = openLedger(workspace, { readonly: true });
      try {
        const open = ledger.getAllEvents().find(row => row.event_type === "session/open" && row.session_id === summary!.sessionId)!;
        return (JSON.parse(open.meta_json ?? "{}") as { compositionDigest: string }).compositionDigest;
      } finally { ledger.close(); }
    };
    const digests = {
      none: await digestOf([]), plan: await digestOf(["--approval-mode", "plan"]), def: await digestOf(["--approval-mode", "default"]),
      edits: await digestOf(["--approval-mode", "accept-edits"]), untrusted: await digestOf(["--approval-mode", "untrusted"]), expert: await digestOf(["--approve-tools", "WRITE_HIGH"])
    };
    expect(new Set(Object.values(digests)).size).toBe(6);
    expect(await digestOf(["--approval-mode", "accept-edits"])).toBe(digests.edits);
  });

  it("refuses bypass modes by name and the expert flags alongside a mode", async () => {
    for (const argv of [["--approval-mode", "never"], ["--approval-mode", "yolo"], ["--approval-mode", "default", "--approve-tools", "WRITE_HIGH"], ["--approval-mode", "plan", "--approve-risk", "low"]]) {
      const { captured } = await runCli("hello", ["--tools", "none", ...argv]);
      expect(captured.failed, argv.join(" ")).toBe(true);
      expect(captured.errors.join("\n")).toMatch(/refused|cannot be combined/);
    }
  });
});

describe("a mode under an active compiled policy", () => {
  // A fully initialised workspace: the suite's own leaves the Action Policy out, and plan review needs signed approvals.
  let regulated: string;
  beforeEach(() => { regulated = realpathSync(mkdtempSync(join(tmpdir(), "amc-approval-mode-regulated-"))); initWorkspace({ workspacePath: regulated, agentId: "default", trustBoundaryMode: "isolated" }); });
  afterEach(() => { rmSync(regulated, { recursive: true, force: true }); });

  /** The L0-IDN-01 fixture plan, reviewed by two test approvers and activated (as tests/runPrincipalLease.test.ts does). */
  function activatePlan(): void {
    const workspace = regulated;
    initUsersConfig({ workspace, username: "owner", password: "approval-mode-fixture-password" });
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
    expect(plan.runtimePolicy?.toolPipeline.approvalRequiredFor ?? []).toContain("WRITE_LOW");
    const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    for (const userId of ["approver-1", "approver-2"]) {
      decideApprovalForIntent({ reviewerAuthentication: "authenticated", workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "approval-mode fixture plan review", userId, username: userId, userRoles: ["OWNER"] });
    }
    activateControlPlan({ workspace, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
  }

  it("accept-edits is refused by name where the compiled policy requires a signed approval for WRITE_LOW; default composes", () => {
    activatePlan();
    const recorder = { recordProjectedEvidence: () => {} };
    expect(() => agentToolset({ workspace: regulated, agentId: "default", sessionId: "compiled-accept-edits", recorder, approvalMode: "accept-edits" }))
      .toThrow(/--approval-mode accept-edits leaves WRITE_LOW unasked, but the active compiled policy requires a signed approval/);
    const composed = agentToolset({ workspace: regulated, agentId: "default", sessionId: "compiled-default", recorder, approvalMode: "default" });
    composed.close();
  });
});

describe("a mode's gate through the real composed turn", () => {
  const deny = { name: "test-denier", answer: async () => "deny" as const };
  async function turn(prompt: string, mode: "default" | "accept-edits") {
    const sessionId = `mode-${mode}-${Date.now()}`;
    let writer: ComposedToolSession | undefined;
    const toolset = agentToolset({ workspace, agentId: "default", sessionId, recorder: { recordProjectedEvidence: row => writer!.recordProjectedEvidence(row) } });
    try {
      const outcome = await runComposedTurn({
        workspace, agentId: "default", sessionId, systemPrompt: "You are an AMC-governed agent.", prompt,
        route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
        routes: [stubProviderRoute()], transport: stubProviderTransport(),
        tools: toolset.seam, bindToolSession: selected => { writer = selected; },
        credentials: { homeDir: credentialsHome, env: {}, watch: false, projectDir: null },
        approvalMode: mode,
        approvalGate: { actionClass: "WRITE_HIGH", riskTier: "high", gatesClasses: approvalModeGatedClasses(mode)!, answerers: [deny] }
      });
      const ledger = openLedger(workspace, { readonly: true });
      try { return { outcome, rows: ledger.getAllEvents().filter(row => row.session_id === outcome.sessionId) }; } finally { ledger.close(); }
    } finally { toolset.close(); }
  }

  it("default asks about fs.write (WRITE_LOW) and the denial stops it; accept-edits lets the same edit run without a question", async () => {
    const asked = await turn(scripted("fs.write", { path: "workspace/output/gated.txt", content: "x" }), "default");
    expect(asked.rows.filter(row => row.event_type === "approval/request")).toHaveLength(1);
    expect(existsSync(join(workspace, "workspace", "output", "gated.txt"))).toBe(false);
    const accepted = await turn(scripted("fs.write", { path: "workspace/output/accepted.txt", content: "x" }), "accept-edits");
    expect(accepted.rows.filter(row => row.event_type === "approval/request")).toHaveLength(0);
    expect(existsSync(join(workspace, "workspace", "output", "accepted.txt"))).toBe(true);
  });

  it("neither default nor accept-edits asks about a READ_ONLY call", async () => {
    const read = await turn(scripted("fs.read", { path: "README.md" }), "default");
    expect(read.rows.filter(row => row.event_type === "approval/request")).toHaveLength(0);
    expect(read.rows.filter(row => row.event_type === "tool/result")).toHaveLength(1);
  });
});
