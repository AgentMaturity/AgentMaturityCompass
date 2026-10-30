/**
 * P1-22 follow-up (fail-open audit gap): Pi follows the evidence rules Claude Code's hooks adopted in P1-23.
 *
 * 1. Only a genuine fault of AMC's own verifying writer, while recording for a Pi session with a verified registration,
 *    trips the workspace's hook audit latch (hookAuditLatch.ts): kept in AMC home, it survives a restart, covers that
 *    workspace only, and only the owner clears it, with the vault passphrase.
 * 2. A tripped latch denies every later Pi tool_call decision, and Pi is told why.
 * 3. A repeat is recorded only when it is the same observation bound to the same decision; a conflicting one is kept,
 *    flagged and refused (409), and the extension never counts a 409 as recorded.
 * 4. Intake caps deny decisions (backpressure) instead of dropping observations, and churned registrations cannot defeat them.
 * 5. Malformed, unauthenticated, replayed or forwarder-reported observations, or an unregistered session's, never latch.
 */
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { createAmcPiExtension, type PiExtensionApi, type PiToolCallContext } from "../src/adapters/pi/amcPiExtension.js";
import { PI_OBSERVE_PATH } from "../src/adapters/pi/piControlClient.js";
import { piActionId } from "../src/adapters/pi/piIdentity.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { hookAuditLatchState, recoverHookAuditLatch } from "../src/bridge/hookAuditLatch.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { workspaceScope } from "../src/keys/highWater.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { setMode } from "../src/mode/mode.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { controlledWorkspace, fakePiPackage, freePort, piEnvelope, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const agentId = "pi-latch-agent";
const lease = { leaseId: "lease_pi_latch", expiresTs: Date.now() + 3_600_000 };
const MODULE = resolve("dist", "adapters", "pi", "amcPiExtension.js");
const UNAVAILABLE = { block: true, reason: "AMC control unavailable; action denied." };
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

type Route = typeof handleHookControlRequest;
const send = (workspace: string, body: unknown, now?: number, handle: Route = handleHookControlRequest) => () => handle({ workspace,
  authenticatedAgentId: agentId, provider: "pi", lease, rawInput: typeof body === "string" ? body : JSON.stringify(body), ...(now === undefined ? {} : { now }) });
const latched = expect.objectContaining({ statusCode: 503, message: expect.stringContaining("latched") });
const latchFile = (workspace: string) => join(process.env.AMC_HOME!, "state", "hook-audit-latch", `${workspaceScope(workspace)}.json`);
const registration = (sessionId: string) => ({ hook_event_name: "session_start",
  pi: { version: "1.0.4", mode: "print", sessionId, extensionSha256: sha256Hex(readFileSync(MODULE)) } });

/** A workspace with a signed Pi control installation and Pi session `pi-session` registered. */
function piWorkspace(): string {
  const workspace = controlledWorkspace(agentId);
  installHookIntegration({ workspace, provider: "pi", agentId, mode: "control", piPackageDir: fakePiPackage() });
  send(workspace, registration("pi-session"))();
  return workspace;
}

const publicFile = (workspace: string) => join(workspace, "workspace", "public.txt");
/** The tool_call body AMC's extension posts for a Pi read of the workspace's public file. */
const readCall = (workspace: string, options: Parameters<typeof piEnvelope>[2] = {}) =>
  piEnvelope("read", { path: publicFile(workspace) }, { cwd: realpathSync.native(workspace), ...options });
let calls = 0;
/** One allowed Pi read in `sessionId`, decided by AMC; its call id and the digest of its receipt. */
function allowedRead(workspace: string, sessionId = "pi-session", now?: number): { toolCallId: string; receiptSha256: string } {
  calls += 1;
  const toolCallId = `toolu_latch_${calls}`;
  const result = send(workspace, readCall(workspace, { sessionId, toolCallId, nonce: `nonce-${calls}-aaaaaaaaaaaa` }), now)() as
    { decision: string; receiptSha256: string };
  expect(result.decision).toBe("allow");
  return { toolCallId, receiptSha256: result.receiptSha256 };
}
const decision = (workspace: string, sessionId = "pi-session", now?: number) => {
  calls += 1;
  return send(workspace, readCall(workspace, { sessionId, toolCallId: `toolu_latch_${calls}`, nonce: `nonce-${calls}-bbbbbbbbbbbb` }), now)() as
    { decision: string; reason: string };
};

/** What AMC's extension posts on Pi's tool_result: the call, its input, its outcome and the decision it follows. */
const outcome = (workspace: string, sessionId: string, call: { toolCallId: string; receiptSha256: string | null }, extra: Record<string, unknown> = {}) => ({
  hook_event_name: "tool_result", pi: { sessionId, toolCallId: call.toolCallId }, tool_name: "read", tool_input: { path: publicFile(workspace) },
  isError: false, ingressRecorded: true, decisionReceiptSha256: call.receiptSha256, ...extra });

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

function auditRows(workspace: string): Array<{ id: string; meta: Record<string, unknown>; intact: boolean }> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((event) => event.event_type === "audit").map((event) => ({ id: event.id, meta: JSON.parse(event.meta_json) as Record<string, unknown>,
      intact: verifyEvidenceEventIntegrity({ ledger, eventId: event.id, requireReceipt: true, requireSealedSession: true }).ok }));
  } finally {
    ledger.close();
  }
}

