import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACP_MAX_TURN_UPDATE_BYTES } from "../src/acp/acpCommittedUpdates.js";
import { COMMITTED_CURSOR_START, chargeUpdateBudget, projectCommittedTail } from "../src/acp/acpCommittedStream.js";
import { ACP_MAX_UPDATE_PARAMS_BYTES } from "../src/acp/acpRuntimeContracts.js";
import { UNSIGNED } from "../src/agent/runReport.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * SH-UI-01: the one authenticated projection ACP and `--output-format stream-json` share. A consumer that reads rows
 * while the driver writes them must see exactly the committed, signed tail: nothing tampered, nothing unsigned, nothing
 * twice, and nothing over the frame or turn bound.
 */
let workspace: string;
let writer: SessionService;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "sh-ui-committed-stream");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-committed-stream-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace);
  writer.open({ sessionId: "stream-fixture", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.startStep();
});
afterEach(() => { writer.disposeWithoutClosing(); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });

const tail = (events = writer.readEvents(), cursor = COMMITTED_CURSOR_START, emit = true) =>
  projectCommittedTail({ workspace, sessionId: "stream-fixture", events, cursor, emit });

describe("projectCommittedTail", () => {
  it("projects only the rows after the cursor, each with its signed identity, and never a row twice", () => {
    writer.recordToolCall({ toolCallId: "c1", toolName: "fs.read", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "src/a.ts" }) });
    const first = tail();
    expect(first.updates.map(entry => entry.update.sessionUpdate)).toEqual(["tool_call"]);
    expect(first.updates[0]).toMatchObject({ seq: expect.any(Number), eventId: expect.any(String), eventHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(first.cursor.projected).toBe(writer.readEvents().length);
    writer.recordToolResult({ toolCallId: "c1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "ok" });
    writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "done" });
    const second = tail(writer.readEvents(), first.cursor);
    expect(second.updates.map(entry => entry.update.sessionUpdate)).toEqual(["tool_call_update", "agent_message_chunk"]);
    expect(second.updates.every(entry => entry.seq > first.updates[0]!.seq)).toBe(true);
    expect(tail(writer.readEvents(), second.cursor).updates).toEqual([]);
  });

  it("authenticates without rendering when emit is false, and still advances the cursor", () => {
    writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "withheld" });
    const withheld = tail(writer.readEvents(), COMMITTED_CURSOR_START, false);
    expect(withheld.updates).toEqual([]);
    expect(withheld.cursor.projected).toBe(writer.readEvents().length);
  });

  it("refuses a tampered signature, a changed prefix and an unsigned row instead of showing less than happened", () => {
    writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "signed" });
    const events = [...writer.readEvents()];
    const last = events.length - 1;
    expect(() => tail([...events.slice(0, last), { ...events[last]!, writer_sig: "ab".repeat(64) }])).toThrow(/authentication failed/);
    expect(() => tail([...events.slice(0, last), { ...events[last]!, writer_sig: UNSIGNED }])).toThrow(/authentication failed|unsigned/);
    const seen = tail(events);
    expect(() => tail(events, { projected: seen.cursor.projected, projectedHash: "0".repeat(64) })).toThrow(/previously observed session head changed/);
  });
});

describe("chargeUpdateBudget", () => {
  it("refuses one frame over the params bound and a turn over the aggregate bound", () => {
    const budget = { bytes: 0 };
    expect(chargeUpdateBudget(budget, { small: true })).toBeGreaterThan(0);
    expect(() => chargeUpdateBudget({ bytes: 0 }, { text: "x".repeat(ACP_MAX_UPDATE_PARAMS_BYTES) })).toThrow(/frame or turn bound/);
    expect(() => chargeUpdateBudget({ bytes: ACP_MAX_TURN_UPDATE_BYTES - 4 }, { text: "x".repeat(16) })).toThrow(/frame or turn bound/);
  });
});
