import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolEvidenceFor } from "../src/tools/toolEvidence.js";
import { NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";

/**
 * Every governed tool call lands in the signed spine (P5.1 remainder).
 *
 * `ToolPipeline` has always taken a `record` callback and nothing supplied
 * one, so guard denials were returned to the caller and recorded nowhere. A
 * governance product whose enforcement leaves no trace is advisory again at
 * the only moment that matters.
 */
const PASS = "tool-evidence-recording-pass";
const dirs: string[] = [];
const open: Array<{ close: () => void }> = [];
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
/**
 * Pin the host-dependent native shell (P0-06): macOS with the explicit opt-in
 * registers the shell on every host, so a guessed shell call reaches the signed
 * allowlist instead of depending on whether this machine has Bubblewrap.
 */
function unconfinedShellHost(): { readonly unconfinedShell: "cli-flag" } {
  Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
  return { unconfinedShell: "cli-flag" };
}

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  while (open.length > 0) {
    try { open.pop()?.close(); } catch { /* already closed */ }
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function readyWorkspace(): string {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = prior ?? PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-toolev-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  mkdirSync(join(dir, "workspace", "output"), { recursive: true });
  return dir;
}

function rows(workspace: string): Array<{ event_type: string; meta: Record<string, unknown> }> {
  const db = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT event_type, meta_json FROM evidence_events").all() as Array<{ event_type: string; meta_json: string }>)
      .map((row) => ({ event_type: row.event_type, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
  } finally {
    db.close();
  }
}

const call = (name: string, args: unknown) => ({
  callId: `c-${name}-${Math.random().toString(36).slice(2, 8)}`,
  toolName: name,
  rawArguments: JSON.stringify(args),
  sessionId: "s1",
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

describe("a governed call leaves evidence", () => {
  it("records an ALLOWED call", async () => {
    const workspace = readyWorkspace();
    writeFileSync(join(workspace, "workspace", "n.txt"), "hello");
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    await toolset.seam.execute(call("fs.read", { path: "workspace/n.txt" }));

    const audits = rows(workspace).filter((row) => row.meta["auditType"] === "TOOL_CALL_ALLOWED");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.meta["toolName"]).toBe("fs.read");
    expect(audits[0]?.meta["trustTier"], "a machine watched it happen").toBe("OBSERVED");
  });

  it("records a DENIED call, with which guard refused and why", async () => {
    // The row that matters most. A denial the caller sees and the log does not
    // is enforcement nobody can audit afterwards.
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session", ...unconfinedShellHost() });
    open.push(toolset);

    await toolset.seam.execute(call("bash", { command: "sudo rm -rf /tmp/x" }));

    const denials = rows(workspace).filter((row) => row.meta["auditType"] === "TOOL_CALL_DENIED");
    expect(denials).toHaveLength(1);
    expect(denials[0]?.meta["denialGuard"]).toBe("tool-allowlist");
    expect(String(denials[0]?.meta["denialReason"])).toContain("deny pattern");
    expect(denials[0]?.meta["denialStage"]).toBe("guard");
  });

  it("writes an audit row AND a metric row per call", async () => {
    // Two rows because they answer different questions and the scoring gates
    // count them separately: what policy decided, and what it cost.
    const workspace = readyWorkspace();
    writeFileSync(join(workspace, "workspace", "n.txt"), "hello");
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    const request = call("fs.read", { path: "workspace/n.txt" });
    expect((await toolset.seam.execute(request)).outcome).toBe("OK");

    const written = rows(workspace);
    const audits = written.filter(row => row.event_type === "audit");
    // Admission and disposition are separate facts. Exact types/counts keep
    // duplicate tool evidence visible instead of counting every audit as a call.
    expect(audits.map(row => row.meta.auditType).sort()).toEqual([NATIVE_BUDGET_RESERVATION, "TOOL_CALL_ALLOWED"]);
    const disposition = audits.find(row => row.meta.auditType === "TOOL_CALL_ALLOWED")!;
    expect(disposition.meta).toMatchObject({ callId: request.callId, actionClass: "READ_ONLY", effectiveMode: "EXECUTE" });
    expect(audits.find(row => row.meta.auditType === NATIVE_BUDGET_RESERVATION)?.meta).toMatchObject({
      kind: "tool", nativeSessionId: "toolset-test-session", agentId: "default", callId: request.callId,
      toolToken: disposition.meta.toolToken, actionClass: "READ_ONLY"
    });
    const metrics = written.filter(row => row.event_type === "metric");
    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.meta).toMatchObject({ metricKey: "tool_call_outcome", callId: request.callId, toolToken: disposition.meta.toolToken });
  });

  it("correlates a call to its token, so a denial can be traced", async () => {
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session", ...unconfinedShellHost() });
    open.push(toolset);

    const request = call("bash", { command: "sudo ls" });
    await toolset.seam.execute(request);
    const audit = rows(workspace).find((row) => row.event_type === "audit" && row.meta.auditType === "TOOL_CALL_DENIED");

    expect(String(audit?.meta["toolToken"] ?? "")).toMatch(/^tok_/);
    expect(audit?.meta.callId).toBe(request.callId);
  });

  it("does NOT copy the arguments into the audit row", async () => {
    // They are frozen and already recorded on the call itself. Repeating them
    // would put the same untrusted content in a second place with a second
    // retention and DSAR story.
    const workspace = readyWorkspace();
    const toolset = agentToolset({ workspace, agentId: "default", sessionId: "toolset-test-session"});
    open.push(toolset);

    await toolset.seam.execute(call("fs.read", { path: "workspace/SECRET-MARKER.txt" }));

    const serialised = JSON.stringify(rows(workspace));
    expect(serialised, "the audit row is about the decision, not the payload").not.toContain("SECRET-MARKER");

    // The meta is only half the row. Checking it alone left the PAYLOAD
    // uncovered, so a mutation that copied the arguments into the payload
    // stayed green — asserted directly on the projection, which is the only
    // place both halves are visible together.
    const projected = toolEvidenceFor(
      {
        token: "tok_1", callId: "c1", rootCallId: "c1", name: "fs.read", agentId: "a",
        workspace, actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
        arguments: { path: "workspace/SECRET-MARKER.txt" }, parentToken: null
      },
      { ok: true, exitCode: null, timedOut: false, denied: null, output: "", bytes: 0 }
    );
    expect(JSON.stringify(projected), "neither meta nor payload carries the arguments")
      .not.toContain("SECRET-MARKER");
  });
});

describe("recording never breaks the call", () => {
  it("returns the tool's real outcome when the recorder throws", async () => {
    // Tested against a recorder that genuinely fails, which is only possible
    // because the guarantee lives in the PIPELINE. It was previously inside
    // agentToolset's recorder, where proving it meant making the real ledger
    // fail — and every filesystem sabotage I tried was survived by SQLite, so
    // the test passed without ever reaching the path it claimed to cover.
    const registry = new ToolRegistry();
    registry.define(defineTool({
      name: "echo", actionClass: "READ_ONLY", description: "echo",
      body: () => ({ output: "real output" })
    }));
    let recorderCalled = false;
    const pipeline = new ToolPipeline({
      registry,
      workspace: "/tmp",
      record: () => {
        recorderCalled = true;
        throw new Error("the evidence store is unreachable");
      }
    });

    const outcome = await pipeline.execute({
      name: "echo", agentId: "a", arguments: {}, requestedMode: "EXECUTE"
    });

    expect(recorderCalled, "the recorder really did run and really did throw").toBe(true);
    expect(outcome.ok, "an evidence problem is not a tool failure").toBe(true);
    expect(outcome.output).toBe("real output");
    expect(outcome.denied, "and certainly not a denial policy never made").toBeNull();
  });
});

describe("the projection itself", () => {
  it("labels the three outcomes distinctly", () => {
    const base = {
      token: "tok_1", callId: "c1", rootCallId: "c1", name: "fs.read", agentId: "a",
      workspace: "/w", actionClass: "READ_ONLY" as const, requestedMode: "EXECUTE" as const,
      effectiveMode: "EXECUTE" as const, arguments: {}, parentToken: null
    };
    const outcome = (over: Record<string, unknown>) => ({
      ok: true, exitCode: null, timedOut: false, denied: null, output: "", bytes: 0, ...over
    });

    const allowed = toolEvidenceFor(base, outcome({}) as never);
    const denied = toolEvidenceFor(base, outcome({
      ok: false, denied: { stage: "guard", reason: "no", guardLabel: "g" }
    }) as never);
    const failed = toolEvidenceFor(base, outcome({ ok: false }) as never);

    expect(allowed[0]?.meta["auditType"]).toBe("TOOL_CALL_ALLOWED");
    expect(denied[0]?.meta["auditType"]).toBe("TOOL_CALL_DENIED");
    // A tool that threw is not a tool that policy refused. Conflating them
    // would credit the guards with stopping something they allowed.
    expect(failed[0]?.meta["auditType"]).toBe("TOOL_CALL_FAILED");
  });
});