/** Pi's extension runner as 1.0.2 and 1.0.4 dispatch it (handlers in order, a throw blocks), with AMC's extension loaded. */
async function loadedPi(workspace: string) {
  const handlers = new Map<string, Array<(event: unknown, ctx: PiToolCallContext) => unknown>>();
  const api: PiExtensionApi = { on: (name, handler) => void handlers.set(name, [...(handlers.get(name) ?? []), handler as never]),
    getAllTools: () => ["read", "bash", "write"].map((name) => ({ name, sourceInfo: { source: "builtin", path: `builtin:${name}` } })) };
  await createAmcPiExtension({ workspace, mode: "control", piVersion: "1.0.4", timeoutMs: 10_000, modulePath: MODULE })(api);
  const notices: string[] = [];
  const context = (sessionId: string): PiToolCallContext => ({ mode: "tui", hasUI: true, cwd: realpathSync.native(workspace),
    sessionManager: { getSessionId: () => sessionId }, ui: { notify: (message) => void notices.push(message) } });
  const emit = async (name: string, event: Record<string, unknown>, sessionId = "pi-session") => {
    for (const handler of handlers.get(name) ?? []) {
      try {
        const result = await handler(event, context(sessionId)) as { block?: boolean } | undefined;
        if (result?.block) return result;
      } catch (error) {
        return { block: true, reason: `Extension failed, blocking execution: ${String(error)}` };
      }
    }
    return undefined;
  };
  return { emit, notices };
}

/** A Pi control installation served by a real Bridge on loopback; returns the Bridge's origin. */
async function bridged(workspace: string): Promise<string> {
  const port = await freePort();
  const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
  closers.push(() => bridge.close());
  installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase: `http://127.0.0.1:${port}`, mode: "control", piPackageDir: fakePiPackage() });
  return `http://127.0.0.1:${port}`;
}

describe("rule 1: only a genuine fault of AMC's verifying writer latches, in AMC home, until the owner recovers", () => {
  test("a writer fault while recording a registered session's tool outcome latches the workspace across a restart; only the owner's passphrase clears it", async () => {
    const workspace = piWorkspace();
    const tenantB = piWorkspace();
    const call = allowedRead(workspace);
    breakWriter(workspace);
    expect(send(workspace, outcome(workspace, "pi-session", call))).toThrowError(expect.objectContaining({ statusCode: 503 }));
    repairWriter(workspace);

    expect(readFileSync(latchFile(workspace), "utf8")).toContain("simulated write failure");
    expect(hookAuditLatchState(workspace)).toMatchObject({ latched: true });
    vi.resetModules();
    const restarted = (await import("../src/bridge/hookControlRoute.js")).handleHookControlRequest;
    expect(send(workspace, readCall(workspace, { toolCallId: "after-restart" }), undefined, restarted)).toThrowError(latched);
    expect(send(workspace, registration("new-session-after-latch"), undefined, restarted)).toThrowError(latched);
    // The latch covers this workspace's writer only.
    expect(hookAuditLatchState(tenantB)).toEqual({ latched: false });
    expect(decision(tenantB).decision).toBe("allow");

    setMode(workspace, "agent");
    expect(() => recoverHookAuditLatch({ workspace, passphrase: process.env.AMC_VAULT_PASSPHRASE })).toThrowError(/agent mode/);
    setMode(workspace, "owner");
    expect(() => recoverHookAuditLatch({ workspace, passphrase: "not-the-vault-passphrase" })).toThrow();
    expect(recoverHookAuditLatch({ workspace, passphrase: process.env.AMC_VAULT_PASSPHRASE })).toMatchObject({ recovered: true });
    expect(decision(workspace).decision).toBe("allow");
  });

  test("a writer fault while recording a Pi session registration latches the workspace", () => {
    const workspace = piWorkspace();
    breakWriter(workspace);
    expect(send(workspace, registration("registers-while-broken"))).toThrowError(expect.objectContaining({ statusCode: 503 }));
    repairWriter(workspace);
    expect(hookAuditLatchState(workspace)).toMatchObject({ latched: true });
    expect(send(workspace, readCall(workspace))).toThrowError(latched);
  });
});

