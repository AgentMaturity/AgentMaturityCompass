import { describe, expect, it } from "vitest";
import { projectSurface } from "../src/session/surfaceProjection.js";
import type { ConversationHistory } from "../src/session/surfaceProjection.js";
import {
  embedEnvelope,
  SESSION_GENESIS
} from "../src/session/sessionTypes.js";
import type {
  SessionEnvelope,
  SurfaceKind,
  SurfaceOp,
  SurfaceRole
} from "../src/session/sessionTypes.js";
import type { EvidenceEvent, EvidenceEventType } from "../src/types.js";

/**
 * P2.2 surface projection. projectSurface folds the ordered session events'
 * surface ops into the model-visible conversation. Two properties are asserted:
 * the fold is pure (identical events -> byte-identical history) and a known
 * small event sequence yields the expected role-grouped conversation. Every
 * SurfacePartRef.sha256 in the output is the payload_sha256 of exactly one
 * logged row here (the "model-visible ⊆ logged" invariant), so the fixtures set
 * part.sha256 equal to each event's payload_sha256.
 */

let seq = 0;

// Build one session EvidenceEvent whose meta_json embeds an envelope carrying
// `surface`. Only the fields projectSurface reads (meta_json) are load-bearing;
// the rest are filled with deterministic placeholders so no clock or randomness
// leaks into the fixture.
function sessionEvent(
  eventType: EvidenceEventType,
  surface: SurfaceOp,
  payloadSha256: string
): EvidenceEvent {
  const currentSeq = seq;
  seq += 1;
  const envelope: SessionEnvelope = {
    v: 1,
    sessionId: "sess-fixture",
    seq: currentSeq,
    prevSessionEventHash: currentSeq === 0 ? SESSION_GENESIS : `hash-${currentSeq - 1}`,
    turn: null,
    step: null,
    surface,
    synthetic: false
  };
  const meta = embedEnvelope({}, envelope);
  return {
    id: `evt-${currentSeq}`,
    ts: 1_700_000_000_000 + currentSeq,
    session_id: "sess-fixture",
    runtime: "claude",
    event_type: eventType,
    payload_path: null,
    payload_inline: null,
    payload_sha256: payloadSha256,
    meta_json: JSON.stringify(meta),
    prev_event_hash: currentSeq === 0 ? "GENESIS" : `chain-${currentSeq - 1}`,
    event_hash: `chain-${currentSeq}`,
    writer_sig: "sig"
  };
}

function appendOp(
  slot: string,
  role: SurfaceRole,
  kind: SurfaceKind,
  sha256: string
): SurfaceOp {
  return { op: "append", slot, role, part: { kind, sha256 } };
}

// A realistic two-turn conversation, mirroring the slots SessionService emits:
// system/prompt -> slot "system"; user/message -> slot "user"; assistant/block
// -> slot "assistant:<i>"; tool/call -> "tool_use:<id>"; tool/result ->
// "tool_result:<id>"; control events -> op "none". The recurring "user" slot in
// turn two must NOT collapse onto turn one's user message.
function conversationFixture(): readonly EvidenceEvent[] {
  seq = 0;
  return [
    sessionEvent("session/open", { op: "none" }, "sha-open"),
    sessionEvent("system/prompt", appendOp("system", "system", "text", "sha-sys"), "sha-sys"),
    sessionEvent("turn/start", { op: "none" }, "sha-t1start"),
    sessionEvent("user/message", appendOp("user", "user", "text", "sha-u1"), "sha-u1"),
    sessionEvent("step/start", { op: "none" }, "sha-s1start"),
    sessionEvent("assistant/block", appendOp("assistant:0", "assistant", "text", "sha-a0"), "sha-a0"),
    sessionEvent("assistant/block", appendOp("assistant:1", "assistant", "thinking", "sha-a1"), "sha-a1"),
    sessionEvent(
      "tool/call",
      appendOp("tool_use:call-1", "assistant", "tool_use", "sha-tc1"),
      "sha-tc1"
    ),
    sessionEvent(
      "tool/result",
      appendOp("tool_result:call-1", "tool", "tool_result", "sha-tr1"),
      "sha-tr1"
    ),
    sessionEvent("step/end", { op: "none" }, "sha-s1end"),
    sessionEvent("turn/end", { op: "none" }, "sha-t1end"),
    sessionEvent("turn/seal", { op: "none" }, "sha-t1seal"),
    // Turn two: the "user" slot recurs and must open a NEW user message.
    sessionEvent("turn/start", { op: "none" }, "sha-t2start"),
    sessionEvent("user/message", appendOp("user", "user", "text", "sha-u2"), "sha-u2"),
    sessionEvent("assistant/block", appendOp("assistant:0", "assistant", "text", "sha-a2"), "sha-a2")
  ];
}

