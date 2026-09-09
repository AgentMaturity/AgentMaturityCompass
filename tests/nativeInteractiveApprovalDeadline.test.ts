import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeInteractiveApprovals } from "../src/setup/nativeInteractiveApprovals.js";

// Synthetic process/inbox/actor seams isolate delivery classification. They do
// not create or verify a real approval, sign a decision or authenticate a user.
const seam = vi.hoisted(() => ({
  recorded: false, recordOnClose: true, termMode: "zero" as "zero" | "ignore",
  signals: [] as unknown[], commands: [] as string[][],
  spawned: null as null | (() => void), complete: null as null | ((code: number | null) => void)
}));
const requestId = `apprreq_${"a".repeat(32)}`;
const approvalId = "apr_00000000-0000-4000-8000-000000000001";
vi.mock("../src/approvals/approvalInbox.js", () => ({ getApprovalInboxItem: () => ({
  request: { approvalRequestId: `apprreq_${"a".repeat(32)}`, agentId: "default", intentId: "apr_00000000-0000-4000-8000-000000000001",
    expiresTs: Date.now() + 120_000, rolesAllowed: ["OWNER"], toolName: "fs.write", actionClass: "WRITE_LOW", riskTier: "medium",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", boundHashes: {} },
  requestIntegrity: { valid: true }, chainIntegrity: { valid: true }, contextIntegrity: { valid: true },
  requestDigestSha256: "fixture-reviewed-digest", status: seam.recorded ? "APPROVED" : "PENDING", quorum: { received: seam.recorded ? 1 : 0, required: 1 },
  decisions: seam.recorded ? [{ approvalDecisionId: "fixture-decision", userId: "fixture-user", username: "fixture-reviewer",
    decision: "APPROVE_EXECUTE", requestDigestSha256: "fixture-reviewed-digest" }] : []
}) }));
vi.mock("../src/setup/nativeApprovalIdentity.js", () => ({ readNativeApprovalActor: () => ({ userId: "fixture-user", username: "fixture-reviewer", roles: ["OWNER"] }) }));
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter: Events } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return { ...actual, spawn: (_executable: string, argv: string[]) => {
    seam.commands.push([...argv]);
    let closed = false;
    const child = Object.assign(new Events(), { stdout: new PassThrough(), stderr: new PassThrough(),
      exitCode: null as number | null, signalCode: null,
      kill: (signal: unknown) => {
        seam.signals.push(signal);
        if (signal === "SIGKILL" || (signal === "SIGTERM" && seam.termMode === "zero")) seam.complete?.(signal === "SIGKILL" ? null : 0);
        return true;
      }
    });
    seam.complete = code => {
      if (closed) return;
      closed = true; child.exitCode = code;
      if (seam.recordOnClose) seam.recorded = true;
      child.stdout.end(); child.stderr.end();
      void Promise.resolve().then(() => child.emit("close", code));
    };
    seam.spawned?.();
    return child;
  } };
});

describe("native interactive approval command deadline", () => {
  let active: ReturnType<typeof createNativeInteractiveApprovals> | null;
  beforeEach(() => {
    vi.useFakeTimers(); seam.recorded = false; seam.recordOnClose = true; seam.termMode = "zero";
    seam.signals = []; seam.commands = []; seam.spawned = null; seam.complete = null; active = null;
  });
  afterEach(async () => {
    if (active) { seam.complete?.(1); await active.close(); }
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  async function start() {
    const caller = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn(() => true) });
    const logs: string[] = [], errors: string[] = [];
    const answers = ["approve", "fixture-reviewer-session.txt", "reviewed exact request"];
    const spawned = new Promise<void>(resolve => { seam.spawned = resolve; });
    active = createNativeInteractiveApprovals({ child: caller as unknown as ChildProcess, workspace: "/synthetic-amc-workspace", entry: "/synthetic-amc-entry.js",
      question: async () => answers.shift() ?? null, log: line => logs.push(line), error: line => errors.push(line) });
    caller.emit("message", { type: "amc/native-approval-raised", v: 1, agentId: "default", approvalId, approvalRequestId: requestId });
    await spawned;
    return { caller, logs, errors };
  }
  it("keeps timely zero-exit delivery and its matching recorded decision distinct but successful", async () => {
    const result = await start();
    seam.complete?.(0); await vi.advanceTimersByTimeAsync(0);
    expect(seam.recorded).toBe(true);
    expect(result.logs.join("\n")).toContain("Signed approve decision fixture-decision");
    expect(result.errors).toEqual([]);
    expect(result.caller.kill).not.toHaveBeenCalled();
    expect(seam.signals).toEqual([]);
    expect(seam.commands).toHaveLength(1);
  });
  it("does not call delivery clean after the deadline even when SIGTERM produces zero and a decision exists", async () => {
    const result = await start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seam.signals).toEqual(["SIGTERM"]);
    expect(seam.recorded).toBe(true);
    expect(result.logs.join("\n")).not.toContain("Signed approve decision fixture-decision");
    expect(result.errors.join("\n")).toContain("decision is recorded, but its command did not complete cleanly");
    expect(result.errors.join("\n")).toContain("No retry was sent");
    expect(result.caller.kill).toHaveBeenCalledWith("SIGINT");
    expect(seam.commands).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seam.signals).toEqual(["SIGTERM"]);
  });
  it("does not invent a decision when deadline closure leaves none recorded", async () => {
    seam.recordOnClose = false;
    const result = await start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seam.recorded).toBe(false);
    expect(result.errors.join("\n")).toContain("No matching signed decision was confirmed");
    expect(result.caller.kill).toHaveBeenCalledWith("SIGINT");
    expect(seam.commands).toHaveLength(1);
  });
  it("retains the existing forced-close escalation and never resubmits a timed-out decision", async () => {
    seam.termMode = "ignore"; seam.recordOnClose = false;
    const result = await start();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(seam.signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(result.errors.join("\n")).toContain("No matching signed decision was confirmed");
    expect(result.caller.kill).toHaveBeenCalledWith("SIGINT");
    expect(seam.commands).toHaveLength(1);
  });
});
