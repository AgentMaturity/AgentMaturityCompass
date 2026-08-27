import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { verifySessionChains } from "../src/ledger/sessionVerification.js";
import { openLedger } from "../src/ledger/ledger.js";

/**
 * Compaction shrinks what the model sees, never what the log says (plan P6.3).
 *
 * The surface-op vocabulary has had `replace` and `retract` since it was
 * written, and `surfaceProjection.ts` has handled both -- and nothing in src/
 * ever emitted one. This is the producer.
 *
 * The property the plan names is "shrinks the surface without rewriting the
 * signed log", and it falls straight out of the design: the log is append-only
 * and hash-chained, so a compaction is a NEW row whose surface op happens to
 * replace an older slot. The projection gets smaller; the chain only grows. An
 * auditor replaying the log sees everything that was ever said; the model does
 * not.
 */
const PASS = "compaction-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-compact-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function openSession(dir: string): SessionService {
  const session = new SessionService(dir);
  session.open({
    agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p"
  });
  return session;
}

/** A turn with one tool call whose result is large. */
function turnWithToolResult(session: SessionService, callId: string, output: string): void {
  session.startTurn({ trigger: "user" });
  session.recordUserMessage("do the thing");
  session.startStep();
  session.recordToolCall({
    toolCallId: callId, toolName: "fs.read", dispatch: "native", parentToken: null, args: "{}"
  });
  session.recordToolResult({
    toolCallId: callId, outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: output
  });
  session.endStep({ stopReason: "tool_use", usage: null });
  session.endTurn({ reason: "complete" });
}

const rowCount = (dir: string, sessionId: string): number => {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT COUNT(*) n FROM evidence_events WHERE session_id = ?")
      .get(sessionId) as { n: number }).n;
  } finally {
    db.close();
  }
};

/**
 * The sha the surface currently points at for one slot's part.
 *
 * `ConversationHistory` carries part REFERENCES -- `{kind, sha256}` -- and never
 * content, so its serialized size is the same whether a tool result was four
 * bytes or four thousand. An earlier version of these tests measured that JSON's
 * length as a proxy for context size and could never have failed. What
 * compaction actually changes is WHICH BYTES request derivation resolves, and
 * that is the sha below.
 */
function toolPartSha(session: SessionService): string | undefined {
  for (const message of session.projectHistory()) {
    for (const part of message.parts) {
      if (part.kind === "tool_result") return part.sha256;
    }
  }
  return undefined;
}

describe("a compaction replaces a tool result on the surface", () => {
  it("shrinks the projection", () => {
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "x".repeat(4_000));

    const before = toolPartSha(session);
    session.compactToolResult({
      toolCallId: "call-1",
      replacement: "[compacted: 4000 bytes of fs.read output]",
      replacedBytes: 4_000,
      reason: "context pressure"
    });
    const after = toolPartSha(session);

    expect(before, "a tool result was on the surface").toBeDefined();
    expect(after, "the slot now points at different bytes").not.toBe(before);
    expect(after, "specifically, at the replacement")
      .toBe(createHash("sha256").update("[compacted: 4000 bytes of fs.read output]").digest("hex"));
    session.close({ reason: "completed" });
  });

  it("grows the log rather than editing it", () => {
    // THE property. Compaction is an append like everything else; the row that
    // carried the original output is still there, unchanged.
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "y".repeat(2_000));
    const sessionId = session.sessionId;
    const rowsBefore = rowCount(dir, sessionId);

    session.compactToolResult({
      toolCallId: "call-1",
      replacement: "[compacted]",
      replacedBytes: 4_000,
      reason: "context pressure"
    });
    session.close({ reason: "completed" });

    expect(rowCount(dir, sessionId), "one more row, none removed")
      .toBe(rowsBefore + 2); // the compaction, and session/close
  });

  it("leaves the per-session hash chain intact", () => {
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "z".repeat(1_000));
    session.compactToolResult({ toolCallId: "call-1", replacement: "[compacted]", replacedBytes: 1_000, reason: "pressure" });
    session.close({ reason: "completed" });

    const errors: string[] = [];
    const ledger = openLedger(dir);
    try {
      verifySessionChains(ledger, errors);
    } finally {
      ledger.close();
    }

    expect(errors, "a compacted session still verifies").toEqual([]);
  });

  it("puts the replacement text on the surface, and it is a logged row", () => {
    // The invariant SurfacePartRef documents: a projected part's sha256 IS some
    // row's payload_sha256. So the replacement the model reads has to be this
    // event's own payload -- it cannot be a string that exists only in the
    // projection.
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "original output here");

    session.compactToolResult({
      toolCallId: "call-1",
      replacement: "[compacted: 20 bytes]",
      replacedBytes: 4_000,
      reason: "pressure"
    });

    // The surface now points at THIS event's payload, which is the invariant
    // SurfacePartRef states: a projected part's sha256 is some row's
    // payload_sha256, so the replacement cannot be text that lives only in the
    // projection.
    const sha = toolPartSha(session);
    const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
    const row = db.prepare("SELECT event_type FROM evidence_events WHERE payload_sha256 = ?")
      .get(sha) as { event_type: string };
    db.close();

    // Asserted on the ROW, not on `payload_inline`: session payloads are
    // blob-backed, so `payload_inline` is null even for a two-byte row. What the
    // invariant actually claims is that the projected sha IS some logged row's
    // payload_sha256 -- and here that row is the compaction itself.
    expect(row.event_type, "the surface points at the compaction row").toBe("loop/compact");
    expect(sha, "and at exactly the replacement's bytes")
      .toBe(createHash("sha256").update("[compacted: 20 bytes]").digest("hex"));
    session.close({ reason: "completed" });
  });
});

describe("compaction refuses what it cannot do honestly", () => {
  it("refuses a tool result that was never recorded", () => {
    // `replace` on an absent slot is a silent no-op in the projection, so
    // without this the caller would be told a compaction happened and the model
    // would see no change.
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "output");

    expect(() => session.compactToolResult({
      toolCallId: "call-does-not-exist",
      replacement: "[compacted]",
      replacedBytes: 4_000,
      reason: "pressure"
    })).toThrow(/call-does-not-exist/);
    session.close({ reason: "completed" });
  });

  it("refuses a replacement that is not smaller", () => {
    // Compaction that grows the surface is not compaction. Allowing it would let
    // a caller spend a signed row and a context window to make things worse.
    const dir = workspace();
    const session = openSession(dir);
    turnWithToolResult(session, "call-1", "tiny");

    expect(() => session.compactToolResult({
      toolCallId: "call-1",
      replacement: "a much longer replacement than the original ever was",
      replacedBytes: 4,
      reason: "pressure"
    })).toThrow(/smaller|larger/i);
    session.close({ reason: "completed" });
  });
});
