/**
 * The projection registry (plan P2.3).
 *
 * Domains register pure folds; the registry drives them over the event log,
 * caches the result, gates the change feed on `Object.is`, and — the point of
 * the whole module — guarantees that a cached value is STALE BUT NEVER WRONG.
 *
 * The two halves of that phrase are separate promises:
 *
 *   STALE is allowed. `peek()` returns the last computed value without touching
 *   the log, so it can lag behind rows appended since. Its `cut` says exactly
 *   how far behind: the value is the fold of THAT prefix, and that prefix really
 *   occurred. A lagging value describes an earlier, genuine state of the log.
 *
 *   WRONG is not. `evaluate()` never returns a value that contradicts the log it
 *   was given. A cached value is reused only after its cut is re-proved against
 *   the live rows (see ./projectionCut.ts), so an append EXTENDS the fold while
 *   a truncation, reorder, deletion or rewrite RETIRES the entry and the fold
 *   restarts from `init()`. A `stateVersion` bump retires it the same way: the
 *   old state is discarded, never migrated onto the new meaning.
 *
 * Everything here is synchronous, matching the session store: a projection that
 * resolved later than the log advanced would reintroduce exactly the race the
 * synchronous store exists to prevent.
 */
import type { EvidenceEvent } from "../../types.js";
import { cutAt, PROJECTION_EMPTY_CUT, prefixDigestAt } from "./projectionCut.js";
import type {
  ProjectionCut,
  ProjectionEvaluation,
  ProjectionReuse,
  ProjectionUnit
} from "./projectionTypes.js";

export type ProjectionListener<TValue> = (evaluation: ProjectionEvaluation<TValue>) => void;

/** A registered unit, bound to its registry and typed in its own value. */
export interface ProjectionHandle<TValue> {
  readonly key: string;
  readonly stateVersion: number;

  /** Fold `events`, reusing the cached prefix when it is still provably valid. */
  evaluate(events: readonly EvidenceEvent[]): ProjectionEvaluation<TValue>;

  /**
   * The last computed evaluation without consulting the log — possibly stale,
   * never wrong (see the module header). Null when nothing has been computed at
   * this unit's `stateVersion`, so a handle for a bumped version never hands
   * back the previous version's value under the new type.
   */
  peek(): ProjectionEvaluation<TValue> | null;

  /** Subscribe to the change feed. Fires only when `Object.is` says the value moved. */
  subscribe(listener: ProjectionListener<TValue>): () => void;
}

/**
 * Every registered projection folded over the SAME log, so all values describe
 * one consistent cut rather than a mixture of moments.
 */
export interface ProjectionSnapshot {
  readonly cut: ProjectionCut;
  readonly values: ReadonlyMap<string, ProjectionEvaluation<unknown>>;
}

// State is held beside the evaluation rather than inside it: `state` is the
// fold's private intermediate (a consumer must not reach into it), while the
// evaluation is what callers see. Both are replaced atomically per evaluate.
interface ProjectionCacheEntry {
  readonly state: unknown;
  readonly evaluation: ProjectionEvaluation<unknown>;
}

export class ProjectionRegistry {
  private readonly units = new Map<string, ProjectionUnit<unknown, unknown>>();

  private readonly cache = new Map<string, ProjectionCacheEntry>();

  private readonly listeners = new Map<string, Set<ProjectionListener<unknown>>>();

