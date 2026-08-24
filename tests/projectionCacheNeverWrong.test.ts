import { describe, expect, it } from "vitest";
import { createProjectionRegistry } from "../src/session/projection/projectionRegistry.js";
import { defineProjection } from "../src/session/projection/projectionTypes.js";
import type { ProjectionUnit } from "../src/session/projection/projectionTypes.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { projectSurface, surfaceProjection } from "../src/session/surfaceProjection.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  appendOp,
  appendTo,
  buildLog,
  dropAt,
  NONE_OP,
  recomputeEventHash,
  rewriteSurfaceAt,
  rewriteSurfaceKeepingHash,
  swapAt,
  type EventSpec
} from "./helpers/sessionProjectionFixtures.js";

/**
 * P2.3's load-bearing property: a projection cache is STALE BUT NEVER WRONG,
 * including across a `stateVersion` bump.
 *
 * These tests are written to FAIL if the cache can ever return a value that
 * contradicts the log — not merely one that lags it. The distinction matters
 * because the cheap, obvious cache design (remember the length and the last
 * event's hash) is stale-and-sometimes-wrong: it happily extends a value folded
 * over a prefix that has since been rewritten, reordered, or partly deleted, as
 * long as the row at the remembered position still carries the remembered hash.
 * Every mutation below preserves exactly that appearance, so a registry built on
 * the naive check passes its happy-path tests and fails this file.
 *
 * The reference in every assertion is the from-scratch fold of the CURRENT log.
 * That is the definition of "not wrong": whatever the cache did internally, the
 * value it hands back must be the value a cold fold would produce.
 */

const BASE: readonly EventSpec[] = [
  { eventType: "session/open", surface: NONE_OP },
  { eventType: "system/prompt", surface: appendOp("system", "system", "text", "sha-sys") },
  { eventType: "turn/start", surface: NONE_OP },
  { eventType: "user/message", surface: appendOp("user", "user", "text", "sha-u1") },
  { eventType: "assistant/block", surface: appendOp("assistant:0", "assistant", "text", "sha-a0") },
  { eventType: "tool/call", surface: appendOp("tool_use:c1", "assistant", "tool_use", "sha-tc1") }
];

const NEXT_BLOCK: EventSpec = {
  eventType: "assistant/block",
  surface: appendOp("assistant:1", "assistant", "text", "sha-a1")
};

// A fold whose MEANING depends on its version: v1 records every appended part,
// v2 records only the assistant's. Same key, so a bump must retire v1's cached
// state rather than extend it — which is precisely what "discarded, never
// migrated" has to mean in practice.
function digestUnit(stateVersion: 1 | 2): ProjectionUnit<readonly string[], string> {
  return defineProjection<readonly string[], string>({
    key: "test/surface-digest",
    stateVersion,
    init: () => [],
    apply: (state, event) => {
      const envelope = extractEnvelope(event.meta_json);
      if (envelope === null || envelope.surface.op !== "append") {
        return state;
      }
      if (stateVersion === 2 && envelope.surface.role !== "assistant") {
        return state;
      }
      return [...state, envelope.surface.part.sha256];
    },
    view: (state) => state.join("|")
  });
}

/** The same fold written independently, as the oracle every assertion compares to. */
function digestReference(events: readonly EvidenceEvent[], stateVersion: 1 | 2): string {
  const parts: string[] = [];
  for (const event of events) {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null || envelope.surface.op !== "append") continue;
    if (stateVersion === 2 && envelope.surface.role !== "assistant") continue;
    parts.push(envelope.surface.part.sha256);
  }
  return parts.join("|");
}

