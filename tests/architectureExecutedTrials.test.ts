import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { getPrivateKeyPem, getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import { ExperimentInputError, gateExperiment } from "../src/experiments/experimentRunner.js";
import { evaluateExperimentGate } from "../src/experiments/experimentGatePolicy.js";
import {
  analyzeArchitectureExperiment, createArchitectureExperiment, createArchitectureSpec, createProbe, quickArchitectureComparison,
  renderArchitectureComparisonMarkdown, simulateProbeOutcomes, type ProbeOutcome
} from "../src/experiments/architectureExperiment.js";
import { runExecutedArchitectureExperiment, type ArchitectureArm } from "../src/experiments/architectureTrials.js";
import { nativeTrialRunner } from "../src/experiments/nativeTrialRunner.js";
import type { TrialBudgetHook, TrialRunInput, TrialRunner } from "../src/experiments/trialExecutor.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * GAP-WP06: architecture comparisons execute through the WP04 trial executor and gate. Each arm is a digest-pinned
 * architecture artifact run on one declared model; results are the bound, sealed experiment report. The synchronous
 * probe API remains labelled simulated or unbound and can never pass a promotion gate.
 */
vi.setConfig({ testTimeout: 120_000 });
const PASSPHRASE = "architecture-trials-passphrase";
const CASE_IDS = ["arch_1", "arch_2", "arch_3", "arch_4", "arch_5", "arch_6"];
let ws: string;

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  ws = realpathSync(mkdtempSync(join(tmpdir(), "amc-arch-trials-")));
  initWorkspace({ workspacePath: ws, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(ws, "default");
  writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
  initApprovalPolicy(ws);
  mkdirSync(join(ws, "workspace"), { recursive: true });
  writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
}, 120_000);
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(ws, { recursive: true, force: true });
});

function sign(file: string, key: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, key), signedTs: Date.now(), signer: "auditor" }));
}

/** Six signed cases that pass only when the agent reads the note. */
function writeCasebook(): void {
  initCasebook(ws, "default", "archbook");
  const dir = join(ws, ".amc", "casebooks", "archbook");
  const index = YAML.parse(readFileSync(join(dir, "casebook.yaml"), "utf8")) as { casebook: { caseIds: string[] } };
  index.casebook.caseIds = CASE_IDS;
  writeFileSync(join(dir, "casebook.yaml"), YAML.stringify(index));
  const configKey = getSigningKey(ws, "config-signature");
  sign(join(dir, "casebook.yaml"), configKey);
  for (const caseId of CASE_IDS) {
    const file = join(dir, "cases", `${caseId}.json`);
    writeFileSync(file, JSON.stringify({ v: 1, caseId, title: caseId, description: "read the note", riskTier: "low", requestedMode: "SIMULATE",
      allowedActionClasses: ["READ_ONLY"], inputs: { prompt: `Report what workspace/n.txt says (${caseId}).` },
      validators: { requiredToolActions: ["fs.read"], forbiddenAudits: [], minCorrelationRatio: 0, requireReceipts: true },
      scoring: { successPoints: 60, valuePoints: 100 } }));
    sign(file, configKey);
  }
}

/** One fixture model for both arms: it reads the note only when the architecture artifact says USE-TOOL. */
function fixtureRunner(): TrialRunner {
  let body = "";
  const adapter: LlmAdapter = {
    id: "arch-fixture", version: 1, encoderId: "anthropic-messages", encoderVersion: 1, capabilities: ANTHROPIC_CAPABILITIES,
    envelope: (input) => { body = typeof input.body === "string" ? input.body : Buffer.from(input.body).toString("utf8");
      return { url: `${input.baseUrl}/v1/messages`, method: "POST", headers: { ...input.extraHeaders }, body: input.body }; },
    decode: async function* decode() {
      const script = body.includes("tool_result") ? textStep("done") : body.includes("USE-TOOL") ? toolStep("read_1", "fs.read", JSON.stringify({ path: "workspace/n.txt" })) : textStep("done");
      for (const chunk of script) yield chunk;
    }
  };
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL], adapter });
  return nativeTrialRunner({ workspace: ws, agentId: "default", harnessVersion: "fixture", maxSteps: 4,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    makeLlm: (session) => new LlmRuntime({ session, registry, credentials: new FixedCredentials(), transport: silentTransport }) });
}

