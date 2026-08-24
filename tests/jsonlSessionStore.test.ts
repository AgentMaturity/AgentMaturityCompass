import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getPrivateKeyPem, getPublicKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { jsonlEventsPath, jsonlSessionsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { recoverSession } from "../src/session/sessionRecovery.js";
import { verifyStoredSessionEvents } from "../src/persistence/sessionStoreVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent, SessionRecord } from "../src/types.js";

/**
 * The JSONL backend under attack, plus the spine running on it end to end.
 *
 * The conformance suite proves the two backends agree on the rules. This file
 * proves the JSONL backend's rules are worth anything against an adversary who
 * has what a JSONL log makes cheap: raw write access to a text file. Each test
 * makes ONE edit and asserts the specific finding, so a verifier check that
 * stopped working would turn this red rather than merely stop being exercised.
 *
 * The final tamper test is the isolation case: a forgery re-hashed AND re-signed
 * with the workspace's own monitor key passes every global check, and is caught
 * only by the per-session chain. That is the check earning its place.
 */
const PASS = "jsonl-session-store-passphrase";

let workspace: string;
let priorPassphrase: string | undefined;

beforeEach(() => {
  priorPassphrase = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  workspace = mkdtempSync(join(tmpdir(), "amc-jsonl-store-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  if (priorPassphrase === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
  else process.env["AMC_VAULT_PASSPHRASE"] = priorPassphrase;
});

/** A complete one-turn session written through the real SessionService. */
function runSession(backend: "sqlite" | "jsonl"): string {
  const service = new SessionService(workspace, openSessionEventStore(workspace, backend));
  service.open({
    sessionId: "session-under-test",
    agentId: "agent-a",
    harnessVersion: "test",
    compositionDigest: sha256Hex("composition"),
    policyDigest: sha256Hex("policy")
  });
  service.recordSystemPrompt("you are a test");
  service.startTurn({ trigger: "user" });
  service.recordUserMessage("hello");
  service.startStep();
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: null, content: "hi" });
  service.endStep({ stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0 } });
  service.endTurn({ reason: "complete", interrupted: false });
  service.sealTurn();
  service.close({ reason: "done" });
  return service.sessionId;
}

function readRows(): EvidenceEvent[] {
  const store = openSessionEventStore(workspace, "jsonl", { readOnly: true });
  try {
    return [...store.readAllEvents()];
  } finally {
    store.close();
  }
}

function readRecords(sessionId: string): SessionRecord[] {
  const store = openSessionEventStore(workspace, "jsonl", { readOnly: true });
  try {
    const record = store.readSessionRecord(sessionId);
    return record === null ? [] : [record];
  } finally {
    store.close();
  }
}