describe("stale-but-never-wrong: across a stateVersion bump", () => {
  it("a bumped fold never inherits the previous version's state", () => {
    const registry = createProjectionRegistry();
    const v1 = registry.register(digestUnit(1));
    const events = buildLog(BASE);
    expect(v1.evaluate(events).value).toBe(digestReference(events, 1));

    const v2 = registry.register(digestUnit(2));
    const bumped = v2.evaluate(events);
    expect(bumped.reuse).toBe("rebuilt");
    expect(bumped.eventsFolded).toBe(events.length);
    expect(bumped.value).toBe(digestReference(events, 2));
    // The two really do disagree, or this test would prove nothing.
    expect(digestReference(events, 2)).not.toBe(digestReference(events, 1));
  });

  it("a bumped handle does not hand back the previous version's value from peek", () => {
    const registry = createProjectionRegistry();
    const events = buildLog(BASE);
    registry.register(digestUnit(1)).evaluate(events);
    // peek() is the stale surface; staleness may never cross a version boundary,
    // because a v1 value returned under a v2 handle is wrong AND mistyped.
    expect(registry.register(digestUnit(2)).peek()).toBeNull();
  });

  it("the log advancing AND the version bumping together still yields the cold fold", () => {
    const registry = createProjectionRegistry();
    const before = buildLog(BASE);
    registry.register(digestUnit(1)).evaluate(before);

    const after = appendTo(before, NEXT_BLOCK, 100);
    const bumped = registry.register(digestUnit(2)).evaluate(after);
    // The dangerous shortcut here is "the cached cut is still a valid prefix, so
    // fold only the tail" — valid prefix, wrong state. The version check has to
    // run first.
    expect(bumped.reuse).toBe("rebuilt");
    expect(bumped.eventsFolded).toBe(after.length);
    expect(bumped.value).toBe(digestReference(after, 2));
  });
});

describe("stale-but-never-wrong: a rewritten prefix retires the cache", () => {
  it("an interior rewrite is caught even though the cut's head hash is untouched", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = buildLog(BASE);
    const cached = handle.evaluate(before);

    // Rewrite the user message, then append. Rows after index 3 keep their
    // recorded hashes, so the row at the cached cut's last position still
    // carries the hash the cut remembers.
    const mutated = appendTo(rewriteSurfaceAt(before, 3, appendOp("user", "user", "text", "sha-u1-EDITED")), NEXT_BLOCK, 100);
    expect(mutated[cached.cut.count - 1]?.event_hash).toBe(cached.cut.headEventHash);
    expect(mutated.length).toBeGreaterThan(cached.cut.count);

    const evaluation = handle.evaluate(mutated);
    // A head-hash cache would report "extended" here and return a conversation
    // still containing "sha-u1". The cut digest binds every row in the prefix,
    // so the entry is retired and the fold restarts.
    expect(evaluation.reuse).toBe("rebuilt");
    expect(evaluation.value).toEqual(projectSurface(mutated));
    expect(JSON.stringify(evaluation.value)).toContain("sha-u1-EDITED");
    expect(JSON.stringify(evaluation.value)).not.toContain('"sha-u1"');
  });

  it("a reorder inside the prefix is caught although length and head are unchanged", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = buildLog(BASE);
    const cached = handle.evaluate(before);

    // Swapping the user message with the assistant block keeps the multiset of
    // rows, the length, and the head hash identical — only the ORDER moves, and
    // order is the whole content of a fold.
    const reordered = swapAt(before, 3, 4);
    expect(reordered.length).toBe(cached.cut.count);
    expect(reordered[cached.cut.count - 1]?.event_hash).toBe(cached.cut.headEventHash);

    const evaluation = handle.evaluate(reordered);
    expect(evaluation.reuse).toBe("rebuilt");
    expect(evaluation.value).toEqual(projectSurface(reordered));
    expect(evaluation.value).not.toEqual(projectSurface(before));
  });

  it("a deletion inside the prefix is caught", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = buildLog(BASE);
    handle.evaluate(before);

    const pruned = appendTo(dropAt(before, 3), NEXT_BLOCK, 101);
    const evaluation = handle.evaluate(pruned);
    expect(evaluation.reuse).toBe("rebuilt");
    expect(evaluation.value).toEqual(projectSurface(pruned));
  });

  it("a truncated log is caught", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = buildLog(BASE);
    handle.evaluate(before);

    const truncated = before.slice(0, 3);
    const evaluation = handle.evaluate(truncated);
    expect(evaluation.reuse).toBe("rebuilt");
    expect(evaluation.value).toEqual(projectSurface(truncated));
  });
});

