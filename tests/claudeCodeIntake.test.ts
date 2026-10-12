/**
 * P1-23 review (audit evasion through the intake cap): Claude Code's after-the-fact observations are capped per
 * authenticated registration, but a session can never hide its own actions behind the cap. An observation refused for
 * rate is listed in a signed summary row (registration, window, count, tool_use_ids), the decision it belongs to never
 * reads as fully evidenced, and while its registration is shedding every PreToolUse decision of that registration is
 * denied. Decision rows themselves are never capped, and one registration's flood never touches another's.
 */
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { readStdinAll } from "../src/adapters/hookForwarder.js";
import { claudeActionId } from "../src/adapters/hookProviders/claudeCode.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { handleHookControlRequest } from "../src/bridge/hookControlRoute.js";
import { claudeCodeGovernance, claudeCodeSessionRegistration } from "../src/bridge/claudeCodeSessionRegistry.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../src/ledger/ledger.js";
import { inspectHookActionLifecycle } from "../src/watch/hookActionLifecycle.js";
import { agentId, claudeWorkspace, controlRequest, decide, lease, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => {
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

const FLOODER = "flooding-registration";
const CAP = 120;
let calls = 0;
const fileOf = (workspace: string) => join(String(recorded("PreToolUse-read", workspace).cwd), "workspace", "public.txt");
function readCall(workspace: string, sessionId: string): { raw: string; toolUseId: string } {
  calls += 1;
  const toolUseId = `toolu_intake_${calls}`;
  return { toolUseId, raw: controlRequest({ ...recorded("PreToolUse-read", workspace), session_id: sessionId, tool_use_id: toolUseId,
    tool_input: { file_path: fileOf(workspace) } }) };
}
const observe = (workspace: string, body: Record<string, unknown>, now: number) =>
  () => handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code", lease, now, rawInput: JSON.stringify(body) });
const stop = (sessionId: string) => ({ hook_event_name: "Stop", session_id: sessionId, stop_hook_active: false });
const post = (workspace: string, sessionId: string, toolUseId: string, receiptSha256: string) => ({ hook_event_name: "PostToolUse", session_id: sessionId,
  tool_use_id: toolUseId, tool_name: "Read", tool_input: { file_path: fileOf(workspace) }, ingressRecorded: true, decisionReceiptSha256: receiptSha256 });

/** The verified intake summary rows of the workspace. */
function summaries(workspace: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((event) => event.event_type === "audit")
      .map((event) => ({ event, meta: JSON.parse(event.meta_json) as Record<string, unknown> }))
      .filter(({ meta }) => meta.intakeSummarySchemaVersion === 1)
      .map(({ event, meta }) => ({ ...meta, intact: verifyEvidenceEventIntegrity({ ledger, eventId: event.id, requireReceipt: true, requireSealedSession: true }).ok }));
  } finally {
    ledger.close();
  }
}

/** Calls of the flooding registration that ran (allowed), then a flood that fills its intake, then their outcomes, refused for rate. */
function floodWithOutcomesPending(workspace: string, now: number) {
  register(workspace, FLOODER);
  const ran = [0, 1, 2].map(() => {
    const call = readCall(workspace, FLOODER);
    const decision = decide(workspace, call.raw, now);
    expect(decision.decision).toBe("allow");
    return { ...call, receiptSha256: decision.receiptSha256, actionId: claudeActionId(FLOODER, call.toolUseId) };
  });
  for (let i = 0; i < CAP; i += 1) observe(workspace, stop(FLOODER), now)();
  for (const call of ran) expect(observe(workspace, post(workspace, FLOODER, call.toolUseId, call.receiptSha256), now)).toThrowError(expect.objectContaining({ statusCode: 429 }));
  return ran;
}

describe("the intake cap never hides a session's actions", () => {
  test("flooding, then a real tool call: the call is denied and the summary row exists; once the flood stops, calls allow and the gap stays marked", () => {
    const workspace = claudeWorkspace();
    const now = Date.now();
    const ran = floodWithOutcomesPending(workspace, now);

    const during = decide(workspace, readCall(workspace, FLOODER).raw, now);
    expect(during.decision).toBe("deny");
    expect(during.reason).toContain("observations");
    const rows = summaries(workspace);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.intact && row.reason === "observation not recorded (rate-limited)")).toBe(true);
    expect(rows.reduce((total, row) => total + Number(row.count), 0)).toBe(ran.length);
    expect(rows.flatMap((row) => row.toolUseIds as string[]).sort()).toEqual(ran.map((call) => call.toolUseId).sort());

    // A minute later the window has passed: intake has recovered and decisions allow again.
    expect(decide(workspace, readCall(workspace, FLOODER).raw, now + 61_000).decision).toBe("allow");
    for (const call of ran) {
      const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId: call.actionId });
      expect(lifecycle.observationNotRecorded).toBe("rate-limited");
      expect(lifecycle.reasonCodes).toContain("OBSERVATION_RATE_LIMITED");
      expect(lifecycle.valid).toBe(false);
    }
  });

  test("two registrations: one floods, the other is unaffected", () => {
    const workspace = claudeWorkspace();
    const other = String(recorded("SessionStart-startup", workspace).session_id);
    const now = Date.now();
    floodWithOutcomesPending(workspace, now);
    expect(observe(workspace, stop(other), now)()).toMatchObject({ recorded: true });
    const call = readCall(workspace, other);
    const decision = decide(workspace, call.raw, now);
    expect(decision.decision).toBe("allow");
    expect(observe(workspace, post(workspace, other, call.toolUseId, decision.receiptSha256), now)()).toMatchObject({ recorded: true });
    expect(inspectHookActionLifecycle({ workspace, agentId, actionId: claudeActionId(other, call.toolUseId) }).observationNotRecorded).toBeNull();
  });
});

