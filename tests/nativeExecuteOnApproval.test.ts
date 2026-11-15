import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalInbox } from "../src/approvals/approvalInbox.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import { openLedger } from "../src/ledger/ledger.js";
import { applyStarterProfile } from "../src/setup/starterProfiles.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * H-02: in a workspace made by `amc init --coding`, a file edit the person approves is written, one they deny is not,
 * one nobody is asked about stays SIMULATE, and the signed record says EXECUTE only for the call that ran.
 * The stub provider plays scripted tool calls; the approver stands in for a signed-in person (Studio or a session token).
 */
const OWNER = { username: "exec-owner", password: "exec-owner-password" };
const originalCwd = process.cwd();
let workspace: string;
let home: string;
let checkpoints: string;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "execute-on-approval-test");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-approval-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-approval-home-")));
  checkpoints = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-approval-ckpt-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(checkpoints, "checkpoints"));
  initWorkspace({ workspacePath: workspace });
  applyStarterProfile(workspace, "coding", OWNER);
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
  }
  try { lockVault(workspace); } catch { /* not unlocked */ }
  for (const dir of [workspace, home, checkpoints]) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function ownerUserId(): string {
  const text = readFileSync(join(workspace, ".amc", "users.yaml"), "utf8");
  return /userId: ([0-9a-f-]{36})\n\s+username: exec-owner/.exec(text)?.[1] ?? "";
}

/** The person: waits for the run's request and decides it as the signed-in owner. */
async function decideNext(decision: "APPROVED" | "DENIED"): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const pending = listApprovalInbox({ workspace, agentId: "default", status: "PENDING" });
    if (pending.length > 0) {
      decideApprovalForIntent({ workspace, agentId: "default", approvalId: pending[0]!.request.approvalRequestId, decision, mode: "EXECUTE",
        reason: "reviewed in test", username: OWNER.username, userId: ownerUserId(), userRoles: ["OWNER"], reviewerAuthentication: "authenticated" });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("no approval request was raised");
}

async function run(tool: object, extra: string[]): Promise<AgentRunSummary> {
  const out: string[] = [], errors: string[] = [];
  let failed = false;
  const io: AgentLoopCliIo = { log: (line) => out.push(line), error: (line) => errors.push(line), fail: () => { failed = true; } };
  const program = new Command().exitOverride();
  registerAgentCommands(program, io);
  await program.parseAsync(["agent-loop", "run", JSON.stringify(tool), "--provider", "stub", "--credentials-home", home,
    "--tools", "workspace", "--json", ...extra], { from: "user" });
  expect(failed, errors.join("\n")).toBe(false);
  return JSON.parse(out.at(-1)!) as AgentRunSummary;
}

/** Each signed TOOL_CALL_ALLOWED row's tool and effective mode, in this session. */
function recordedModes(sessionId: string): string[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.getAllEvents().filter((event) => event.session_id === sessionId && event.event_type === "audit").map((event) =>
      JSON.parse(event.meta_json ?? "{}") as { auditType?: string; toolName?: string; effectiveMode?: string })
      .filter((meta) => meta.auditType === "TOOL_CALL_ALLOWED").map((meta) => `${meta.toolName}:${meta.effectiveMode}`);
  } finally {
    ledger.close();
  }
}

const write = (path: string) => ({ tool: "fs.write", arguments: { path, content: "hello\n" } });

describe("a coding workspace runs an edit only after a person approves it", () => {
  it("writes the file after approval and records EXECUTE", async () => {
    const [summary] = await Promise.all([run(write("approved.txt"), ["--approval-mode", "default"]), decideNext("APPROVED")]);
    expect(readFileSync(join(workspace, "approved.txt"), "utf8")).toBe("hello\n");
    expect(summary.simulatedToolCalls ?? 0).toBe(0);
    expect(recordedModes(summary.sessionId)).toEqual(["fs.write:EXECUTE"]);
  }, 60_000);

  it("writes nothing after a denial and records no allowed call", async () => {
    const [summary] = await Promise.all([run(write("denied.txt"), ["--approval-mode", "default"]), decideNext("DENIED")]);
    expect(existsSync(join(workspace, "denied.txt"))).toBe(false);
    expect(recordedModes(summary.sessionId)).toEqual([]);
  }, 60_000);

  it("keeps a call nobody was asked about as SIMULATE, and says how to be asked", async () => {
    const summary = await run(write("unasked.txt"), []);
    expect(existsSync(join(workspace, "unasked.txt"))).toBe(false);
    expect(summary.simulatedToolCalls).toBe(1);
    expect(recordedModes(summary.sessionId)).toEqual(["fs.write:SIMULATE"]);
    expect(listApprovalInbox({ workspace, agentId: "default" })).toEqual([]);
  }, 60_000);

  it("keeps an edit SIMULATE under accept-edits, which asks nobody about edits", async () => {
    const summary = await run(write("accepted.txt"), ["--approval-mode", "accept-edits"]);
    expect(existsSync(join(workspace, "accepted.txt"))).toBe(false);
    expect(recordedModes(summary.sessionId)).toEqual(["fs.write:SIMULATE"]);
  }, 60_000);
});
