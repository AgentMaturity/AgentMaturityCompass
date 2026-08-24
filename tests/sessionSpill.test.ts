import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import {
  inspectSpilledEvent,
  retrieveSpilledContent,
  verifySpilledContent
} from "../src/session/spill/spillEvidence.js";
import { readSpilled, resolveSpillPath, spillRoot } from "../src/session/spill/spillStore.js";
import {
  extractSpillRef,
  resolveSpillPolicyConfig,
  type SpillRef
} from "../src/session/spill/spillTypes.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * P2.3 stage 3 — spill.
 *
 * The property under test is not "large output gets truncated". It is that
 * truncating it opens no unsigned side-channel: the bytes leave the ledger, the
 * COMMITMENT to those bytes does not. Every test below is written so that
 * removing a check makes it red — the happy-path assertions are paired with a
 * mutation that must be caught, and the two tampering tests attack the two
 * halves separately (change the file, and change the row that describes it).
 */
const PASS = "session-spill-test-passphrase";

// Small enough that the tests are fast, large enough that a preview is visibly
// a preview. The policy validates head+tail < threshold, so these must too.
const SPILL_CONFIG = { maxInlineBytes: 1_024, previewHeadBytes: 96, previewTailBytes: 48 };

/** ~8 KiB of distinguishable, non-repeating text — well over the threshold. */
function bigOutput(): string {
  const lines: string[] = [];
  for (let index = 0; index < 400; index += 1) {
    lines.push(`line ${index}: ${"x".repeat(10)} unique-${index * 7919}`);
  }
  return lines.join("\n");
}

