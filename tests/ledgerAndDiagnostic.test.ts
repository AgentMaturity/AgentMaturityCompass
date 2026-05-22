import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace, loadAMCConfig, saveAMCConfig } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { runDiagnostic, applyGlobalCherryPickDefense } from "../src/diagnostic/runner.js";
import { loadTargetProfile, verifyTargetProfileSignature } from "../src/targets/targetProfile.js";
import { parseEvidenceEvent } from "../src/diagnostic/gates.js";
import { wrapRuntime } from "../src/ledger/monitor.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("ledger and diagnostics", () => {
  test("ledger verification fails on hash-chain tampering", async () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);

    ledger.startSession({
      sessionId: "s1",
      runtime: "unknown",
      binaryPath: "bin",
      binarySha256: "deadbeef"
    });
    ledger.appendEvidence({
      sessionId: "s1",
      runtime: "unknown",
      eventType: "stdout",
      payload: "hello world",
      inline: true,
      meta: { questionId: "AMC-1.1" }
    });
    ledger.sealSession("s1");

    // Tamper by inserting a forged event with invalid chain/signature.
    ledger.db
      .prepare(
        `INSERT INTO evidence_events
         (id, ts, session_id, runtime, event_type, payload_path, payload_inline, payload_sha256, meta_json, prev_event_hash, event_hash, writer_sig)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "forged",
        Date.now() + 1,
        "s1",
        "unknown",
        "stdout",
        null,
        "forged",
        "00",
        "{}",
        "WRONG_PREV",
        "WRONG_HASH",
        "WRONG_SIG"
      );

    ledger.close();

    const verify = await verifyLedgerIntegrity(workspace);
    expect(verify.ok).toBe(false);
    expect(verify.errors.length).toBeGreaterThan(0);
  });

  test("signature verification fails when target profile is edited", () => {
    const workspace = newWorkspace();
    const profile = loadTargetProfile(workspace, "default");
    expect(verifyTargetProfileSignature(workspace, profile)).toBe(true);

    const file = join(workspace, ".amc", "targets", "default.target.json");
    const mutated = { ...profile, mapping: { ...profile.mapping, "AMC-1.1": 5 } };
    writeFileSync(file, JSON.stringify(mutated, null, 2));

    const reloaded = loadTargetProfile(workspace, "default");
    expect(verifyTargetProfileSignature(workspace, reloaded)).toBe(false);
  });

  test("finalLevel never exceeds supportedMaxLevel", async () => {
    const workspace = newWorkspace();
    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    for (const row of report.questionScores) {
      expect(row.finalLevel).toBeLessThanOrEqual(row.supportedMaxLevel);
    }
  });

  test("global cherry-pick constraints are enforced for levels 4 and 5", () => {
    const now = Date.now();
    const mkEvent = (session: string, dayOffset: number) =>
      parseEvidenceEvent({
        id: `${session}-${dayOffset}`,
        ts: now - dayOffset * 24 * 60 * 60 * 1000,
        session_id: session,
        runtime: "unknown",
        event_type: "stdout",
        payload_path: null,
        payload_inline: "evidence",
        payload_sha256: "",
        meta_json: "{}",
        prev_event_hash: "",
        event_hash: "",
        writer_sig: ""
      });

    const lowSessions = [mkEvent("s1", 0), mkEvent("s2", 1), mkEvent("s3", 2), mkEvent("s4", 3)];
    expect(applyGlobalCherryPickDefense(4, lowSessions)).toBe(3);

    const enoughDays = [
      mkEvent("s1", 0),
      mkEvent("s2", 1),
      mkEvent("s3", 2),
      mkEvent("s4", 3),
      mkEvent("s5", 4),
      mkEvent("s6", 5),
      mkEvent("s7", 6),
      mkEvent("s8", 7),
      mkEvent("s9", 8),
      mkEvent("s10", 9)
    ];

    expect(applyGlobalCherryPickDefense(5, enoughDays)).toBe(5);

    const withCritical = [
      ...enoughDays,
      parseEvidenceEvent({
        id: "audit",
        ts: now,
        session_id: "sa",
        runtime: "unknown",
        event_type: "audit",
        payload_path: null,
        payload_inline: JSON.stringify({ auditType: "POLICY_VIOLATION", severity: "CRITICAL" }),
        payload_sha256: "",
        meta_json: JSON.stringify({ auditType: "POLICY_VIOLATION", severity: "CRITICAL" }),
        prev_event_hash: "",
        event_hash: "",
        writer_sig: ""
      })
    ];

    expect(applyGlobalCherryPickDefense(5, withCritical)).toBe(4);
  });

  test("run produces VALID signed report when ledger and target are valid", async () => {
    const workspace = newWorkspace();

    // Ensure trust boundary mode isolated in config for VALID run.
    const config = loadAMCConfig(workspace);
    config.security.trustBoundaryMode = "isolated";
    saveAMCConfig(workspace, config);

    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    expect(report.status).toBe("VALID");
    expect(report.runSealSig.length).toBeGreaterThan(8);
    expect(report.reportJsonSha256.length).toBe(64);

    const runJson = JSON.parse(readFileSync(join(workspace, ".amc", "runs", `${report.runId}.json`), "utf8")) as { runId: string };
    expect(runJson.runId).toBe(report.runId);

    const verifyAfterFirstRun = await verifyLedgerIntegrity(workspace);
    expect(verifyAfterFirstRun.ok).toBe(true);

    const secondReport = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    expect(secondReport.status).toBe("VALID");
  });

  test("wrap mode captures stdin/stdout and seals session", async () => {
    const workspace = newWorkspace();
    const config = loadAMCConfig(workspace);
    config.runtimes.mock.command = "node";
    saveAMCConfig(workspace, config);

    const runPromise = wrapRuntime(
      "mock",
      [
        "-e",
        'process.stdin.on("data", d => process.stdout.write(d)); setTimeout(() => process.exit(0), 80);'
      ],
      {
        workspace,
        config
      }
    );

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        (process.stdin as unknown as { emit: (event: string, data: Buffer) => void }).emit("data", Buffer.from("ping\n"));
        resolve();
      }, 10);
    });

    const sessionId = await runPromise;

    const ledger = openLedger(workspace);
    const events = ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    const session = ledger.getAllSessions().find((row) => row.session_id === sessionId);
    ledger.close();

    expect(events.some((event) => event.event_type === "stdin")).toBe(true);
    expect(events.some((event) => event.event_type === "stdout")).toBe(true);
    expect(session?.session_seal_sig).toBeTruthy();
    expect(session?.session_final_event_hash).toBeTruthy();
  });
});
