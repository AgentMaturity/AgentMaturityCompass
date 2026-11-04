/** P2-26 slice A: detectors run from the ledger append path and open each incident once, with its clock run. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { readClockRun } from "../../src/incidents/clockRuntime.js";
import { createIncidentStore, verifyIncidentSignature } from "../../src/incidents/incidentStore.js";
import { openLedger, type Ledger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let workspace: string;
let ledger: Ledger;

function audit(meta: Record<string, unknown>): string {
  return ledger.appendEvidence({ sessionId: "p226-detectors", runtime: "unknown", eventType: "audit", payload: JSON.stringify(meta), inline: true,
    meta: { agentId: "default", ...meta } });
}
const incidents = () => createIncidentStore(ledger.db).getOpenIncidents("default");

beforeEach(() => {
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-detectors-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "p226-detectors", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
});
afterEach(() => {
  ledger.close();
  rmSync(workspace, { recursive: true, force: true });
});

describe("detector wiring", () => {
  test("a drift audit event opens a verifiable incident with a recorded clock run", () => {
    audit({ auditType: "DRIFT_REGRESSION_DETECTED", driftAdvisoryId: "drift-1", metric: "overall", severity: "CRITICAL" });
    const [incident, ...rest] = incidents();
    expect(rest).toEqual([]);
    expect(incident).toMatchObject({ triggerType: "DRIFT", triggerId: "drift-1" });
    expect(verifyIncidentSignature(workspace, incident!, getPublicKeyHistory(workspace, "monitor"))).toBe(true);
    // No active compiled plan in this workspace: clocks are recorded as not evaluated, never silently absent.
    expect(readClockRun(ledger.db, incident!.incidentId, getPublicKeyHistory(workspace, "monitor"))).toMatchObject({ status: "not_evaluated" });
  });

  test("an outcome_unknown action opens an incident", () => {
    audit({ auditType: "ACTION_STATE", executionId: "exec-1", state: "outcome_unknown", seq: 2 });
    audit({ auditType: "ACTION_STATE", executionId: "exec-2", state: "completed", seq: 2 });
    expect(incidents().map((i) => i.triggerId)).toEqual(["outcome_unknown:exec-1"]);
  });

  test("a duplicate trigger opens one incident", () => {
    audit({ auditType: "DRIFT_REGRESSION_DETECTED", driftAdvisoryId: "drift-dup" });
    audit({ auditType: "DRIFT_REGRESSION_DETECTED", driftAdvisoryId: "drift-dup" });
    audit({ auditType: "BREAK_GLASS_ACTION", breakGlassId: "bg-1" });
    audit({ auditType: "BREAK_GLASS_ACTION", breakGlassId: "bg-1" });
    expect(incidents().map((i) => i.triggerId).sort()).toEqual(["break_glass:bg-1", "drift-dup"]);
  });

  test("other audit rows open nothing", () => {
    audit({ auditType: "TELEMETRY_DROPPED" });
    expect(incidents()).toEqual([]);
  });
});
