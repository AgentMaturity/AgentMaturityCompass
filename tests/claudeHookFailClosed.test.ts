import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { installHookIntegration, type HookProvider } from "../src/adapters/hookIntegration.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { defaultActionPolicy, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

const cliPath = resolve(process.cwd(), "dist/cli.js");
const PASSPHRASE = "claude-hook-fail-closed-passphrase";
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

const CLAUDE_DENY = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "AMC control is unavailable; the action is denied fail closed.",
  },
};

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-claude-fail-closed-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = PASSPHRASE;
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initApprovalPolicy(workspace);
  return workspace;
}

function installObservedRun(workspace: string, agentId: string): void {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId,
    runId: "run_fail_closed",
    ts: now,
    windowStartTs: now - 60_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.95,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev_fail_closed"],
      flags: [],
      narrative: "AMC-owned hook fail-closed fixture",
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "fixture",
    reportJsonSha256: "fixture",
  };
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, `${report.runId}.json`), JSON.stringify(report, null, 2));
}

function permitReadAndWrite(workspace: string): void {
  const policy = defaultActionPolicy();
  for (const rule of policy.actions) {
    if (rule.actionClass !== "READ_ONLY" && rule.actionClass !== "WRITE_LOW") continue;
    rule.minEffectiveQuestionLevels = {};
    rule.requireTrustTierAtLeast = "OBSERVED";
    rule.requireAssurancePacks = {};
    rule.allowExecute = true;
    rule.requireExecTicket = false;
  }
  policy.riskTierDefaults.low.requireSandboxForExecute = false;
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  initActionPolicy(workspace, policy);
}

async function listen(handler: RequestListener): Promise<string> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub bridge did not bind");
  closers.push(() => new Promise<void>((resolvePromise) => {
    server.closeAllConnections();
    server.close(() => resolvePromise());
  }));
  return `http://127.0.0.1:${address.port}`;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

function installControl(workspace: string, provider: HookProvider, agentId: string, bridgeBase: string): void {
  installHookIntegration({ workspace, provider, agentId, bridgeBase, mode: "control" });
}

