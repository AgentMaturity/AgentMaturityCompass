import { randomUUID, verify } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { loadAssuranceReport, runAssurance, verifyAssuranceRun } from "../src/assurance/assuranceRunner.js";
import { loadAssuranceFindings, loadAssuranceRun, assuranceRunJsonPath } from "../src/assurance/assurancePolicyStore.js";
import { getAssurancePack } from "../src/assurance/packs/index.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { orgSignatureSchema } from "../src/org/orgSchema.js";
import { runRedTeam, type RedTeamReport } from "../src/redteam/runner.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { loadTrustContext } from "../src/trust/index.js";
import type { AssuranceReport, EvidenceEvent, SessionRecord } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { compliantReply, startFakeAgentServer, useFakeAgentEnv } from "./helpers/fakeAgentServer.js";
import { workspaceKeyPem } from "./helpers/trustContext.js";

const calls = [{ toolName: "read_owned_fixture", arguments: { path: "harmless-p0-19-fixture.txt" } }];
const records: Array<Record<string, unknown>> = [], roots: string[] = [];
const scenarioIds = getAssurancePack("injection").scenarios.map(row => row.id);
type Fixture = { name: string; root: string; workspace: string; home: string; monitorPem: string; auditorPem: string;
  monitorId: string; report: AssuranceReport; events: EvidenceEvent[]; sessions: SessionRecord[];
  assuranceCalls: number; redteamCalls: number; redteam?: RedTeamReport; reportPath: string };
let tool: Fixture, measured: Fixture, failure: Fixture, evidence: string;

function snapshot(root: string) {
  const rows: Array<Record<string, unknown>> = [];
  const walk = (path: string) => {
    const s = lstatSync(path);
    rows.push({ path: relative(root, path) || ".", kind: s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : "file",
      mode: s.mode, inode: s.ino, links: s.nlink,
      ...(s.isSymbolicLink() ? { target: readlinkSync(path) } : s.isFile() ? { size: s.size, sha256: sha256Hex(readFileSync(path)) } : {}) });
    if (s.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(root); return rows;
}

function activate(f: Pick<Fixture, "home" | "monitorId">) {
  vi.stubEnv("HOME", f.home); vi.stubEnv("AMC_HOME", f.home); vi.stubEnv("AMC_AGENT_ID", "");
  vi.stubEnv("AMC_NO_SIGN", undefined); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", f.monitorId);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-p0-19-runner-fixture");
  vi.stubEnv("OPENAI_API_KEY", "test-key-not-a-real-secret");
}

function payload(f: Fixture, row: EvidenceEvent): string {
  if (row.payload_inline !== null) return row.payload_inline;
  if (typeof row.payload_path !== "string" || row.payload_path.length === 0) throw new Error("Owned evidence event has no payload path.");
  const path = resolve(f.workspace, row.payload_path), rel = relative(f.workspace, path);
  expect(rel).not.toBe(".."); expect(rel.startsWith("../")).toBe(false);
  activate(f);
  return loadBlobPlaintext(f.workspace, row.payload_path).bytes.toString("utf8");
}

async function fixture(name: string, reply?: string): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), `amc-p0-19-${name}-`)); roots.push(root); chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), home = join(root, "operator-home"); mkdirSync(home, { mode: 0o700 });
  activate({ home, monitorId: "" });
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const monitorPem = workspaceKeyPem(workspace, "monitor"), auditorPem = workspaceKeyPem(workspace, "auditor"), monitorId = sha256Hex(monitorPem);
  activate({ home, monitorId });
  writeFileSync(join(evidence, `${name}-monitor.pub`), monitorPem, { mode: 0o600 });
  writeFileSync(join(evidence, `${name}-auditor.pub`), auditorPem, { mode: 0o600 });
  const agent = await startFakeAgentServer(reply === undefined
    ? { toolCalls: () => calls.map(call => ({ name: call.toolName, arguments: call.arguments })) }
    : { reply: () => reply });
  const restore = useFakeAgentEnv(agent.baseUrl), before = snapshot(root);
  records.push({ name, phase: "captured-before-producer", root, homeMode: lstatSync(home).mode & 0o777, monitorId,
    auditorId: sha256Hex(auditorPem), before, pinsCapturedBeforeRows: true });
  try {
    const report = await runAssurance({ workspace, agentId: "default", packIds: ["injection"], mode: "sandbox", window: "1d", noSign: false });
    const assuranceCalls = agent.prompts.length;
    const redteam = reply === undefined ? await runRedTeam({ workspace, agentId: "default", plugins: ["injection"], strategies: ["direct"], noSign: true }) : undefined;
    const ledger = openLedger(workspace); let events: EvidenceEvent[], sessions: SessionRecord[];
    try { events = ledger.getAllEvents(); sessions = ledger.getAllSessions(); } finally { ledger.close(); }
    const f: Fixture = { name, root, workspace, home, monitorPem, auditorPem, monitorId, report, events, sessions,
      assuranceCalls, redteamCalls: agent.prompts.length - assuranceCalls, redteam,
      reportPath: join(getAgentPaths(workspace, "default").reportsDir, "assurance", `${report.assuranceRunId}.json`) };
    records.push({ name, phase: "actual-producer-result", report, events, sessions, assuranceCalls, redteamCalls: f.redteamCalls,
      redteam, after: snapshot(root), artifactValidityBeforeCurrentSessionSeal: { status: report.status, verificationPassed: report.verificationPassed } });
    return f;
  } catch (error) {
    records.push({ name, phase: "actual-fixture-failure", error: error instanceof Error ? { name: error.name, message: error.message } : String(error), after: snapshot(root) });
    throw error;
  } finally { restore(); await agent.close(); }
}

