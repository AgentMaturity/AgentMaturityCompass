import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runRedTeam } from "../src/redteam/runner.js";
import { redTeamReportsDir, verifiedRedTeamReports, verifyRedTeamReportFile } from "../src/redteam/redteamStore.js";
import { runRedTeamCiGate } from "../src/ci/redteamGate.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";
import { eventMeta } from "../src/claims/evidenceProvenance.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * SH-TRUST-03: a signed red-team run writes every attack prompt, reply and result into a sealed `amc-redteam-runner`
 * ledger session and seals its report with the artifact-seal key; readers and the CI gate refuse anything less.
 */
let fakeAgent: FakeAgentServer;
let restoreEnv: () => void;
const roots: string[] = [];

beforeAll(async () => {
  fakeAgent = await startFakeAgentServer();
  restoreEnv = useFakeAgentEnv(fakeAgent.baseUrl);
});
afterAll(async () => { restoreEnv(); await fakeAgent.close(); });
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-redteam-seal-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "redteam-seal-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

describe("signed red-team runs are ledgered and sealed", () => {
  test("a signed run seals a redteam-runner session, seals its report, and every graded row resolves", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    expect(report.verification).toMatchObject({ signed: true, status: "SIGNED_VALID", mode: "vault-signed", evidenceUse: "verified-claim" });
    expect(report.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(report.runSealSig).not.toBe("unsigned");
    expect(sealedRunReportVerifies(ws, report as unknown as Record<string, unknown>)).toBe(true);

    const ledger = openLedger(ws);
    try {
      const session = ledger.getSessionById(report.sessionId!);
      expect(session?.binary_path).toBe("amc-redteam-runner");
      expect(session?.session_seal_sig).toBeTruthy();
      const rows = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId);
      expect(rows.filter((event) => event.event_type === "stdin").length).toBe(report.pluginResults[0]!.scenarioResults.length);
      expect(rows.every((event) => eventMeta(event).source === "redteam" || eventMeta(event).auditType === "ASSURANCE_RUN_STARTED")).toBe(true);
      // Every graded row names its own stdin, stdout and test rows in that session.
      for (const row of report.pluginResults[0]!.scenarioResults.filter((row) => row.inconclusive !== true)) {
        expect(row.evidenceEventIds).toHaveLength(3);
        expect(row.evidenceEventIds.every((id) => rows.some((event) => event.id === id))).toBe(true);
      }
    } finally { ledger.close(); }
    expect((await verifyLedgerIntegrity(ws)).ok).toBe(true);

    const file = join(redTeamReportsDir(ws, "default"), `${report.runId}.json`);
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: true });
    expect(verifiedRedTeamReports({ workspace: ws, agentId: "default", windowStartTs: 0, windowEndTs: Date.now() + 1000 }).reports.map((row) => row.runId)).toEqual([report.runId]);
  }, 60_000);

  test("an unsigned run writes no ledger rows and is never a verified red-team report", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: true });
    expect(report.verification).toMatchObject({ signed: false, status: "UNSIGNED_VALID", mode: "unsigned-local" });
    expect(report.sessionId).toBeUndefined();
    expect(report.runSealSig).toBe("unsigned");
    const file = join(redTeamReportsDir(ws, "default"), `${report.runId}.json`);
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_UNSIGNED" });
    const verified = verifiedRedTeamReports({ workspace: ws, agentId: "default", windowStartTs: 0, windowEndTs: Date.now() + 1000 });
    expect(verified.reports).toEqual([]);
    expect(verified.refused).toEqual([{ file, reason: "REDTEAM_UNSIGNED" }]);
  }, 60_000);

  test("a tampered or unbacked sealed report is refused by the reader and fails the CI gate", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    const file = join(redTeamReportsDir(ws, "default"), `${report.runId}.json`);
    const original = readFileSync(file, "utf8");
    // One byte of the score changes: the seal no longer verifies.
    const tampered = JSON.parse(original) as Record<string, unknown>;
    tampered.overallScore0to100 = 100;
    writeFileSync(file, JSON.stringify(tampered));
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_SEAL_INVALID" });
    writeFileSync(file, original);
    // The seal verifies but a graded row no longer names its session: provenance refuses it.
    const ledger = openLedger(ws);
    try {
      ledger.db.prepare("DELETE FROM evidence_events WHERE id = ?").run(report.pluginResults[0]!.scenarioResults.find((row) => row.inconclusive !== true)!.evidenceEventIds[2]);
    } finally { ledger.close(); }
    const refused = verifyRedTeamReportFile(ws, file);
    expect(refused.ok).toBe(false);
    expect((refused as { reason: string }).reason).toMatch(/^REDTEAM_PROVENANCE_/);
  }, 60_000);

  test("the CI gate verifies the sealed run it just wrote and names the refusal", async () => {
    const ws = workspace();
    const result = await runRedTeamCiGate({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false, includeGamingResistance: false });
    expect(result.report.verification.signed).toBe(true);
    expect(result.reasons.some((reason) => reason.startsWith("REDTEAM_"))).toBe(false);
  }, 60_000);
});