function arm(side: "baseline" | "candidate", content: string, modelId = LOOP_MODEL): ArchitectureArm {
  const file = join(ws, `${side}-architecture.md`);
  writeFileSync(file, content);
  if (side === "candidate") sign(file, getPrivateKeyPem(ws, "auditor"));
  return { file, spec: createArchitectureSpec({ name: side, kind: "PROMPT_STRUCTURE", modelId, artifactContent: readFileSync(file), description: side }) };
}

function arms(): { baseline: ArchitectureArm; candidate: ArchitectureArm } {
  writeCasebook();
  return { baseline: arm("baseline", "Answer briefly from memory."), candidate: arm("candidate", "USE-TOOL: read the named file before answering.") };
}

const run = (input: { baseline: ArchitectureArm; candidate: ArchitectureArm }, runTrial: TrialRunner, budget?: TrialBudgetHook) =>
  runExecutedArchitectureExperiment({ workspace: ws, agentId: "default", name: "prompt structure", casebookId: "archbook", mode: "supervise", ...input,
    trials: { runTrial, executorIdentity: `native:${LOOP_PROVIDER}/${LOOP_MODEL}`, ...(budget === undefined ? {} : { budget }) } });

describe("executed architecture comparison (GAP-WP06)", () => {
  test("an executed comparison yields bound held-out results and a decided gate, not inconclusive", async () => {
    const input = arms();
    const plans: unknown[] = [];
    const settled: string[] = [];
    const out = await run(input, fixtureRunner(), { admit: (plan) => { plans.push(plan); }, settle: (row) => { settled.push(row.outcome); } });
    expect(out.architecture.status).toBe("COMPLETED");
    const execution = out.report.execution!;
    expect(execution.method).toBe("native-trials/1");
    expect(execution.executions).toHaveLength(6);
    // Each arm ran under its pinned artifact digest, and nothing else differed between the arms.
    expect(out.report.baseline!.configDigest).toBe(input.baseline.spec.artifactSha256);
    expect(out.report.candidateConfigDigest).toBe(input.candidate.spec.artifactSha256);
    expect(plans).toEqual([{ executions: 6, caseIds: execution.caseIds,
      arms: [{ side: "baseline", configDigest: input.baseline.spec.artifactSha256 }, { side: "candidate", configDigest: input.candidate.spec.artifactSha256 }] }]);
    expect(settled).toEqual(Array(6).fill("completed"));
    for (const row of out.report.cases.filter((kase) => execution.caseIds.includes(kase.caseId))) {
      expect([row.baselineStatus, row.candidateStatus]).toEqual(["failed", "passed"]);
      expect(row.candidateExecution?.configDigest).toBe(input.candidate.spec.artifactSha256);
      expect(row.candidateExecution?.eventIds.length).toBeGreaterThan(0);
    }
    expect(out.report.counts?.pairedCases).toBe(3);
    expect(out.report.confidenceStatus).toBe("estimated");

    const policy = join(ws, "policy.json");
    writeFileSync(policy, JSON.stringify({ minUpliftSuccessRate: 0.5, minUpliftValuePoints: 50, valueUnit: "points", denyIfRegression: true, minPairedCases: 3 }));
    const gate = gateExperiment({ workspace: ws, agentId: "default", experimentId: out.experimentId, policyPath: policy });
    expect(gate.reasons).toEqual([]);
    expect(gate.status).toBe("pass");
    expect(gate.decision).toBe("promote-candidate");
  });

  test("arms that declare different models are refused before any execution", async () => {
    writeCasebook();
    const calls: TrialRunInput[] = [];
    await expect(run({ baseline: arm("baseline", "a"), candidate: arm("candidate", "b", "other-model") }, async (input) => { calls.push(input); return { ok: true }; }))
      .rejects.toThrow(/Model mismatch/);
    expect(calls).toHaveLength(0);
  });

  test("a changed arm config is refused, before and during execution", async () => {
    const input = arms();
    const calls: TrialRunInput[] = [];
    const recording: TrialRunner = async (call) => { calls.push(call); return { ok: true }; };
    writeFileSync(input.baseline.file, "Answer at length.");
    await expect(run(input, recording)).rejects.toThrow(/baseline architecture artifact changed/);
    writeFileSync(input.baseline.file, "Answer briefly from memory.");
    writeFileSync(input.candidate.file, "USE-TOOL: swapped.");
    await expect(run(input, recording)).rejects.toThrow(ExperimentInputError);
    expect(calls).toHaveLength(0);

    writeFileSync(input.candidate.file, "USE-TOOL: read the named file before answering.");
    const swapping: TrialRunner = async (call) => { calls.push(call); writeFileSync(input.baseline.file, "swapped mid-run"); return { ok: true }; };
    await expect(run(input, swapping)).rejects.toThrow(/changed after admission/);
    expect(calls.length).toBeLessThan(6);
  });

  test("an unsigned candidate architecture is refused before any execution", async () => {
    const input = arms();
    rmSync(`${input.candidate.file}.sig`);
    const calls: TrialRunInput[] = [];
    await expect(run(input, async (call) => { calls.push(call); return { ok: true }; })).rejects.toThrow(/candidate signature missing/);
    expect(calls).toHaveLength(0);
  });
});

