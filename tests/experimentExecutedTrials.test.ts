import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/** Off: the real shell readiness check. On: no confinement backend, as on a machine without bwrap or seatbelt. */
const noBackend = vi.hoisted(() => ({ on: false }));
vi.mock("../src/sandbox/nativeShellGate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/sandbox/nativeShellGate.js")>();
  return { ...original, nativeShellReadiness: (...args: Parameters<typeof original.nativeShellReadiness>) => noBackend.on
    ? { offered: false, decision: "refused", enforcement: "none", boundary: null, reason: "no sandbox backend (test)", optInSource: null }
    : original.nativeShellReadiness(...args) };
});
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { getPrivateKeyPem, getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import { runCasebook } from "../src/casebooks/casebookRunner.js";
import { createExperiment, ExperimentInputError, gateExperiment, setExperimentBaseline, setExperimentCandidate } from "../src/experiments/experimentRunner.js";
import { runExecutedExperimentAsync } from "../src/experiments/executedExperiment.js";
import { nativeTrialRunner } from "../src/experiments/nativeTrialRunner.js";
import { executeCaseTrials, type TrialRunInput, type TrialRunner } from "../src/experiments/trialExecutor.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * GAP-WP04: AMC executes the immutable baseline and the admitted candidate itself, over the casebook's held-out cases,
 * through the governed native agent path. Every signed row of a trial carries its case execution identity, so the bound
 * casebook judge reads exactly that execution; the executor never sees the judge's validators.
 */
vi.setConfig({ testTimeout: 120_000 });
const SENTINEL = "HELDOUT_SENTINEL_AUDIT";
const READ_ARGS = JSON.stringify({ path: "workspace/n.txt" });
const WRITE_ARGS = JSON.stringify({ path: "workspace/out.txt", content: "written" });
const CASE_IDS = ["case_1", "case_2", "case_3", "case_4", "case_5", "case_6"];
let ws: string;
const bodies: string[] = [];

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "executed-trials-passphrase");
  ws = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-trials-")));
  initWorkspace({ workspacePath: ws, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(ws, "default");
  writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
  initApprovalPolicy(ws);
  mkdirSync(join(ws, "workspace"), { recursive: true });
  writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
  bodies.length = 0;
  noBackend.on = false;
}, 120_000);
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(ws, { recursive: true, force: true });
});

function signConfig(file: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(ws, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
}

function signAuditor(file: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(ws, "auditor")), signedTs: Date.now(), signer: "auditor" }));
}

/** Six signed cases that pass only when the agent actually reads the note; the forbidden audit is the held-out answer. */
function writeCasebook(allowedActionClasses: string[] = ["READ_ONLY"]): void {
  initCasebook(ws, "default", "book");
  const dir = join(ws, ".amc", "casebooks", "book");
  const index = YAML.parse(readFileSync(join(dir, "casebook.yaml"), "utf8")) as { casebook: { caseIds: string[] } };
  index.casebook.caseIds = CASE_IDS;
  writeFileSync(join(dir, "casebook.yaml"), YAML.stringify(index));
  signConfig(join(dir, "casebook.yaml"));
  for (const caseId of CASE_IDS) {
    const file = join(dir, "cases", `${caseId}.json`);
    writeFileSync(file, JSON.stringify({ v: 1, caseId, title: `Case ${caseId}`, description: "read the note", riskTier: "low", requestedMode: "SIMULATE",
      allowedActionClasses, inputs: { prompt: `Report what workspace/n.txt says (${caseId}).` },
      validators: { requiredToolActions: ["fs.read"], forbiddenAudits: [SENTINEL], minCorrelationRatio: 0, requireReceipts: true },
      scoring: { successPoints: 60, valuePoints: 100 } }));
    signConfig(file);
  }
}

/** The fixture model reads the note only when its persona says USE-TOOL; it records every request body it was sent. */
function fixtureRunner(): TrialRunner {
  let body = "";
  const adapter: LlmAdapter = {
    id: "trial-fixture", version: 1, encoderId: "anthropic-messages", encoderVersion: 1, capabilities: ANTHROPIC_CAPABILITIES,
    envelope: (input) => { body = typeof input.body === "string" ? input.body : Buffer.from(input.body).toString("utf8"); bodies.push(body);
      return { url: `${input.baseUrl}/v1/messages`, method: "POST", headers: { ...input.extraHeaders }, body: input.body }; },
    decode: async function* decode() {
      const script = body.includes("tool_result") ? textStep("done") : body.includes("USE-TOOL") ? toolStep("read_1", "fs.read", READ_ARGS)
        : body.includes("WRITE-NOTE") ? toolStep("write_1", "fs.write", WRITE_ARGS) : textStep("done");
      for (const chunk of script) yield chunk;
    }
  };
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL], adapter });
  return nativeTrialRunner({ workspace: ws, agentId: "default", harnessVersion: "fixture", maxSteps: 4,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    makeLlm: (session) => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }) });
}

