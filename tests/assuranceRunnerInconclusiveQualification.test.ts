import { verify } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
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
  test.each(["pass", "score100", "score5"] as const)("refuses an inconclusive stored row carrying %s and restores exact report bytes", async mutation => {
    activate(tool); const original = readFileSync(tool.reportPath), changed: AssuranceReport = JSON.parse(original.toString("utf8"));
    const row = changed.packResults[0]!.scenarioResults[0]!;
    if (mutation === "pass") row.pass = true; else if (mutation === "score100") row.score0to100 = 1; else row.score0to5 = 1;
    try {
      writeFileSync(tool.reportPath, JSON.stringify(changed, null, 2));
      const result = await laterVerify(tool, `tampered-inconclusive-${mutation}`);
      expect(result.ok).toBe(false); expect(result.errors).toContain(`inconclusive row carries a score: injection/${row.scenarioId}`);
      expect(result.errors).toContain("reportJsonSha256 mismatch");
    } finally { writeFileSync(tool.reportPath, original); }
    expect(readFileSync(tool.reportPath)).toEqual(original);
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
});