describe("simulated and unbound architecture reports (GAP-WP06)", () => {
  const probes = [0, 1, 2].map((index) => createProbe({ category: "fixture", promptText: `probe ${index}`, measureDimension: "fixture" }));
  const experiment = createArchitectureExperiment({ name: "labels", probes,
    baselineSpec: createArchitectureSpec({ name: "b", kind: "POLICY_FRAME", modelId: "m", artifactContent: "b", description: "" }),
    candidateSpec: createArchitectureSpec({ name: "c", kind: "POLICY_FRAME", modelId: "m", artifactContent: "c", description: "" }) });
  const outcomes = (side: "baselineSpec" | "candidateSpec", seed: number) => simulateProbeOutcomes(experiment[side], probes, seed);

  test("the simulation path is labelled simulated and refused for promotion", () => {
    const { report, markdown } = quickArchitectureComparison({ name: "sim", modelId: "m", baselineName: "b", baselineKind: "POLICY_FRAME", baselineContent: "b",
      baselineDescription: "", candidateName: "c", candidateKind: "POLICY_FRAME", candidateContent: "c", candidateDescription: "", probeRunner: simulateProbeOutcomes });
    expect(report.evidence).toBe("simulated");
    expect(markdown).toContain("**SIMULATED**");
    const gate = evaluateExperimentGate(report as unknown as Record<string, unknown>, { minUpliftSuccessRate: -1, minUpliftValuePoints: -100, valueUnit: "points", minPairedCases: 0 });
    expect(gate.status).not.toBe("pass");
    expect(gate.reasons.join("; ")).toMatch(/unbound experiment report/);
  });

  test("caller-supplied outcomes are labelled unbound, never measured", () => {
    const strip = (rows: ProbeOutcome[]) => rows.map(({ simulated: _simulated, ...row }) => row);
    const report = analyzeArchitectureExperiment(experiment, strip(outcomes("baselineSpec", 1)), strip(outcomes("candidateSpec", 2)));
    expect(report.evidence).toBe("unbound");
    expect(renderArchitectureComparisonMarkdown(report)).toContain("**UNBOUND**");
  });

  test.each([
    ["missing", (rows: ProbeOutcome[]) => rows.slice(1), /outcomes for 2 of 3 probes/],
    ["duplicate", (rows: ProbeOutcome[]) => [...rows.slice(0, 2), rows[0]!], /is a duplicate/],
    ["wrong spec", (rows: ProbeOutcome[]) => rows.map((row, i) => i === 0 ? { ...row, specId: "spec_other" } : row), /belongs to spec spec_other/],
    ["unknown probe", (rows: ProbeOutcome[]) => [...rows, { ...rows[0]!, probeId: "probe_extra" }], /unknown probe/],
    ["out-of-range score", (rows: ProbeOutcome[]) => rows.map((row, i) => i === 0 ? { ...row, score: 1.5 } : row), /outside 0..1/],
    ["negative counter", (rows: ProbeOutcome[]) => rows.map((row, i) => i === 0 ? { ...row, tokenCount: -1 } : row), /negative or non-integer/]
  ])("a %s outcome is refused, not scored", (_label, mutate, message) => {
    expect(() => analyzeArchitectureExperiment(experiment, outcomes("baselineSpec", 1), mutate(outcomes("candidateSpec", 2)))).toThrow(message);
  });
});