describe("projectSurface determinism", () => {
  it("projects the same event list to a byte-identical history twice", () => {
    const events = conversationFixture();
    const first = projectSurface(events);
    const second = projectSurface(events);
    expect(second).toEqual(first);
    // Structural sharing is irrelevant; equal JSON proves byte-for-byte parity.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("is independent of the array object identity for equal input", () => {
    const a = projectSurface(conversationFixture());
    const b = projectSurface(conversationFixture());
    expect(b).toEqual(a);
  });
});

describe("projectSurface conversation shape", () => {
  it("yields the expected role-grouped conversation for a known sequence", () => {
    const expected: ConversationHistory = [
      { role: "system", parts: [{ kind: "text", sha256: "sha-sys" }] },
      { role: "user", parts: [{ kind: "text", sha256: "sha-u1" }] },
      {
        role: "assistant",
        parts: [
          { kind: "text", sha256: "sha-a0" },
          { kind: "thinking", sha256: "sha-a1" },
          { kind: "tool_use", sha256: "sha-tc1" }
        ]
      },
      { role: "tool", parts: [{ kind: "tool_result", sha256: "sha-tr1" }] },
      { role: "user", parts: [{ kind: "text", sha256: "sha-u2" }] },
      { role: "assistant", parts: [{ kind: "text", sha256: "sha-a2" }] }
    ];
    expect(projectSurface(conversationFixture())).toEqual(expected);
  });

  it("coalesces consecutive assistant blocks and splits on role change", () => {
    const history = projectSurface(conversationFixture());
    expect(history.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "user",
      "assistant"
    ]);
    // The recurring "user" slot produced two distinct user messages, not one.
    expect(history.filter((message) => message.role === "user")).toHaveLength(2);
  });

  it("ignores rows without a session envelope", () => {
    seq = 0;
    const nonSpine: EvidenceEvent = {
      id: "plain",
      ts: 1,
      session_id: "sess-fixture",
      runtime: "claude",
      event_type: "audit",
      payload_path: null,
      payload_inline: null,
      payload_sha256: "sha-plain",
      meta_json: JSON.stringify({ note: "not a spine row" }),
      prev_event_hash: "x",
      event_hash: "y",
      writer_sig: "sig"
    };
    const withPrompt = sessionEvent(
      "system/prompt",
      appendOp("system", "system", "text", "sha-sys"),
      "sha-sys"
    );
    expect(projectSurface([nonSpine, withPrompt])).toEqual([
      { role: "system", parts: [{ kind: "text", sha256: "sha-sys" }] }
    ]);
  });

  it("applies replace to the slot's live part and retract to remove it", () => {
    seq = 0;
    const events: readonly EvidenceEvent[] = [
      sessionEvent(
        "tool/result",
        appendOp("tool_result:call-9", "tool", "tool_result", "sha-raw"),
        "sha-raw"
      ),
      // Redaction: a new event replaces the slot's visible part with redacted
      // bytes that are themselves this row's payload.
      sessionEvent(
        "tool/result",
        { op: "replace", slot: "tool_result:call-9", part: { kind: "tool_result", sha256: "sha-redacted" } },
        "sha-redacted"
      )
    ];
    expect(projectSurface(events)).toEqual([
      { role: "tool", parts: [{ kind: "tool_result", sha256: "sha-redacted" }] }
    ]);

    seq = 0;
    const retracted: readonly EvidenceEvent[] = [
      sessionEvent("user/message", appendOp("user", "user", "text", "sha-u"), "sha-u"),
      sessionEvent(
        "assistant/block",
        appendOp("assistant:0", "assistant", "text", "sha-a"),
        "sha-a"
      ),
      sessionEvent(
        "assistant/block",
        { op: "retract", slot: "assistant:0", reason: "superseded" },
        "sha-noop"
      )
    ];
    expect(projectSurface(retracted)).toEqual([
      { role: "user", parts: [{ kind: "text", sha256: "sha-u" }] }
    ]);
  });

  it("returns an empty history for control-only or empty input", () => {
    expect(projectSurface([])).toEqual([]);
    seq = 0;
    const controlOnly = [
      sessionEvent("session/open", { op: "none" }, "sha-open"),
      sessionEvent("turn/start", { op: "none" }, "sha-start"),
      sessionEvent("turn/seal", { op: "none" }, "sha-seal")
    ];
    expect(projectSurface(controlOnly)).toEqual([]);
  });
});

describe("projectSurface is a real fold, not an order-independent passthrough", () => {
  it("produces a DIFFERENT conversation when the events are reordered", () => {
    // The determinism tests above project the same ordering twice — necessary
    // but not sufficient: a function that ignored order would also pass them.
    // A genuine fold must be sensitive to sequence, or "derived from the log in
    // order" is an empty claim. Reversing a multi-message conversation must not
    // yield the same history.
    const events = conversationFixture();
    const forward = projectSurface(events);
    const reversed = projectSurface([...events].reverse());
    expect(forward.length).toBeGreaterThan(1);
    expect(JSON.stringify(reversed)).not.toBe(JSON.stringify(forward));
  });
});
