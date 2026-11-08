import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runRedTeam, type RedTeamReport } from "../src/redteam/runner.js";
import { redTeamReportsDir, verifiedRedTeamReports, verifyRedTeamReportFile } from "../src/redteam/redteamStore.js";
import { runRedTeamCiGate } from "../src/ci/redteamGate.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { GATEWAY_SESSION_STALE_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { startAssuranceSession } from "../src/assurance/evidenceWriters.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";
import { eventMeta } from "../src/claims/evidenceProvenance.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { startFakeAgentServer, useFakeAgentEnv, type FakeAgentServer } from "./helpers/fakeAgentServer.js";

/**
 * SH-TRUST-03: a signed red-team run writes every attack prompt, reply and result into a sealed `amc-redteam-runner`
 * ledger session and seals its report with the artifact-seal key; readers and the CI gate refuse anything less.
 */
const PASS = "redteam-seal-passphrase";
let fakeAgent: FakeAgentServer;
let restoreEnv: () => void;
const roots: string[] = [];

beforeAll(async () => {
  fakeAgent = await startFakeAgentServer();
  restoreEnv = useFakeAgentEnv(fakeAgent.baseUrl);
});
afterAll(async () => { restoreEnv(); await fakeAgent.close(); });
afterEach(() => { delete process.env.AMC_NO_SIGN; while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-redteam-seal-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = PASS;
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}
const reportFile = (ws: string, report: RedTeamReport) => join(redTeamReportsDir(ws, "default"), `${report.runId}.json`);
const window = (ws: string) => ({ workspace: ws, agentId: "default", windowStartTs: 0, windowEndTs: Date.now() + 10_000 });

/** Re-seals an edited report with the workspace's artifact-seal key: what an insider with the vault could do. */
function resealReport(ws: string, file: string, edit: (report: RedTeamReport) => void): void {
  const report = JSON.parse(readFileSync(file, "utf8")) as RedTeamReport;
  edit(report);
  const body = { ...report, reportJsonSha256: "", runSealSig: "" };
  const hash = sha256Hex(canonicalize(body));
  const ledger = openLedger(ws);
  let runSealSig: string;
  try { runSealSig = ledger.signRunHash(hash); } finally { ledger.close(); }
  writeFileSync(file, canonicalize({ ...body, reportJsonSha256: hash, runSealSig }));
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

    expect(verifyRedTeamReportFile(ws, reportFile(ws, report))).toMatchObject({ ok: true });
    const verified = verifiedRedTeamReports(window(ws));
    expect(verified.reports.map((row) => row.runId)).toEqual([report.runId]);
    expect(verified.blocking).toEqual([]);
  }, 60_000);

  test("an unsigned run writes no ledger rows and is never a verified red-team report", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: true });
    expect(report.verification).toMatchObject({ signed: false, status: "UNSIGNED_VALID", mode: "unsigned-local" });
    expect(report.sessionId).toBeUndefined();
    expect(report.runSealSig).toBe("unsigned");
    const file = reportFile(ws, report);
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_UNSIGNED" });
    const verified = verifiedRedTeamReports(window(ws));
    expect(verified.reports).toEqual([]);
    // An honest unsigned run is refused; with nothing verified it still blocks, so a consumer says INSUFFICIENT_EVIDENCE
    // rather than "never red-teamed" (the assurance readers' rule).
    expect(verified.refused).toEqual([{ file, reason: "REDTEAM_UNSIGNED", ts: report.ts, tampered: false }]);
    expect(verified.blocking).toEqual(verified.refused);
  }, 60_000);

  test("AMC_NO_SIGN=1 makes a run unsigned whatever the caller asked, with its rows in the unsigned store (no vault needed)", async () => {
    const ws = workspace();
    process.env.AMC_NO_SIGN = "1";
    delete process.env.AMC_VAULT_PASSPHRASE;
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    expect(report.verification).toMatchObject({ signed: false, status: "UNSIGNED_VALID", mode: "unsigned-local" });
    expect(report.verification.explanation).toMatch(/AMC_NO_SIGN store/);
    expect(report.runSealSig).toBe("unsigned");
    expect(report.evidenceStore).toBeTruthy();
    expect(report.sessionId).toMatch(/[0-9a-f-]{36}/);
    const unsigned = openLedger(ws, { store: "unsigned" });
    try { expect(unsigned.getSessionById(report.sessionId!)?.session_seal_sig).toBeTruthy(); } finally { unsigned.close(); }
    const signed = openLedger(ws);
    try { expect(signed.getSessionById(report.sessionId!)).toBeNull(); } finally { signed.close(); }
    expect(verifyRedTeamReportFile(ws, reportFile(ws, report))).toMatchObject({ ok: false, reason: "REDTEAM_UNSIGNED" });
  }, 60_000);

  test("a tampered, re-sealed or unbacked report is refused by the reader, and a refused newer run blocks the older verified one", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    const other = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false });
    const file = reportFile(ws, report);
    const original = readFileSync(file, "utf8");
    // One byte of the score changes: the seal no longer verifies.
    const tampered = JSON.parse(original) as Record<string, unknown>;
    tampered.overallScore0to100 = 100;
    writeFileSync(file, JSON.stringify(tampered));
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_SEAL_INVALID" });
    // Re-sealed with a flipped verdict: the seal verifies but the test row disagrees with the graded result.
    resealReport(ws, file, (edited) => { edited.pluginResults[0]!.scenarioResults.find((row) => row.inconclusive !== true)!.pass = !report.pluginResults[0]!.scenarioResults.find((row) => row.inconclusive !== true)!.pass; });
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_PROVENANCE_UNRESOLVED", detail: expect.stringMatching(/disagrees/) });
    // Rows claimed under another run's session: not that session's rows.
    writeFileSync(file, original);
    const otherFile = reportFile(ws, other);
    resealReport(ws, otherFile, (edited) => { edited.sessionId = report.sessionId; });
    expect(verifyRedTeamReportFile(ws, otherFile)).toMatchObject({ ok: false, reason: "REDTEAM_PROVENANCE_UNRESOLVED", detail: expect.stringMatching(/not the stdin row of its session/) });
    // The refused newer file is tampered evidence: it blocks the older verified run instead of rolling back to it.
    const verified = verifiedRedTeamReports(window(ws));
    expect(verified.reports.map((row) => row.runId)).toEqual([report.runId]);
    expect(verified.blocking).toEqual([{ file: otherFile, reason: "REDTEAM_PROVENANCE_UNRESOLVED", ts: other.ts, tampered: true }]);
    // Re-sealed to name an open runner session: not sealed, so nothing in it backs anything.
    const ledger = openLedger(ws);
    let open: string;
    try { open = startAssuranceSession({ ledger, mode: "supervise", agentId: "default", packIds: ["injection"], trustTier: "OBSERVED", source: "redteam" }); } finally { ledger.close(); }
    resealReport(ws, file, (edited) => { edited.sessionId = open; });
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_PROVENANCE_SESSION_UNSEALED" });
  }, 120_000);

  test("a signed --evil-mcp run writes the Evil MCP scenarios into the same sealed session, and the reader gates them", async () => {
    const ws = workspace();
    const report = await runRedTeam({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], evilMcp: true, mcpAttackCategories: ["tool_poison"], noSign: false });
    expect(report.verification.status).toBe("SIGNED_VALID");
    const evil = report.evilMcp!;
    expect(evil.scenarioResults.length).toBe(evil.totalScenarios);
    expect(evil.scenarioResults.every((row) => row.evidenceEventIds.length === 3)).toBe(true);
    const ledger = openLedger(ws);
    try {
      const rows = ledger.getAllEvents().filter((event) => event.session_id === report.sessionId && eventMeta(event).packId === "evil-mcp");
      expect(rows.filter((event) => event.event_type === "stdin").length).toBe(evil.totalScenarios);
      expect(rows.filter((event) => event.event_type === "test").length).toBe(evil.totalScenarios);
    } finally { ledger.close(); }
    const file = reportFile(ws, report);
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: true });
    // An Evil MCP verdict the ledger does not hold, or a score with no scenario rows behind it, is refused like any pack.
    const original = readFileSync(file, "utf8");
    resealReport(ws, file, (edited) => { edited.evilMcp!.scenarioResults[0]!.pass = !edited.evilMcp!.scenarioResults[0]!.pass; });
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_PROVENANCE_UNRESOLVED", detail: expect.stringMatching(/evil-mcp/) });
    writeFileSync(file, original);
    resealReport(ws, file, (edited) => { edited.evilMcp!.scenarioResults = []; edited.evilMcp!.overallScore0to100 = 100; });
    expect(verifyRedTeamReportFile(ws, file)).toMatchObject({ ok: false, reason: "REDTEAM_PROVENANCE_MISSING" });
  }, 120_000);

  test("the CI gate stays unsigned by default, re-reads a signed run it wrote, and names the refusal when it does not verify", async () => {
    const ws = workspace();
    const unsigned = await runRedTeamCiGate({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], includeGamingResistance: false });
    expect(unsigned.report.verification.signed).toBe(false);
    expect(unsigned.report.sessionId).toBeUndefined();
    const signed = await runRedTeamCiGate({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false, includeGamingResistance: false });
    expect(signed.report.verification.signed).toBe(true);
    expect(signed.reasons.some((reason) => reason.startsWith("REDTEAM_"))).toBe(false);
    // An interrupted runner session (no seal) whose last signed row is older than the liveness window reads as a missing
    // seal (LIVE-INTEGRITY-01), so the next signed run is SIGNED_INVALID; the gate says so by name.
    const ledger = openLedger(ws);
    try {
      const sessionId = randomUUID(), meta = { auditType: "ASSURANCE_RUN_STARTED", severity: "LOW", mode: "supervise", agentId: "default", packIds: ["injection"], source: "redteam" };
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-redteam-runner", binarySha256: sha256Hex("amc-redteam-runner") });
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", ts: Date.now() - GATEWAY_SESSION_STALE_AFTER_MS - 60_000,
        payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta: { ...meta, trustTier: "OBSERVED" } });
    } finally { ledger.close(); }
    const invalid = await runRedTeamCiGate({ workspace: ws, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: false, includeGamingResistance: false });
    expect(invalid.report.verification.status).toBe("SIGNED_INVALID");
    expect(invalid.passed).toBe(false);
    expect(invalid.reasons.some((reason) => reason.startsWith("REDTEAM_UNSIGNED: the sealed red-team report does not verify"))).toBe(true);
  }, 120_000);

  test("`amc ci redteam` runs unsigned without a vault, and `--sign` without one is refused", async () => {
    const ws = workspace();
    const cli = resolve(process.cwd(), "dist/cli.js");
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
    delete env.AMC_VAULT_PASSPHRASE;
    const args = ["ci", "redteam", "--plugins", "injection", "--strategies", "direct", "--no-gaming-resistance", "--json",
      "--min-score", "0", "--max-vulnerabilities", "999", "--max-critical", "999", "--max-high", "999"];
    // Asynchronous: the fake agent answers from this process's event loop, which a synchronous spawn would block.
    const run = (extra: string[]) => promisify(execFile)(process.execPath, [cli, ...args, ...extra], { cwd: ws, env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })
      .then((out) => ({ status: 0, ...out }), (error: { code?: number; stdout?: string; stderr?: string }) => ({ status: error.code ?? -1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }));
    const unsigned = await run([]);
    expect(unsigned.status, unsigned.stderr).toBe(0);
    const result = JSON.parse(unsigned.stdout.slice(unsigned.stdout.indexOf("{"))) as { passed: boolean; report: RedTeamReport };
    expect(result.report.verification).toMatchObject({ signed: false, status: "UNSIGNED_VALID" });
    const signed = await run(["--sign"]);
    expect(signed.status).not.toBe(0);
    expect(`${signed.stdout}${signed.stderr}`).toMatch(/Vault locked/);
  }, 240_000);
});
