import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startTrustDriftMonitor } from "../src/monitor/trustDriftMonitor.js";
import { writeSealedReport } from "./helpers/sealedRun.js";

const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "trust-drift-test-passphrase"; });

const roots: string[] = [];

function newWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-trust-drift-test-"));
  roots.push(root);
  mkdirSync(join(root, ".amc"), { recursive: true });
  return root;
}

/** Sealed like the runner's runs: since WP37 only sealed runs form the trust series. */
function writeRun(workspace: string, agentId: string, runId: string, ts: number, integrityIndex: number): void {
  writeSealedReport(workspace, join(workspace, ".amc", "agents", agentId, "runs"), runId, { runId, ts, integrityIndex });
}

afterEach(() => {
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("startTrustDriftMonitor", () => {
  test("alerts when sequential run scores degrade past threshold", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-drift", "r1", 1000, 0.9);
    writeRun(workspace, "agent-drift", "r2", 2000, 0.78);
    writeRun(workspace, "agent-drift", "r3", 3000, 0.62);

    const result = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 10,
      nowTs: 4000
    });

    expect(result.analyzedRuns).toBe(3);
    expect(result.alerts).toHaveLength(2);
    expect(result.alerts[0]!.drop).toBe(12);
    expect(result.alerts[1]!.drop).toBe(16);
    expect(existsSync(result.statePath)).toBe(true);
  });

  test("does not re-alert when no new runs are available", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-drift", "r1", 1000, 0.85);
    writeRun(workspace, "agent-drift", "r2", 2000, 0.7);

    const first = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 10,
      nowTs: 3000
    });
    const second = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 10,
      nowTs: 4000
    });

    expect(first.alerts).toHaveLength(1);
    expect(second.analyzedRuns).toBe(0);
    expect(second.alerts).toHaveLength(0);
  });

  test("uses persisted state to evaluate only newly appended runs", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-drift", "r1", 1000, 0.88);
    writeRun(workspace, "agent-drift", "r2", 2000, 0.86);

    const first = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 5,
      nowTs: 3000
    });
    expect(first.alerts).toHaveLength(0);

    writeRun(workspace, "agent-drift", "r3", 3000, 0.7);

    const second = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 5,
      nowTs: 4000
    });

    expect(second.analyzedRuns).toBe(1);
    expect(second.alerts).toHaveLength(1);
    expect(second.alerts[0]!.previousRunId).toBe("r2");
    expect(second.alerts[0]!.currentRunId).toBe("r3");
  });

  test("does not alert on improvements", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-drift", "r1", 1000, 0.4);
    writeRun(workspace, "agent-drift", "r2", 2000, 0.6);
    writeRun(workspace, "agent-drift", "r3", 3000, 0.75);

    const result = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 5,
      nowTs: 3500
    });

    expect(result.alerts).toHaveLength(0);
    expect(result.latestPoint?.runId).toBe("r3");
  });

  test("classifies severe drops as critical", () => {
    const workspace = newWorkspace();
    writeRun(workspace, "agent-drift", "r1", 1000, 0.95);
    writeRun(workspace, "agent-drift", "r2", 2000, 0.6);

    const result = startTrustDriftMonitor({
      workspace,
      agentId: "agent-drift",
      alertThreshold: 10,
      nowTs: 2100
    });

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]!.severity).toBe("critical");
  });
});

