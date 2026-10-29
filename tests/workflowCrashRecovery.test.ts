import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import type { SubagentRunner } from "../src/agent/subagentSpawn.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { lockVault } from "../src/vault/vault.js";
import { runWorkflowPlan } from "../src/workflow/workflowRunner.js";
import type { WorkflowNode } from "../src/workflow/workflowPlan.js";
import { initWorkspace } from "../src/workspace.js";

const OPEN = { agentId: "owner", harnessVersion: "workflow-crash-fixture",
  compositionDigest: "workflow-crash-composition", policyDigest: "workflow-crash-policy" };
const PLAN: WorkflowNode = { kind: "pipeline", id: "root", stages: [
  { kind: "agent", id: "a", runAs: "researcher", goal: "goal-a" },
  { kind: "agent", id: "b", runAs: "researcher", goal: "goal-b" }
] };
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHILD = `
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { rootIdentity } from "./dist/agent/delegationIdentity.js";
import { SessionService } from "./dist/session/sessionService.js";
import { runWorkflowPlan } from "./dist/workflow/workflowRunner.js";
import { initWorkspace } from "./dist/workspace.js";
const [workspace, phase] = process.argv.slice(1);
const identity = ${JSON.stringify(OPEN)};
const plan = ${JSON.stringify(PLAN)};
initWorkspace({ workspacePath: workspace, agentId: "owner", trustBoundaryMode: "isolated" });
const parent = new SessionService(workspace);
parent.open({ ...identity, sessionId: "parent" });
parent.startTurn({ trigger: "user" });
parent.recordUserMessage("Run the exact two-node crash fixture.");
const record = parent.recordProjectedEvidence.bind(parent);
parent.recordProjectedEvidence = row => {
  const target = phase === "before-waiting" ? "waiting" : phase === "after-result" ? "succeeded" : "running";
  if (row.meta.kind === "workflow/progress" && row.meta.nodeId === "b"
    && row.meta.status === target) {
    if (phase === "after-running") record(row);
    process.kill(process.pid, "SIGKILL");
  }
  return record(row);
};
let child = 0;
const result = await runWorkflowPlan({ workspace, session: parent, plan, runId: "job",
  parent: rootIdentity("owner"), mintSessionId: () => "initial-child-" + (++child),
  runner: async context => {
    const node = context.goal.startsWith("goal-a") ? "a" : "b";
    const session = new SessionService(workspace);
    session.open({ ...identity, sessionId: context.childSessionId });
    session.startTurn({ trigger: "user" });
    session.recordUserMessage(context.goal);
    session.startStep();
    appendFileSync(join(workspace, "fixture-effects.jsonl"), JSON.stringify({ node, goal: context.goal, pid: process.pid }) + "\\n");
    session.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "stop", content: "completed-" + node });
    session.endStep({ stopReason: "stop", usage: null });
    session.endTurn({ reason: "complete" });
    session.sealTurn();
    session.close({ reason: "fixture completed" });
    return { ok: true, text: "completed-" + node };
  }
});
throw new Error("crash hook did not fire: " + JSON.stringify({ ok: result.ok, failures: result.failures }));
`;

let directory: string;
let workspace: string;
const services: SessionService[] = [];
beforeEach(() => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), "amc-workflow-crash-")));
  workspace = join(directory, "workspace");
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "disposable-workflow-crash-passphrase");
  vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_HOME", join(directory, "home"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(directory, "control-checkpoints"));
  vi.stubEnv("AMC_GUARD_RECEIPTS_WORKSPACE", join(directory, "guard-receipts"));
  vi.stubEnv("AMC_GUARD_EVENTS_DB_PATH", join(directory, "guard-events.sqlite"));
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_NO_SIGN", undefined);
});
afterEach(() => {
  for (const session of services.splice(0)) session.disposeWithoutClosing();
  closeAllSqlitePools();
  lockVault(workspace);
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function resume() {
  const resumed = resumeSession({ workspace, sessionId: "parent", ...OPEN, staleAfterMs: 0,
    claimant: { pid: process.pid, hostId: hostname(), bootId: "workflow-crash-test", startedAt: Date.now() } });
  services.push(resumed.service);
  return resumed;
}

function effects(): Array<{ node: string; goal: string; pid: number }> {
  return readFileSync(join(workspace, "fixture-effects.jsonl"), "utf8").trim().split("\n")
    .map(line => JSON.parse(line) as { node: string; goal: string; pid: number });
}

function resumedRunner(): SubagentRunner {
  return async context => {
    const node = context.goal.startsWith("goal-a") ? "a" : "b";
    const child = new SessionService(workspace);
    services.push(child);
    child.open({ ...OPEN, sessionId: context.childSessionId });
    child.startTurn({ trigger: "user" });
    child.recordUserMessage(context.goal);
    child.startStep();
    appendFileSync(join(workspace, "fixture-effects.jsonl"), JSON.stringify({ node, goal: context.goal, pid: process.pid }) + "\n");
    child.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "stop", content: `completed-${node}` });
    child.endStep({ stopReason: "stop", usage: null });
    child.endTurn({ reason: "complete" });
    child.sealTurn();
    child.close({ reason: "fixture completed" });
    return { ok: true, text: `completed-${node}` };
  };
}