/** The installed hook timeout in milliseconds, read from the written provider settings. */
function installedTimeoutMs(workspace: string, provider: HookProvider): number {
  if (provider === "gemini-cli") {
    const config = JSON.parse(readFileSync(join(workspace, ".gemini", "settings.json"), "utf8")) as {
      hooks: { BeforeTool: Array<{ hooks: Array<{ timeout: number }> }> };
    };
    return config.hooks.BeforeTool[0]!.hooks[0]!.timeout;
  }
  const config = JSON.parse(readFileSync(join(workspace, ".claude", "settings.local.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ hooks: Array<{ timeout: number }> }> };
  };
  return config.hooks.PreToolUse[0]!.hooks[0]!.timeout * 1000;
}

interface ForwardRun {
  status: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** Spawns the hidden forwarder asynchronously so the in-process stub bridge keeps serving. */
function forward(input: {
  workspace: string;
  provider: HookProvider;
  agentId: string;
  bridgeBase: string;
  stdin: string;
}): Promise<ForwardRun> {
  const started = Date.now();
  const child = spawn(process.execPath, [
    cliPath, "connect", "hooks", "forward",
    "--provider", input.provider,
    "--mode", "control",
    "--agent", input.agentId,
    "--bridge-url", input.bridgeBase,
    "--token-file", `.amc/hooks/${input.provider}.lease`,
  ], {
    cwd: input.workspace,
    env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASSPHRASE },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(input.stdin);
  const killer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  return new Promise((resolvePromise) => {
    child.on("close", (status) => {
      clearTimeout(killer);
      resolvePromise({ status, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}

function claudeRead(path: string, id: string): string {
  return JSON.stringify({
    session_id: "private-fail-closed-session",
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_use_id: id,
    tool_input: { file_path: path },
  });
}

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("Claude Code control hook fails closed with exit code 2", () => {
  test("a bridge that never answers is denied with exit 2 before the hook timeout", async () => {
    const workspace = newWorkspace();
    const bridgeBase = await listen(() => { /* never answers */ });
    installControl(workspace, "claude-code", "hung-agent", bridgeBase);
    const timeoutMs = installedTimeoutMs(workspace, "claude-code");

    const run = await forward({
      workspace,
      provider: "claude-code",
      agentId: "hung-agent",
      bridgeBase,
      stdin: claudeRead("/private/hung-never-forwarded.txt", "toolu_hung_01"),
    });

    expect(run.status).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual(CLAUDE_DENY);
    expect(run.durationMs).toBeLessThan(timeoutMs - 1000);
    expect(run.stderr).not.toContain("hung-never-forwarded");
  }, 60_000);

  test("a bridge that returns HTTP 500 twice is denied with exit 2", async () => {
    const workspace = newWorkspace();
    let requests = 0;
    const bridgeBase = await listen((_req, res) => {
      requests += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "fixture outage" }));
    });
    installControl(workspace, "claude-code", "outage-agent", bridgeBase);

    const run = await forward({
      workspace,
      provider: "claude-code",
      agentId: "outage-agent",
      bridgeBase,
      stdin: claudeRead("/private/outage-never-forwarded.txt", "toolu_outage_01"),
    });

    expect(requests).toBe(2);
    expect(run.status).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual(CLAUDE_DENY);
    expect(run.stderr).toContain("AMC hook control unavailable; action denied.");
  }, 60_000);

  test("a policy deny exits 2 and allow and ask exit 0 with the matching native JSON", async () => {
    const workspace = newWorkspace();
    const agentId = "policy-agent";
    installObservedRun(workspace, agentId);
    permitReadAndWrite(workspace);
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    const readable = join(workspace, "workspace", "public.txt");
    writeFileSync(readable, "public fixture");
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    closers.push(() => bridge.close());
    installControl(workspace, "claude-code", agentId, bridgeBase);

    const denied = await forward({
      workspace, provider: "claude-code", agentId, bridgeBase,
      stdin: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "UnmappedDangerousTool",
        tool_use_id: "toolu_policy_deny_01",
        tool_input: { secret: "DO_NOT_RETAIN_FAIL_CLOSED" },
      }),
    });
    expect(denied.status).toBe(2);
    expect(JSON.parse(denied.stdout)).toEqual({
      hookSpecificOutput: expect.objectContaining({ hookEventName: "PreToolUse", permissionDecision: "deny" }),
    });
    expect(denied.stderr).toContain("not mapped to an allowed ToolHub tool");
    expect(denied.stderr).not.toContain("DO_NOT_RETAIN_FAIL_CLOSED");

    const allowed = await forward({
      workspace, provider: "claude-code", agentId, bridgeBase,
      stdin: claudeRead(readable, "toolu_policy_allow_01"),
    });
    expect(allowed.status).toBe(0);
    expect(JSON.parse(allowed.stdout)).toEqual({
      hookSpecificOutput: expect.objectContaining({ hookEventName: "PreToolUse", permissionDecision: "allow" }),
    });

    const asked = await forward({
      workspace, provider: "claude-code", agentId, bridgeBase,
      stdin: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_use_id: "toolu_policy_ask_01",
        tool_input: { file_path: join(workspace, "workspace", "output", "draft.txt"), content: "PRIVATE" },
      }),
    });
    expect(asked.status).toBe(0);
    expect(JSON.parse(asked.stdout)).toEqual({
      hookSpecificOutput: expect.objectContaining({ hookEventName: "PreToolUse", permissionDecision: "ask" }),
    });
  }, 90_000);

  test("empty stdin and malformed JSON are denied with exit 2", async () => {
    const workspace = newWorkspace();
    const bridgeBase = await listen((_req, res) => { res.writeHead(500); res.end(); });
    installControl(workspace, "claude-code", "input-agent", bridgeBase);

    for (const stdin of ["", "{\"hook_event_name\": \"PreToolUse\", "]) {
      const run = await forward({ workspace, provider: "claude-code", agentId: "input-agent", bridgeBase, stdin });
      expect(run.status).toBe(2);
      expect(JSON.parse(run.stdout)).toEqual(CLAUDE_DENY);
      expect(run.stderr).toContain("AMC hook control input invalid; action denied.");
    }
  }, 60_000);
});

describe("Gemini CLI control hook keeps its outputs and exit codes", () => {
  const GEMINI_DENY = { decision: "deny", reason: "AMC control is unavailable; the action is denied fail closed." };
  const geminiRead = JSON.stringify({
    hook_event_name: "BeforeTool",
    tool_name: "read_file",
    tool_input: { file_path: "/private/gemini-never-forwarded.txt" },
  });

  test("an outage or malformed input denies with exit 0 and empty stdin still exits 1", async () => {
    const workspace = newWorkspace();
    const bridgeBase = await listen((_req, res) => { res.writeHead(500); res.end(); });
    installControl(workspace, "gemini-cli", "gemini-agent", bridgeBase);

    const outage = await forward({ workspace, provider: "gemini-cli", agentId: "gemini-agent", bridgeBase, stdin: geminiRead });
    expect(outage.status).toBe(0);
    expect(JSON.parse(outage.stdout)).toEqual(GEMINI_DENY);

    const malformed = await forward({ workspace, provider: "gemini-cli", agentId: "gemini-agent", bridgeBase, stdin: "{" });
    expect(malformed.status).toBe(0);
    expect(JSON.parse(malformed.stdout)).toEqual(GEMINI_DENY);

    const empty = await forward({ workspace, provider: "gemini-cli", agentId: "gemini-agent", bridgeBase, stdin: "" });
    expect(empty.status).toBe(1);
    expect(empty.stdout).toBe("");
  }, 60_000);

  test("a bridge that never answers is denied with exit 0 before the Gemini hook timeout", async () => {
    const workspace = newWorkspace();
    const bridgeBase = await listen(() => { /* never answers */ });
    installControl(workspace, "gemini-cli", "gemini-hung", bridgeBase);
    const timeoutMs = installedTimeoutMs(workspace, "gemini-cli");

    const run = await forward({ workspace, provider: "gemini-cli", agentId: "gemini-hung", bridgeBase, stdin: geminiRead });

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(GEMINI_DENY);
    expect(run.durationMs).toBeLessThan(timeoutMs - 1000);
  }, 60_000);
});
