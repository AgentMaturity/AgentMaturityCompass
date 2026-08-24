import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { anchorSessionRoot } from "../src/transparency/sessionAnchor.js";
import {
  buildSessionRootDescriptor,
  SessionAnchorError
} from "../src/transparency/sessionRootDescriptor.js";
import type { EvidenceEvent, SessionRecord } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * The descriptor is what an anchor publishes, so every rule that decides whether
 * a session MAY be anchored needs a test that breaks it.
 *
 * The sharpest one here is the re-signed forgery: an attacker with workspace
 * write and the monitor key can rewrite `session/close` to claim any session
 * root, recompute its `event_hash`, and sign it. Nothing about that row is
 * inconsistent — which is exactly why the builder recomputes the root from the
 * `turn/seal` rows and treats the close event's claim as an assertion to check.
 * If that test ever passes, the anchor has become a notarised copy of whatever
 * the last row says.
 */
const PASS = "session-anchor-descriptor-passphrase";
const dirs: string[] = [];

function newWorkspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-anchor-neg-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function runSession(workspace: string, close: boolean): string {
  const service = new SessionService(workspace);
  service.open({
    agentId: "default",
    harnessVersion: "2.4.0",
    compositionDigest: sha256Hex("composition"),
    policyDigest: sha256Hex("policy")
  });
  const sessionId = service.sessionId;
  service.startTurn({ trigger: "user" });
  service.recordUserMessage("do the thing");
  service.startStep();
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "done" });
  service.endStep({
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheWrite: 0 }
  });
  service.endTurn({ reason: "complete", interrupted: false });
  service.sealTurn();
  if (close) {
    service.close({ reason: "completed" });
  }
  return sessionId;
}

function readStored(workspace: string, sessionId: string): {
  rows: EvidenceEvent[];
  record: SessionRecord | null;
} {
  const store = openSessionEventStore(workspace, "sqlite", { readOnly: true });
  try {
    return {
      rows: [...store.readSessionEvents(sessionId)],
      record: store.readSessionRecord(sessionId)
    };
  } finally {
    store.close();
  }
}

function describeErrors(workspace: string, sessionId: string, rows: EvidenceEvent[], record: SessionRecord | null): string {
  try {
    buildSessionRootDescriptor({ workspace, sessionId, rows, record });
  } catch (error) {
    expect(error).toBeInstanceOf(SessionAnchorError);
    return (error as SessionAnchorError).errors.join("; ");
  }
  throw new Error("expected buildSessionRootDescriptor to reject these rows");
}

