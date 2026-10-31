import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { dispatchAlert } from "../src/drift/alerts.js";
import { driftCheckCliAsync } from "../src/drift/driftCli.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { Ledger } from "../src/ledger/ledger.js";
import { ContinuousMonitor } from "../src/watch/continuousMonitor.js";
import { freezeFixture, type FreezeFixture } from "./helpers/freezePublicationFixture.js";
import { spawnOwnedNode } from "./helpers/ownedNodeGroup.js";
import { writeAnchoredRun } from "./helpers/sealedRun.js";

/**
 * Security review 2026-10-31: a drift check whose run history is not whole returned triggered: false with an
 * INSUFFICIENT_EVIDENCE reason, and the monitor and `amc drift check` treated that as a clean non-trigger. Deleting a run
 * file (or holding the ledger open) silenced drift. Now it alerts, is counted, and the CLI exits non-zero.
 */
vi.mock("../src/drift/alerts.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/drift/alerts.js")>()),
  dispatchAlert: vi.fn(async () => undefined)
}));

afterEach(() => {
  vi.mocked(dispatchAlert).mockReset();
  vi.restoreAllMocks();
});

/** Sealed, ledger-anchored runs for `agentId` with these overall levels, oldest first. */
function runs(f: FreezeFixture, agentId: string, levels: number[]): string[] {
  return levels.map((level, index) => writeAnchoredRun(f.workspace, getAgentPaths(f.workspace, agentId).runsDir, {
    runId: `${agentId}-run-${index}`, agentId, ts: index + 1, windowStartTs: 0, windowEndTs: 100, status: "VALID" as const,
    layerScores: [{ layerName: "Skills", avgFinalLevel: level, confidenceWeightedFinalLevel: level }], integrityIndex: 1, correlationRatio: 1 }));
}

const notEvaluatedAlerts = () => vi.mocked(dispatchAlert).mock.calls.filter(([, payload]) => payload.ruleId === "drift-not-evaluated");

describe("drift that cannot be evaluated alerts, never reads as clean", () => {
  test("this agent's deleted run: not evaluated, and the owner is alerted", async () => {
    const f = freezeFixture();
    const files = runs(f, "default", [5, 5, 4]);
    rmSync(files[2]!);
    const result = await driftCheckCliAsync({ workspace: f.workspace, agentId: "default" });
    expect(result.triggered).toBe(false);
    expect(result.reasons[0]).toMatch(/^INSUFFICIENT_EVIDENCE: the ledger records run default-run-2 with no matching run file on disk/);
    expect(notEvaluatedAlerts()).toHaveLength(1);
    expect(notEvaluatedAlerts()[0]![1]).toMatchObject({ type: "AMC_ALERT", agentId: "default", summary: expect.stringContaining("INSUFFICIENT_EVIDENCE") });
  });

  test("an unreadable ledger: not evaluated, and the owner is alerted", async () => {
    const f = freezeFixture();
    runs(f, "default", [5, 4]);
    vi.spyOn(Ledger.prototype, "listRuns").mockImplementation(() => { throw new Error("ledger held open"); });
    const result = await driftCheckCliAsync({ workspace: f.workspace, agentId: "default" });
    expect(result.reasons.join("; ")).toContain("the ledger could not be read to check run history");
    expect(notEvaluatedAlerts()).toHaveLength(1);
  });

  test("another agent's anchored runs on disk leave this agent's drift evaluated, with no alert", async () => {
    const f = freezeFixture();
    runs(f, "default", [5, 5]);
    runs(f, "agent-b", [5, 4]);
    const result = await driftCheckCliAsync({ workspace: f.workspace, agentId: "default" });
    expect(result.reasons.filter((reason) => reason.startsWith("INSUFFICIENT_EVIDENCE"))).toEqual([]);
    expect(notEvaluatedAlerts()).toHaveLength(0);
  });

  test("an unsealed assurance report planted in the window: not evaluated, never thrown or compared", async () => {
    const f = freezeFixture();
    runs(f, "default", [5, 4]);
    const dir = join(getAgentPaths(f.workspace, "default").reportsDir, "assurance");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "planted.json"), JSON.stringify({ assuranceRunId: "planted", agentId: "default", ts: 50, status: "VALID",
      packResults: [{ packId: "injection", score0to100: 100, scenarioResults: [] }] }));
    const result = await driftCheckCliAsync({ workspace: f.workspace, agentId: "default" });
    expect(result.reasons[0]).toMatch(/^INSUFFICIENT_EVIDENCE: assurance report\(s\) planted\.json cannot be verified/);
    expect(notEvaluatedAlerts()).toHaveLength(1);
  });

  test("an alert that cannot be delivered is reported in the result, never swallowed", async () => {
    const f = freezeFixture();
    const files = runs(f, "default", [5, 4]);
    rmSync(files[0]!);
    vi.mocked(dispatchAlert).mockRejectedValueOnce(new Error("webhook unreachable"));
    const result = await driftCheckCliAsync({ workspace: f.workspace, agentId: "default" });
    expect(result.reasons).toContain("ALERT_NOT_DELIVERED: webhook unreachable");
  });

  test("the continuous monitor alerts and counts a drift check it could not evaluate", async () => {
    const f = freezeFixture();
    const files = runs(f, "default", [5, 5]);
    rmSync(files[0]!);
    const monitor = new ContinuousMonitor({ workspace: f.workspace, agentId: "default", scoringIntervalMs: 3_600_000, driftCheckIntervalMs: 3_600_000 });
    try {
      await monitor.start();
    } finally {
      await monitor.stop();
    }
    expect(monitor.getMetrics()).toMatchObject({ driftNotEvaluated: 1, activeIncidents: 0 });
    expect(notEvaluatedAlerts()).toHaveLength(1);
  }, 120_000);

  test.skipIf(process.platform === "win32")("amc drift check exits non-zero when drift could not be evaluated", async () => {
    const f = freezeFixture();
    const files = runs(f, "default", [5, 5, 4]);
    rmSync(files[2]!);
    const child = spawnOwnedNode([resolve("dist/cli.js"), "drift", "check", "--agent", "default"], { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1" } });
    const result = await child.wait(60_000);
    expect(result.stdout).toContain("INSUFFICIENT_EVIDENCE");
    expect(result.code, result.stderr).toBe(3);
  }, 90_000);
});
