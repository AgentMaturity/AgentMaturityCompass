import { describe, expect, it } from "vitest";
import { foldSurfaceEntries, projectSurface } from "../src/session/surfaceProjection.js";
import { embedEnvelope, SESSION_GENESIS } from "../src/session/sessionTypes.js";
import type {
  SessionEnvelope,
  SurfaceKind,
  SurfaceOp,
  SurfaceRole
} from "../src/session/sessionTypes.js";
import type { EvidenceEvent, EvidenceEventType } from "../src/types.js";

/**
 * Addressing an OLD surface entry (plan P6.3, compaction half).
 *
 * `replace`/`retract` target a slot NAME, and conversation slot names recur
 * every turn -- `user` for every user message, `assistant:0` for the first block
 * of every response. `lastIndexOfSlot` resolves them to the most recent
 * occurrence, so turn one's user message is unreachable the moment turn two
 * appends its own. That is fine for redaction (which replaces a slot its own
 * append just created) and fatal for compaction, whose whole job is to shrink
 * OLD history.
 *
 * The fix is a second identity on every entry: `originEventId`, the id of the
 * event whose `append` created the position. Event ids are already unique, so
 * this needs no naming convention; and unlike `sourceEventId` it does NOT move
 * when the entry is replaced, so a position stays addressable however many times
 * it is compacted.
 */

// Build one session EvidenceEvent with an explicit id, so a test can name the
// event it later addresses. Only meta_json is load-bearing for the fold; the
// rest are deterministic placeholders.
function sessionEvent(
  id: string,
  seq: number,
  eventType: EvidenceEventType,
  surface: SurfaceOp,
  payloadSha256: string
): EvidenceEvent {
  const envelope: SessionEnvelope = {
    v: 1,
    sessionId: "sess-addressing",
    seq,
    prevSessionEventHash: seq === 0 ? SESSION_GENESIS : `hash-${seq - 1}`,
    turn: null,
    step: null,
    surface,
    synthetic: false
  };
  return {
    id,
    ts: 1_700_000_000_000 + seq,
    session_id: "sess-addressing",
    runtime: "claude",
    event_type: eventType,
    payload_path: null,
    payload_inline: null,
    payload_sha256: payloadSha256,
    meta_json: JSON.stringify(embedEnvelope({}, envelope)),
    prev_event_hash: seq === 0 ? "GENESIS" : `chain-${seq - 1}`,
    event_hash: `chain-${seq}`,
    writer_sig: "sig"
  };
}

function appendOp(slot: string, role: SurfaceRole, kind: SurfaceKind, sha256: string): SurfaceOp {
  return { op: "append", slot, role, part: { kind, sha256 } };
}

/**
 * Two turns, each with a user message and one assistant block -- so BOTH the
 * `user` slot and the `assistant:0` slot recur, exactly as SessionService emits
 * them (`sessionService.ts` uses slot "user" per message and
 * `assistant:${blockIndex}` where blockIndex is a per-RESPONSE dense index).
 */
function twoTurns(): readonly EvidenceEvent[] {
  return [
    sessionEvent("evt-u1", 0, "user/message", appendOp("user", "user", "text", "sha-u1"), "sha-u1"),
    sessionEvent("evt-a1", 1, "assistant/block", appendOp("assistant:0", "assistant", "text", "sha-a1"), "sha-a1"),
    sessionEvent("evt-u2", 2, "user/message", appendOp("user", "user", "text", "sha-u2"), "sha-u2"),
    sessionEvent("evt-a2", 3, "assistant/block", appendOp("assistant:0", "assistant", "text", "sha-a2"), "sha-a2")
  ];
}

describe("every surface entry carries the id of the event that created it", () => {
  it("names the appending event as the entry's origin", () => {
    const entries = foldSurfaceEntries(twoTurns());

    expect(entries.map((entry) => entry.originEventId))
      .toEqual(["evt-u1", "evt-a1", "evt-u2", "evt-a2"]);
  });

  it("gives two entries on the same recurring slot different origins", () => {
    // The whole point: `user` names both, so slot identity cannot tell them
    // apart. Origin can.
    const entries = foldSurfaceEntries(twoTurns());
    const userEntries = entries.filter((entry) => entry.slot === "user");

    expect(userEntries).toHaveLength(2);
    expect(userEntries[0]?.originEventId).not.toBe(userEntries[1]?.originEventId);
  });
});

