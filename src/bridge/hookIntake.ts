/**
 * Bounded intake accounting for Claude Code hooks (P1-23): fixed-window counters per session, per lease and per
 * workspace, so neither one session, nor many sessions or registrations under one lease, nor many leases together can
 * exceed their cap.
 *
 * - Observations: over any cap, the observation is refused and listed in a signed summary row (count, at most
 *   `summaryIds` tool_use_ids and action ids, and the digest of that list), never dropped silently; the counter that hit
 *   its cap is put under backpressure, and every PreToolUse decision under it is denied until its window passes.
 * - Registrations: counted per lease and per workspace only, never per registration, so churning registrations cannot
 *   reset a counter; over a cap the registration is refused.
 * - Memory: at most `maxEntries` counters, each holding at most `summaryIds` pending ids. The least recently used counter
 *   is evicted only when it holds nothing (no count in its window, no backpressure, nothing pending), so an eviction is
 *   the same as a counter never seen and never turns into an allow; when no counter can be evicted, the request is
 *   refused as over the cap.
 */
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type IntakeLevel = "session" | "lease" | "workspace";
const LEVELS: readonly IntakeLevel[] = ["session", "lease", "workspace"];
export interface IntakeLimits { session?: number; lease?: number; workspace?: number; windowMs: number; maxEntries: number; summaryIds: number }
export interface IntakeScope { workspace: string; lease: string; session: string }
export interface IntakeShed { since: number; count: number; toolUseIds: string[]; actionIds: string[] }
/** Writes one summary row for `shed`, refused at `level`. A writer that throws keeps the shed pending. */
export type IntakeSummaryWriter = (shed: IntakeShed, level: IntakeLevel) => void;
interface Counter { windowStart: number; count: number; backpressure: boolean; shed: IntakeShed | null }

export const OBSERVATION_LIMITS: IntakeLimits = { session: 120, lease: 360, workspace: 1_200, windowMs: 60_000, maxEntries: 4_096, summaryIds: 50 };
export const REGISTRATION_LIMITS: IntakeLimits = { lease: 30, workspace: 60, windowMs: 60_000, maxEntries: 4_096, summaryIds: 0 };

/** The digest a summary row carries of the ids it lists. */
export const shedDigest = (shed: IntakeShed) => sha256Hex(canonicalize({ toolUseIds: shed.toolUseIds, actionIds: shed.actionIds }));

export class IntakeCounters {
  private readonly counters = new Map<string, Counter>();

  constructor(private readonly limits: IntakeLimits) {}

  get size(): number {
    return this.counters.size;
  }

  private levels(): IntakeLevel[] {
    return LEVELS.filter((level) => this.limits[level] !== undefined);
  }

  private key(level: IntakeLevel, scope: IntakeScope): string {
    return level === "workspace" ? `w\0${scope.workspace}` : level === "lease" ? `l\0${scope.workspace}\0${scope.lease}` : `s\0${scope.workspace}\0${scope.session}`;
  }

  /** The counter of `key` in its current window, made most recently used; undefined when there is none. */
  private read(key: string, now: number): Counter | undefined {
    const counter = this.counters.get(key);
    if (!counter) return undefined;
    const rolled = now - counter.windowStart >= this.limits.windowMs ? { ...counter, windowStart: now, count: 0 } : counter;
    this.counters.delete(key);
    this.counters.set(key, rolled);
    return rolled;
  }

  private holdsNothing(counter: Counter, now: number): boolean {
    return !counter.backpressure && counter.shed === null && (counter.count === 0 || now - counter.windowStart >= this.limits.windowMs);
  }

  /** Evict the least recently used counter that holds nothing; false when every counter still holds something. */
  private evictOne(now: number): boolean {
    for (const [key, counter] of this.counters) {
      if (this.holdsNothing(counter, now)) return this.counters.delete(key);
    }
    return false;
  }

  /** The counter of `key`, created if needed; null when the map is full and no counter holding nothing can be evicted. */
  private counter(key: string, now: number): Counter | null {
    const found = this.read(key, now);
    if (found) return found;
    if (this.counters.size >= this.limits.maxEntries && !this.evictOne(now)) return null;
    const fresh: Counter = { windowStart: now, count: 0, backpressure: false, shed: null };
    this.counters.set(key, fresh);
    return fresh;
  }

  /**
   * Count one request at every level; null when admitted. Otherwise nothing is counted and the level that refused it is
   * returned; with `write`, the request is shed: added to the pending summary of the most specific counter there is,
   * which goes under backpressure with the counter that refused, and written at once when it is the first of an episode,
   * when it reaches `summaryIds`, or when no counter can hold it.
   */
  admit(scope: IntakeScope, now: number, write?: IntakeSummaryWriter, ids?: { toolUseId: string; actionId: string }): IntakeLevel | null {
    const rows = this.levels().map((level) => ({ level, key: this.key(level, scope), counter: this.counter(this.key(level, scope), now) }));
    const full = rows.find(({ level, counter }) => counter === null || counter.count >= this.limits[level]!);
    if (!full) {
      for (const row of rows) {
        // A counter admitting again has recovered: what it shed since its last summary row is written first.
        if (row.counter!.shed && write) write(row.counter!.shed, row.level);
        this.counters.set(row.key, { ...row.counter!, count: row.counter!.count + 1, backpressure: false, shed: null });
      }
      return null;
    }
    if (!write) return full.level;
    const holder = rows.find((row) => row.counter !== null) ?? null;
    const previous = holder?.counter?.shed ?? null;
    const shed: IntakeShed = { since: previous?.since ?? now, count: (previous?.count ?? 0) + 1,
      toolUseIds: [...(previous?.toolUseIds ?? []), ...(ids ? [ids.toolUseId] : [])], actionIds: [...(previous?.actionIds ?? []), ...(ids ? [ids.actionId] : [])] };
    for (const row of rows) {
      if (row.counter && (row === holder || row.level === full.level)) this.counters.set(row.key, { ...row.counter, backpressure: true, shed: row === holder ? shed : row.counter.shed });
    }
    if (!holder || previous === null || shed.toolUseIds.length >= this.limits.summaryIds) {
      write(shed, full.level);
      if (holder) this.counters.set(holder.key, { ...this.counters.get(holder.key)!, shed: null });
    }
    return full.level;
  }

  /**
   * The levels whose backpressure denies a decision in `scope` now. A counter under backpressure writes what it shed
   * since its last summary row first, and leaves backpressure once its window has passed.
   */
  backpressure(scope: IntakeScope, now: number, write: IntakeSummaryWriter): IntakeLevel[] {
    const denied: IntakeLevel[] = [];
    for (const level of this.levels()) {
      const key = this.key(level, scope);
      const counter = this.read(key, now);
      if (!counter?.backpressure) continue;
      if (counter.shed) write(counter.shed, level);
      const recovered = counter.count < this.limits[level]!;
      this.counters.set(key, { ...counter, shed: null, backpressure: !recovered });
      if (!recovered) denied.push(level);
    }
    return denied;
  }
}
