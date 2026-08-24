import { describe, expect, it } from "vitest";
import { createProjectionRegistry } from "../src/session/projection/projectionRegistry.js";
import { defineProjection } from "../src/session/projection/projectionTypes.js";
import { projectSurface, surfaceProjection } from "../src/session/surfaceProjection.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  appendOp,
  buildLog,
  NONE_OP,
  type EventSpec
} from "./helpers/sessionProjectionFixtures.js";

/**
 * P2.3 projection registry — the mechanism.
 *
 * The registry's correctness property (a cached value is stale but never wrong)
 * lives in projectionCacheNeverWrong.test.ts. This file asserts the machinery
 * that property is built on and that consumers depend on: that a cache hit
 * really skips the fold, that `Object.is` gating hands back the SAME value
 * reference when nothing moved, that the change feed fires only on a real
 * change, and that two folds can never share a cache slot.
 */

// A second, deliberately trivial unit. Its state is a number, so `Object.is`
// gating is unambiguous: an irrelevant event leaves state identical and `view`
// is never called, which is exactly the contract units are asked to honour.
const assistantBlocks = defineProjection<number, { readonly blocks: number }>({
  key: "test/assistant-blocks",
  stateVersion: 1,
  init: () => 0,
  apply: (state, event) => (event.event_type === "assistant/block" ? state + 1 : state),
  view: (state) => ({ blocks: state })
});

const OPENING: readonly EventSpec[] = [
  { eventType: "session/open", surface: NONE_OP },
  { eventType: "system/prompt", surface: appendOp("system", "system", "text", "sha-sys") },
  { eventType: "turn/start", surface: NONE_OP },
  { eventType: "user/message", surface: appendOp("user", "user", "text", "sha-u1") },
  { eventType: "assistant/block", surface: appendOp("assistant:0", "assistant", "text", "sha-a0") }
];

const CONTROL_TAIL: EventSpec = { eventType: "step/end", surface: NONE_OP };
const CONTENT_TAIL: EventSpec = {
  eventType: "assistant/block",
  surface: appendOp("assistant:1", "assistant", "text", "sha-a1")
};

function log(extra: readonly EventSpec[] = []): readonly EvidenceEvent[] {
  return buildLog([...OPENING, ...extra]);
}

describe("projection registry: registration is the cache key", () => {
  it("re-registering the identical unit is idempotent", () => {
    const registry = createProjectionRegistry();
    const first = registry.register(surfaceProjection);
    const second = registry.register(surfaceProjection);
    expect(registry.keys()).toEqual([surfaceProjection.key]);
    first.evaluate(log());
    // The second handle reads the first's cache, because it is the same unit.
    expect(second.evaluate(log()).reuse).toBe("unchanged");
  });

  it("refuses a different fold under a taken key at the same stateVersion", () => {
    const registry = createProjectionRegistry();
    registry.register(surfaceProjection);
    const impostor = defineProjection<number, number>({
      key: surfaceProjection.key,
      stateVersion: surfaceProjection.stateVersion,
      init: () => 0,
      apply: (state) => state + 1,
      view: (state) => state
    });
    // Fail closed: sharing a slot is the one registration mistake that yields a
    // wrong value rather than a slow one, so it is rejected up front.
    expect(() => registry.register(impostor)).toThrow(/already registered by a different unit/);
  });

  it("rejects a malformed unit at definition, not at first use", () => {
    expect(() =>
      defineProjection({ key: "  ", stateVersion: 1, init: () => 0, apply: (s) => s, view: (s) => s })
    ).toThrow(/non-empty/);
    expect(() =>
      defineProjection({ key: "k", stateVersion: 0, init: () => 0, apply: (s) => s, view: (s) => s })
    ).toThrow(/stateVersion/);
  });
});

describe("projection registry: folding and caching", () => {
  it("a cold evaluation equals the direct fold", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const events = log();
    const evaluation = handle.evaluate(events);
    expect(evaluation.value).toEqual(projectSurface(events));
    expect(evaluation.reuse).toBe("cold");
    expect(evaluation.eventsFolded).toBe(events.length);
    expect(evaluation.cut.count).toBe(events.length);
    expect(evaluation.cut.headEventHash).toBe(events[events.length - 1]?.event_hash);
  });

  it("re-evaluating an unchanged log folds nothing and returns the same reference", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const events = log();
    const first = handle.evaluate(events);
    const second = handle.evaluate(events);
    expect(second.reuse).toBe("unchanged");
    expect(second.eventsFolded).toBe(0);
    expect(second.changed).toBe(false);
    // Object.is, not toEqual: downstream consumers gate on reference identity.
    expect(second.value).toBe(first.value);
  });

  it("an appended event extends the fold instead of restarting it", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = log();
    handle.evaluate(before);
    const after = log([CONTENT_TAIL]);
    const extended = handle.evaluate(after);
    expect(extended.reuse).toBe("extended");
    // Only the tail was applied — the proof the cache short-circuits at all.
    expect(extended.eventsFolded).toBe(1);
    expect(extended.changed).toBe(true);
    expect(extended.value).toEqual(projectSurface(after));
  });

  it("an appended event that changes nothing does not churn the value", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = log();
    const first = handle.evaluate(before);
    const after = log([CONTROL_TAIL]);
    const second = handle.evaluate(after);
    // The row was folded (the cut advanced) but the fold state did not move, so
    // `view` was never re-derived and the consumer sees the identical value.
    expect(second.eventsFolded).toBe(1);
    expect(second.cut.count).toBe(before.length + 1);
    expect(second.changed).toBe(false);
    expect(second.value).toBe(first.value);
  });

  it("invalidate drops the cached state and the next evaluation refolds", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const events = log();
    handle.evaluate(events);
    registry.invalidate(surfaceProjection.key);
    const refolded = handle.evaluate(events);
    expect(refolded.reuse).toBe("cold");
    expect(refolded.eventsFolded).toBe(events.length);
    expect(refolded.value).toEqual(projectSurface(events));
  });
});