function readLines(): Record<string, unknown>[] {
  return readFileSync(jsonlEventsPath(workspace), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writeLines(rows: readonly Record<string, unknown>[]): void {
  writeFileSync(jsonlEventsPath(workspace), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function readSessionLines(): Record<string, unknown>[] {
  return readFileSync(jsonlSessionsPath(workspace), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function writeSessionLines(rows: readonly Record<string, unknown>[]): void {
  writeFileSync(jsonlSessionsPath(workspace), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function monitorFingerprint(): string {
  return sha256Hex(Buffer.from(getPublicKeyPem(workspace, "monitor"), "utf8"));
}

/** Re-hash and re-sign a row after editing it — the attacker who has the key's reach. */
function reseal(row: Record<string, unknown>): void {
  const canonical = canonicalMetadataForHash({
    id: row["id"] as string,
    ts: row["ts"] as number,
    sessionId: row["session_id"] as string,
    runtime: row["runtime"] as EvidenceEvent["runtime"],
    eventType: row["event_type"] as EvidenceEvent["event_type"],
    payloadPath: (row["canonical_payload_path"] ?? row["payload_path"]) as string | null,
    payloadInline: (row["canonical_payload_inline"] ?? row["payload_inline"]) as string | null,
    metaJson: row["meta_json"] as string
  });
  const hash = sha256Hex(`${row["prev_event_hash"] as string}${canonical}${row["payload_sha256"] as string}`);
  row["event_hash"] = hash;
  row["writer_sig"] = signHexDigest(hash, getPrivateKeyPem(workspace, "monitor"));
}

describe("the spine runs on the JSONL backend", () => {
  it("writes a complete session that verifies, signed and chained", () => {
    const sessionId = runSession("jsonl");
    const rows = readRows();
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.every((row) => row.writer_sig !== "unsigned")).toBe(true);
    const result = verifyStoredSessionEvents(workspace, rows, {
      sessionRecords: readRecords(sessionId),
      expectedMonitorFingerprint: monitorFingerprint()
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.trustRoot.anchored).toBe(true);
  });

  it("projects the same conversation history on both backends", () => {
    // The fold reads only payload digests and surface ops, so a backend that
    // preserved the envelope faithfully must produce an identical projection.
    const jsonlService = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"));
    jsonlService.open({
      sessionId: "projection-session",
      agentId: "agent-a",
      harnessVersion: "test",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    jsonlService.recordSystemPrompt("system");
    jsonlService.recordUserMessage("user");
    const projected = jsonlService.projectHistory();
    jsonlService.close({ reason: "done" });

    const other = mkdtempSync(join(tmpdir(), "amc-jsonl-cmp-"));
    try {
      initWorkspace({ workspacePath: other, agentId: "default", trustBoundaryMode: "isolated" });
      const sqliteService = new SessionService(other, openSessionEventStore(other, "sqlite"));
      sqliteService.open({
        sessionId: "projection-session",
        agentId: "agent-a",
        harnessVersion: "test",
        compositionDigest: sha256Hex("composition"),
        policyDigest: sha256Hex("policy")
      });
      sqliteService.recordSystemPrompt("system");
      sqliteService.recordUserMessage("user");
      expect(sqliteService.projectHistory()).toEqual(projected);
      sqliteService.close({ reason: "done" });
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("does not regress the SQLite path: verifyLedgerIntegrity still passes, anchored", async () => {
    runSession("sqlite");
    const result = await verifyLedgerIntegrity(workspace, {
      expectedMonitorFingerprint: monitorFingerprint()
    });
    expect(result.chain.errors).toEqual([]);
    expect(result.trustRoot.anchored).toBe(true);
    expect(result.sessions.closed).toContain("session-under-test");
  });
});

describe("the JSONL log under tamper", () => {
  it("catches an edited meta (event_hash mismatch)", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    const target = lines[2];
    expect(target).toBeDefined();
    const meta = JSON.parse(target!["meta_json"] as string) as Record<string, unknown>;
    meta["injected"] = "by an attacker";
    target!["meta_json"] = JSON.stringify(meta);
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("event_hash mismatch"))).toBe(true);
  });

  it("catches a deleted line (previous hash mismatch)", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    lines.splice(2, 1);
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("previous hash mismatch"))).toBe(true);
  });

  it("catches an appended forgery even when it is correctly signed", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    const last = lines[lines.length - 1];
    expect(last).toBeDefined();
    const forged: Record<string, unknown> = {
      ...last!,
      id: "forged-event",
      // Chained to the wrong predecessor: an attacker who can sign can still not
      // choose a prev_event_hash that makes the global order come out right.
      prev_event_hash: last!["prev_event_hash"],
      meta_json: JSON.stringify({ forged: true })
    };
    reseal(forged);
    writeLines([...lines, forged]);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("previous hash mismatch"))).toBe(true);
  });

  it("catches a corrupted payload blob", () => {
    const sessionId = runSession("jsonl");
    const rows = readRows();
    const contentRow = rows.find((row) => row.payload_path !== null);
    expect(contentRow).toBeDefined();
    writeFileSync(join(workspace, contentRow!.payload_path as string), "tampered bytes");

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (error) => error.includes("payload hash mismatch") || error.includes("payload authentication failed")
      )
    ).toBe(true);
  });

  it("catches a re-signed forgery ONLY through the per-session chain", () => {
    // Deliberately unsealed: a sealed session would also flag the stale seal,
    // and this test is about what the per-session chain alone catches.
    const service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"));
    service.open({
      sessionId: "resign-session",
      agentId: "agent-a",
      harnessVersion: "test",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    service.recordUserMessage("one");
    service.recordUserMessage("two");

    const lines = readLines();
    const last = lines[lines.length - 1];
    expect(last).toBeDefined();
    const meta = JSON.parse(last!["meta_json"] as string) as Record<string, unknown>;
    const envelope = meta[SESSION_ENVELOPE_META_KEY] as { seq: number };
    meta[SESSION_ENVELOPE_META_KEY] = { ...envelope, seq: envelope.seq + 5 };
    last!["meta_json"] = JSON.stringify(meta);
    reseal(last!);
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords("resign-session")
    });
    expect(result.ok).toBe(false);
    // Every global check still passes — the hash recomputes and the signature
    // verifies, because the attacker used the workspace's own monitor key.
    expect(result.errors.some((error) => error.includes("event_hash mismatch"))).toBe(false);
    expect(result.errors.some((error) => error.includes("writer signature invalid"))).toBe(false);
    expect(result.errors.some((error) => error.includes("previous hash mismatch"))).toBe(false);
    expect(result.errors.some((error) => error.includes("session sequence mismatch"))).toBe(true);
  });

  it("catches a duplicated event id", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    const first = lines[0];
    const second = lines[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    second!["id"] = first!["id"];
    reseal(second!);
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.errors.some((error) => error.includes("duplicate event id"))).toBe(true);
  });

  it("refuses to read a malformed line instead of quietly returning a shorter log", () => {
    runSession("jsonl");
    const raw = readFileSync(jsonlEventsPath(workspace), "utf8");
    writeFileSync(jsonlEventsPath(workspace), `${raw}{"id":"torn"\n`);
    expect(() => readRows()).toThrow(/jsonl event log line/);
  });

  it("fails closed when the monitor key does not match the expected fingerprint", () => {
    const sessionId = runSession("jsonl");
    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId),
      expectedMonitorFingerprint: "f".repeat(64)
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.startsWith("trust root:"))).toBe(true);
  });
});