  /**
   * Register a fold and get a typed handle.
   *
   * Re-registering the identical unit is idempotent. Registering a DIFFERENT
   * fold under a key already taken at the same `stateVersion` throws: the two
   * would share a cache slot, and the second would silently inherit the first's
   * state. That is the one registration mistake that produces a wrong value
   * rather than a slow one, so it fails closed. Registering under an existing
   * key with a different `stateVersion` is the supported way to change a fold's
   * meaning — the cached entry is not deleted here, it is retired on the next
   * evaluate, which keeps the previous value available for change gating.
   */
  register<TState, TValue>(unit: ProjectionUnit<TState, TValue>): ProjectionHandle<TValue> {
    const existing = this.units.get(unit.key);
    if (existing !== undefined && (existing as unknown) !== (unit as unknown)) {
      if (existing.stateVersion === unit.stateVersion) {
        throw new Error(
          `projection key "${unit.key}" is already registered by a different unit at ` +
            `stateVersion ${unit.stateVersion}; bump stateVersion or reuse the registered unit`
        );
      }
    }
    this.units.set(unit.key, unit as ProjectionUnit<unknown, unknown>);
    return {
      key: unit.key,
      stateVersion: unit.stateVersion,
      evaluate: (events) => this.evaluateUnit(unit, events),
      peek: () => this.peekUnit(unit),
      subscribe: (listener) => this.subscribeUnit(unit.key, listener)
    };
  }

  has(key: string): boolean {
    return this.units.has(key);
  }

  /** Registered keys in registration order — deterministic, unlike object keys. */
  keys(): readonly string[] {
    return [...this.units.keys()];
  }

  /**
   * Fold every registered unit over one log. All units share the end digest, so
   * a snapshot costs one digest pass rather than one per unit, and every
   * returned cut is identical by construction.
   */
  snapshot(events: readonly EvidenceEvent[]): ProjectionSnapshot {
    const endDigest = prefixDigestAt(events, events.length);
    const values = new Map<string, ProjectionEvaluation<unknown>>();
    for (const unit of this.units.values()) {
      values.set(unit.key, this.evaluateUnit(unit, events, endDigest));
    }
    return { cut: cutAt(events, events.length, endDigest), values };
  }