describe("stale-but-never-wrong: the boundary is stated, not assumed", () => {
  it("a row edited without re-hashing is out of the cache's remit and inside the verifier's", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = buildLog(BASE);
    handle.evaluate(before);

    // The cut digest binds each row's `event_hash` — the identity the ledger,
    // the turn seals and the transparency anchors already treat as the row's
    // content digest. A row whose stored hash no longer covers its contents is
    // not a log the cache is asked to be correct over; it is a tampered row.
    const tampered = rewriteSurfaceKeepingHash(before, 3, appendOp("user", "user", "text", "sha-forged"));
    expect(handle.evaluate(tampered).reuse).toBe("unchanged");

    // And it does not escape: the ledger's own event-hash recomputation — the
    // check verifyLedgerIntegrity runs on every row — rejects it.
    const row = tampered[3];
    expect(row).toBeDefined();
    if (row !== undefined) {
      expect(recomputeEventHash(row)).not.toBe(row.event_hash);
    }
    // The untampered log still verifies, so the assertion above is about the
    // edit and not about the fixture's hashing.
    for (const original of before) {
      expect(recomputeEventHash(original)).toBe(original.event_hash);
    }
  });
});

// Deterministic LCG: a seeded sequence so a failure is reproducible from the
// seed alone. Randomised only to reach op orderings nobody thought to enumerate.
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("stale-but-never-wrong: under arbitrary log edits", () => {
  it("evaluate always equals the cold fold, and peek is always a genuine prefix fold", () => {
    const random = makeRandom(0x5eed_1234);
    const registry = createProjectionRegistry();
    let surface = registry.register(surfaceProjection);
    let digestVersion: 1 | 2 = 1;
    let digest = registry.register(digestUnit(digestVersion));

    let events = buildLog(BASE);
    let uid = 1_000;
    surface.evaluate(events);
    digest.evaluate(events);

    for (let round = 0; round < 200; round += 1) {
      // The log as the cache last saw it. Everything below edits `events` away
      // from this, which opens the stale window the next assertions inspect.
      const logAsCached = events;
      const roll = random();
      const interior = events.length > 2 ? 1 + Math.floor(random() * (events.length - 2)) : 0;

      if (roll < 0.3) {
        uid += 1;
        events = appendTo(
          events,
          random() < 0.5
            ? NEXT_BLOCK
            : { eventType: "step/end", surface: NONE_OP },
          uid
        );
      } else if (roll < 0.45 && events.length > 2) {
        events = rewriteSurfaceAt(events, interior, appendOp(`slot-${uid}`, "user", "text", `sha-r${round}`));
      } else if (roll < 0.6 && events.length > 3) {
        events = swapAt(events, interior, Math.max(1, interior - 1));
      } else if (roll < 0.7 && events.length > 2) {
        events = dropAt(events, interior);
      } else if (roll < 0.78) {
        events = events.slice(0, Math.max(1, Math.floor(events.length * random())));
      } else if (roll < 0.84) {
        digestVersion = digestVersion === 1 ? 2 : 1;
        digest = registry.register(digestUnit(digestVersion));
      } else if (roll < 0.88) {
        registry.invalidate();
        surface = registry.register(surfaceProjection);
      }

      // The STALE half, checked in the window where the log has moved and
      // nothing has been re-evaluated. peek() may lag — but the value it holds
      // must be the fold of the prefix its cut names, of the log that produced
      // it. An earlier genuine state, never an invented one.
      const stale = surface.peek();
      if (stale !== null) {
        expect(stale.cut.count, `round ${round} stale cut`).toBe(logAsCached.length);
        expect(stale.value, `round ${round} stale value`).toEqual(
          projectSurface(logAsCached.slice(0, stale.cut.count))
        );
      }

      // The NEVER-WRONG half, asserted every round: whatever the cache did
      // internally, the value it returns is the value a cold fold of the
      // CURRENT log produces.
      const surfaceEvaluation = surface.evaluate(events);
      expect(surfaceEvaluation.value, `round ${round}`).toEqual(projectSurface(events));
      const digestEvaluation = digest.evaluate(events);
      expect(digestEvaluation.value, `round ${round}`).toBe(digestReference(events, digestVersion));
    }
  });
});
