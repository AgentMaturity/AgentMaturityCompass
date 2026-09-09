import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory, SessionHistoryRefused } from "../src/sdk/nativeAgentClient.js";
import { readSessionSpillRange } from "../src/session/spill/spillRead.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { getPublicKeyPem, getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import type { EvidenceEvent } from "../src/types.js";
import * as readerModule from "../src/session/sessionHistoryReader.js";

// Real signed writes to disposable stores; no provider or human evidence.
let workspace: string;
const full = Buffer.from("private retained fixture output\n".repeat(300));
beforeEach(() => {
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-session-history-fixture");
  workspace = mkdtempSync(join(tmpdir(), "amc-public-history-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { lockVault(workspace); vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });
function record(backend: "sqlite" | "jsonl", id = "history-subject-a", close = true) {
  const session = new SessionService(workspace, openSessionEventStore(workspace, backend),
    { maxInlineBytes: 1024, previewHeadBytes: 32, previewTailBytes: 16 });
  try {
    session.open({ sessionId: id, agentId: "default", harnessVersion: "synthetic-history-fixture",
      compositionDigest: sha256Hex("fixture composition"), policyDigest: sha256Hex("fixture policy") });
    session.startTurn({ trigger: "user" }); session.startStep();
    session.recordToolCall({ toolCallId: "fixture-call", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
    session.recordToolResult({ toolCallId: "fixture-call", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: full });
    session.endStep({ stopReason: "end_turn", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn();
    if (close) session.close({ reason: "completed" });
  } finally { session.disposeWithoutClosing(); }
  return id;
}
function snapshot() {
  const result: Record<string, { hash: string; mtime: number }> = {};
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && !path.endsWith("-shm")) result[relative(workspace, path)] = { hash: sha256Hex(readFileSync(path)), mtime: statSync(path).mtimeMs };
    }
  }
  visit(join(workspace, ".amc")); return result;
}
function mutateEvents(change: (rows: EvidenceEvent[]) => EvidenceEvent[]) {
  const path = join(workspace, ".amc/jsonl/events.jsonl");
  const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as EvidenceEvent);
  writeFileSync(path, change(rows).map(row => JSON.stringify(row)).join("\n") + "\n");
}
function resign(rows: EvidenceEvent[]): EvidenceEvent[] {
  // Hostile synthetic fixture: every global signature is real, so envelope and
  // identity guards must refuse for their own reason rather than bad signatures.
  const key = getPrivateKeyPem(workspace, "monitor");
  let previous = "GENESIS";
  return rows.map(row => {
    const canonical = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
      eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path,
      payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
    const event_hash = sha256Hex(`${previous}${canonical}${row.payload_sha256}`);
    const changed = { ...row, prev_event_hash: previous, event_hash, writer_sig: signHexDigest(event_hash, key) };
    previous = event_hash; return changed;
  });
}

describe("public complete persisted session history", () => {
  test.each(["sqlite", "jsonl"] as const)("loads exact %s rows across restarted writers, then selects without losing chain context", backend => {
    const first = record(backend); const second = record(backend, "history-subject-b");
    const reader = openSessionEventStore(workspace, backend, { readOnly: true });
    let original: EvidenceEvent[];
    try { original = [...reader.readAllEvents()]; } finally { reader.close(); }
    const fingerprint = sha256Hex(getPublicKeyPem(workspace, "monitor")); const before = snapshot();
    const history = loadSessionEventHistory({ workspace, expectedMonitorFingerprint: fingerprint, requireSealed: true });
    expect(history.events).toEqual(original); expect(history.sessions.map(row => row.session_id)).toEqual([first, second]);
    expect(history.verification).toMatchObject({ payloads: "not-read", retainedOutput: "not-read", trustRoot: { anchored: true }, checkedStoreEventCount: original.length });
    const selected = loadSessionEventHistory({ workspace, sessionId: second, agentId: "default", requireSealed: true, verifyPayloads: true });
    expect(selected.events).toEqual(original.filter(row => row.session_id === second));
    expect(selected.verification.payloads).toBe("verified"); expect(selected.scope).toBe("session");
    expect(Object.isFrozen(selected.events)).toBe(true); expect(Object.isFrozen(selected.events[0])).toBe(true);
    expect(snapshot()).toEqual(before);
    const ref = extractSpillRef(history.events.find(row => row.event_type === "tool/result")!.meta_json)!;
    const range = readSessionSpillRange({ workspace, events: history.events, locator: ref.locator!, offset: 13, limit: 64 });
    expect(Buffer.from(range.contentBase64, "base64")).toEqual(full.subarray(13, 77));
  });
  test("keyless metadata loading does not decrypt or resurrect missing private payloads", () => {
    record("jsonl"); const history = loadSessionEventHistory({ workspace });
    const row = history.events.find(event => event.payload_path !== null)!; expect(row).toBeDefined();
    unlinkSync(join(workspace, row.payload_path!)); lockVault(workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    const before = snapshot();
    expect(loadSessionEventHistory({ workspace }).events).toEqual(history.events);
    expect(() => loadSessionEventHistory({ workspace, verifyPayloads: true })).toThrow(SessionHistoryRefused);
    expect(snapshot()).toEqual(before);
  });
  test("retention metadata is exposed without pretending its missing payload was verified", () => {
    record("jsonl"); mutateEvents(rows => rows.map((row, i) => i === 0 ? { ...row, archived: 1 } : row));
    expect(loadSessionEventHistory({ workspace }).events[0]!.archived).toBe(1);
    expect(() => loadSessionEventHistory({ workspace, verifyPayloads: true })).toThrow("TAMPERED");
  });
  test("an unsealed signed prefix is explicit and can be bound to an independently saved head", () => {
    record("jsonl", "open-session", false);
    const history = loadSessionEventHistory({ workspace }); expect(history.sealed).toBe(false);
    expect(() => loadSessionEventHistory({ workspace, requireSealed: true })).toThrow("UNSEALED");
    expect(loadSessionEventHistory({ workspace, expectedHeadEventHash: history.headEventHash }).verification.rollbackProtection).toBe("expected-head-matched");
    mutateEvents(rows => rows.slice(0, -1));
    expect(() => loadSessionEventHistory({ workspace, expectedHeadEventHash: history.headEventHash })).toThrow("TAMPERED");
  });
  test.each(["events.jsonl", "sessions.jsonl"])("missing %s cannot fall back to the operations database", name => {
    record("jsonl"); unlinkSync(join(workspace, ".amc/jsonl", name));
    expect(() => loadSessionEventHistory({ workspace })).toThrow("MISSING");
  });
  test("missing session, empty JSONL and an unrelated workspace never verify as empty history", () => {
    record("jsonl"); expect(() => loadSessionEventHistory({ workspace, sessionId: "absent" })).toThrow("MISSING");
    expect(() => loadSessionEventHistory({ workspace: join(workspace, "not-created") })).toThrow("MISSING");
    writeFileSync(join(workspace, ".amc/jsonl/events.jsonl"), "");
    expect(() => loadSessionEventHistory({ workspace })).toThrow("MISSING");
  });
  test("the selected session cannot conceal corrupted evidence in another session", () => {
    const first = record("jsonl"); const second = record("jsonl", "subject-b");
    mutateEvents(rows => rows.map(row => row.session_id === first ? { ...row, writer_sig: "unsigned" } : row));
    expect(() => loadSessionEventHistory({ workspace, sessionId: second })).toThrow("TAMPERED");
  });
  test.each(["duplicate", "drop-middle", "reverse", "signature", "metadata"])("%s corruption returns no partial rows", attack => {
    record("jsonl"); mutateEvents(rows => {
      if (attack === "duplicate") return [...rows, rows[0]!];
      if (attack === "drop-middle") return rows.filter((_row, i) => i !== 2);
      if (attack === "reverse") return [...rows].reverse();
      rows[1] = { ...rows[1]!, ...(attack === "signature" ? { writer_sig: "unsigned" } : { meta_json: JSON.stringify({ forged: true }) }) };
      return rows;
    });
    expect(() => loadSessionEventHistory({ workspace })).toThrow(SessionHistoryRefused);
  });
  test.each(["version", "sequence", "session-id"])("resigned %s alteration fails the envelope boundary", attack => {
    record("jsonl", "open-session", false);
    mutateEvents(rows => resign(rows.map((row, i) => {
      if (i !== rows.length - 1) return row;
      const meta = JSON.parse(row.meta_json);
      if (attack === "version") meta.amcSession.v = 2;
      else if (attack === "sequence") meta.amcSession.seq += 1;
      else meta.amcSession.sessionId = "wrong-identity";
      return { ...row, meta_json: JSON.stringify(meta) };
    })));
    expect(() => loadSessionEventHistory({ workspace })).toThrow(attack === "version" ? "UNSUPPORTED_FORMAT" : "TAMPERED");
  });
  test.each(["duplicate-start", "duplicate-seal", "unknown-op", "wrong-agent", "bad-seal"])("%s lifecycle evidence fails after restart", attack => {
    record("jsonl"); const path = join(workspace, ".amc/jsonl/sessions.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line));
    if (attack === "duplicate-start") lines.push(lines[0]);
    else if (attack === "duplicate-seal") lines.push(lines[1]);
    else if (attack === "unknown-op") lines[1].op = "future-op";
    else if (attack === "wrong-agent") lines[0].binary_path = "forged-agent";
    else lines[1].session_seal_sig = "unsigned";
    writeFileSync(path, lines.map(line => JSON.stringify(line)).join("\n") + "\n");
    expect(() => loadSessionEventHistory({ workspace })).toThrow(SessionHistoryRefused);
  });
  test("invalid retention types and torn records are not normalized into valid evidence", () => {
    record("jsonl"); const path = join(workspace, ".amc/jsonl/events.jsonl"), original = readFileSync(path);
    mutateEvents(rows => rows.map((row, i) => i === 0 ? { ...row, payload_pruned: "unknown" as unknown as number } : row));
    expect(() => loadSessionEventHistory({ workspace })).toThrow("UNREADABLE");
    writeFileSync(path, Buffer.concat([original, Buffer.from('{"torn":')]));
    expect(() => loadSessionEventHistory({ workspace })).toThrow("UNREADABLE");
  });
  test.each(["", "garbage", "sqlite"])("refuses conflicting or invalid backend override '%s'", backend => {
    record("jsonl"); vi.stubEnv("AMC_SESSION_STORE", backend);
    expect(() => loadSessionEventHistory({ workspace })).toThrow(SessionHistoryRefused);
  });
  test.each(["missing", "malformed", "version", "symlink"])("refuses %s marker without backend fallback", attack => {
    record("jsonl"); const path = join(workspace, ".amc/session-store.json");
    if (attack === "missing") unlinkSync(path);
    else if (attack === "malformed") writeFileSync(path, "bad-json");
    else if (attack === "version") writeFileSync(path, JSON.stringify({ v: 2, backend: "jsonl" }));
    else { const copy = join(workspace, "marker-copy"); writeFileSync(copy, readFileSync(path)); unlinkSync(path); symlinkSync(copy, path); }
    expect(() => loadSessionEventHistory({ workspace })).toThrow(SessionHistoryRefused);
  });
  test("wrong agent, wrong pin and empty pin are refused; unpinned consistency is not anchored", () => {
    const id = record("jsonl");
    expect(loadSessionEventHistory({ workspace }).verification.trustRoot.anchored).toBe(false);
    expect(() => loadSessionEventHistory({ workspace, sessionId: id, agentId: "different" })).toThrow("IDENTITY_MISMATCH");
    expect(() => loadSessionEventHistory({ workspace, expectedMonitorFingerprint: "0".repeat(64) })).toThrow("TAMPERED");
    expect(() => loadSessionEventHistory({ workspace, expectedMonitorFingerprint: "" })).toThrow("INVALID_INPUT");
  });
  test("observed history changes return no stale snapshot or partial rows", () => {
    record("jsonl");
    const originalOpen = readerModule.openHistoryReader;
    vi.spyOn(readerModule, "openHistoryReader").mockImplementation(path => {
      const reader = originalOpen(path), originalRead = reader.store.readAllEvents.bind(reader.store);
      vi.spyOn(reader.store, "readAllEvents").mockImplementation(() => {
        const rows = originalRead();
        // A byte-only concurrent append leaves every signature valid, so only
        // the snapshot fence can refuse these now-stale loaded rows.
        appendFileSync(join(workspace, ".amc/jsonl/events.jsonl"), "\n"); return rows;
      });
      return reader;
    });
    expect(() => loadSessionEventHistory({ workspace })).toThrow("CHANGED");
  });
});