async function laterVerify(f: Fixture, name: string) {
  activate(f); const before = snapshot(f.root);
  const result = await verifyAssuranceRun({ workspace: f.workspace, agentId: "default", assuranceRunId: f.report.assuranceRunId });
  records.push({ name, result, before, after: snapshot(f.root) }); return result;
}

async function completionFault(kind: "seal" | "markdown") {
  const name = `completion-${kind}-fault`, root = mkdtempSync(join(tmpdir(), `amc-p0-19-${name}-`));
  roots.push(root); chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), home = join(root, "operator-home"); mkdirSync(home, { mode: 0o700 });
  activate({ home, monitorId: "" });
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const monitorPem = workspaceKeyPem(workspace, "monitor"), auditorPem = workspaceKeyPem(workspace, "auditor"), monitorId = sha256Hex(monitorPem);
  activate({ home, monitorId });
  writeFileSync(join(evidence, `${name}-monitor.pub`), monitorPem, { mode: 0o600 });
  writeFileSync(join(evidence, `${name}-auditor.pub`), auditorPem, { mode: 0o600 });
  const blocker = join(root, "owned-markdown-parent-file");
  const agent = await startFakeAgentServer({ reply: () => compliantReply() }), restore = useFakeAgentEnv(agent.baseUrl);
  let ledger: ReturnType<typeof openLedger> | undefined;
  try {
    ledger = openLedger(workspace);
    if (kind === "seal") {
      ledger.db.exec("CREATE TRIGGER p019_completion_seal_fault BEFORE UPDATE ON sessions WHEN OLD.binary_path='amc-assurance-runner' AND NEW.session_seal_sig IS NOT NULL BEGIN SELECT RAISE(ABORT,'P019_COMPLETION_SEAL_FAULT'); END");
    } else {
      writeFileSync(blocker, "A real file prevents creation of the Markdown parent directory.\n");
      ledger.db.exec("CREATE TABLE p019_seal_updates (session_id TEXT, final_hash TEXT, seal_sig TEXT); CREATE TRIGGER p019_seal_observer AFTER UPDATE ON sessions WHEN OLD.binary_path='amc-assurance-runner' AND NEW.session_seal_sig IS NOT NULL BEGIN INSERT INTO p019_seal_updates VALUES (NEW.session_id, NEW.session_final_event_hash, NEW.session_seal_sig); END");
    }
    records.push({ name, phase: "captured-before-faulted-producer", monitorId, auditorId: sha256Hex(auditorPem),
      pinsCapturedBeforeRows: true, before: snapshot(root) });
    let returned: AssuranceReport | undefined, caught: unknown;
    try {
      returned = await runAssurance({ workspace, agentId: "default", packIds: ["injection"], mode: "sandbox", window: "1d", noSign: false,
        ...(kind === "markdown" ? { outputMarkdownPath: join(blocker, "report.md") } : {}) });
    } catch (error) { caught = error; }
    const sessions = ledger.getAllSessions().filter(row => row.binary_path === "amc-assurance-runner");
    const events = ledger.getAllEvents().filter(row => sessions.some(session => session.session_id === row.session_id));
    const runs = ledger.listAssuranceRuns("default");
    const reportsDir = join(getAgentPaths(workspace, "default").reportsDir, "assurance");
    const reportFiles = existsSync(reportsDir) ? readdirSync(reportsDir).sort() : [];
    const jsonReports = reportFiles.filter(file => file.endsWith(".json")).map(file => ({ file,
      bytesSha256: sha256Hex(readFileSync(join(reportsDir, file))), report: JSON.parse(readFileSync(join(reportsDir, file), "utf8")) as AssuranceReport }));
    const sealUpdates = kind === "markdown" ? ledger.db.prepare("SELECT * FROM p019_seal_updates").all() : [];
    const integrity = verifyLedgerIntegrity(workspace, { expectedMonitorFingerprint: monitorId,
      trust: loadTrustContext({ amcHome: home, expectMonitor: monitorId, env: {} }) });
    const errorValue = (error: unknown) => error instanceof Error ? { name: error.name, message: error.message,
      code: (error as NodeJS.ErrnoException).code, path: (error as NodeJS.ErrnoException).path, syscall: (error as NodeJS.ErrnoException).syscall } : error;
    records.push({ name, phase: "actual-faulted-producer-result", returned: returned ?? null, error: errorValue(caught),
      cause: errorValue(caught instanceof Error ? caught.cause : undefined), calls: agent.prompts.length,
      sessions, events, runs, reportFiles, jsonReports, sealUpdates, integrity, after: snapshot(root),
      scope: "Actual serial SQL/FS faults. A late report-write error may leave an already-written JSON artifact; report persistence is not transactional." });
    return { returned, caught, sessions, events, runs, reportFiles, jsonReports, sealUpdates, integrity, monitorPem, auditorPem,
      blocker, calls: agent.prompts.length };
  } finally {
    try {
      if (ledger) {
        try { ledger.db.exec("DROP TRIGGER IF EXISTS p019_completion_seal_fault; DROP TRIGGER IF EXISTS p019_seal_observer; DROP TABLE IF EXISTS p019_seal_updates"); }
        finally { ledger.close(); }
      }
    } finally { restore(); await agent.close(); }
  }
}