describe("spill — oversized tool output leaves the ledger, its commitment does not", () => {
  let dir: string;
  let priorPass: string | undefined;

  beforeEach(() => {
    priorPass = process.env["AMC_VAULT_PASSPHRASE"];
    process.env["AMC_VAULT_PASSPHRASE"] = PASS;
    dir = mkdtempSync(join(tmpdir(), "amc-spill-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (priorPass === undefined) {
      delete process.env["AMC_VAULT_PASSPHRASE"];
    } else {
      process.env["AMC_VAULT_PASSPHRASE"] = priorPass;
    }
  });

  /** One turn, one tool call, one result of the caller's choosing. */
  function runSessionWith(content: string): string {
    const service = new SessionService(dir, undefined, SPILL_CONFIG);
    service.open({
      sessionId: "spill-session",
      agentId: "default",
      harnessVersion: "2.3.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    service.startTurn({ trigger: "user" });
    service.startStep();
    service.recordToolCall({
      toolCallId: "call-1",
      toolName: "grep",
      dispatch: "native",
      parentToken: null,
      args: JSON.stringify({ pattern: "x" })
    });
    service.recordToolResult({
      toolCallId: "call-1",
      outcome: "OK",
      exitCode: 0,
      timedOut: false,
      denied: false,
      content
    });
    service.endStep({
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 10, cacheRead: 0, cacheWrite: 0 }
    });
    service.endTurn({ reason: "complete", interrupted: false });
    service.sealTurn();
    service.close({ reason: "done" });
    return service.sessionId;
  }

  function allEvents(): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents();
    } finally {
      ledger.close();
    }
  }

  function toolResultEvent(): EvidenceEvent {
    const event = allEvents().find((row) => row.event_type === "tool/result");
    expect(event, "the session recorded a tool/result row").toBeDefined();
    return event!;
  }

  /** The bytes the model actually read: the event's payload. */
  function payloadBytes(event: EvidenceEvent): Buffer {
    const path = event.canonical_payload_path ?? event.payload_path;
    expect(path, "session content is blob-backed, never inline").not.toBeNull();
    return loadBlobPlaintext(dir, path!).bytes;
  }

  function spillRef(event: EvidenceEvent): SpillRef {
    const ref = extractSpillRef(event.meta_json);
    expect(ref, "the tool/result row carries a spill ref").not.toBeNull();
    return ref!;
  }

  /** Raw DB handle with the immutability triggers dropped — an attacker's view. */
  function openRaw(): Database.Database {
    const db = new Database(join(dir, ".amc", "evidence.sqlite"));
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    return db;
  }

  it("leaves an under-threshold result completely alone", () => {
    runSessionWith("small output\n");

    const event = toolResultEvent();
    const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
    expect(meta.spilled, "nothing spilled, so the ref is null and not an empty object").toBeNull();
    expect(payloadBytes(event).toString("utf8")).toBe("small output\n");
    // A row that did not spill is not a retrieval candidate, and says so rather
    // than reporting a missing file.
    expect(inspectSpilledEvent(dir, event).status).toBe("not-spilled");
  });

  it("spills an oversized result: the model reads a preview, the event commits to the full bytes", async () => {
    const full = bigOutput();
    const fullBytes = Buffer.from(full, "utf8");
    const sessionId = runSessionWith(full);

    const event = toolResultEvent();
    const ref = spillRef(event);

    // The commitment is over the FULL output, not the preview.
    expect(ref.contentSha256).toBe(sha256Hex(fullBytes));
    expect(ref.bytes).toBe(fullBytes.byteLength);
    expect(ref.locator).not.toBeNull();
    expect(ref.unretrievable).toBeNull();
    expect(ref.maxInlineBytes).toBe(SPILL_CONFIG.maxInlineBytes);

    // What the model read is a preview: far smaller, and NOT the full output.
    const preview = payloadBytes(event);
    expect(preview.byteLength).toBeLessThan(fullBytes.byteLength);
    expect(preview.byteLength).toBeLessThan(SPILL_CONFIG.maxInlineBytes);
    expect(preview.equals(fullBytes)).toBe(false);
    // …and it tells the reader where the rest went and what it hashes to.
    const previewText = preview.toString("utf8");
    expect(previewText).toContain(ref.locator!);
    expect(previewText).toContain(ref.contentSha256);
    expect(previewText).toContain(String(fullBytes.byteLength));
    // Head and tail both survive the cut, so the preview is a window and not a
    // truncation.
    expect(previewText).toContain("line 0:");
    expect(previewText).toContain("line 399:");

    // model-visible ⟺ logged: the payload the model read is the row's own hash.
    expect(sha256Hex(preview)).toBe(event.payload_sha256);

    // And the whole workspace still verifies, under the ADR-0007 anchor: spill
    // must not cost the chain, the seal, or the trust root.
    const fingerprint = sha256Hex(
      Buffer.from(loadMonitorPub(), "utf8")
    );
    const verdict = await verifyLedgerIntegrity(dir, { expectedMonitorFingerprint: fingerprint });
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.trustRoot.anchored).toBe(true);
    expect(verdict.sessions.closed).toContain(sessionId);
  });

  it("retrieves the exact original bytes through the locator", () => {
    const full = bigOutput();
    runSessionWith(full);

    const event = toolResultEvent();
    const retrieved = retrieveSpilledContent(dir, event);
    expect(retrieved.equals(Buffer.from(full, "utf8"))).toBe(true);
    expect(sha256Hex(retrieved)).toBe(spillRef(event).contentSha256);

    // The sweep agrees, and counts the row it checked (a sweep that checked
    // nothing would also report ok).
    const sweep = verifySpilledContent(dir, allEvents());
    expect(sweep.ok, sweep.errors.join("; ")).toBe(true);
    expect(sweep.checked).toBe(1);
    expect(sweep.missing).toEqual([]);
  });

  it("keeps the spill directory 0700 and the object 0600", () => {
    runSessionWith(bigOutput());
    const ref = spillRef(toolResultEvent());
    const path = resolveSpillPath(dir, ref.locator!);
    expect(path).not.toBeNull();

    expect(statSync(path!).mode & 0o777).toBe(0o600);
    expect(statSync(join(spillRoot(dir), `session-${sha256Hex("spill-session")}`)).mode & 0o777).toBe(0o700);
  });

  // ---- negative: the file is attacked -------------------------------------

  it("detects a tampered spill file whose length is unchanged", () => {
    const full = bigOutput();
    runSessionWith(full);

    const event = toolResultEvent();
    const ref = spillRef(event);
    const path = resolveSpillPath(dir, ref.locator!)!;

    // Same byte count, one character different: the size check cannot catch
    // this, so only the hash comparison can.
    const tampered = Buffer.from(full.replace("unique-0", "unique-X"), "utf8");
    expect(tampered.byteLength).toBe(ref.bytes);
    writeFileSync(path, tampered);

    const inspected = inspectSpilledEvent(dir, event);
    expect(inspected.status).toBe("tampered");
    expect(inspected.detail).toContain("the signed event committed to");
    expect(() => retrieveSpilledContent(dir, event)).toThrow(/tampered/);

    const sweep = verifySpilledContent(dir, allEvents());
    expect(sweep.ok).toBe(false);
    expect(sweep.errors.join("; ")).toContain(event.id);
  });

  it("detects a spill file that grew, without reading it", () => {
    runSessionWith(bigOutput());
    const event = toolResultEvent();
    const ref = spillRef(event);
    writeFileSync(resolveSpillPath(dir, ref.locator!)!, Buffer.alloc(ref.bytes + 1, 0x41));

    const inspected = inspectSpilledEvent(dir, event);
    expect(inspected.status).toBe("tampered");
    expect(inspected.detail).toContain(`the signed event committed to ${ref.bytes}`);
  });

  it("reports a deleted spill object as missing, not as tampering", () => {
    runSessionWith(bigOutput());
    const event = toolResultEvent();
    unlinkSync(resolveSpillPath(dir, spillRef(event).locator!)!);

    expect(inspectSpilledEvent(dir, event).status).toBe("missing");
    // Deletion is a legitimate retention outcome, so the sweep records it
    // without calling the evidence broken — but it does record it.
    const sweep = verifySpilledContent(dir, allEvents());
    expect(sweep.ok).toBe(true);
    expect(sweep.missing.join("; ")).toContain(event.id);
  });

  // ---- negative: the signed row is attacked -------------------------------

  it("refuses retrieval when the commitment itself was edited to match a swapped file", () => {
    const full = bigOutput();
    runSessionWith(full);

    const event = toolResultEvent();
    const ref = spillRef(event);
    const path = resolveSpillPath(dir, ref.locator!)!;

    // The strongest attack available to someone with workspace write access:
    // replace the spilled output AND rewrite the row's commitment so the two
    // agree. It fails not because the file mismatches — it matches perfectly —
    // but because meta_json is inside event_hash, which is what was signed.
    const swapped = Buffer.from("attacker-supplied output\n", "utf8");
    writeFileSync(path, swapped);
    const forgedMeta = JSON.parse(event.meta_json) as Record<string, unknown>;
    forgedMeta.spilled = { ...ref, contentSha256: sha256Hex(swapped), bytes: swapped.byteLength };
    const db = openRaw();
    db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(
      JSON.stringify(forgedMeta),
      event.id
    );
    db.close();

    const forgedEvent = toolResultEvent();
    // The file now matches the ref it carries…
    expect(readSpilled(dir, extractSpillRef(forgedEvent.meta_json)!).status).toBe("ok");
    // …and retrieval still refuses, because the ref is not the one that was signed.
    const inspected = inspectSpilledEvent(dir, forgedEvent);
    expect(inspected.status).toBe("row-unauthentic");
    expect(inspected.detail).toContain("event_hash mismatch");
    expect(() => retrieveSpilledContent(dir, forgedEvent)).toThrow(/row-unauthentic/);
    expect(verifySpilledContent(dir, allEvents()).ok).toBe(false);
  });

  it("refuses retrieval when the commitment was edited and the event_hash recomputed to match", () => {
    const full = bigOutput();
    runSessionWith(full);

    const event = toolResultEvent();
    const ref = spillRef(event);
    const path = resolveSpillPath(dir, ref.locator!)!;

    // One rung above the previous attack: the attacker knows meta_json is inside
    // event_hash, so it edits the commitment AND recomputes the hash correctly.
    // Everything is now self-consistent — file, ref, and event_hash all agree.
    // The only thing it cannot produce is a monitor signature over the new hash,
    // which is precisely what writer_sig is for. Without that check this row
    // would hand back attacker-supplied bytes.
    const swapped = Buffer.from("attacker-supplied output\n", "utf8");
    writeFileSync(path, swapped);
    const forgedMeta = JSON.parse(event.meta_json) as Record<string, unknown>;
    forgedMeta.spilled = { ...ref, contentSha256: sha256Hex(swapped), bytes: swapped.byteLength };
    const forgedMetaJson = JSON.stringify(forgedMeta);
    const forgedHash = sha256Hex(
      `${event.prev_event_hash}${canonicalMetadataForHash({
        id: event.id,
        ts: event.ts,
        sessionId: event.session_id,
        runtime: event.runtime,
        eventType: event.event_type,
        payloadPath: event.canonical_payload_path ?? event.payload_path,
        payloadInline: event.canonical_payload_inline ?? event.payload_inline,
        metaJson: forgedMetaJson
      })}${event.payload_sha256}`
    );
    const db = openRaw();
    db.prepare("UPDATE evidence_events SET meta_json = ?, event_hash = ? WHERE id = ?").run(
      forgedMetaJson,
      forgedHash,
      event.id
    );
    db.close();

    const forgedEvent = toolResultEvent();
    // The forgery is internally perfect: hash recomputes, file matches the ref.
    expect(forgedEvent.event_hash).toBe(forgedHash);
    expect(readSpilled(dir, extractSpillRef(forgedEvent.meta_json)!).status).toBe("ok");
    // And it is still refused, on the signature alone.
    const inspected = inspectSpilledEvent(dir, forgedEvent);
    expect(inspected.status).toBe("row-unauthentic");
    expect(inspected.detail).toContain("writer signature invalid");
    expect(() => retrieveSpilledContent(dir, forgedEvent)).toThrow(/writer signature invalid/);
  });

  it("does not follow a symlink planted in place of a spill object", () => {
    const full = bigOutput();
    runSessionWith(full);

    const event = toolResultEvent();
    const path = resolveSpillPath(dir, spillRef(event).locator!)!;

    // Swap the object for a link to bytes that hash correctly. Reading through
    // it would "succeed" — which is why the read requires a regular file rather
    // than trusting a name inside a directory an attacker can write to.
    const decoy = join(dir, "decoy.txt");
    writeFileSync(decoy, full);
    unlinkSync(path);
    symlinkSync(decoy, path);

    const inspected = inspectSpilledEvent(dir, event);
    expect(inspected.status).toBe("tampered");
    expect(inspected.detail).toContain("not a regular file");
  });

  it("refuses retrieval when the row was re-signed with a substituted monitor key", () => {
    runSessionWith(bigOutput());
    const event = toolResultEvent();

    // Pin the workspace to a fingerprint that is not its own: the ADR-0007
    // anchor. Retrieval must fail closed rather than hand back bytes on the
    // strength of a signature by a key nobody vouched for.
    const inspected = inspectSpilledEvent(dir, event, { expectedMonitorFingerprint: sha256Hex("some-other-key") });
    expect(inspected.status).toBe("row-unauthentic");
    expect(inspected.detail).toContain("trust root");
    // Sanity: the same row retrieves fine under the workspace's real anchor, so
    // the failure above is the anchor working and not a broken row.
    expect(
      inspectSpilledEvent(dir, event, {
        expectedMonitorFingerprint: sha256Hex(Buffer.from(loadMonitorPub(), "utf8"))
      }).status
    ).toBe("ok");
  });

  // ---- negative: the locator is attacked ----------------------------------

  it("rejects a locator that tries to name a path outside the session directory", () => {
    runSessionWith(bigOutput());
    const ref = spillRef(toolResultEvent());

    const hostile = [
      "amc-spill:v1:../../../../etc:passwd",
      `amc-spill:v1:${"a".repeat(64)}:../../../../etc/passwd`,
      `amc-spill:v1:${"a".repeat(64)}:${"0".repeat(32)}-../escape`,
      `amc-spill:v1:${"a".repeat(64)}:/etc/passwd`,
      "amc-spill:v1:not-a-hash:object",
      "/etc/passwd"
    ];
    for (const locator of hostile) {
      expect(resolveSpillPath(dir, locator), locator).toBeNull();
      expect(readSpilled(dir, { ...ref, locator }).status, locator).toBe("invalid-locator");
    }
  });

  // ---- negative: the store itself fails -----------------------------------

  it("degrades honestly when the spill store cannot write: no locator, but still a commitment", async () => {
    // Occupy the spill root with a regular file so creating the session
    // directory fails. Chosen over chmod because it fails for root too.
    writeFileSync(spillRoot(dir), "not a directory\n");

    const full = bigOutput();
    const sessionId = runSessionWith(full);

    const event = toolResultEvent();
    const ref = spillRef(event);
    expect(ref.locator).toBeNull();
    expect(ref.unretrievable).toContain("spill store write failed");
    // The output is gone, but what it WAS is still provable from the signed row.
    expect(ref.contentSha256).toBe(sha256Hex(Buffer.from(full, "utf8")));
    expect(ref.bytes).toBe(Buffer.byteLength(full, "utf8"));
    // The model was told, in the preview it read, that the bytes are not there.
    expect(payloadBytes(event).toString("utf8")).toContain("full output NOT retained");

    expect(inspectSpilledEvent(dir, event).status).toBe("unretrievable");
    const sweep = verifySpilledContent(dir, allEvents());
    expect(sweep.ok, "an unretrievable spill is a gap, not a forgery").toBe(true);
    expect(sweep.missing.join("; ")).toContain(event.id);

    // A tool call whose output could not be spilled is still a recorded,
    // verifiable outcome — the failure did not cost the event.
    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.chain.ok, verdict.chain.errors.join("; ")).toBe(true);
    expect(verdict.sessions.closed).toContain(sessionId);
  });

  it("refuses a policy whose preview budget would not shrink anything", () => {
    expect(() => resolveSpillPolicyConfig({ maxInlineBytes: 100, previewHeadBytes: 80, previewTailBytes: 40 })).toThrow(
      /must be smaller than maxInlineBytes/
    );
    expect(() => resolveSpillPolicyConfig({ maxInlineBytes: 0 })).toThrow(/positive integer/);
    expect(() => resolveSpillPolicyConfig({ retrievalHint: "  " })).toThrow(/non-empty/);
  });

  /** The same file the verifier fingerprints, so both anchored tests agree. */
  function loadMonitorPub(): string {
    return readFileSync(join(dir, ".amc", "keys", "monitor_ed25519.pub"), "utf8");
  }
});