describe("compiled CLI experiment-architecture (GAP-WP06)", () => {
  const cli = (args: string[], env: NodeJS.ProcessEnv = {}) => {
    const out = spawnSync(process.execPath, [resolve("dist/cli.js"), "experiment-architecture", "--name", "cli", "--model", "amc-stub-1", ...args], {
      cwd: ws, encoding: "utf8", env: { ...process.env, AMC_ARCHITECTURE_ALLOW_SIMULATED: undefined, ...env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASSPHRASE }, timeout: 180_000 });
    return { status: out.status, stdout: out.stdout, stderr: out.stderr };
  };

  test("--execute-trials runs both pinned artifacts and records a bound report; simulation consent is exact", () => {
    const input = arms();
    const files = ["--baseline-file", input.baseline.file, "--candidate-file", input.candidate.file];
    const executed = cli([...files, "--execute-trials", "--casebook", "archbook", "--provider", "stub", "--max-steps", "3"]);
    expect(executed.stderr).not.toContain("ERROR");
    expect([0, 1, 3]).toContain(executed.status);
    expect(executed.stdout).toMatch(/Architecture comparison (PASSED|FAILED|INCONCLUSIVE) \(measured\)/);
    const report = JSON.parse(readFileSync(/json=(.*)/.exec(executed.stdout)![1]!.trim(), "utf8")) as { execution: { executor: { identity: string }; executions: unknown[] }; baseline: { configDigest: string } };
    expect(report.execution.executor.identity).toBe("native:stub/amc-stub-1");
    expect(report.execution.executions).toHaveLength(6);
    expect(report.baseline.configDigest).toBe(input.baseline.spec.artifactSha256);

    expect(cli([...files, "--execute-trials", "--provider", "stub"]).status).toBe(1); // no casebook
    // The stub route always runs amc-stub-1: a different declared model is refused, not silently substituted.
    const otherModel = cli([...files, "--execute-trials", "--casebook", "archbook", "--provider", "stub", "--model", "declared-model"]);
    expect(otherModel.status).toBe(1);
    expect(otherModel.stderr).toContain("not the declared model declared-model");
    const notConsent = cli(files, { AMC_ARCHITECTURE_ALLOW_SIMULATED: "0" });
    expect(notConsent.status).toBe(3);
    expect(notConsent.stderr).toContain("no real probe runner is configured");
    const missing = cli(["--baseline-file", join(ws, "absent.md"), "--candidate-file", input.candidate.file], { AMC_ARCHITECTURE_ALLOW_SIMULATED: "1" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Architecture comparison ERROR");
    const badKind = cli([...files, "--baseline-kind", "NOPE"], { AMC_ARCHITECTURE_ALLOW_SIMULATED: "1" });
    expect(badKind.status).toBe(1);
    expect(badKind.stderr).toContain("unknown architecture kind 'NOPE'");
    expect(cli(files, { AMC_ARCHITECTURE_ALLOW_SIMULATED: "1" }).stdout).toContain("**SIMULATED**");
  }, 300_000);
});
