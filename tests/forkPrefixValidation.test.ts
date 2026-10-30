import { describe, expect, test } from "vitest";
import { selectForkPrefix } from "../src/session/forkConversation.js";
import { SESSION_GENESIS } from "../src/session/sessionTypes.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";

type Boundary = readonly ["turn/start" | "turn/end" | "turn/seal", number, number?];

/** Pure selector inputs only; cryptographic authentication belongs to its caller. */
function history(boundaries: readonly Boundary[]): EvidenceEvent[] {
  const definitions: readonly (readonly [EvidenceEvent["event_type"], number | null, number | null])[] = [
    ["session/open", null, null], ...boundaries.map(([type, turn, metaTurn]) => [type, turn, metaTurn ?? turn] as const)
  ];
  return definitions.map(([event_type, turn, metaTurn], seq) => ({
    id: `boundary-${seq}`, ts: seq, session_id: "pure-parent", runtime: "amc", event_type,
    payload_path: null, payload_inline: null, payload_sha256: sha256Hex(""),
    prev_event_hash: seq === 0 ? "GENESIS" : sha256Hex(`boundary-${seq - 1}`), event_hash: sha256Hex(`boundary-${seq}`),
    writer_sig: "pure-selector-fixture", meta_json: JSON.stringify({ turn: metaTurn,
      ...(event_type === "turn/end" ? { reason: "complete", cancelCause: null, recovery: null } : {}),
      amcSession: { v: 1, sessionId: "pure-parent", seq,
        prevSessionEventHash: seq === 0 ? SESSION_GENESIS : sha256Hex(`boundary-${seq - 1}`),
        turn, step: null, surface: { op: "none" }, synthetic: false } })
  }));
}

describe("fork prefix lifecycle validation", () => {
  test("accepts complete sequential turns and an exact earlier inclusive cutoff", () => {
    const rows = history([["turn/start", 1], ["turn/end", 1], ["turn/seal", 1], ["turn/start", 2], ["turn/end", 2], ["turn/seal", 2]]);
    expect(selectForkPrefix(rows).forkTurn).toBe(2);
    expect(selectForkPrefix(rows, 1)).toEqual({ rows: rows.slice(0, 4), forkTurn: 1 });
    expect(selectForkPrefix(rows, 0)).toEqual({ rows: rows.slice(0, 1), forkTurn: 0 });
  });

  test("invalid selectors and missing requested turns produce explicit refusals", () => {
    const rows = history([["turn/start", 1], ["turn/end", 1], ["turn/seal", 1]]);
    for (const turn of [-1, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() => selectForkPrefix(rows, turn)).toThrow("Fork turn must be a nonnegative safe integer");
    }
    expect(() => selectForkPrefix(rows, 99)).toThrow("Fork turn must identify one complete sealed parent turn");
  });

  test("a seal without an explicit turn ending cannot establish a completed fork turn", () => {
    expect(() => selectForkPrefix(history([["turn/start", 1], ["turn/seal", 1]]))).toThrow();
  });

  test("a later complete turn cannot hide an overlapping unfinished earlier turn", () => {
    expect(() => selectForkPrefix(history([["turn/start", 1], ["turn/start", 2], ["turn/end", 2], ["turn/seal", 2]]))).toThrow();
  });

  test("rejects skipped, backward and duplicate turn identities", () => {
    for (const turns of [[1, 3], [2, 1], [1, 1]]) {
      const rows = history(turns.flatMap(turn => [["turn/start", turn], ["turn/end", turn], ["turn/seal", turn]] as const));
      expect(() => selectForkPrefix(rows)).toThrow();
    }
  });

  test("rejects a wrong or duplicate ending and a foreign seal inside the selected turn", () => {
    for (const definitions of [
      [["turn/start", 1], ["turn/end", 2], ["turn/seal", 1]],
      [["turn/start", 1], ["turn/end", 1], ["turn/end", 1], ["turn/seal", 1]],
      [["turn/start", 1], ["turn/end", 1], ["turn/seal", 2], ["turn/seal", 1]]
    ] as const) expect(() => selectForkPrefix(history(definitions))).toThrow();
  });

  test("requires boundary metadata and envelope turn identities to agree", () => {
    for (const index of [0, 1, 2]) {
      const definitions: Boundary[] = [["turn/start", 1], ["turn/end", 1], ["turn/seal", 1]];
      const [type, turn] = definitions[index]!; definitions[index] = [type, turn, 2];
      expect(() => selectForkPrefix(history(definitions))).toThrow();
    }
  });
});
