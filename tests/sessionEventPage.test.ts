import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { loadSessionEventPage, SESSION_EVENT_PAGE_MAX_BYTES } from "../src/session/sessionEventPage.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import type { EvidenceEvent } from "../src/types.js";

let workspace: string;
const writers: SessionService[] = [];
beforeEach(() => {
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-wp20-page-fixture");
  workspace = mkdtempSync(join(tmpdir(), "amc-event-page-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const writer of writers.splice(0)) writer.disposeWithoutClosing();
  lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true });
});
function open(backend: "sqlite" | "jsonl", sessionId = "page-subject") {
  const writer = new SessionService(workspace, openSessionEventStore(workspace, backend));
  writers.push(writer);
  writer.open({ sessionId, agentId: "default", harnessVersion: "synthetic-page-fixture",
    compositionDigest: sha256Hex("fixture composition"), policyDigest: sha256Hex("fixture policy") });
  return writer;
}
function turn(writer: SessionService, content = "committed answer") {
  writer.startTurn({ trigger: "user" }); writer.startStep();
  writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content });
  writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
}
function mutateRows(change: (rows: EvidenceEvent[]) => EvidenceEvent[]) {
  const path = join(workspace, ".amc/jsonl/events.jsonl");
  const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as EvidenceEvent);
  writeFileSync(path, change(rows).map(row => JSON.stringify(row)).join("\n") + "\n");
}
function decode(cursor: string): Record<string, unknown> { return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
function encode(value: Record<string, unknown>): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

describe("WP20 verified session event pages", () => {
  test.each(["sqlite", "jsonl"] as const)("%s pages use a stable snapshot and resume appended committed rows once", backend => {
    const writer = open(backend); turn(writer);
    const original = loadSessionEventHistory({ workspace, sessionId: writer.sessionId }).events;
    let page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", limit: 2 });
    const collected = [...page.events]; const head = page.headEventHash;
    turn(writer, "answer after reconnect");
    while (page.nextCursor) {
      page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", cursor: page.nextCursor, limit: 2 });
      expect(page.headEventHash).toBe(head); collected.push(...page.events);
    }
    expect(collected).toEqual(original);
    expect(new Set(collected.map(row => row.id)).size).toBe(collected.length);
    expect(page.committed).toBe(true); expect(page.sealed).toBe(false);
    const latest = loadSessionEventHistory({ workspace, sessionId: writer.sessionId }).events;
    const resumed = loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", cursor: page.resumeCursor, limit: 256 });
    expect(resumed.events).toEqual(latest.slice(original.length)); expect(resumed.nextCursor).toBeNull();
    expect(loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", cursor: resumed.resumeCursor }).events).toEqual([]);
    expect(Object.isFrozen(resumed.events)).toBe(true);
  });
  test("a frozen open snapshot does not become sealed when a later head closes", () => {
    const writer = open("jsonl"); turn(writer);
    const first = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 });
    expect(first.sealed).toBe(false);
    writer.close({ reason: "completed" }); writer.disposeWithoutClosing();
    const frozen = loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: first.nextCursor! });
    expect(frozen.headEventHash).toBe(first.headEventHash); expect(frozen.sealed).toBe(false);
    const followed = loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: frozen.resumeCursor });
    expect(followed.sealed).toBe(true);
  });
  test("sealed admission applies to the selected frozen head", () => {
    const writer = open("jsonl"); turn(writer);
    const first = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 });
    writer.close({ reason: "completed" }); writer.disposeWithoutClosing();
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId,
      cursor: first.nextCursor!, requireSealed: true })).toThrow("UNSEALED");
  });
  test("parallel readers cannot claim the live JSONL writer or change evidence", async () => {
    const writer = open("jsonl"); turn(writer);
    const eventsPath = join(workspace, ".amc/jsonl/events.jsonl"), before = readFileSync(eventsPath);
    const pages = await Promise.all(Array.from({ length: 8 }, async () => loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 })));
    expect(pages.every(page => page.events.length === 1)).toBe(true); expect(readFileSync(eventsPath)).toEqual(before);
    turn(writer); expect(loadSessionEventPage({ workspace, sessionId: writer.sessionId }).headEventHash).not.toBe(pages[0]!.headEventHash);
  });
  test.each([0, -1, 257, 1.5, NaN, Infinity, "2", null])("refuses invalid page limit %s", limit => {
    const writer = open("jsonl"); turn(writer);
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: limit as number })).toThrow("INVALID_INPUT");
  });
  test.each(["garbage", "", "a".repeat(4097)])("rejects malformed or overlong cursors", cursor => {
    const writer = open("jsonl");
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor })).toThrow("INVALID_INPUT");
  });
  test("rejects cross-session, cross-agent and cross-consumer cursors before returning rows", () => {
    const writer = open("jsonl"); turn(writer);
    const page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", limit: 1 });
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-b", cursor: page.nextCursor! })).toThrow("IDENTITY_MISMATCH");
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, agentId: "other-agent", cursor: page.nextCursor! })).toThrow("IDENTITY_MISMATCH");
    const cursor = decode(page.nextCursor!); cursor.sessionId = "different-session";
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "owner-a", cursor: encode(cursor) })).toThrow("IDENTITY_MISMATCH");
  });
  test.each(["headEventHash", "afterEventHash"])("forged %s cannot select an arbitrary prefix", field => {
    const writer = open("jsonl"); turn(writer);
    const first = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 });
    const forged = decode(first.nextCursor!); forged[field] = "f".repeat(64);
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: encode(forged) })).toThrow("TAMPERED");
  });
  test("cursor decoding rejects unknown discriminants and extra fields", () => {
    const writer = open("jsonl"); turn(writer);
    const page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 });
    for (const changed of [{ mode: "draft" }, { v: 2 }, { unexpected: "field" }]) {
      const forged = { ...decode(page.nextCursor!), ...changed };
      expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: encode(forged) })).toThrow("INVALID_INPUT");
    }
  });
  test("cursor byte bound applies to generated reconnect positions", () => {
    const writer = open("jsonl");
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, consumerId: "x".repeat(2048) })).toThrow("cursor byte bound");
  });
  test("valid-prefix rollback invalidates both page and reconnect cursors", () => {
    const writer = open("jsonl"); turn(writer);
    const page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 });
    mutateRows(rows => rows.slice(0, -1));
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: page.nextCursor! })).toThrow("TAMPERED");
  });
  test.each(["gap", "unsigned"])("%s fails the full store instead of returning a shorter page", attack => {
    const writer = open("jsonl"); turn(writer);
    mutateRows(rows => attack === "gap" ? rows.filter((_row, index) => index !== 2)
      : rows.map((row, index) => index === rows.length - 1 ? { ...row, writer_sig: "unsigned" } : row));
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 1 })).toThrow();
  });
  test("page bytes are bounded and an oversized signed row is refused without skipping it", () => {
    const writer = open("jsonl");
    writer.startTurn({ trigger: "user" }); writer.startStep();
    writer.recordToolCall({ toolCallId: "oversize", toolName: "x".repeat(SESSION_EVENT_PAGE_MAX_BYTES + 1),
      args: "{}", dispatch: "native", parentToken: null });
    let page = loadSessionEventPage({ workspace, sessionId: writer.sessionId, limit: 256 });
    expect(Buffer.byteLength(JSON.stringify(page.events))).toBeLessThanOrEqual(SESSION_EVENT_PAGE_MAX_BYTES);
    expect(page.nextCursor).not.toBeNull();
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId, cursor: page.nextCursor! })).toThrow("exceeds the page byte bound");
  });
  test("legacy signed evidence cannot masquerade as a native page sequence", () => {
    const writer = open("jsonl"); turn(writer);
    mutateRows(rows => {
      const previous = rows[rows.length - 1]!;
      const legacy = { ...previous, id: "synthetic-legacy-tail", event_type: "audit" as const,
        meta_json: JSON.stringify({ fixture: "legacy evidence without native sequence" }), prev_event_hash: previous.event_hash };
      const metadata = canonicalMetadataForHash({ id: legacy.id, ts: legacy.ts, sessionId: legacy.session_id,
        runtime: legacy.runtime, eventType: legacy.event_type, payloadPath: legacy.canonical_payload_path ?? legacy.payload_path,
        payloadInline: legacy.canonical_payload_inline ?? legacy.payload_inline, metaJson: legacy.meta_json });
      const event_hash = sha256Hex(`${legacy.prev_event_hash}${metadata}${legacy.payload_sha256}`);
      return [...rows, { ...legacy, event_hash, writer_sig: signHexDigest(event_hash, getPrivateKeyPem(workspace, "monitor")) }];
    });
    expect(loadSessionEventHistory({ workspace, sessionId: writer.sessionId }).events.at(-1)?.event_type).toBe("audit");
    expect(() => loadSessionEventPage({ workspace, sessionId: writer.sessionId })).toThrow("TAMPERED");
  });
  test("selected pages cannot hide corruption in a different session", () => {
    const writer = open("jsonl"); turn(writer); writer.close({ reason: "completed" }); writer.disposeWithoutClosing();
    const other = open("jsonl", "other-subject"); turn(other);
    mutateRows(rows => rows.map(row => row.session_id === writer.sessionId ? { ...row, writer_sig: "unsigned" } : row));
    expect(() => loadSessionEventPage({ workspace, sessionId: other.sessionId, limit: 1 })).toThrow("TAMPERED");
  });
});
