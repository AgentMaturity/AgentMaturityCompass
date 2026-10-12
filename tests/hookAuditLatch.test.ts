/**
 * P1-23 review (fail-open latch bypass): once AMC cannot record hook evidence for a workspace, the Bridge refuses every
 * later hook request of that workspace (any session, event or provider: they all share its one ledger writer) until the
 * owner recovers it in owner mode with the vault passphrase. Neither a new session, a restart, a re-registration nor a
 * later successful write clears it, and it is kept outside the workspace, in AMC home.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { recoverHookAuditLatch } from "../src/bridge/hookAuditLatch.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { workspaceScope } from "../src/keys/highWater.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { setMode } from "../src/mode/mode.js";
import { agentId, claudeWorkspace, controlRequest, decide, lease, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => {
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

type Route = typeof handleHookControlRequest;
const send = (workspace: string, body: unknown, provider: Parameters<Route>[0]["provider"] = "claude-code", handle: Route = handleHookControlRequest) =>
  () => handle({ workspace, authenticatedAgentId: agentId, provider, lease, rawInput: typeof body === "string" ? body : JSON.stringify(body) });
const latched = expect.objectContaining({ statusCode: 503, message: expect.stringContaining("latched") });
const sessionOf = (workspace: string) => String(recorded("SessionStart-startup", workspace).session_id);
const stop = (sessionId: string) => ({ hook_event_name: "Stop", session_id: sessionId, stop_hook_active: false });
let calls = 0;
function readCall(workspace: string, sessionId: string): string {
  calls += 1;
  const read = recorded("PreToolUse-read", workspace);
  return controlRequest({ ...read, session_id: sessionId, tool_use_id: `toolu_latch_${calls}`,
    tool_input: { file_path: join(String(read.cwd), "workspace", "public.txt") } });
}

/** The ledger refuses every new evidence row, as a full disk or a failing database would, until repaired. */
function breakWriter(workspace: string): void {
  const ledger = openLedger(workspace);
  ledger.db.exec("CREATE TRIGGER test_failing_writer BEFORE INSERT ON evidence_events BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
  ledger.close();
}
function repairWriter(workspace: string): void {
  const ledger = openLedger(workspace);
  ledger.db.exec("DROP TRIGGER test_failing_writer");
  ledger.close();
}

/** An observation-only write (Stop) fails at the Bridge; the writer is then repaired. */
function failOneWrite(workspace: string): void {
  breakWriter(workspace);
  expect(send(workspace, stop(sessionOf(workspace)))).toThrowError(expect.objectContaining({ statusCode: 503 }));
  repairWriter(workspace);
}

describe("a failed evidence write latches the workspace's hooks", () => {
  test("a new session is refused: registration and its calls", () => {
    const workspace = claudeWorkspace();
    expect(decide(workspace, readCall(workspace, sessionOf(workspace))).decision).toBe("allow");
    failOneWrite(workspace);
    expect(() => register(workspace, "fresh-session-after-latch")).toThrowError(latched);
    expect(send(workspace, readCall(workspace, "fresh-session-after-latch"))).toThrowError(latched);
    expect(send(workspace, readCall(workspace, sessionOf(workspace)))).toThrowError(latched);
  });

  test("an AMC restart is refused: the latch is kept in AMC home, not in the Bridge's memory or the workspace", async () => {
    const workspace = claudeWorkspace();
    failOneWrite(workspace);
    const state = readFileSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch.json"), "utf8");
    expect(state).toContain(workspaceScope(workspace));
    // Nothing in the workspace holds it, so nothing the agent can edit there clears it.
    rmSync(join(workspace, ".amc", "hooks", "claude-code.latched.json"), { force: true });
    expect(readdirSync(join(workspace, ".amc", "hooks")).filter((name) => name.includes("latch"))).toEqual([]);
    vi.resetModules();
    const restarted = (await import("../src/bridge/hookControlRoute.js")).handleHookControlRequest;
    expect(send(workspace, { hook_event_name: "SessionStart", session_id: sessionOf(workspace),
      amc: { claudePid: process.pid, configDir: join(workspace, ".fixture-home", ".claude") } }, "claude-code", restarted)).toThrowError(latched);
    expect(send(workspace, readCall(workspace, sessionOf(workspace)), "claude-code", restarted)).toThrowError(latched);
  });

  test("a later successful write does not clear it", () => {
    const workspace = claudeWorkspace();
    failOneWrite(workspace);
    const ledger = openLedger(workspace);
    ledger.startSession({ sessionId: "unrelated-writer-check", runtime: "claude", binaryPath: "test", binarySha256: "0".repeat(64) });
    ledger.appendEvidence({ sessionId: "unrelated-writer-check", runtime: "claude", eventType: "audit", payload: "{}", payloadExt: "json", inline: true,
      meta: { trustTier: "OBSERVED" } });
    ledger.close();
    expect(send(workspace, readCall(workspace, sessionOf(workspace)))).toThrowError(latched);
    expect(() => decide(workspace, readCall(workspace, sessionOf(workspace)))).toThrowError(latched);
  });

  test("a different hook event, another provider and the observed ingress are refused", async () => {
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const workspace = claudeWorkspace({ bridgeBase });
    failOneWrite(workspace);
    const session = sessionOf(workspace);
    const prompt = recorded("UserPromptSubmit-prompt", workspace);
    expect(send(workspace, { hook_event_name: "UserPromptSubmit", session_id: session, prompt_id: prompt.prompt_id,
      prompt: { sha256: "a".repeat(64), length: 3 } })).toThrowError(latched);
    expect(send(workspace, stop(session))).toThrowError(latched);
    expect(send(workspace, readCall(workspace, session))).toThrowError(latched);
    for (const provider of ["pi", "gemini-cli"] as const) expect(send(workspace, "{}", provider)).toThrowError(latched);
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      const rows = () => { const ledger = openLedger(workspace); try { return ledger.getAllEvents().length; } finally { ledger.close(); } };
      const before = rows();
      const forwarded = await runHookForward({ provider: "claude-code", mode: "control", agent: agentId, tokenFile: ".amc/hooks/claude-code.lease",
        bridgeUrl: bridgeBase, event: "PreToolUse" }, async () => Buffer.from(JSON.stringify(recorded("PreToolUse-read", workspace))), workspace, 5_000);
      expect(forwarded.exitCode).toBe(2);
      expect(forwarded.stdout).toContain('"permissionDecision":"deny"');
      // Not even the observation of the request was written.
      expect(rows()).toBe(before);
    } finally {
      await bridge.close();
    }
  });
});