describe("session root descriptor — what may not be anchored", () => {
  test("a well-formed closed session is described (the control for every mutation below)", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const descriptor = buildSessionRootDescriptor({ workspace, sessionId, rows, record });

    expect(descriptor.sessionId).toBe(sessionId);
    expect(descriptor.sealCount).toBe(1);
    expect(descriptor.eventCount).toBe(rows.length);
    expect(descriptor.monitorKeyFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an unclosed session is refused rather than anchored as if it had ended", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, false);

    expect(() => anchorSessionRoot({ workspace, sessionId })).toThrow(SessionAnchorError);
    const { rows, record } = readStored(workspace, sessionId);
    const errors = describeErrors(workspace, sessionId, rows, record);
    expect(errors).toContain("is not sealed");
    expect(errors).toContain("does not end with session/close");
  });

  test("a session/close that lies about its merkle root is rejected even when perfectly re-signed", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const close = rows[rows.length - 1]!;
    expect(close.event_type).toBe("session/close");
    // Key order is load-bearing for the hash pre-image; overwriting an existing
    // key leaves insertion order untouched, so this forgery is byte-faithful.
    const meta = JSON.parse(close.meta_json) as Record<string, unknown>;
    meta.sessionMerkleRoot = "1".repeat(64);
    const metaJson = JSON.stringify(meta);
    const eventHash = sha256Hex(
      `${close.prev_event_hash}${canonicalMetadataForHash({
        id: close.id,
        ts: close.ts,
        sessionId: close.session_id,
        runtime: close.runtime,
        eventType: close.event_type,
        payloadPath: close.canonical_payload_path ?? close.payload_path,
        payloadInline: close.canonical_payload_inline ?? close.payload_inline,
        metaJson
      })}${close.payload_sha256}`
    );
    const monitorKey = getPrivateKeyPem(workspace, "monitor");
    const forgedRows = [
      ...rows.slice(0, -1),
      { ...close, meta_json: metaJson, event_hash: eventHash, writer_sig: signHexDigest(eventHash, monitorKey) }
    ];
    // Re-seal to the forged row too, so the ONLY thing left inconsistent is the
    // claim itself. Anything less and this test could pass on the seal check.
    const forgedRecord: SessionRecord = {
      ...record!,
      session_final_event_hash: eventHash,
      session_seal_sig: signHexDigest(eventHash, monitorKey)
    };

    const errors = describeErrors(workspace, sessionId, forgedRows, forgedRecord);

    expect(errors).toContain("session/close claims merkle root 1111");
    expect(errors).toContain("but the sealed turns hash to");
  });

  test("a row whose meta was edited fails its hash recomputation", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const target = rows[1]!;
    const errors = describeErrors(
      workspace,
      sessionId,
      [...rows.slice(0, 1), { ...target, meta_json: `${target.meta_json.slice(0, -1)},"injected":true}` }, ...rows.slice(2)],
      record
    );

    expect(errors).toContain(`Event ${target.id} event_hash mismatch`);
  });

  // The complement of the test above. Editing meta alone leaves `writer_sig`
  // valid over the row's stale `event_hash`, so only the hash check fires;
  // updating `event_hash` to match the edit is what strands the signature. Both
  // halves are needed, or an implementation that dropped one check would still
  // look covered.
  test("a row rehashed without the monitor key fails its writer signature", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const target = rows[1]!;
    const metaJson = `${target.meta_json.slice(0, -1)},"injected":true}`;
    const eventHash = sha256Hex(
      `${target.prev_event_hash}${canonicalMetadataForHash({
        id: target.id,
        ts: target.ts,
        sessionId: target.session_id,
        runtime: target.runtime,
        eventType: target.event_type,
        payloadPath: target.canonical_payload_path ?? target.payload_path,
        payloadInline: target.canonical_payload_inline ?? target.payload_inline,
        metaJson
      })}${target.payload_sha256}`
    );
    const errors = describeErrors(
      workspace,
      sessionId,
      [...rows.slice(0, 1), { ...target, meta_json: metaJson, event_hash: eventHash }, ...rows.slice(2)],
      record
    );

    expect(errors).toContain(`Event ${target.id} writer signature invalid`);
    expect(errors).not.toContain(`Event ${target.id} event_hash mismatch`);
  });

  test("dropping a row from the middle breaks the per-session sequence", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const errors = describeErrors(workspace, sessionId, [...rows.slice(0, 2), ...rows.slice(3)], record);

    expect(errors).toContain("session sequence mismatch");
    expect(errors).toContain("session chain mismatch");
  });

  test("a seal that names an event other than the session's last is rejected", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const errors = describeErrors(workspace, sessionId, rows, {
      ...record!,
      session_final_event_hash: rows[0]!.event_hash
    });

    expect(errors).toContain("seal names");
    expect(errors).toContain("but its last event is");
  });

  test("an unsigned seal is rejected", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);
    const { rows, record } = readStored(workspace, sessionId);

    const errors = describeErrors(workspace, sessionId, rows, { ...record!, session_seal_sig: null });

    expect(errors).toContain("seal signature invalid");
  });

  test("the monitor trust-root pin is honoured, so an anchor cannot be minted under a swapped key", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, true);

    expect(() =>
      anchorSessionRoot({
        workspace,
        sessionId,
        options: { expectedMonitorFingerprint: "d".repeat(64) }
      })
    ).toThrow(/monitor key fingerprint mismatch/);
  });
});