describe("JSONL single-writer and backend pinning", () => {
  it("refuses a second concurrent writer and releases the lock on close", () => {
    const first = openSessionEventStore(workspace, "jsonl");
    try {
      expect(() => openSessionEventStore(workspace, "jsonl")).toThrow(/locked by another writer/);
    } finally {
      first.close();
    }
    const second = openSessionEventStore(workspace, "jsonl");
    expect(second.backendId).toBe("jsonl");
    second.close();
  });

  it("refuses to open the other backend once a workspace is pinned", () => {
    const store = openSessionEventStore(workspace, "jsonl");
    store.close();
    expect(() => openSessionEventStore(workspace, "sqlite")).toThrow(
      /workspace session store is jsonl/
    );
  });

  it("resolves the pinned backend with no environment set — JSONL-only is a default", () => {
    const prior = process.env["AMC_SESSION_STORE"];
    delete process.env["AMC_SESSION_STORE"];
    try {
      openSessionEventStore(workspace, "jsonl").close();
      const reopened = openSessionEventStore(workspace);
      expect(reopened.backendId).toBe("jsonl");
      reopened.close();
    } finally {
      if (prior === undefined) delete process.env["AMC_SESSION_STORE"];
      else process.env["AMC_SESSION_STORE"] = prior;
    }
  });
});