  /**
   * Drop cached state (one key, or all). The next evaluate re-folds from
   * `init()`. Correctness never depends on this — it exists for a caller that
   * knows it is now pointing at an unrelated log and would rather not pay the
   * digest comparison to discover it.
   */
  invalidate(key?: string): void {
    if (key === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(key);
  }

  private evaluateUnit<TState, TValue>(
    unit: ProjectionUnit<TState, TValue>,
    events: readonly EvidenceEvent[],
    endDigestHint?: string
  ): ProjectionEvaluation<TValue> {
    const previous = this.cache.get(unit.key);
    const resumable = this.resumableEntry(unit.stateVersion, previous, events);

    const startCount = resumable === null ? 0 : resumable.evaluation.cut.count;
    // The cast is sound because `register` guarantees one unit per key, so only
    // this unit can have written this slot, and `resumableEntry` has already
    // rejected any entry left by an earlier stateVersion of it.
    const startState = resumable === null ? unit.init() : (resumable.state as TState);

    let state = startState;
    for (let index = startCount; index < events.length; index += 1) {
      const event = events[index];
      if (event === undefined) {
        throw new Error(`projection ${unit.key}: no event at index ${index}`);
      }
      state = unit.apply(state, event);
    }

    // Object.is gating, at its source: when no applied event moved the fold
    // state, `view` is not called at all and the PREVIOUS value reference is
    // handed back. Downstream consumers can then skip work on a reference
    // comparison — which is the whole point, since most rows change nothing.
    const value: TValue =
      resumable !== null && Object.is(state, resumable.state)
        ? (resumable.evaluation.value as TValue)
        : unit.view(state);

    const endDigest = this.endDigestFor(events, resumable, startCount, endDigestHint);
    const evaluation: ProjectionEvaluation<TValue> = {
      key: unit.key,
      stateVersion: unit.stateVersion,
      value,
      cut: cutAt(events, events.length, endDigest),
      changed: previous === undefined || !Object.is(previous.evaluation.value, value),
      reuse: classifyReuse(previous, resumable, startCount, events.length),
      eventsFolded: events.length - startCount
    };

    this.cache.set(unit.key, {
      state,
      evaluation: evaluation as ProjectionEvaluation<unknown>
    });
    if (evaluation.changed) {
      this.notify(unit.key, evaluation as ProjectionEvaluation<unknown>);
    }
    return evaluation;
  }

  /**
   * The cached entry, if and only if it may be extended onto `events`.
   *
   * Each rejection below is a case where reusing the entry would return a value
   * that contradicts the log, so each one is a correctness gate, not a heuristic.
   */
  private resumableEntry(
    stateVersion: number,
    previous: ProjectionCacheEntry | undefined,
    events: readonly EvidenceEvent[]
  ): ProjectionCacheEntry | null {
    if (previous === undefined) {
      return null;
    }
    // The fold's meaning changed. A state computed under the old meaning is not
    // a state of the new fold at all, so it is discarded rather than migrated.
    if (previous.evaluation.stateVersion !== stateVersion) {
      return null;
    }
    const cut = previous.evaluation.cut;
    // The log is shorter than the cut: rows were removed, so the cut is not a
    // prefix of this log and no amount of appending will make it one. This also
    // keeps the digest call below well-defined — it refuses to digest a prefix
    // the log does not have rather than quietly digesting a shorter one.
    if (cut.count > events.length) {
      return null;
    }
    // The decisive check. The cut binds the identity AND order of every event it
    // covers, so this rejects an in-place rewrite or a reorder inside the
    // prefix — the cases a head-hash comparison would wave through.
    if (prefixDigestAt(events, cut.count) !== cut.prefixDigest) {
      return null;
    }
    return previous;
  }

  private endDigestFor(
    events: readonly EvidenceEvent[],
    resumable: ProjectionCacheEntry | null,
    startCount: number,
    endDigestHint: string | undefined
  ): string {
    if (endDigestHint !== undefined) {
      return endDigestHint;
    }
    // A full cache hit already proved the digest at `startCount`, and
    // `startCount === events.length` means that IS the end digest — so the
    // common "nothing changed" call costs exactly one digest pass, not two.
    if (resumable !== null && startCount === events.length) {
      return resumable.evaluation.cut.prefixDigest;
    }
    if (events.length === 0) {
      return PROJECTION_EMPTY_CUT.prefixDigest;
    }
    return prefixDigestAt(events, events.length);
  }

  private peekUnit<TState, TValue>(
    unit: ProjectionUnit<TState, TValue>
  ): ProjectionEvaluation<TValue> | null {
    const entry = this.cache.get(unit.key);
    if (entry === undefined || entry.evaluation.stateVersion !== unit.stateVersion) {
      return null;
    }
    return entry.evaluation as ProjectionEvaluation<TValue>;
  }

  private subscribeUnit<TValue>(key: string, listener: ProjectionListener<TValue>): () => void {
    // Erased at the boundary rather than cast as a function type: only this
    // key's evaluations are ever passed in, so narrowing the argument is sound
    // where making the listener bivariant would not be.
    const erased: ProjectionListener<unknown> = (evaluation) => {
      listener(evaluation as ProjectionEvaluation<TValue>);
    };
    const existing = this.listeners.get(key) ?? new Set<ProjectionListener<unknown>>();
    existing.add(erased);
    this.listeners.set(key, existing);
    return () => {
      existing.delete(erased);
    };
  }

  /**
   * Deliver to every listener, then rethrow. One broken subscriber must not
   * starve the others (a silently dropped change feed is how a UI goes stale
   * without anyone noticing), and it must not be swallowed either.
   */
  private notify(key: string, evaluation: ProjectionEvaluation<unknown>): void {
    const subscribers = this.listeners.get(key);
    if (subscribers === undefined || subscribers.size === 0) {
      return;
    }
    const failures: unknown[] = [];
    for (const listener of [...subscribers]) {
      try {
        listener(evaluation);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, `projection ${key}: ${failures.length} listener(s) threw`);
    }
  }
}

function classifyReuse(
  previous: ProjectionCacheEntry | undefined,
  resumable: ProjectionCacheEntry | null,
  startCount: number,
  logLength: number
): ProjectionReuse {
  if (resumable === null) {
    return previous === undefined ? "cold" : "rebuilt";
  }
  return startCount === logLength ? "unchanged" : "extended";
}

export function createProjectionRegistry(): ProjectionRegistry {
  return new ProjectionRegistry();
}
