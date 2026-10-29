import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as humanAudit from "../src/auth/humanLog.js";
import { initWorkspace } from "../src/workspace.js";
import { runNativeInteractiveCommand } from "../src/setup/nativeInteractiveCommandAudit.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const selection = { workspace: "/synthetic/wp30-audit", command: "fork", sessionId: "native-session" };

describe("native command operational audit", () => {
  it("records start before dispatch and settled after a handler returns, preserving its result", async () => {
    const sequence: string[] = [];
    const publish = vi.spyOn(humanAudit, "appendHumanActionEventAsync").mockImplementation(async input => {
      sequence.push(String(input.payload?.phase)); return {} as humanAudit.HumanLogEntry;
    });
    const value = await runNativeInteractiveCommand(selection, async () => { sequence.push("handler"); return 42; });
    expect(value).toBe(42);
    expect(sequence).toEqual(["started", "handler", "settled"]);
    expect(publish.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({ type: "NATIVE_COMMAND", payload: expect.objectContaining({ auditType: "NATIVE_COMMAND", command: "fork", sessionId: "native-session", phase: "started" }) }),
      expect.objectContaining({ type: "NATIVE_COMMAND", payload: expect.objectContaining({ phase: "settled", completionBoundary: "handler-return-only" }) })
    ]);
    expect(publish.mock.calls[0][0].payload?.invocationId).toBe(publish.mock.calls[1][0].payload?.invocationId);
  });

  it("fails closed before dispatch when start publication refuses", async () => {
    const refusal = new Error("signing unavailable");
    vi.spyOn(humanAudit, "appendHumanActionEventAsync").mockRejectedValue(refusal);
    const handler = vi.fn(async () => "must not run");
    await expect(runNativeInteractiveCommand(selection, handler)).rejects.toBe(refusal);
    expect(handler).not.toHaveBeenCalled();
  });

  it("records refused when the handler throws, retaining the error without logging its text", async () => {
    const publish = vi.spyOn(humanAudit, "appendHumanActionEventAsync").mockResolvedValue({} as humanAudit.HumanLogEntry);
    const refusal = new Error("private prompt and /private/operator/path");
    await expect(runNativeInteractiveCommand({ ...selection, command: "compact" }, async () => { throw refusal; })).rejects.toBe(refusal);
    expect(publish.mock.calls.map(([input]) => input.payload?.phase)).toEqual(["started", "refused"]);
    expect(JSON.stringify(publish.mock.calls)).not.toMatch(/private prompt|operator\/path/);
  });

  it("retains both failures when a refused handler cannot publish its refusal audit", async () => {
    const commandFailure = new Error("handler refused");
    const auditFailure = new Error("audit refused");
    vi.spyOn(humanAudit, "appendHumanActionEventAsync").mockResolvedValueOnce({} as humanAudit.HumanLogEntry).mockRejectedValueOnce(auditFailure);
    const result = runNativeInteractiveCommand(selection, async () => { throw commandFailure; });
    await expect(result).rejects.toMatchObject({ errors: [commandFailure, auditFailure] });
  });

  it("does not retry a returned handler when settlement publication fails", async () => {
    const publish = vi.spyOn(humanAudit, "appendHumanActionEventAsync");
    publish.mockResolvedValueOnce({} as humanAudit.HumanLogEntry).mockRejectedValueOnce(new Error("settlement audit unavailable"));
    const handler = vi.fn(async () => "returned");
    await expect(runNativeInteractiveCommand(selection, handler)).rejects.toThrow("settlement audit unavailable");
    expect(handler).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it.each(["sessions", "resume", "inspect", "help", "verify", "mcp", "extensions", "exit"])("keeps /%s read-only", async command => {
    const publish = vi.spyOn(humanAudit, "appendHumanActionEventAsync");
    await expect(runNativeInteractiveCommand({ ...selection, command }, async () => "read only")).resolves.toBe("read only");
    expect(publish).not.toHaveBeenCalled();
  });

  it.each(["/fork", " fork", "fork /private/path", "unknown"])("refuses a noncanonical command before dispatch: %j", async command => {
    const publish = vi.spyOn(humanAudit, "appendHumanActionEventAsync");
    const handler = vi.fn(async () => undefined);
    await expect(runNativeInteractiveCommand({ ...selection, command }, handler)).rejects.toThrow("canonical native chat command");
    expect(handler).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes through the existing signed async human audit and verifies the resulting chain", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-wp30-command-audit-")); roots.push(root);
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "wp30-command-audit-fixture-only";
    try {
      initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
      await runNativeInteractiveCommand({ workspace: root, command: "unload", sessionId: null }, async () => undefined);
      expect(humanAudit.verifyHumanActionLog(root)).toMatchObject({ ok: true, entryCount: 2 });
      const entries = readFileSync(join(root, ".amc", "studio", "audit", "human.log"), "utf8").trim().split("\n").map(line => JSON.parse(line) as humanAudit.HumanLogEntry);
      expect(entries.map(entry => entry.payload.phase)).toEqual(["started", "settled"]);
      expect(entries.every(entry => entry.type === "NATIVE_COMMAND" && entry.payload.command === "unload" && entry.payload.sessionId === null)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
    }
  });
});