function experimentFixture(): { experimentId: string; candidateFile: string } {
  writeCasebook();
  const { experimentId } = createExperiment({ workspace: ws, agentId: "default", name: "executed", casebookId: "book" });
  const baselineFile = join(ws, "baseline.txt");
  writeFileSync(baselineFile, "Answer briefly from memory.");
  setExperimentBaseline({ workspace: ws, agentId: "default", experimentId, config: { path: baselineFile } });
  const candidateFile = join(ws, "candidate.txt");
  writeFileSync(candidateFile, "USE-TOOL: read the named file before answering.");
  signAuditor(candidateFile);
  setExperimentCandidate({ workspace: ws, agentId: "default", experimentId, candidateFile });
  return { experimentId, candidateFile };
}

describe("executed baseline and candidate trials (GAP-WP04)", () => {
  test("an executed run yields bound held-out case results and a decided gate, not inconclusive", async () => {
    const { experimentId } = experimentFixture();
    const { report } = await runExecutedExperimentAsync({ workspace: ws, agentId: "default", experimentId, mode: "supervise",
      trials: { runTrial: fixtureRunner(), executorIdentity: `native:${LOOP_PROVIDER}/${LOOP_MODEL}` } });
    const execution = report.execution!;
    expect(execution.caseIds).toHaveLength(3);
    expect(execution.executor.identity).not.toBe(execution.judge.identity);
    expect(execution.executions).toHaveLength(6);
    expect(execution.executions.every((row) => row.outcome === "completed")).toBe(true);
    const evaluated = report.cases.filter((row) => execution.caseIds.includes(row.caseId));
    for (const row of evaluated) {
      expect(row.baselineStatus).toBe("failed"); // the baseline persona never reads the note
      expect(row.candidateStatus).toBe("passed");
      expect(row.candidateExecution?.trialId).toBe(report.candidate!.trialId);
      expect(row.candidateExecution?.eventIds.length).toBeGreaterThan(0);
    }
    expect(report.counts?.pairedCases).toBe(3);
    // Search-split cases were not executed and stay unpaired.
    expect(report.cases.filter((row) => !execution.caseIds.includes(row.caseId)).every((row) => row.paired === false)).toBe(true);

    const policy = join(ws, "policy.json");
    writeFileSync(policy, JSON.stringify({ minUpliftSuccessRate: 0.5, minUpliftValuePoints: 50, valueUnit: "points", denyIfRegression: true, minPairedCases: 3 }));
    const gate = gateExperiment({ workspace: ws, agentId: "default", experimentId, policyPath: policy });
    expect(gate.reasons).toEqual([]);
    expect(gate.status).toBe("pass");
    expect(gate.decision).toBe("promote-candidate");
    // The unchanged baseline stays eligible: a policy the candidate misses keeps it.
    writeFileSync(policy, JSON.stringify({ minUpliftSuccessRate: 0.5, minUpliftValuePoints: 101, valueUnit: "points", minPairedCases: 3 }));
    expect(gateExperiment({ workspace: ws, agentId: "default", experimentId, policyPath: policy }).decision).toBe("keep-baseline");
  });

  test("every signed row of a trial session carries its case execution identity", async () => {
    writeCasebook();
    const config = join(ws, "candidate.txt");
    writeFileSync(config, "USE-TOOL");
    const executed = await executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1"], mode: "supervise", runTrial: fixtureRunner(),
      arms: [{ side: "baseline", configPath: config, configDigest: sha256Hex(readFileSync(config)) }, { side: "candidate", configPath: config, configDigest: sha256Hex(readFileSync(config)) }] });
    const ledger = openLedger(ws);
    try {
      const rows = ledger.db.prepare("SELECT session_id, meta_json FROM evidence_events WHERE session_id IN (SELECT session_id FROM evidence_events WHERE meta_json LIKE ?)")
        .all(`%${executed.trials.candidate.trialId}%`) as { session_id: string; meta_json: string }[];
      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) expect((JSON.parse(row.meta_json) as { caseExecution?: { trialId?: string } }).caseExecution?.trialId).toBe(executed.trials.candidate.trialId);
    } finally { ledger.close(); }
  });

  test("a candidate artifact changed after admission is refused, before and during execution", async () => {
    const { experimentId, candidateFile } = experimentFixture();
    const calls: TrialRunInput[] = [];
    const recording: TrialRunner = async (input) => { calls.push(input); return { ok: true }; };
    writeFileSync(candidateFile, "USE-TOOL: a different candidate.");
    await expect(runExecutedExperimentAsync({ workspace: ws, agentId: "default", experimentId, mode: "supervise",
      trials: { runTrial: recording, executorIdentity: "native:fixture" } })).rejects.toThrow(ExperimentInputError);
    expect(calls).toHaveLength(0);

    const admitted = sha256Hex(readFileSync(candidateFile));
    const tampering: TrialRunner = async (input) => { calls.push(input); writeFileSync(candidateFile, "swapped mid-run"); return { ok: true }; };
    await expect(executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1", "case_2"], mode: "supervise", runTrial: tampering,
      arms: [{ side: "baseline", configPath: join(ws, "baseline.txt"), configDigest: sha256Hex(readFileSync(join(ws, "baseline.txt"))) },
        { side: "candidate", configPath: candidateFile, configDigest: admitted }] })).rejects.toThrow(/changed after admission/);
    expect(calls.length).toBeLessThan(4);
  });

  test("the executor sees each held-out case's task only, never its validators or scoring", async () => {
    const { experimentId } = experimentFixture();
    const seen: TrialRunInput[] = [];
    const inner = fixtureRunner();
    await runExecutedExperimentAsync({ workspace: ws, agentId: "default", experimentId, mode: "supervise",
      trials: { runTrial: async (input) => { seen.push(input); return await inner(input); }, executorIdentity: "native:fixture" } });
    expect(seen).toHaveLength(6);
    for (const input of seen) {
      expect(Object.keys(input.view).sort()).toEqual(["allowedActionClasses", "caseId", "context", "prompt"]);
      expect(JSON.stringify(input.view)).not.toContain(SENTINEL);
      expect(input.config.toString("utf8")).not.toContain(SENTINEL);
    }
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain(SENTINEL);
      expect(body).not.toContain("requiredToolActions");
    }
  });

  test("a crashed or timed-out trial is unavailable, never a success, even when it left passing evidence", async () => {
    writeCasebook();
    const config = join(ws, "candidate.txt");
    writeFileSync(config, "USE-TOOL");
    const digest = sha256Hex(readFileSync(config));
    const inner = fixtureRunner();
    let calls = 0;
    const flaky: TrialRunner = async (input) => {
      calls += 1;
      if (calls === 1) { await inner(input); throw new Error("boom"); } // ran and read the note, then crashed
      if (calls === 2) return await new Promise<never>(() => undefined); // never settles
      return await inner(input);
    };
    const executed = await executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1", "case_2", "case_3"], mode: "supervise", runTrial: flaky,
      // Unrecognised keys (a request body's) are dropped, never sealed into the report as limits that bound the run.
      limits: { trialTimeoutMs: 200, maxCostUsd: 0.01, approvedBy: "auditor" } as unknown as { trialTimeoutMs: number },
      arms: [{ side: "baseline", configPath: config, configDigest: digest }, { side: "candidate", configPath: config, configDigest: digest }] });
    expect(executed.limits).toEqual({ maxExecutions: 64, trialTimeoutMs: 200, concurrency: 1 });
    expect(executed.executions.map((row) => row.outcome)).toEqual(["unavailable", "unavailable", "completed", "completed", "completed", "completed"]);
    expect(executed.executions[0]!.reason).toMatch(/trial crashed: boom/);
    expect(executed.executions[1]!.reason).toMatch(/timed out/);
    const run = runCasebook({ workspace: ws, agentId: "default", casebookId: "book", mode: "sandbox", window: "1d", trial: executed.trials.baseline });
    const byId = new Map(run.results.map((row) => [row.caseId, row]));
    expect(byId.get("case_1")!.status).toBe("unavailable");
    expect(byId.get("case_1")!.success).toBe(false);
    expect(byId.get("case_1")!.reasons.join("; ")).toMatch(/trial execution did not complete: trial crashed: boom/);
    expect(byId.get("case_2")!.status).toBe("unavailable");
    expect(byId.get("case_3")!.status).toBe("passed");
  });

  test("a baseline outside the workspace, under .amc or reached through a symlink into .amc is refused at set-baseline", () => {
    writeCasebook();
    const { experimentId } = createExperiment({ workspace: ws, agentId: "default", name: "confined", casebookId: "book" });
    const set = (path: string) => () => setExperimentBaseline({ workspace: ws, agentId: "default", experimentId, config: { path } });
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-exec-outside-")));
    try {
      writeFileSync(join(outside, "baseline.txt"), "outside");
      expect(set(join(outside, "baseline.txt"))).toThrow(ExperimentInputError);
    } finally { rmSync(outside, { recursive: true, force: true }); }
    const keyFile = join(ws, ".amc", "keys", readdirSync(join(ws, ".amc", "keys"))[0]!);
    expect(existsSync(keyFile)).toBe(true);
    expect(set(keyFile)).toThrow(ExperimentInputError);
    symlinkSync(keyFile, join(ws, "innocent.txt"));
    expect(set(join(ws, "innocent.txt"))).toThrow(ExperimentInputError);
  });

  test("executed trials refuse a baseline pinned only by its 12-character id prefix", async () => {
    const { experimentId } = experimentFixture();
    const file = join(ws, ".amc", "agents", "default", "experiments", experimentId, "experiment.yaml");
    const path = existsSync(file) ? file : join(ws, ".amc", "experiments", experimentId, "experiment.yaml");
    const doc = YAML.parse(readFileSync(path, "utf8")) as { experiment: { baselineConfig: { digestSha256?: string } } };
    const full = doc.experiment.baselineConfig.digestSha256!;
    const calls: TrialRunInput[] = [];
    const run = () => runExecutedExperimentAsync({ workspace: ws, agentId: "default", experimentId, mode: "supervise",
      trials: { runTrial: async (input) => { calls.push(input); return { ok: true }; }, executorIdentity: "native:fixture" } });
    // A recorded digest that shares only the 12-character id prefix with the file is a mismatch.
    doc.experiment.baselineConfig.digestSha256 = `${full.slice(0, 12)}${"0".repeat(52)}`;
    writeFileSync(path, YAML.stringify(doc));
    await expect(run()).rejects.toThrow(ExperimentInputError); // refused at admission, not after the executor starts
    delete doc.experiment.baselineConfig.digestSha256; // a record written before full digests: only the id prefix remains
    writeFileSync(path, YAML.stringify(doc));
    await expect(run()).rejects.toThrow(/full digest/);
    expect(calls).toHaveLength(0);
  });

  test("sandbox trials are refused before any execution when no confinement backend is enforced", async () => {
    writeCasebook();
    const config = join(ws, "candidate.txt");
    writeFileSync(config, "USE-TOOL");
    const digest = sha256Hex(readFileSync(config));
    const calls: TrialRunInput[] = [];
    noBackend.on = true;
    await expect(executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1"], mode: "sandbox",
      runTrial: async (input) => { calls.push(input); return { ok: true }; },
      arms: [{ side: "baseline", configPath: config, configDigest: digest }, { side: "candidate", configPath: config, configDigest: digest }] }))
      .rejects.toThrow(/sandbox trials require an enforced OS-confined backend/);
    expect(calls).toHaveLength(0);
  });

  test("a READ_ONLY case's trial cannot call a write tool: it is not offered and a guessed call is denied", async () => {
    writeCasebook();
    const config = join(ws, "writer.txt");
    writeFileSync(config, "WRITE-NOTE: write the answer to a file.");
    const digest = sha256Hex(readFileSync(config));
    await executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1"], mode: "supervise", runTrial: fixtureRunner(),
      arms: [{ side: "baseline", configPath: config, configDigest: digest }, { side: "candidate", configPath: config, configDigest: digest }] });
    expect(existsSync(join(ws, "workspace", "out.txt"))).toBe(false);
    const offered = bodies.flatMap((body) => ((JSON.parse(body) as { tools?: { name: string }[] }).tools ?? []).map((tool) => tool.name));
    expect(offered).toContain("fs.read");
    expect(offered).not.toContain("fs.write"); // never offered to the model
    const ledger = openLedger(ws);
    try {
      const denied = (ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit'").all() as { meta_json: string }[])
        .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.auditType === "TOOL_CALL_DENIED" && meta.toolName === "fs.write");
      expect(denied.length).toBe(2);
    } finally { ledger.close(); }
  });

  test("a trial's tools are confined to its case's action classes: an out-of-scope read is neither offered nor run", async () => {
    writeCasebook(["WRITE_LOW"]);
    const config = join(ws, "reader.txt");
    writeFileSync(config, "USE-TOOL: read the named file before answering.");
    const digest = sha256Hex(readFileSync(config));
    await executeCaseTrials({ workspace: ws, casebookId: "book", caseIds: ["case_1"], mode: "supervise", runTrial: fixtureRunner(),
      arms: [{ side: "baseline", configPath: config, configDigest: digest }, { side: "candidate", configPath: config, configDigest: digest }] });
    const offered = bodies.flatMap((body) => ((JSON.parse(body) as { tools?: { name: string }[] }).tools ?? []).map((tool) => tool.name));
    expect(offered).not.toContain("fs.read");
    const ledger = openLedger(ws);
    try {
      const reads = (ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit'").all() as { meta_json: string }[])
        .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>).filter((meta) => meta.toolName === "fs.read");
      expect(reads.filter((meta) => meta.auditType === "TOOL_CALL_ALLOWED")).toEqual([]);
      expect(reads.filter((meta) => meta.auditType === "TOOL_CALL_DENIED")).toHaveLength(2);
    } finally { ledger.close(); }
  });
});