describe("registrations and payloads cannot defeat the caps", () => {
  test("one lease cannot create registrations past its cap; a re-registration of the same session is not counted", () => {
    const workspace = claudeWorkspace();
    const session = String(recorded("SessionStart-startup", workspace).session_id);
    let refused = 0;
    for (let i = 0; i < 35; i += 1) {
      try {
        register(workspace, `churned-session-${i}`);
      } catch (error) {
        expect(error).toMatchObject({ statusCode: 429 });
        refused += 1;
      }
    }
    // claudeWorkspace() registered one session already: 30 per lease per minute in all.
    expect(refused).toBe(35 - 29);
    expect(register(workspace, session)).toMatchObject({ registered: true, idempotentReplay: true });
  });

  test("a new registration of a session supersedes the old one", () => {
    const workspace = claudeWorkspace();
    const session = String(recorded("SessionStart-startup", workspace).session_id);
    const moved = join(workspace, ".fixture-home", "other-config");
    expect(register(workspace, session, moved)).toMatchObject({ registered: true, idempotentReplay: false });
    const ledger = openLedger(workspace);
    try {
      const found = claudeCodeSessionRegistration(ledger, agentId, session);
      expect(found.status === "registered" && found.record.userSettingsPath).toBe(join(moved, "settings.json"));
    } finally {
      ledger.close();
    }
    expect(claudeCodeGovernance(workspace, agentId).registeredSessions).toBe(1);
    expect(decide(workspace, readCall(workspace, session).raw).decision).toBe("allow");
  });

  test("an oversized body is refused before it is parsed, at the route and in the forwarder", async () => {
    const workspace = claudeWorkspace();
    // Repeated keys would be refused as ambiguous (400) by a parse; the size cap answers first.
    const huge = `{${Array.from({ length: 30_000 }, (_, i) => `"k":${i}`).join(",")}}`;
    expect(() => handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "claude-code", lease, rawInput: huge }))
      .toThrowError(expect.objectContaining({ statusCode: 413 }));
    let pushed = 0;
    const endless = Readable.from((function* () { for (;;) { pushed += 1; yield Buffer.alloc(65_536, 0x20); } })());
    await expect(readStdinAll(endless)).rejects.toThrow(/too large/);
    expect(pushed).toBeLessThan(10);
  });
});

test("Claude Code cannot read AMC's own state, its hook lease included", () => {
  const workspace = claudeWorkspace();
  const session = String(recorded("SessionStart-startup", workspace).session_id);
  const cwd = String(recorded("PreToolUse-read", workspace).cwd);
  for (const [tool, input] of [["Read", { file_path: join(cwd, ".amc", "hooks", "claude-code.lease") }], ["Grep", { pattern: "lease", path: join(cwd, ".amc") }],
    ["Glob", { pattern: "**/*.lease", path: join(cwd, ".amc", "hooks") }]] as const) {
    const decision = decide(workspace, controlRequest({ ...recorded("PreToolUse-read", workspace), session_id: session, tool_use_id: `toolu_amc_${tool}`,
      tool_name: tool, tool_input: input }));
    expect(decision.decision, tool).toBe("deny");
    expect(decision.reason, tool).toContain("AMC protects its hook configuration");
  }
});