describe("rule 2: a tripped latch denies every later Pi tool_call decision, never silently", () => {
  test("after a writer fault on a tool outcome, the extension blocks every later call of every session and tells Pi the workspace is latched", async () => {
    const workspace = controlledWorkspace(agentId);
    await bridged(workspace);
    const pi = await loadedPi(workspace);
    const call = { toolName: "read", toolCallId: "toolu_ran", input: { path: publicFile(workspace) } };
    expect(await pi.emit("tool_call", call)).toBeUndefined();
    breakWriter(workspace);
    await pi.emit("tool_result", { ...call, content: [], isError: false });
    repairWriter(workspace);
    expect(pi.notices.join("\n")).toContain("could not record");

    expect(await pi.emit("tool_call", { ...call, toolCallId: "toolu_next", input: { path: publicFile(workspace) } })).toEqual(UNAVAILABLE);
    expect(await pi.emit("tool_call", { ...call, toolCallId: "toolu_other", input: { path: publicFile(workspace) } }, "another-session")).toEqual(UNAVAILABLE);
    expect(pi.notices.at(-1)).toContain("latched");
  });
});

describe("rule 3: a repeat is recorded only when it is the same observation bound to the same decision", () => {
  test("the same outcome re-sent is recorded once; a conflicting one is kept, flagged and refused", () => {
    const workspace = piWorkspace();
    const call = allowedRead(workspace);
    const first = send(workspace, outcome(workspace, "pi-session", call))() as { eventId: string };
    expect(first).toMatchObject({ recorded: true, idempotentReplay: false, provider: "pi" });
    const rows = auditRows(workspace).length;
    expect(send(workspace, outcome(workspace, "pi-session", call))()).toMatchObject({ recorded: true, idempotentReplay: true, eventId: first.eventId });
    expect(auditRows(workspace)).toHaveLength(rows);

    expect(send(workspace, outcome(workspace, "pi-session", call, { isError: true }))).toThrowError(expect.objectContaining({ statusCode: 409 }));
    const flagged = auditRows(workspace).filter((row) => row.meta.conflictOf === first.eventId);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.intact).toBe(true);
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: piActionId("pi-session", call.toolCallId) }))
      .toMatchObject({ observationConflict: true, authorizationMismatch: false });
  });

  test("a call whose request observation conflicts with one already recorded is blocked and gets no decision", async () => {
    const workspace = controlledWorkspace(agentId);
    const bridgeBase = await bridged(workspace);
    const pi = await loadedPi(workspace);
    const actionId = piActionId("pi-session", "toolu_squatted");
    // A lease holder records another request under this call's event id first.
    const token = readFileSync(join(workspace, ".amc", "hooks", "pi.lease"), "utf8").trim();
    const squat = await fetch(`${bridgeBase}${PI_OBSERVE_PATH}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ aep_version: "0.1", id: `${actionId}.requested`, type: "action.requested", time: new Date().toISOString(),
        agent: { slug: agentId, surface: "pi", version: "1.0.4" }, action: { type: "tool_call", id: actionId }, tool: { type: "native", name: "bash" } }) });
    expect(squat.status).toBe(201);

    expect(await pi.emit("tool_call", { toolName: "read", toolCallId: "toolu_squatted", input: { path: publicFile(workspace) } })).toEqual(UNAVAILABLE);
    expect(auditRows(workspace).filter((row) => row.meta.actionId === actionId && row.meta.controlSchemaVersion === 2)).toEqual([]);
  });
});

describe("rule 4: intake caps deny decisions instead of dropping observations", () => {
  const CAP = 120;

  test("outcomes over a session's cap are listed in a signed summary, and its calls are denied until the window passes", () => {
    const workspace = piWorkspace();
    const now = Date.now();
    const ran = [0, 1, 2].map(() => allowedRead(workspace, "pi-session", now));
    for (let i = 0; i < CAP; i += 1) {
      expect(send(workspace, outcome(workspace, "pi-session", { toolCallId: `flood_${i}`, receiptSha256: null }), now)).toThrowError(expect.objectContaining({ statusCode: 409 }));
    }
    for (const call of ran) expect(send(workspace, outcome(workspace, "pi-session", call), now)).toThrowError(expect.objectContaining({ statusCode: 429 }));

    const during = decision(workspace, "pi-session", now);
    expect(during.decision).toBe("deny");
    expect(during.reason).toContain("observations");
    const summaries = auditRows(workspace).filter((row) => row.meta.intakeSummarySchemaVersion === 1);
    expect(summaries.every((row) => row.intact && row.meta.provider === "pi")).toBe(true);
    expect(summaries.flatMap((row) => row.meta.toolUseIds as string[]).sort()).toEqual(ran.map((call) => call.toolCallId).sort());
    for (const call of ran) {
      expect(inspectHookActionLifecycle({ workspace, agentId, actionId: piActionId("pi-session", call.toolCallId) }).observationNotRecorded).toBe("rate-limited");
    }
    expect(decision(workspace, "pi-session", now + 61_000).decision).toBe("allow");
  }, 300_000);

  test("churned registrations cannot defeat the caps: one lease registers at most 30 Pi sessions a minute; a re-registration is not counted", () => {
    const workspace = piWorkspace();
    let refused = 0;
    for (let i = 0; i < 35; i += 1) {
      try {
        send(workspace, registration(`churned-session-${i}`))();
      } catch (error) {
        expect(error).toMatchObject({ statusCode: 429 });
        refused += 1;
      }
    }
    // piWorkspace() registered one session already.
    expect(refused).toBe(35 - 29);
    expect(send(workspace, registration("pi-session"))()).toMatchObject({ registered: true, idempotentReplay: true });
  });
});

describe("rule 5: untrusted input never trips the latch", () => {
  test("malformed, unauthenticated, conflicting, forwarder-reported or unregistered observations do not latch", async () => {
    const workspace = controlledWorkspace(agentId);
    const bridgeBase = await bridged(workspace);
    send(workspace, registration("pi-session"))();
    for (let i = 0; i < 10; i += 1) {
      const response = await fetch(`${bridgeBase}/bridge/hooks/control/v1`, { method: "POST", body: JSON.stringify(outcome(workspace, "pi-session", { toolCallId: "x", receiptSha256: null })),
        headers: { "content-type": "application/json", "x-amc-hook-provider": "pi", ...(i % 2 ? { authorization: "Bearer forged" } : {}) } });
      expect(response.status).toBe(401);
    }
    expect(send(workspace, "{not json")).toThrowError(expect.objectContaining({ statusCode: 400 }));
    const call = allowedRead(workspace);
    expect(send(workspace, outcome(workspace, "pi-session", call, { isError: "no" }))).toThrowError(expect.objectContaining({ statusCode: 400 }));
    expect(send(workspace, outcome(workspace, "pi-session", call, { ingressRecorded: false }))).toThrowError(expect.objectContaining({ statusCode: 422 }));
    expect(send(workspace, outcome(workspace, "pi-session", call))).toThrowError(expect.objectContaining({ statusCode: 409 }));
    breakWriter(workspace);
    expect(send(workspace, outcome(workspace, "never-registered", { toolCallId: "x", receiptSha256: null }))).toThrowError(expect.objectContaining({ statusCode: 503 }));
    repairWriter(workspace);

    expect(hookAuditLatchState(workspace)).toEqual({ latched: false });
    expect(decision(workspace).decision).toBe("allow");
  });
});