describe("workflow recovery after a separate process is killed", () => {
  it.each(["before-waiting", "after-running", "after-result"] as const)("preserves completed nodes after %s", async phase => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD, workspace, phase], {
      cwd: ROOT, env: { ...process.env }, encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL", maxBuffer: 1_000_000
    });
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.signal, child.stderr).toBe("SIGKILL");
    expect(child.pid).not.toBe(process.pid);
    expect(effects().map(effect => effect.node)).toEqual(phase === "after-result" ? ["a", "b"] : ["a"]);
    expect(effects()[0].pid).toBe(child.pid);

    const before = loadSessionEventHistory({ workspace });
    const completedChild = before.sessions.find(session => session.session_id === "initial-child-1");
    expect(completedChild).toBeDefined();
    expect(completedChild!.ended_ts).not.toBeNull();
    const parentRows = before.events.filter(row => row.session_id === "parent");
    const progress = parentRows.filter(row => row.event_type === "audit")
      .map(row => JSON.parse(row.meta_json) as Record<string, unknown>).filter(meta => meta.kind === "workflow/progress");
    expect(progress.filter(meta => meta.nodeId === "a" && meta.status === "succeeded")).toHaveLength(1);
    expect(progress.filter(meta => meta.nodeId === "b").map(meta => meta.status))
      .toEqual(phase === "before-waiting" ? [] : ["waiting", "running"]);

    const resumed = resume();
    expect(resumed.report.recovery?.verdict).toBe("RECOVERED");
    resumed.service.startTurn({ trigger: "user" });
    resumed.service.recordUserMessage("Continue the original workflow without repeating uncertain effects.");
    const result = await runWorkflowPlan({ workspace, session: resumed.service, plan: PLAN, runId: "job",
      parent: rootIdentity("owner"), runner: resumedRunner(), mintSessionId: () => `resumed-child-${randomUUID()}` });
    expect(result.outputs.get("a")).toBe("completed-a");
    expect(effects().filter(effect => effect.node === "a")).toHaveLength(1);
    if (phase === "before-waiting") {
      expect(result.ok, JSON.stringify(result.failures)).toBe(true);
      expect(result.agentsRun).toBe(1);
      expect(result.outputs.get("b")).toBe("completed-b");
      expect(effects().map(effect => effect.node)).toEqual(["a", "b"]);
      expect(effects()[1].pid).toBe(process.pid);
      expect(effects()[1].goal).toBe("goal-b\n\nInput from the previous step:\ncompleted-a");
    } else {
      expect(result.ok).toBe(false);
      expect(result.agentsRun).toBe(0);
      expect(result.outputs.has("b")).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].reason).toContain("TOOL_OUTCOME_UNKNOWN");
      expect(effects().map(effect => effect.node)).toEqual(phase === "after-result" ? ["a", "b"] : ["a"]);
    }
    resumed.service.endTurn({ reason: "complete" });
    resumed.service.sealTurn();
    resumed.service.close({ reason: "fixture verification completed" });
    const after = loadSessionEventHistory({ workspace, requireSealed: true });
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(after.sessions.every(session => session.ended_ts !== null)).toBe(true);
  }, 30_000);

  it("refuses to replace a live owning writer without changing its signed history", () => {
    initWorkspace({ workspacePath: workspace, agentId: "owner", trustBoundaryMode: "isolated" });
    const owner = new SessionService(workspace);
    services.push(owner);
    owner.open({ ...OPEN, sessionId: "parent" });
    const before = loadSessionEventHistory({ workspace }).events;
    expect(() => resume()).toThrow(/LIVE_WRITER/);
    expect(loadSessionEventHistory({ workspace }).events).toEqual(before);
    owner.assertDispatchFence();
  });
});