describe("recovery is explicit, owner-mode and passphrase-gated", () => {
  test("agent mode, a wrong passphrase, or a writer that still fails leave the latch in place; the owner's recovery is recorded", () => {
    const workspace = claudeWorkspace();
    failOneWrite(workspace);
    setMode(workspace, "agent");
    expect(() => recoverHookAuditLatch({ workspace, passphrase: process.env.AMC_VAULT_PASSPHRASE })).toThrowError(/agent mode/);
    setMode(workspace, "owner");
    expect(() => recoverHookAuditLatch({ workspace, passphrase: undefined })).toThrowError(/passphrase/);
    expect(() => recoverHookAuditLatch({ workspace, passphrase: "not-the-vault-passphrase" })).toThrow();
    breakWriter(workspace);
    expect(() => recoverHookAuditLatch({ workspace, passphrase: process.env.AMC_VAULT_PASSPHRASE })).toThrow();
    repairWriter(workspace);
    expect(send(workspace, readCall(workspace, sessionOf(workspace)))).toThrowError(latched);

    const recovered = recoverHookAuditLatch({ workspace, passphrase: process.env.AMC_VAULT_PASSPHRASE });
    expect(recovered).toMatchObject({ recovered: true, reason: expect.stringContaining("simulated write failure") });
    const ledger = openLedger(workspace);
    try {
      expect(verifyEvidenceEventIntegrity({ ledger, eventId: recovered.eventId!, requireReceipt: true, requireSealedSession: true }).ok).toBe(true);
    } finally {
      ledger.close();
    }
    expect(existsSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch.json"))
      && readFileSync(join(process.env.AMC_HOME!, "state", "hook-audit-latch.json"), "utf8").includes(workspaceScope(workspace))).toBe(false);
    expect(decide(workspace, readCall(workspace, sessionOf(workspace))).decision).toBe("allow");
  });
});