describe("replace_at reaches an entry that slot-addressing cannot", () => {
  it("replaces the FIRST turn's user message while a second one exists", () => {
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary" } },
        "sha-summary"
      )
    ];

    const shas = foldSurfaceEntries(events).map((entry) => entry.part.sha256);

    expect(shas, "turn one's user message compacted; everything else untouched")
      .toEqual(["sha-summary", "sha-a1", "sha-u2", "sha-a2"]);
  });

  it("leaves slot-addressed replace still targeting the LAST occurrence", () => {
    // The old op keeps its old meaning. This is additive, not a redefinition --
    // redaction relies on `replace` hitting the slot its own append created.
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-redact",
        4,
        "loop/compact",
        { op: "replace", slot: "user", part: { kind: "text", sha256: "sha-redacted" } },
        "sha-redacted"
      )
    ];

    const shas = foldSurfaceEntries(events).map((entry) => entry.part.sha256);

    expect(shas, "the SECOND user message, as before")
      .toEqual(["sha-u1", "sha-a1", "sha-redacted", "sha-a2"]);
  });

  it("keeps the entry's position and role", () => {
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-a1", part: { kind: "text", sha256: "sha-summary" } },
        "sha-summary"
      )
    ];

    const history = projectSurface(events);

    expect(history.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(history[1]?.parts[0]?.sha256).toBe("sha-summary");
  });
});

describe("an origin survives compaction, so a position can be compacted twice", () => {
  it("still addresses the entry after it has already been replaced", () => {
    // If `replace_at` moved the origin to the compaction row, a second pass over
    // the same position would silently no-op -- and a pruner run twice on a long
    // session is the normal case, not the exotic one.
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact-1",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary-1" } },
        "sha-summary-1"
      ),
      sessionEvent(
        "evt-compact-2",
        5,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary-2" } },
        "sha-summary-2"
      )
    ];

    const entries = foldSurfaceEntries(events);

    expect(entries[0]?.part.sha256, "the second compaction landed").toBe("sha-summary-2");
    expect(entries[0]?.originEventId, "and the origin is still the original append").toBe("evt-u1");
  });

  it("moves sourceEventId to the replacing row", () => {
    // Provenance -- which row a reader must consult for this entry's meta and
    // bytes -- follows the content. Request derivation reads the row named here.
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary" } },
        "sha-summary"
      )
    ];

    const entries = foldSurfaceEntries(events);

    expect(entries[0]?.sourceEventId).toBe("evt-compact");
    expect(entries[0]?.originEventId).toBe("evt-u1");
  });
});

describe("retract_at drops one addressed entry", () => {
  it("removes the first turn's assistant block and nothing else", () => {
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-drop",
        4,
        "loop/compact",
        { op: "retract_at", origin: "evt-a1", reason: "pruned" },
        "sha-drop"
      )
    ];

    expect(foldSurfaceEntries(events).map((entry) => entry.part.sha256))
      .toEqual(["sha-u1", "sha-u2", "sha-a2"]);
  });
});

describe("addressing an entry that is not there is a no-op, never an error", () => {
  it("ignores replace_at on an unknown origin", () => {
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-never-appended", part: { kind: "text", sha256: "sha-x" } },
        "sha-x"
      )
    ];

    expect(foldSurfaceEntries(events).map((entry) => entry.part.sha256))
      .toEqual(["sha-u1", "sha-a1", "sha-u2", "sha-a2"]);
  });

  it("ignores replace_at on an origin whose entry was already retracted", () => {
    const events = [
      ...twoTurns(),
      sessionEvent("evt-drop", 4, "loop/compact", { op: "retract_at", origin: "evt-u1", reason: "pruned" }, "sha-d"),
      sessionEvent(
        "evt-compact",
        5,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary" } },
        "sha-summary"
      )
    ];

    expect(foldSurfaceEntries(events).map((entry) => entry.part.sha256))
      .toEqual(["sha-a1", "sha-u2", "sha-a2"]);
  });

  it("ignores retract_at on an unknown origin", () => {
    const events = [
      ...twoTurns(),
      sessionEvent("evt-drop", 4, "loop/compact", { op: "retract_at", origin: "nope", reason: "pruned" }, "sha-d")
    ];

    expect(foldSurfaceEntries(events)).toHaveLength(4);
  });
});

describe("the fold stays deterministic with the new ops", () => {
  it("projects byte-identically across repeated runs", () => {
    const events = [
      ...twoTurns(),
      sessionEvent(
        "evt-compact",
        4,
        "loop/compact",
        { op: "replace_at", origin: "evt-u1", part: { kind: "text", sha256: "sha-summary" } },
        "sha-summary"
      ),
      sessionEvent("evt-drop", 5, "loop/compact", { op: "retract_at", origin: "evt-a1", reason: "pruned" }, "sha-d")
    ];

    expect(JSON.stringify(projectSurface(events))).toBe(JSON.stringify(projectSurface(events)));
  });
});
