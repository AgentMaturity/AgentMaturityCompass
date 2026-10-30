import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopInbox } from "../src/agent/inbox.js";
import { SessionService } from "../src/session/sessionService.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { listNativeQueuedSubmissions, withdrawNativeQueuedSubmission } from "../src/setup/nativeInteractiveWithdraw.js";

const OPEN = { agentId: "default", harnessVersion: "test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const queue = { wake: false, demotedFrom: null };
let root: string, service: SessionService;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "pxb25-chat-withdraw");
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-pxb25-withdraw-")));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  service = new SessionService(root); service.open(OPEN);
});
afterEach(() => {
  try { service.disposeWithoutClosing(); } catch { /* already released */ }
  rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs();
});
const stored = (sessionId: string) => {
  const store = openSessionEventStore(root, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
};
function queued(count: number) {
  const inbox = new LoopInbox(service, () => {});
  return { inbox, ids: Array.from({ length: count }, (_, at) => inbox.insert("next-turn", `queued ${at}`, "followup", queue).messageId) };
}
function sealedTurn(inbox: LoopInbox) {
  service.startTurn({ trigger: "user" }); inbox.claim("next-turn"); service.endTurn({ reason: "complete" }); service.sealTurn();
}

describe("PXB-25 interactive withdrawal of one queued submission", () => {
  it("withdraws the second of three queued prompts with one signed cancel row and leaves the others in order", () => {
    const { ids } = queued(3); const sessionId = service.sessionId; service.releaseWithoutClosing();
    const listed = listNativeQueuedSubmissions(root, sessionId), before = stored(sessionId);
    expect(listed.pending.map(item => item.messageId)).toEqual(ids);
    expect(withdrawNativeQueuedSubmission(root, sessionId, ids[1]!, listed.headEventId)).toEqual({ status: "withdrawn", messageId: ids[1] });
    const after = stored(sessionId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map(row => row.event_type)).toEqual(["session/resume", "loop/inbox", "session/release"]);
    expect(readLoopInboxMeta(after[before.length + 1]!.meta_json)).toMatchObject({ op: "cancel", start: 1, removedCount: 1, messageIds: [ids[1]] });
    expect(listNativeQueuedSubmissions(root, sessionId).pending.map(item => item.messageId)).toEqual([ids[0], ids[2]]);
    expect(withdrawNativeQueuedSubmission(root, sessionId, ids[1]!, after.at(-1)!.id).status).toBe("already-withdrawn");
  });

  it("never reports a dispatched submission as withdrawn and writes nothing", () => {
    const { inbox, ids } = queued(1); sealedTurn(inbox); const sessionId = service.sessionId; service.releaseWithoutClosing();
    const listed = listNativeQueuedSubmissions(root, sessionId), before = stored(sessionId);
    expect(listed.pending).toEqual([]);
    expect(withdrawNativeQueuedSubmission(root, sessionId, ids[0]!, listed.headEventId)).toEqual({ status: "dispatched", messageId: ids[0] });
    expect(stored(sessionId)).toEqual(before);
  });

  it("reports a submission claimed into a turn with no recorded ending as in flight, without a writer", () => {
    const { inbox, ids } = queued(2); service.startTurn({ trigger: "user" }); inbox.claim("next-turn");
    const sessionId = service.sessionId; service.disposeWithoutClosing();
    const listed = listNativeQueuedSubmissions(root, sessionId), before = stored(sessionId);
    expect(withdrawNativeQueuedSubmission(root, sessionId, ids[0]!, listed.headEventId)).toEqual({ status: "in-flight", messageId: ids[0] });
    // Still queued, but the unsealed turn's outcome is unknown: no writer is taken and nothing is cancelled.
    expect(() => withdrawNativeQueuedSubmission(root, sessionId, ids[1]!, listed.headEventId)).toThrow(/TOOL_OUTCOME_UNKNOWN/);
    expect(stored(sessionId)).toEqual(before);
  });

  it("refuses a withdrawal against a head that moved since the list and reports unknown IDs", () => {
    const { ids } = queued(1); const sessionId = service.sessionId; service.releaseWithoutClosing();
    const listed = listNativeQueuedSubmissions(root, sessionId), before = stored(sessionId);
    expect(() => withdrawNativeQueuedSubmission(root, sessionId, ids[0]!, "stale-head")).toThrow(/head changed/);
    expect(withdrawNativeQueuedSubmission(root, sessionId, "no-such-message", listed.headEventId).status).toBe("unknown");
    expect(stored(sessionId)).toEqual(before);
  });
});
