/**
 * P1-23 review (resource-cap defeat): the intake caps hold per session, per lease and per workspace, churning sessions
 * or leases cannot reset or exceed them, memory stays bounded, and evicting a counter never turns into an allow.
 */
import { describe, expect, test } from "vitest";
import { IntakeCounters, shedDigest, type IntakeShed } from "../src/bridge/hookIntake.js";

const scope = (lease: string, session: string) => ({ workspace: "/ws", lease, session });
function rows() {
  const written: Array<{ shed: IntakeShed; level: string }> = [];
  return { written, write: (shed: IntakeShed, level: string) => { written.push({ shed, level }); } };
}

describe("caps that churn cannot defeat", () => {
  test("many sessions or registrations from one lease cannot exceed the per-lease cap", () => {
    const counters = new IntakeCounters({ session: 5, lease: 20, workspace: 1_000, windowMs: 60_000, maxEntries: 4_096, summaryIds: 50 });
    const { written, write } = rows();
    let admitted = 0;
    for (let i = 0; i < 200; i += 1) if (counters.admit(scope("lease-a", `session-${i}`), 1_000, write, { toolUseId: `t${i}`, actionId: `a${i}` }) === null) admitted += 1;
    expect(admitted).toBe(20);
    expect(counters.backpressure(scope("lease-a", "a-fresh-session"), 1_001, write)).toEqual(["lease"]);
    expect(counters.backpressure(scope("lease-b", "other"), 1_001, write)).toEqual([]);
    expect(counters.admit(scope("lease-b", "other"), 1_001, write)).toBeNull();
    expect(written.reduce((total, row) => total + row.shed.count, 0)).toBe(180);
    // Registrations are counted per lease and per workspace only.
    const registrations = new IntakeCounters({ lease: 3, workspace: 5, windowMs: 60_000, maxEntries: 4_096, summaryIds: 0 });
    const accepted = Array.from({ length: 10 }, (_, i) => registrations.admit(scope("lease-a", `registration-${i}`), 1_000)).filter((level) => level === null);
    expect(accepted).toHaveLength(3);
  });

  test("many leases cannot exceed the workspace ceiling, which denies every decision in it until its window passes", () => {
    const counters = new IntakeCounters({ session: 5, lease: 20, workspace: 100, windowMs: 60_000, maxEntries: 4_096, summaryIds: 50 });
    const { write } = rows();
    let admitted = 0;
    for (let lease = 0; lease < 50; lease += 1) {
      for (let session = 0; session < 5; session += 1) if (counters.admit(scope(`lease-${lease}`, `s-${lease}-${session}`), 1_000, write) === null) admitted += 1;
    }
    expect(admitted).toBe(100);
    expect(counters.backpressure(scope("lease-new", "s-new"), 1_001, write)).toEqual(["workspace"]);
    expect(counters.backpressure(scope("lease-new", "s-new"), 61_001, write)).toEqual([]);
  });

  test("memory stays bounded under a 100k-id flood, and every refused id is written in a bounded summary row", () => {
    const limits = { session: 5, lease: 50, workspace: 200, windowMs: 60_000, maxEntries: 1_000, summaryIds: 10 };
    const counters = new IntakeCounters(limits);
    const { written, write } = rows();
    let refused = 0;
    for (let i = 0; i < 100_000; i += 1) {
      if (counters.admit(scope(`lease-${i % 100}`, `session-${i}`), 1_000, write, { toolUseId: `toolu_${i}`, actionId: `cc.${i}` }) !== null) refused += 1;
      expect(counters.size).toBeLessThanOrEqual(limits.maxEntries);
    }
    expect(refused).toBe(100_000 - 200);
    expect(written.every((row) => row.shed.toolUseIds.length <= limits.summaryIds && row.shed.actionIds.length === row.shed.toolUseIds.length)).toBe(true);
    // What is not yet written is pending in counters under backpressure (bounded): drain them as decisions would.
    for (let lease = 0; lease < 100; lease += 1) counters.backpressure(scope(`lease-${lease}`, "drain"), 1_001, write);
    expect(written.reduce((total, row) => total + row.shed.count, 0)).toBe(refused);
    expect(new Set(written.flatMap((row) => row.shed.toolUseIds)).size).toBe(refused);
    expect(shedDigest(written[0]!.shed)).toMatch(/^[a-f0-9]{64}$/);
  });

  test("evictions do not create allows", () => {
    const counters = new IntakeCounters({ session: 2, lease: 1_000, workspace: 1_000, windowMs: 60_000, maxEntries: 12, summaryIds: 50 });
    const { write } = rows();
    const flooded = ["s0", "s1", "s2", "s3", "s4"];
    for (const session of flooded) for (let i = 0; i < 3; i += 1) counters.admit(scope("lease", session), 1_000, write);
    for (let i = 0; i < 1_000; i += 1) counters.admit(scope("lease", `churn-${i}`), 1_000, write);
    for (const session of flooded) {
      expect(counters.backpressure(scope("lease", session), 1_001, write)).toEqual(["session"]);
      expect(counters.admit(scope("lease", session), 1_001, write)).toBe("session");
    }
    // Once no counter can be evicted, a new session is refused, never admitted.
    expect(counters.size).toBeLessThanOrEqual(12);
    expect(counters.admit(scope("lease", "one-more"), 1_002, write)).not.toBeNull();
  });

  test("a refusal episode writes its first refusal, then rows of up to summaryIds; a new episode starts a new row", () => {
    const counters = new IntakeCounters({ session: 2, lease: 360, workspace: 1_200, windowMs: 60_000, maxEntries: 4_096, summaryIds: 50 });
    const { written, write } = rows();
    const scope1 = scope("lease", "s");
    for (let i = 0; i < 100; i += 1) counters.admit(scope1, 1_000 + i, write, { toolUseId: `t${i}`, actionId: `a${i}` });
    expect(written.length).toBe(2);
    expect(written.map((row) => row.shed.toolUseIds.length)).toEqual([1, 50]);
    counters.backpressure(scope1, 1_200, write);
    expect(written.reduce((total, row) => total + row.shed.count, 0)).toBe(98);
    // The window passes: the session admits again, then a new flood is a new episode with its own first row.
    for (let i = 0; i < 3; i += 1) counters.admit(scope1, 70_000 + i, write, { toolUseId: `n${i}`, actionId: `b${i}` });
    expect(written.at(-1)!.shed.toolUseIds).toEqual(["n2"]);
  });
});

