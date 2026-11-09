import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifiedAssuranceByPack } from "../src/compliance/evidenceBinding.js";
import { latestAssuranceByPack, latestAssuranceReports, loadAssuranceReport, scanVerifiedAssuranceByPack, verifiedGovernorAssuranceSummary } from "../src/assurance/assuranceRunner.js";
import { assuranceReportProvenance } from "../src/assurance/reportProvenance.js";
import { startAssuranceSession } from "../src/assurance/evidenceWriters.js";
import { writeProvenancedAssuranceReport } from "./helpers/provenancedAssurance.js";
import { writeSealedReport } from "./helpers/sealedRun.js";

/**
 * SH-TRUST-02: every reader of a sealed assurance report refuses a score whose graded rows are not backed by the
 * runner's own sealed ledger session. The fixtures here are properly sealed, so only the provenance gate refuses them.
 */
describe("assurance report provenance gate", () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-provenance-gate-"));
    roots.push(dir);
    process.env.AMC_VAULT_PASSPHRASE = "provenance-gate-passphrase";
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    return dir;
  }
  const window = (ws: string) => ({ workspace: ws, agentId: "default", windowStartTs: 0, windowEndTs: Date.now() + 10_000 });
  const reportsDir = (ws: string) => join(getAgentPaths(ws, "default").reportsDir, "assurance");

  test("looking up missing assurance history does not create an agent and invalid history still fails closed", () => {
    const ws = workspace(), agentId = "missing-agent";
    const selected = getAgentPaths(ws, agentId);
    const query = { ...window(ws), agentId };
    expect(latestAssuranceReports(query)).toEqual([]);
    expect(scanVerifiedAssuranceByPack(query)).toEqual({ byPack: new Map(), unverifiedReports: [] });
    expect(() => loadAssuranceReport({ workspace: ws, agentId, assuranceRunId: "missing" })).toThrow(/Assurance report not found/);
    expect(existsSync(selected.rootDir)).toBe(false);

    mkdirSync(selected.reportsDir, { recursive: true });
    writeFileSync(join(selected.reportsDir, "assurance"), "not a directory");
    expect(() => latestAssuranceReports(query)).toThrow(/ENOTDIR/);
    expect(() => scanVerifiedAssuranceByPack(query)).toThrow(/ENOTDIR/);
  });

  test("a report whose graded rows resolve in its sealed runner session counts in every reader", () => {
    const ws = workspace();
    const { report } = writeProvenancedAssuranceReport(ws, { name: "backed", packs: [{ packId: "injection", scenarios: [{ scenarioId: "s1", pass: true }, { scenarioId: "s2", pass: false }] }] });
    expect(assuranceReportProvenance(ws, report)).toEqual({ ok: true });
    expect(verifiedAssuranceByPack(window(ws)).packs.get("injection")?.score0to100).toBe(50);
    expect(scanVerifiedAssuranceByPack(window(ws)).byPack.get("injection")?.passCount).toBe(1);
    expect(latestAssuranceByPack(window(ws)).get("injection")?.failCount).toBe(1);
    expect(verifiedGovernorAssuranceSummary(ws, "default", 0, Date.now() + 10_000).packs.injection?.score).toBe(50);
  });

  test("a sealed report with a score but no graded rows, or no session, is refused by every reader", () => {
    const ws = workspace();
    const noRows = { assuranceRunId: "no-rows", agentId: "default", ts: Date.now(), mode: "supervise", windowStartTs: 0, windowEndTs: Date.now(), trustTier: "OBSERVED",
      status: "VALID", verificationPassed: true, evidenceStatus: "MEASURED", overallScore0to100: 90, integrityIndex: 0.8, trustLabel: "HIGH",
      packResults: [{ packId: "injection", title: "Injection", scenarioCount: 1, passCount: 1, failCount: 0, score0to100: 90, trustTier: "OBSERVED", scenarioResults: [] }] };
    const file = writeSealedReport(ws, reportsDir(ws), "no-rows", noRows);
    expect(assuranceReportProvenance(ws, noRows)).toMatchObject({ ok: false, reason: "PROVENANCE_MISSING" });
    const compliance = verifiedAssuranceByPack(window(ws));
    expect(compliance.packs.size).toBe(0);
    expect(compliance.unverifiable).toEqual([{ file, packIds: ["injection"], sha256: expect.any(String), reason: "PROVENANCE_MISSING" }]);
    expect(scanVerifiedAssuranceByPack(window(ws)).unverifiedReports).toEqual([file]);
    expect(verifiedGovernorAssuranceSummary(ws, "default", 0, Date.now() + 10_000).packs).toEqual({});
    expect(() => latestAssuranceByPack(window(ws))).toThrow(/INSUFFICIENT_EVIDENCE/);

    const noSession = writeProvenancedAssuranceReport(ws, { name: "no-session", packs: [{ packId: "pii", scenarios: [{ scenarioId: "s1", pass: true }] }], extra: { sessionId: undefined } });
    expect(assuranceReportProvenance(ws, noSession.report)).toMatchObject({ ok: false, reason: "PROVENANCE_MISSING" });
  });

  test("rows pointing at another session, another scenario or an unsealed session do not resolve", () => {
    const ws = workspace();
    const backed = writeProvenancedAssuranceReport(ws, { name: "backed", packs: [{ packId: "injection", scenarios: [{ scenarioId: "s1", pass: true }] }] });
    const other = writeProvenancedAssuranceReport(ws, { name: "other", packs: [{ packId: "injection", scenarios: [{ scenarioId: "s1", pass: true }] }] });
    // The same ids, claimed under another run's session.
    expect(assuranceReportProvenance(ws, { ...backed.report, sessionId: other.sessionId })).toMatchObject({ ok: false, reason: "PROVENANCE_UNRESOLVED" });
    // A row re-labelled as another scenario.
    const packs = structuredClone(backed.report.packResults) as Array<{ scenarioResults: Array<{ scenarioId: string; pass: boolean }> }>;
    packs[0]!.scenarioResults[0]!.scenarioId = "s9";
    expect(assuranceReportProvenance(ws, { ...backed.report, packResults: packs })).toMatchObject({ ok: false, reason: "PROVENANCE_UNRESOLVED" });
    // A graded result the test row disagrees with.
    const flipped = structuredClone(backed.report.packResults) as Array<{ scenarioResults: Array<{ pass: boolean }> }>;
    flipped[0]!.scenarioResults[0]!.pass = false;
    expect(assuranceReportProvenance(ws, { ...backed.report, packResults: flipped })).toMatchObject({ ok: false, reason: "PROVENANCE_UNRESOLVED" });
    // An open (unsealed) runner session.
    const ledger = openLedger(ws);
    let open: string;
    try { open = startAssuranceSession({ ledger, mode: "supervise", agentId: "default", packIds: ["injection"], trustTier: "OBSERVED" }); } finally { ledger.close(); }
    expect(assuranceReportProvenance(ws, { ...backed.report, sessionId: open })).toMatchObject({ ok: false, reason: "PROVENANCE_SESSION_UNSEALED" });
  });

  test("a reordered or gapped runner session under a valid seal is refused (fix3 S12b)", () => {
    // Runner rows are legacy rows (no session envelope), so their order is the global chain's: each row must link to the
    // stored row just before it. Both tampers keep every row's own hash and signature and the seal (which names the
    // session's last row) intact, and leave the report's referenced rows in place.
    const scenarios = [{ scenarioId: "s1", pass: true }, { scenarioId: "s2", pass: false }];
    const tamper = (edit: (db: ReturnType<typeof openLedger>["db"], rows: Array<{ id: string; rowid: number }>) => void) => {
      const ws = workspace();
      const { report, sessionId } = writeProvenancedAssuranceReport(ws, { name: "chain", packs: [{ packId: "injection", scenarios }] });
      expect(assuranceReportProvenance(ws, report)).toEqual({ ok: true });
      const ledger = openLedger(ws);
      try {
        // A workspace writer with file access, not the monitor key: the append-only triggers are SQL, not cryptography.
        ledger.db.exec("DROP TRIGGER IF EXISTS no_update_evidence; DROP TRIGGER IF EXISTS no_delete_evidence;");
        edit(ledger.db, ledger.db.prepare("SELECT id, rowid FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId) as Array<{ id: string; rowid: number }>);
      } finally { ledger.close(); }
      return assuranceReportProvenance(ws, report);
    };
    // Swap two middle rows (s1's stdout and test rows): the session is reordered under its seal.
    expect(tamper((db, rows) => {
      const [a, b] = [rows[2]!, rows[3]!];
      db.prepare("UPDATE evidence_events SET rowid = -1 WHERE id = ?").run(a.id);
      db.prepare("UPDATE evidence_events SET rowid = ? WHERE id = ?").run(a.rowid, b.id);
      db.prepare("UPDATE evidence_events SET rowid = ? WHERE id = ?").run(b.rowid, a.id);
    })).toMatchObject({ ok: false, reason: "PROVENANCE_LEDGER_INVALID", detail: expect.stringMatching(/previous hash mismatch/) });
    // Drop the run's first row (ASSURANCE_RUN_STARTED, referenced by no scenario): the chain forks around a gap.
    expect(tamper((db, rows) => { db.prepare("DELETE FROM evidence_events WHERE id = ?").run(rows[0]!.id); }))
      .toMatchObject({ ok: false, reason: "PROVENANCE_LEDGER_INVALID", detail: expect.stringMatching(/previous hash mismatch/) });
  });

  test("a report that graded nothing has nothing to prove, and an unsigned-store report never counts", () => {
    const ws = workspace();
    const inconclusive = writeProvenancedAssuranceReport(ws, { name: "inconclusive", packs: [{ packId: "injection", scenarios: [{ scenarioId: "s1", pass: false, inconclusive: true }] }] });
    expect(assuranceReportProvenance(ws, inconclusive.report)).toEqual({ ok: true });
    expect(assuranceReportProvenance(ws, { ...inconclusive.report, evidenceStore: ".amc/unsigned/evidence.sqlite" })).toMatchObject({ ok: false, reason: "PROVENANCE_UNSIGNED_STORE" });
  });
});