beforeAll(async () => {
  expect(scenarioIds.length).toBeGreaterThan(0);
  evidence = process.env.AMC_P0_19_RUNNER_EFFECTS_DIR ?? mkdtempSync(join(tmpdir(), "amc-p0-19-runner-effects-"));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  records.push({ phase: "inputs", node: process.version, executable: process.execPath, sourceHashes: ["src/assurance/assuranceRunner.ts", "src/assurance/evidenceWriters.ts",
    "src/assurance/scenarioGrading.ts", "src/redteam/runner.ts", "src/assurance/assuranceFindings.ts", "src/assurance/assuranceSchema.ts",
    "src/storage/blobs/blobStore.ts", "tests/helpers/fakeAgentServer.ts"].map(path => ({ path, sha256: sha256Hex(readFileSync(resolve(path))) })) });
  tool = await fixture("tool-calls"); measured = await fixture("measured-text", compliantReply()); failure = await fixture("measured-failure", "Our policy is to proceed.");
}, 120_000);
afterAll(() => {
  if (evidence) writeFileSync(join(evidence, "runner-effects.json"), JSON.stringify(records, null, 2) + "\n", { mode: 0o600 });
  for (const root of roots) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

describe("P0-19 actual local runner inconclusive contracts", () => {
  test("tool-call-only replies are recorded as exact unscored inconclusive scenarios", () => {
    const pack = tool.report.packResults[0]!;
    expect(tool.assuranceCalls).toBe(scenarioIds.length); expect(tool.report.packResults).toHaveLength(1);
    expect(pack.scenarioResults.map(row => row.scenarioId)).toEqual(scenarioIds);
    expect(pack).toMatchObject({ scenarioCount: scenarioIds.length, passCount: 0, failCount: 0, score0to100: 0, gradingMethod: "keyword", regulatedEligible: false });
    expect(tool.report).toMatchObject({ evidenceStatus: "INSUFFICIENT_EVIDENCE", inconclusiveScenarioCount: scenarioIds.length, overallScore0to100: 0 });
    for (const row of pack.scenarioResults) {
      expect(row).toMatchObject({ response: "", pass: false, score0to100: 0, score0to5: 0, inconclusive: true, inconclusiveCause: "tool_calls_ungraded", toolCalls: calls });
      expect(row.gradingMethod).toBeUndefined(); expect(row.responseTransport).toBeUndefined(); expect(row.evidenceEventIds).toHaveLength(2);
    }
  });
  test("responses retain canonical call digests and counts without disclosing calls in ledger payload", () => {
    for (const row of tool.report.packResults[0]!.scenarioResults) {
      const [promptId, responseId] = row.evidenceEventIds, prompt = tool.events.find(event => event.id === promptId)!, response = tool.events.find(event => event.id === responseId)!;
      expect(prompt.event_type).toBe("stdin"); expect(response.event_type).toBe("stdout");
      for (const event of [prompt, response]) {
        expect(event.session_id).toBe(tool.report.sessionId);
        expect(JSON.parse(event.meta_json)).toMatchObject({ agentId: "default", packId: "injection", scenarioId: row.scenarioId });
      }
      const text = payload(tool, response), canonical = canonicalize({ text: "", toolCalls: calls });
      expect(JSON.parse(text)).toEqual({ redacted: true, reason: "assurance policy: storeOnlyHashesAndRefs", sha256: sha256Hex(canonical), bytes: Buffer.byteLength(canonical) });
      expect(text).not.toContain(calls[0]!.toolName); expect(text).not.toContain(calls[0]!.arguments.path);
      expect(JSON.parse(response.meta_json)).toMatchObject({ direction: "agent_to_assurance", toolCallCount: 1 });
      expect(JSON.parse(payload(tool, prompt))).toMatchObject({ redacted: true, sha256: sha256Hex(row.prompt), bytes: Buffer.byteLength(row.prompt) });
      const audits = tool.events.filter(event => event.event_type === "audit" && JSON.parse(event.meta_json).scenarioId === row.scenarioId);
      expect(audits).toHaveLength(1);
      expect(JSON.parse(payload(tool, audits[0]!))).toMatchObject({ auditType: "ASSURANCE_SCENARIO_INCONCLUSIVE", severity: "HIGH" });
    }
  });
  test("genuine rows, session seal, report and persisted v1 signatures verify under before-captured public keys", () => {
    for (const f of [tool, measured, failure]) {
      activate(f);
      for (const row of f.events) expect(verify(null, Buffer.from(row.event_hash, "hex"), f.monitorPem, Buffer.from(row.writer_sig, "base64"))).toBe(true);
      const session = f.sessions.find(row => row.session_id === f.report.sessionId)!;
      expect(session.ended_ts).not.toBeNull(); expect(session.session_final_event_hash).toBeTruthy(); expect(session.session_seal_sig).toBeTruthy();
      expect(verify(null, Buffer.from(session.session_final_event_hash!, "hex"), f.monitorPem, Buffer.from(session.session_seal_sig!, "base64"))).toBe(true);
      const hash = sha256Hex(canonicalize({ ...f.report, reportJsonSha256: "", runSealSig: "" }));
      expect(hash).toBe(f.report.reportJsonSha256); expect(verify(null, Buffer.from(hash, "hex"), f.auditorPem, Buffer.from(f.report.runSealSig, "base64"))).toBe(true);
      const ledger = openLedger(f.workspace); let stored;
      try { stored = ledger.getAssuranceRun(f.report.assuranceRunId); } finally { ledger.close(); }
      records.push({ name: `actual-inserted-report-${f.name}`, stored });
      expect(stored).toMatchObject({ report_json_sha256: hash, run_seal_sig: f.report.runSealSig, status: f.report.status });
      const path = assuranceRunJsonPath(f.workspace, f.report.assuranceRunId), bytes = readFileSync(path);
      const sig = orgSignatureSchema.parse(JSON.parse(readFileSync(`${path}.sig`, "utf8")));
      expect(sig.digestSha256).toBe(sha256Hex(bytes)); expect(verify(null, Buffer.from(sig.digestSha256, "hex"), f.auditorPem, Buffer.from(sig.signature, "base64"))).toBe(true);
      const integrity = verifyLedgerIntegrity(f.workspace, { expectedMonitorFingerprint: f.monitorId, trust: loadTrustContext({ amcHome: f.home, expectMonitor: f.monitorId, env: {} }) });
      records.push({ name: `post-seal-pinned-integrity-${f.name}`, integrity }); expect(integrity.chain.ok).toBe(true); expect(integrity.trustRoot.anchored).toBe(true);
    }
  });
  test("records artifact validity separately from insufficient measurement and verifies after the producer sealed", async () => {
    expect(tool.report.status).toBe(tool.report.verificationPassed ? "VALID" : "INVALID");
    expect(["OBSERVED", "OBSERVED_HARDENED"]).toContain(tool.report.trustTier);
    expect(loadAssuranceReport({ workspace: tool.workspace, assuranceRunId: tool.report.assuranceRunId })).toEqual(tool.report);
    expect(await laterVerify(tool, "later-tool-run-verifier")).toEqual({ ok: true, errors: [] });
  });
  test("a genuine measured signed run remains VALID and verification-passed for stored consumers", () => {
    records.push({ name: "measured-artifact-validity-contract", actual: { status: measured.report.status,
      verificationPassed: measured.report.verificationPassed, evidenceStatus: measured.report.evidenceStatus } });
    expect(measured.report.status).toBe("VALID"); expect(measured.report.verificationPassed).toBe(true);
    expect(measured.report.evidenceStatus).toBe("MEASURED");
  });
  test("actual persisted v1 run is insufficient, carries inconclusive rows and has no findings", () => {
    const run = loadAssuranceRun(tool.workspace, tool.report.assuranceRunId)!, findings = loadAssuranceFindings(tool.workspace, tool.report.assuranceRunId)!;
    records.push({ name: "loaded-v1-tool-run", run, findings }); expect(run).not.toBeNull(); expect(findings).not.toBeNull();
    expect(run.score).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", pass: false, riskAssuranceScore: 0, findingCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } });
    expect(run.packRuns).toHaveLength(1); expect(run.packRuns[0]!.scenarios.map(row => row.scenarioId)).toEqual(scenarioIds);
    expect(run.packRuns[0]!.scenarios.every(row => row.inconclusive && !row.passed)).toBe(true); expect(findings.findings).toEqual([]);
  });
  test.each(["pass", "score100", "score5"] as const)("refuses an unauthenticated inconclusive stored row carrying %s before semantic grading and restores exact report bytes", async mutation => {
    activate(tool); const original = readFileSync(tool.reportPath), changed: AssuranceReport = JSON.parse(original.toString("utf8"));
    const row = changed.packResults[0]!.scenarioResults[0]!;
    if (mutation === "pass") row.pass = true; else if (mutation === "score100") row.score0to100 = 1; else row.score0to5 = 1;
    try {
      writeFileSync(tool.reportPath, JSON.stringify(changed, null, 2));
      const result = await laterVerify(tool, `tampered-inconclusive-${mutation}`);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("reportJsonSha256 mismatch");
      expect(result.errors).toContain("assurance report seal does not verify");
      expect(result.errors).not.toContain(`inconclusive row carries a score: injection/${row.scenarioId}`);
    } finally { writeFileSync(tool.reportPath, original); }
    expect(readFileSync(tool.reportPath)).toEqual(original);
  });
  test.each(["pass", "score100", "score5"] as const)("refuses an authentically re-sealed synthetic inconclusive-row %s witness", async mutation => {
    activate(tool);
    const originalBytes = readFileSync(tool.reportPath);
    const synthetic: AssuranceReport = JSON.parse(originalBytes.toString("utf8"));
    // An intentionally invalid owned test artifact, not another target execution or a production measurement.
    synthetic.assuranceRunId = randomUUID();
    const row = synthetic.packResults[0]!.scenarioResults[0]!;
    if (mutation === "pass") row.pass = true; else if (mutation === "score100") row.score0to100 = 1; else row.score0to5 = 1;
    const ledger = openLedger(tool.workspace);
    try {
      const originalRecord = ledger.getAssuranceRun(tool.report.assuranceRunId);
      expect(originalRecord).not.toBeNull();
      if (!originalRecord) throw new Error("Owned original assurance run is missing");
      expect(ledger.getAssuranceRun(synthetic.assuranceRunId)).toBeNull();
      synthetic.reportJsonSha256 = sha256Hex(canonicalize({ ...synthetic, reportJsonSha256: "", runSealSig: "" }));
      synthetic.runSealSig = ledger.signRunHash(synthetic.reportJsonSha256);
      ledger.insertAssuranceRun({ ...originalRecord, assurance_run_id: synthetic.assuranceRunId,
        report_json_sha256: synthetic.reportJsonSha256, run_seal_sig: synthetic.runSealSig });
      expect(ledger.getAssuranceRun(tool.report.assuranceRunId)).toEqual(originalRecord);
    } finally { ledger.close(); }
    const syntheticPath = join(getAgentPaths(tool.workspace, "default").reportsDir, "assurance", `${synthetic.assuranceRunId}.json`);
    writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2));
    try {
      const result = await verifyAssuranceRun({ workspace: tool.workspace, agentId: "default", assuranceRunId: synthetic.assuranceRunId });
      records.push({ name: `authentic-invalid-synthetic-inconclusive-${mutation}`, syntheticWitnessOnly: true, result });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(`inconclusive row carries a score: injection/${row.scenarioId}`);
      expect(result.errors).not.toContain("reportJsonSha256 mismatch");
      expect(result.errors).not.toContain("assurance report seal does not verify");
      expect(result.errors).not.toContain("ledger assurance run binding mismatch");
    } finally {
      // The append-only fixture record/file remain in this owned workspace until normal suite cleanup.
      expect(readFileSync(tool.reportPath)).toEqual(originalBytes);
    }
  });
  test("real text measurements retain pass/fail counts, plain-text digests and nonempty failure findings", async () => {
    for (const f of [measured, failure]) {
      const pack = f.report.packResults[0]!; expect(f.assuranceCalls).toBe(scenarioIds.length); expect(pack.scenarioResults).toHaveLength(scenarioIds.length);
      expect(f.report.evidenceStatus).toBe("MEASURED"); expect(pack.passCount + pack.failCount).toBe(scenarioIds.length);
      expect(pack.scenarioResults.every(row => !row.inconclusive && row.gradingMethod === "keyword" && !row.toolCalls)).toBe(true);
      const first = pack.scenarioResults[0]!, event = f.events.find(row => row.id === first.evidenceEventIds[1])!;
      expect(JSON.parse(payload(f, event))).toEqual({ redacted: true, reason: "assurance policy: storeOnlyHashesAndRefs", sha256: sha256Hex(first.response), bytes: Buffer.byteLength(first.response) });
      expect(await laterVerify(f, `later-measured-${f.name}`)).toEqual({ ok: true, errors: [] });
    }
    expect(measured.report.packResults[0]!.passCount).toBeGreaterThan(0);
    const pack = failure.report.packResults[0]!; expect(pack.failCount).toBeGreaterThan(0);
    const run = loadAssuranceRun(failure.workspace, failure.report.assuranceRunId)!, findings = loadAssuranceFindings(failure.workspace, failure.report.assuranceRunId)!;
    records.push({ name: "loaded-v1-measured-failure", run, findings }); expect(run.score.status).toBe("FAIL"); expect(run.score.pass).toBe(false);
    expect(findings.findings).toHaveLength(pack.failCount); expect(findings.findings.every(row => scenarioIds.includes(row.scenarioId))).toBe(true);
  });
  test("actual direct red-team tool replies preserve unsigned-local inconclusive parity", () => {
    const report = tool.redteam!; expect(tool.redteamCalls).toBe(scenarioIds.length); expect(report.pluginResults).toHaveLength(1);
    expect(report.verification).toMatchObject({ signed: false, status: "UNSIGNED_VALID", mode: "unsigned-local", evidenceUse: "local-redteam" });
    expect(report).toMatchObject({ totalPass: 0, totalFail: 0, totalScenarios: 0, inconclusiveScenarios: scenarioIds.length, evidenceStatus: "INSUFFICIENT_EVIDENCE", overallScore0to100: 0 });
    expect(report.vulnerabilities).toEqual([]); expect(report.pluginResults[0]!.scenarioResults.map(row => row.scenarioId)).toEqual(scenarioIds.map(id => `${id}::direct`));
    expect(report.pluginResults[0]).toMatchObject({ scenarioCount: scenarioIds.length, passCount: 0, failCount: 0, score0to100: 0 });
    for (const row of report.pluginResults[0]!.scenarioResults) expect(row).toMatchObject({ inconclusive: true, inconclusiveCause: "tool_calls_ungraded", pass: false, score0to100: 0, score0to5: 0, toolCalls: calls });
  });

  test("a genuine measured failure is a VALID artifact without turning its failed findings into a pass", () => {
    activate(failure);
    const pack = failure.report.packResults[0]!, run = loadAssuranceRun(failure.workspace, failure.report.assuranceRunId)!;
    const findings = loadAssuranceFindings(failure.workspace, failure.report.assuranceRunId)!;
    records.push({ name: "measured-failure-validity-with-failed-findings", report: failure.report, run, findings });
    const digest = sha256Hex(canonicalize({ ...failure.report, reportJsonSha256: "", runSealSig: "" }));
    expect(verify(null, Buffer.from(digest, "hex"), failure.auditorPem, Buffer.from(failure.report.runSealSig, "base64"))).toBe(true);
    expect(failure.report).toMatchObject({ status: "VALID", verificationPassed: true, evidenceStatus: "MEASURED" });
    expect(pack.failCount).toBeGreaterThan(0); expect(run.score).toMatchObject({ status: "FAIL", pass: false });
    expect(findings.findings).toHaveLength(pack.failCount);
  });

  test("a genuine signed tool-only artifact is VALID while remaining insufficient and unscored", () => {
    activate(tool);
    const run = loadAssuranceRun(tool.workspace, tool.report.assuranceRunId)!;
    records.push({ name: "tool-only-artifact-validity-without-measurement", report: tool.report, run });
    const digest = sha256Hex(canonicalize({ ...tool.report, reportJsonSha256: "", runSealSig: "" }));
    expect(verify(null, Buffer.from(digest, "hex"), tool.auditorPem, Buffer.from(tool.report.runSealSig, "base64"))).toBe(true);
    expect(tool.report).toMatchObject({ status: "VALID", verificationPassed: true, evidenceStatus: "INSUFFICIENT_EVIDENCE", overallScore0to100: 0 });
    expect(tool.report.packResults[0]).toMatchObject({ passCount: 0, failCount: 0, score0to100: 0, regulatedEligible: false });
    expect(run.score).toMatchObject({ status: "INSUFFICIENT_EVIDENCE", pass: false });
  });

  test("a real completion seal-update fault retains the SQLite error without persisting a success report", async () => {
    const result = await completionFault("seal");
    expect(result.calls).toBe(scenarioIds.length); expect(result.returned).toBeUndefined();
    expect(result.caught).toBeInstanceOf(Error);
    expect(result.caught).toMatchObject({ code: "SQLITE_CONSTRAINT_TRIGGER", message: "P019_COMPLETION_SEAL_FAULT" });
    expect((result.caught as Error).cause).toBeInstanceOf(Error);
    expect((result.caught as Error).cause).not.toBe(result.caught);
    expect((result.caught as Error).cause).toMatchObject({ code: "SQLITE_CONSTRAINT_TRIGGER", message: "P019_COMPLETION_SEAL_FAULT" });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ ended_ts: null, session_final_event_hash: null, session_seal_sig: null });
    expect(result.events.filter(row => JSON.parse(row.meta_json).auditType === "ASSURANCE_RUN_ABORTED")).toHaveLength(1);
    for (const row of result.events) expect(verify(null, Buffer.from(row.event_hash, "hex"), result.monitorPem, Buffer.from(row.writer_sig, "base64"))).toBe(true);
    expect(result.integrity.chain.ok).toBe(false); expect(result.integrity.chain.errors.join("\n")).toContain("missing seal");
    expect(result.reportFiles).toEqual([]); expect(result.runs).toEqual([]);
  });

  test("a real Markdown-destination failure preserves its error and the already-sealed session without abort or reseal", async () => {
    const result = await completionFault("markdown");
    expect(result.calls).toBe(scenarioIds.length); expect(result.returned).toBeUndefined();
    expect(result.caught).toBeInstanceOf(Error);
    // P2-08: report destinations are captured before signing, so the unusable Markdown destination is refused before
    // any report file is written. The error names the sealed session it leaves committed and keeps the filesystem cause.
    const caught = result.caught as Error & { phase: string; completed: readonly string[] };
    expect(caught).toMatchObject({ code: "RUN_REPORT_PARTIAL", phase: "assurance-destinations" });
    expect(caught.completed).toEqual([`sealed-session:${result.sessions[0]!.session_id}`]);
    let root: unknown = caught.cause; while (root instanceof Error && root.cause !== undefined) root = root.cause;
    expect(root).toMatchObject({ code: "ENOTDIR", syscall: "lstat", path: join(result.blocker, "report.md") });
    expect(result.reportFiles).toEqual([]);
    expect(result.sessions).toHaveLength(1); expect(result.sealUpdates).toHaveLength(1);
    const session = result.sessions[0]!;
    expect(session.ended_ts).not.toBeNull(); expect(session.session_final_event_hash).toBe(result.events.at(-1)!.event_hash);
    expect(verify(null, Buffer.from(session.session_final_event_hash!, "hex"), result.monitorPem, Buffer.from(session.session_seal_sig!, "base64"))).toBe(true);
    expect(result.events.filter(row => JSON.parse(row.meta_json).auditType === "ASSURANCE_RUN_ABORTED")).toEqual([]);
    expect(result.integrity.chain.ok).toBe(true); expect(result.integrity.trustRoot.anchored).toBe(true); expect(result.runs).toEqual([]);
    // JSON is written before Markdown. Its possible presence is not a successful returned or stored run.
    expect(result.reportFiles.every(file => file.endsWith(".json"))).toBe(true); expect(result.jsonReports.length).toBeLessThanOrEqual(1);
    for (const { report } of result.jsonReports) {
      const digest = sha256Hex(canonicalize({ ...report, reportJsonSha256: "", runSealSig: "" }));
      expect(report.reportJsonSha256).toBe(digest);
      expect(verify(null, Buffer.from(digest, "hex"), result.auditorPem, Buffer.from(report.runSealSig, "base64"))).toBe(true);
    }
  });
});