describe("projection registry: peek is the stale surface", () => {
  it("is null before anything is computed", () => {
    const registry = createProjectionRegistry();
    expect(registry.register(surfaceProjection).peek()).toBeNull();
  });

  it("lags the log until evaluate, and says how far it lags", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const before = log();
    const computed = handle.evaluate(before);
    const after = log([CONTENT_TAIL]);

    const stale = handle.peek();
    expect(stale?.value).toBe(computed.value);
    expect(stale?.cut.count).toBe(before.length);
    // Stale, and provably so: the cut names a shorter prefix than the log has,
    // and the value is the fold of exactly that prefix — an earlier genuine
    // state of the log, never a state the log never had.
    expect(stale?.value).toEqual(projectSurface(after.slice(0, stale?.cut.count ?? 0)));
    expect(handle.evaluate(after).value).toEqual(projectSurface(after));
  });
});

describe("projection registry: change feed", () => {
  it("fires only when the value moves, and stops on unsubscribe", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    const seen: number[] = [];
    const unsubscribe = handle.subscribe((evaluation) => seen.push(evaluation.cut.count));

    const before = log();
    handle.evaluate(before);
    expect(seen).toEqual([before.length]);

    // Same log: no change, no notification.
    handle.evaluate(before);
    expect(seen).toEqual([before.length]);

    // A control row advances the cut but not the value: still no notification.
    handle.evaluate(log([CONTROL_TAIL]));
    expect(seen).toEqual([before.length]);

    handle.evaluate(log([CONTROL_TAIL, CONTENT_TAIL]));
    expect(seen).toEqual([before.length, before.length + 2]);

    unsubscribe();
    handle.evaluate(log([CONTROL_TAIL, CONTENT_TAIL, CONTENT_TAIL]));
    expect(seen).toEqual([before.length, before.length + 2]);
  });

  it("a throwing listener is neither swallowed nor allowed to starve the others", () => {
    const registry = createProjectionRegistry();
    const handle = registry.register(surfaceProjection);
    let reached = false;
    handle.subscribe(() => {
      throw new Error("subscriber exploded");
    });
    handle.subscribe(() => {
      reached = true;
    });
    expect(() => handle.evaluate(log())).toThrow(/1 listener\(s\) threw/);
    expect(reached).toBe(true);
    // The evaluation still committed: a broken subscriber must not corrupt the
    // cache, or the next read would silently refold and hide the failure.
    expect(handle.peek()?.cut.count).toBe(OPENING.length);
  });
});

describe("projection registry: snapshot is one consistent cut", () => {
  it("folds every unit over the same log and reports one cut", () => {
    const registry = createProjectionRegistry();
    registry.register(surfaceProjection);
    registry.register(assistantBlocks);
    const events = log([CONTENT_TAIL]);

    const snapshot = registry.snapshot(events);
    expect([...snapshot.values.keys()]).toEqual([surfaceProjection.key, assistantBlocks.key]);
    for (const evaluation of snapshot.values.values()) {
      expect(evaluation.cut).toEqual(snapshot.cut);
    }
    expect(snapshot.values.get(surfaceProjection.key)?.value).toEqual(projectSurface(events));
    expect(snapshot.values.get(assistantBlocks.key)?.value).toEqual({ blocks: 2 });
  });

  it("gates each unit independently", () => {
    const registry = createProjectionRegistry();
    const surface = registry.register(surfaceProjection);
    const blocks = registry.register(assistantBlocks);
    registry.snapshot(log());

    // A user message moves the surface but not the assistant-block count.
    const after = log([
      { eventType: "user/message", surface: appendOp("user", "user", "text", "sha-u2") }
    ]);
    const snapshot = registry.snapshot(after);
    expect(snapshot.values.get(surfaceProjection.key)?.changed).toBe(true);
    expect(snapshot.values.get(assistantBlocks.key)?.changed).toBe(false);
    expect(blocks.peek()?.value).toBe(snapshot.values.get(assistantBlocks.key)?.value);
    expect(surface.peek()?.value).toEqual(projectSurface(after));
  });
});
