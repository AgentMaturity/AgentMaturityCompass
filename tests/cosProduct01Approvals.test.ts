import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNativeInteractiveApprovals } from "../src/setup/nativeInteractiveApprovals.js";

// Authored, UNEXECUTED. All inbox, reviewer and process values are synthetic.
// This does not authenticate a person, sign a decision or exercise a provider.
const seam = vi.hoisted(() => ({
  commands: [] as string[][], signals: [] as unknown[], recorded: false,
  spawned: null as null | (() => void), finish: null as null | (() => void),
  actor: vi.fn(() => ({ userId: "test-user", username: "test-reviewer", roles: ["OWNER"] }))
}));
const requestId = `apprreq_${"a".repeat(32)}`;
const approvalId = "apr_00000000-0000-4000-8000-000000000001";
vi.mock("../src/approvals/approvalInbox.js", () => ({ getApprovalInboxItem: (input: { approvalRequestId: string }) => ({
  request: { approvalRequestId: input.approvalRequestId, agentId: "default", intentId: "apr_00000000-0000-4000-8000-000000000001",
    expiresTs: Date.now() + 120_000, rolesAllowed: ["OWNER"], toolName: "fs.write", actionClass: "WRITE_LOW", riskTier: "medium",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", boundHashes: {} },
  requestIntegrity: { valid: true }, chainIntegrity: { valid: true }, contextIntegrity: { valid: true },
  requestDigestSha256: "test-digest", status: seam.recorded ? "APPROVED" : "PENDING",
  quorum: { received: seam.recorded ? 1 : 0, required: 1 },
  decisions: seam.recorded ? [{ approvalDecisionId: "test-decision", userId: "test-user", username: "test-reviewer",
    decision: "APPROVE_EXECUTE", requestDigestSha256: "test-digest" }] : []
}) }));
vi.mock("../src/setup/nativeApprovalIdentity.js", () => ({ readNativeApprovalActor: seam.actor }));
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter: Events } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return { ...actual, spawn: (_executable: string, argv: string[]) => {
    seam.commands.push([...argv]);
    let closed = false;
    const child = Object.assign(new Events(), { stdout: new PassThrough(), stderr: new PassThrough(),
      exitCode: null as number | null, signalCode: null,
      kill: (signal: unknown) => { seam.signals.push(signal); queueMicrotask(() => seam.finish?.()); return true; }
    });
    seam.finish = () => {
      if (closed) return;
      closed = true; seam.recorded = true; child.exitCode = 0;
      child.stdout.end(); child.stderr.end(); child.emit("close", 0);
    };
    seam.spawned?.();
    return child;
  } };
});

describe("P01 cancellation closes the approval admission window", () => {
  let active: ReturnType<typeof createNativeInteractiveApprovals> | null = null;
  beforeEach(() => {
    seam.commands = []; seam.signals = []; seam.recorded = false;
    seam.spawned = null; seam.finish = null; seam.actor.mockClear();
  });
  afterEach(async () => {
    seam.finish?.();
    await active?.close(); active = null;
    vi.restoreAllMocks();
  });
  function setup(question: (prompt: string, signal?: AbortSignal) => Promise<string | null>, error = (_line: string) => {}) {
    const caller = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn(() => true) });
    const logs: string[] = [];
    active = createNativeInteractiveApprovals({ child: caller as unknown as ChildProcess,
      workspace: "/synthetic-p01-workspace", entry: "/synthetic-p01-cli.js", question,
      log: line => logs.push(line), error });
    const raise = (id = requestId) => caller.emit("message", { type: "amc/native-approval-raised", v: 1,
      agentId: "default", approvalId, approvalRequestId: id });
    return { caller, logs, raise };
  }

  it("cancels queued IPC before a prompt begins, once, without starting a decision process", async () => {
    const question = vi.fn(async () => "approve");
    const { caller, raise } = setup(question);
    raise(); active!.cancel(); active!.cancel();
    await active!.close();
    expect(question).not.toHaveBeenCalled();
    expect(seam.actor).not.toHaveBeenCalled();
    expect(seam.commands).toEqual([]);
    expect(caller.kill).toHaveBeenCalledTimes(1);
    expect(caller.kill).toHaveBeenCalledWith("SIGINT");
    expect(caller.listenerCount("message")).toBe(0);
  });

  it("does not signal a former caller after its approval controller has closed", async () => {
    const { caller } = setup(async () => null);
    await active!.close(); active!.cancel();
    expect(caller.kill).not.toHaveBeenCalled();
    expect(seam.commands).toEqual([]);
  });

  it.each([0, 1, 2])("aborts the active question at review stage %i and discards a late answer", async stage => {
    let ready!: () => void, lateAnswer!: (answer: string) => void;
    const waiting = new Promise<void>(resolve => { ready = resolve; });
    let pendingSignal: AbortSignal | undefined;
    const answers = ["approve", "synthetic-reviewer-session.txt", "reviewed this exact request"];
    let asked = 0;
    const question = vi.fn((_prompt: string, signal?: AbortSignal): Promise<string | null> => {
      const index = asked++;
      if (index !== stage) return Promise.resolve(answers[index]!);
      pendingSignal = signal;
      return new Promise(resolve => { lateAnswer = resolve; ready(); });
    });
    const { caller, raise } = setup(question);
    raise(); await waiting;
    raise(`apprreq_${"b".repeat(32)}`); // already queued when cancellation arrives
    active!.cancel(); active!.cancel();
    expect(pendingSignal?.aborted).toBe(true);
    lateAnswer(answers[stage]!);
    raise(`apprreq_${"c".repeat(32)}`); // must not reopen review after cancellation
    await active!.close();
    expect(question).toHaveBeenCalledTimes(stage + 1);
    expect(seam.commands).toEqual([]);
    expect(caller.kill).toHaveBeenCalledTimes(1);
    expect(caller.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("retains uncertain signed-decision delivery instead of claiming cancellation revoked it", async () => {
    let onSpawn!: () => void, onReport!: () => void;
    const spawned = new Promise<void>(resolve => { onSpawn = resolve; });
    const reported = new Promise<void>(resolve => { onReport = resolve; });
    seam.spawned = onSpawn;
    const answers = ["approve", "synthetic-reviewer-session.txt", "reviewed this exact request"];
    const errors: string[] = [];
    const { caller, logs, raise } = setup(async () => answers.shift() ?? null, line => { errors.push(line); onReport(); });
    raise(); await spawned;
    active!.cancel(); await reported;
    await active!.close();
    expect(seam.commands).toHaveLength(1);
    expect(seam.recorded).toBe(true);
    expect(seam.signals).toEqual(["SIGTERM"]);
    expect(caller.kill).toHaveBeenCalledTimes(1);
    expect(caller.kill).toHaveBeenCalledWith("SIGINT");
    expect(errors.join("\n")).toContain("decision is recorded, but its command did not complete cleanly");
    expect(errors.join("\n")).toContain("No retry was sent");
    expect(logs.join("\n")).not.toContain("Signed approve decision");
  });
});
