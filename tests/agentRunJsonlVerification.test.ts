import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { openLedger } from "../src/ledger/ledger.js";
import { jsonlEventsPath, jsonlSessionsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { loopHarness, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

// Real signed native session records driven by the existing scripted transport.
// These tests are local source regressions, never installed/provider acceptance.
describe("native run verification selects the JSONL lifecycle", () => {
  const fixtures: LoopHarness[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      try { fixture.finish(); }
      finally { lockVault(fixture.dir); rmSync(fixture.dir, { recursive: true, force: true }); }
    }
    vi.unstubAllEnvs();
  });

  async function recorded(): Promise<LoopHarness> {
    vi.stubEnv("AMC_SESSION_STORE", "jsonl");
    const fixture = loopHarness({ scripts: [textStep("recorded JSONL response")] });
    fixtures.push(fixture);
    fixture.driver.followup("Produce the scripted local response");
    await fixture.driver.whenIdle();
    fixture.finish();
    return fixture;
  }

  function replaceRecordedField(path: string, field: string, value: string): string {
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    const row = JSON.parse(lines[0]!) as Record<string, unknown>;
    const id = String(row.id);
    row[field] = value;
    lines[0] = JSON.stringify(row);
    writeFileSync(path, lines.join("\n") + "\n");
    return id;
  }

  test("cold verification finds the recorded session without an operations SQLite lifecycle row", async () => {
    const fixture = await recorded();
    const ledger = openLedger(fixture.dir, { readonly: true });
    try { expect(ledger.getAllSessions().some(row => row.session_id === fixture.sessionId)).toBe(false); }
    finally { ledger.close(); }
    const paths = [jsonlEventsPath(fixture.dir), jsonlSessionsPath(fixture.dir), join(fixture.dir, ".amc/session-store.json")];
    const snapshot = () => paths.map(path => ({ path, sha256: sha256Hex(readFileSync(path)), mtimeMs: statSync(path).mtimeMs }));
    const before = snapshot();
    const report = await verifyAgentRun(fixture.dir, fixture.sessionId);
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.ledgerErrors).toEqual([]);
    expect(report.sessionChainErrors).toEqual([]);
    expect(report.unsignedRowIds).toEqual([]);
    expect(report.requests).toHaveLength(1);
    expect(report.requests[0]?.status).toBe("reconstructed");
    expect(snapshot()).toEqual(before);
  });

  test("an operations SQLite descriptor cannot supply a missing JSONL session", async () => {
    const fixture = await recorded();
    const ledger = openLedger(fixture.dir);
    try {
      ledger.startSession({ sessionId: "operations-only", runtime: "unknown", binaryPath: "owned-regression", binarySha256: "fixture" });
      ledger.sealSession("operations-only");
    } finally { ledger.close(); }
    const report = await verifyAgentRun(fixture.dir, "operations-only");
    expect(report.ok).toBe(false);
    expect(report.sessionChainErrors).toEqual(["Session operations-only not found"]);
  });

  test("a missing session cannot pass by having zero reconstructable requests", async () => {
    const fixture = await recorded();
    const report = await verifyAgentRun(fixture.dir, "never-recorded");
    expect(report.ok).toBe(false);
    expect(report.requests).toEqual([]);
    expect(report.sessionChainErrors).toEqual(["Session never-recorded not found"]);
  });

  test("unsigned JSONL rows remain identified and fail verification", async () => {
    const fixture = await recorded();
    const changed = replaceRecordedField(jsonlEventsPath(fixture.dir), "writer_sig", "unsigned");
    const report = await verifyAgentRun(fixture.dir, fixture.sessionId);
    expect(report.ok).toBe(false);
    expect(report.ledgerOk).toBe(false);
    expect(report.unsignedRowIds).toContain(changed);
    expect(report.ledgerErrors.join("\n")).toContain("writer signature invalid");
  });

  test("changed JSONL payload bytes cannot pass through the lifecycle correction", async () => {
    const fixture = await recorded();
    replaceRecordedField(jsonlEventsPath(fixture.dir), "payload_inline", "changed owned regression payload");
    const report = await verifyAgentRun(fixture.dir, fixture.sessionId);
    expect(report.ok).toBe(false);
    expect(report.ledgerOk).toBe(false);
    expect(report.ledgerErrors.join("\n")).toContain("payload hash mismatch");
  });

  test("the expected monitor fingerprint remains mandatory when supplied", async () => {
    const fixture = await recorded();
    vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "0".repeat(64));
    const report = await verifyAgentRun(fixture.dir, fixture.sessionId);
    expect(report.ok).toBe(false);
    expect(report.ledgerOk).toBe(false);
    expect(report.trustRoot.anchored).toBe(false);
    expect(report.ledgerErrors.join("\n")).toContain("does not match the expected");
  });
});
