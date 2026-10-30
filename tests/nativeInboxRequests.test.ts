import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopInbox } from "../src/agent/inbox.js";
import { SessionService } from "../src/session/sessionService.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { initWorkspace } from "../src/workspace.js";

let workspace: string, writer: SessionService;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-inbox-requests");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-inbox-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace);
  writer.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
});
afterEach(() => {
  writer.disposeWithoutClosing(); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});
const options = (clientRequestId?: string) => ({ wake: false, demotedFrom: null, clientRequestId });
const rows = () => writer.readEvents().filter(row => row.event_type === "loop/inbox");

describe("WP20 durable inbox request identities and targeted withdrawal", () => {
  it("deduplicates before claim and after replay without inserting or repeating a consumed message", () => {
    const inbox = new LoopInbox(writer, () => {});
    const first = inbox.insert("next-turn", "one request", "followup", options("req-1"));
    expect(inbox.insert("next-turn", "one request", "followup", options("req-1"))).toEqual(first);
    expect(inbox.nextTurn).toHaveLength(1); expect(rows()).toHaveLength(1);
    inbox.claim("next-turn");
    const replay = new LoopInbox(writer, () => {});
    expect(replay.insert("next-turn", "one request", "followup", options("req-1"))).toEqual(first);
    expect(replay.hasPending).toBe(false); expect(rows()).toHaveLength(2);
    expect(readLoopInboxMeta(rows()[0]!.meta_json)?.clientRequestId).toBe("req-1");
  });

  it("rejects request-id reuse with changed content, lane or wake semantics before persistence", () => {
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "original", "followup", options("fixed"));
    expect(() => inbox.insert("next-turn", "different", "followup", options("fixed"))).toThrow(/different submission/);
    expect(() => inbox.insert("next-step", "original", "followup", options("fixed"))).toThrow(/different submission/);
    expect(() => inbox.insert("next-turn", "original", "followup", { ...options("fixed"), wake: true })).toThrow(/different submission/);
    expect(rows()).toHaveLength(1);
  });

  it.each(["", "x".repeat(129), "line\nbreak", "non-ascii-\u00e9"])("refuses malformed request id %j", id => {
    const inbox = new LoopInbox(writer, () => {});
    expect(() => inbox.insert("next-turn", "text", "followup", options(id))).toThrow(/clientRequestId/);
    expect(rows()).toEqual([]);
  });

  it("refuses malformed persisted request fields and malformed direct insert records", () => {
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "original", "followup", options("persisted"));
    const meta = JSON.parse(rows()[0]!.meta_json) as Record<string, unknown>;
    for (const fields of [{ clientRequestId: "" }, { clientRequestSha256: "missing" },
      { clientRequestId: undefined, clientRequestSha256: "f".repeat(64) }, { op: "cancel", origin: null, removedCount: 1 }]) {
      expect(readLoopInboxMeta(JSON.stringify({ ...meta, ...fields }))).toBeNull();
    }
    expect(() => writer.recordLoopEvent({ kind: "inbox", op: "insert", target: "next-turn", start: 1, removedCount: 0,
      messageIds: ["malformed"], origin: "followup", text: "bad", wake: false, demotedFrom: null,
      clientRequestId: "id", clientRequestSha256: "invalid" })).toThrow(/request fingerprint/);
  });

  it.each(["", "x".repeat(129), "line\nbreak"])("refuses malformed withdrawal identity %j", id => {
    expect(() => new LoopInbox(writer, () => {}).withdraw(id)).toThrow(/messageId/);
    expect(rows()).toEqual([]);
  });

  it("does not cache an admission whose signed append failed", () => {
    const inbox = new LoopInbox(writer, () => {});
    const append = vi.spyOn(writer, "recordLoopEvent").mockImplementationOnce(() => { throw new Error("append failed"); });
    expect(() => inbox.insert("next-turn", "retry", "followup", options("retry"))).toThrow("append failed");
    append.mockRestore();
    const admitted = inbox.insert("next-turn", "retry", "followup", options("retry"));
    expect(admitted.messageId).toBeDefined(); expect(rows()).toHaveLength(1); expect(inbox.nextTurn).toHaveLength(1);
  });

  it("withdraws exactly one queued message with a one-element cancel splice and replays identically", () => {
    const inbox = new LoopInbox(writer, () => {});
    const first = inbox.insert("next-turn", "first", "followup", options());
    const second = inbox.insert("next-turn", "second", "followup", options("second"));
    const third = inbox.insert("next-turn", "third", "followup", options());
    inbox.insert("next-step", "context", "inject", options());
    expect(inbox.withdraw(second.messageId)).toBe(true);
    expect(inbox.nextTurn.map(message => message.messageId)).toEqual([first.messageId, third.messageId]);
    expect(inbox.nextStep.map(message => message.text)).toEqual(["context"]);
    expect(readLoopInboxMeta(rows().at(-1)!.meta_json)).toMatchObject({ op: "cancel", start: 1, removedCount: 1, messageIds: [second.messageId] });
    const replay = new LoopInbox(writer, () => {});
    expect(replay.nextTurn).toEqual(inbox.nextTurn); expect(replay.nextStep).toEqual(inbox.nextStep);
    const count = rows().length;
    expect(replay.withdraw(second.messageId)).toBe(false); expect(rows()).toHaveLength(count);
    expect(replay.insert("next-turn", "second", "followup", options("second")).messageId).toBe(second.messageId);
    expect(replay.nextTurn).toHaveLength(2);
  });

  it("refuses a replayed request identity whose signed fingerprint does not match its original bytes", () => {
    const inbox = new LoopInbox(writer, () => {});
    inbox.insert("next-turn", "original", "followup", options("fingerprint"));
    const view = new Proxy(writer, { get(target, key) {
      if (key === "readEvents") return () => target.readEvents().map(row => row.event_type === "loop/inbox"
        ? { ...row, meta_json: JSON.stringify({ ...JSON.parse(row.meta_json), clientRequestSha256: "f".repeat(64) }) } : row);
      const value: unknown = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    expect(() => new LoopInbox(view, () => {})).toThrow(/request.*fingerprint/);
  });
});