describe("JSONL verification rules, one broken property at a time", () => {
  it("catches a corrupted writer signature", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    const target = lines[1];
    expect(target).toBeDefined();
    // Same length and shape, wrong bytes: this must fail the signature rule and
    // nothing else, because writer_sig is outside event_hash.
    target!["writer_sig"] = Buffer.alloc(64, 7).toString("base64");
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.errors.some((error) => error.includes("writer signature invalid"))).toBe(true);
    expect(result.errors.some((error) => error.includes("event_hash mismatch"))).toBe(false);
  });

  it("catches events whose session was never started", () => {
    const sessionId = runSession("jsonl");
    writeSessionLines(readSessionLines().filter((line) => line["op"] !== "start"));
    // The session log now describes a seal with no start, which is malformed
    // rather than merely incomplete: it would otherwise be a way to conjure a
    // sealed session out of nothing.
    expect(() => readRecords(sessionId)).toThrow(/seal for unstarted session/);

    const result = verifyStoredSessionEvents(workspace, readRows(), { sessionRecords: [] });
    expect(result.errors.some((error) => error.includes("references missing session"))).toBe(true);
  });

  it("catches a seal that names something other than the session's last event", () => {
    const sessionId = runSession("jsonl");
    const lines = readSessionLines();
    const seal = lines.find((line) => line["op"] === "seal");
    expect(seal).toBeDefined();
    seal!["session_final_event_hash"] = "0".repeat(64);
    writeSessionLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.errors.some((error) => error.includes("seal names"))).toBe(true);
  });

  it("catches a forged seal signature", () => {
    const sessionId = runSession("jsonl");
    const lines = readSessionLines();
    const seal = lines.find((line) => line["op"] === "seal");
    expect(seal).toBeDefined();
    seal!["session_seal_sig"] = Buffer.alloc(64, 3).toString("base64");
    writeSessionLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.errors.some((error) => error.includes("seal signature invalid"))).toBe(true);
  });

  it("refuses to adjudicate a row wearing retention state it never produced", () => {
    const sessionId = runSession("jsonl");
    const lines = readLines();
    const target = lines[1];
    expect(target).toBeDefined();
    // archived/payload_pruned are outside the hash pre-image, so a row can be
    // relabelled without breaking any chain. Passing it silently would mean a
    // deleted payload could be excused by a flag the attacker set.
    target!["archived"] = 1;
    writeLines(lines);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords(sessionId)
    });
    expect(result.errors.some((error) => error.includes("retention state this verifier does not adjudicate"))).toBe(
      true
    );
  });
});

describe("crash recovery on the JSONL backend", () => {
  it("recovers an abandoned session once the crashed writer is gone", async () => {
    const store = openSessionEventStore(workspace, "jsonl");
    const service = new SessionService(workspace, store);
    service.open({
      sessionId: "crashed-session",
      agentId: "agent-a",
      harnessVersion: "test",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    service.startTurn({ trigger: "user" });
    service.recordUserMessage("do the thing");
    service.recordToolCall({
      toolCallId: "call-1",
      toolName: "shell",
      dispatch: "native",
      parentToken: null,
      args: JSON.stringify({ command: "ls" })
    });
    // The crash: no result, no turn/end, no seal, no close. Releasing the store
    // (without sealing) is what a dead process leaves behind — the writer lock
    // must not outlive it, or recovery could never take over.
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 25));

    const report = recoverSession({
      workspace,
      sessionId: "crashed-session",
      claimant: { pid: process.pid, hostId: "test-host", bootId: "boot", startedAt: Date.now() },
      staleAfterMs: 0,
      close: true
    });
    expect(report.verdict).toBe("RECOVERED");
    expect(report.unknownToolOutcomes).toBe(1);
    expect(report.syntheticTurnEnds).toBe(1);
    expect(report.closed).toBe(true);

    const result = verifyStoredSessionEvents(workspace, readRows(), {
      sessionRecords: readRecords("crashed-session"),
      expectedMonitorFingerprint: monitorFingerprint()
    });
    expect(result.errors).toEqual([]);
  });
});
