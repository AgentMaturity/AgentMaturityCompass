import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { budgetsPath, initBudgets, signBudgetsConfig } from "../src/budgets/budgets.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import { createExperiment, gateExperiment, listExperiments, loadExperiment, setExperimentBaseline, setExperimentCandidate, verifySignedCandidateFile } from "../src/experiments/experimentRunner.js";
import { experimentHoldout, runExecutedExperimentAsync } from "../src/experiments/executedExperiment.js";
import { nativeTrialRunner } from "../src/experiments/nativeTrialRunner.js";
import type { TrialRunner } from "../src/experiments/trialExecutor.js";
import { attemptAuditDigest, editorRouteSchema, runImprovementLoop, type EditorAttempt, type ImprovementEditor,
  type ImprovementLimits, type ImprovementProposal } from "../src/experiments/improvementLoop.js";
import { SessionService } from "../src/session/sessionService.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * GAP-WP08: a bounded propose -> edit (fresh attempt workspace) -> execute (WP04) -> judge on held-out cases (WP09) ->
 * select or keep (WP07) loop, journalled in the owning signed session and resumable from verified stages only.
 */
vi.setConfig({ testTimeout: 180_000 });
const CASE_IDS = ["case_1", "case_2", "case_3", "case_4", "case_5", "case_6"];
const ROUTE = { provider: "fixture", model: "editor-1", effort: "high", maxSteps: 20, wallMs: 5_000, maxTokens: 10_000, maxCostUsd: 1 } as const;
const POLICY = { minUpliftSuccessRate: 0.5, minUpliftValuePoints: 50, valueUnit: "points" as const, denyIfRegression: true, minPairedCases: 3 };
let ws: string;
let session: SessionService;
let experimentId: string;
let executions: number;

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "improvement-loop-passphrase");
  ws = realpathSync(mkdtempSync(join(tmpdir(), "amc-improve-")));
  initWorkspace({ workspacePath: ws, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(ws, "default");
  writeRuntimeFirewallPolicy({ workspace: ws, mode: "observe" });
  initApprovalPolicy(ws);
  mkdirSync(join(ws, "workspace"), { recursive: true });
  writeFileSync(join(ws, "workspace", "n.txt"), "fixture");
  writeCasebook();
  experimentId = createExperiment({ workspace: ws, agentId: "default", name: "improve", casebookId: "book" }).experimentId;
  writeFileSync(join(ws, "baseline.txt"), "Answer briefly from memory.");
  setExperimentBaseline({ workspace: ws, agentId: "default", experimentId, config: { path: join(ws, "baseline.txt") } });
  session = new SessionService(ws);
  session.open({ sessionId: "improver", agentId: "default", harnessVersion: "test", compositionDigest: "composition", policyDigest: "policy" });
  executions = 0;
}, 120_000);
afterEach(() => {
  session.disposeWithoutClosing();
  vi.unstubAllEnvs();
  rmSync(ws, { recursive: true, force: true });
});

function signConfig(file: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(ws, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
}

/** Six signed cases that pass only when the agent reads the note. */
function writeCasebook(): void {
  initCasebook(ws, "default", "book");
  const dir = join(ws, ".amc", "casebooks", "book");
  const index = YAML.parse(readFileSync(join(dir, "casebook.yaml"), "utf8")) as { casebook: { caseIds: string[] } };
  index.casebook.caseIds = CASE_IDS;
  writeFileSync(join(dir, "casebook.yaml"), YAML.stringify(index));
  signConfig(join(dir, "casebook.yaml"));
  for (const caseId of CASE_IDS) {
    const file = join(dir, "cases", `${caseId}.json`);
    writeFileSync(file, JSON.stringify({ v: 1, caseId, title: `Case ${caseId}`, description: "read the note", riskTier: "low", requestedMode: "SIMULATE",
      allowedActionClasses: ["READ_ONLY"], inputs: { prompt: `Report what workspace/n.txt says (${caseId}).` },
      validators: { requiredToolActions: ["fs.read"], forbiddenAudits: [], minCorrelationRatio: 0, requireReceipts: true },
      scoring: { successPoints: 60, valuePoints: 100 } }));
    signConfig(file);
  }
}

/** The governed native path; by default the fixture model reads the note only when its persona says USE-TOOL. Counts executions. */
function fixtureRunner(readsNote: (body: string) => boolean = (body) => body.includes("USE-TOOL")): TrialRunner {
  let body = "";
  const adapter: LlmAdapter = {
    id: "trial-fixture", version: 1, encoderId: "anthropic-messages", encoderVersion: 1, capabilities: ANTHROPIC_CAPABILITIES,
    envelope: (input) => { body = typeof input.body === "string" ? input.body : Buffer.from(input.body).toString("utf8");
      return { url: `${input.baseUrl}/v1/messages`, method: "POST", headers: { ...input.extraHeaders }, body: input.body }; },
    decode: async function* decode() {
      const script = body.includes("tool_result") ? textStep("done")
        : readsNote(body) ? toolStep("read_1", "fs.read", JSON.stringify({ path: "workspace/n.txt" })) : textStep("done");
      for (const chunk of script) yield chunk;
    }
  };
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, baseUrl: "https://fixture.invalid", credentialRef: null, models: [LOOP_MODEL], adapter });
  const inner = nativeTrialRunner({ workspace: ws, agentId: "default", harnessVersion: "fixture", maxSteps: 4,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    makeLlm: (owner) => new LlmRuntime({ session: owner, registry, credentials: new FixedCredentials(), transport: silentTransport }) });
  return async (input) => { executions += 1; return await inner(input); };
}

/** Counts executions without running an agent; every case then lacks evidence and the probe cannot pass. */
/** The operator experiment's persisted definition; the loop must never rewrite it. */
const definition = () => readFileSync(join(ws, ".amc", "experiments", experimentId, "experiment.yaml"), "utf8");

const stubRunner: TrialRunner = async () => { executions += 1; return { ok: true }; };

const proposals = (n: number): ImprovementProposal[] => Array.from({ length: n }, (_, index) =>
  ({ proposalId: `p${index + 1}`, mission: `mission ${index + 1}`, evidenceClass: "repeated-failure", evidence: { split: "search" } }));

/** Writes `text`, the mission and an attempt number into the attempt's candidate copy; mission 2 never improves. */
const writingEditor = (text: string): ImprovementEditor => {
  let attempts = 0;
  return async (attempt) => {
    const body = attempt.mission === "mission 2" ? "Answer differently from memory." : text;
    writeFileSync(join(attempt.dir, "candidate.txt"), `${body} (${attempt.mission} #${++attempts})`);
  };
};

function loop(options: { loopId: string; proposals: ImprovementProposal[]; limits: ImprovementLimits; edit: ImprovementEditor; runner?: TrialRunner;
  signal?: AbortSignal; policy?: typeof POLICY; seed?: string; compose?: boolean }) {
  return runImprovementLoop({ workspace: ws, agentId: "default", experimentId, loopId: options.loopId, session, proposals: options.proposals,
    ...(options.seed === undefined ? {} : { seed: options.seed }), ...(options.compose === undefined ? {} : { compose: options.compose }),
    editor: { route: ROUTE, edit: options.edit }, limits: options.limits, policy: options.policy ?? POLICY, mode: "supervise",
    trials: { runTrial: options.runner ?? stubRunner, executorIdentity: "native:fixture" }, ...(options.signal ? { signal: options.signal } : {}) });
}

describe("bounded recursive improvement loop (GAP-WP08)", () => {
  test("the loop stops exactly at its width, depth, execution budget and cancellation", async () => {
    const edit = writingEditor("Try harder");
    const width = await loop({ loopId: "width", proposals: proposals(3), limits: { width: 2, depth: 1, maxExecutions: 100 }, edit });
    expect([width.edits, width.probes, width.rounds, width.executionsUsed, width.stopReason]).toEqual([2, 2, 1, 12, "depth"]);
    const depth = await loop({ loopId: "depth", proposals: proposals(1), limits: { width: 1, depth: 2, maxExecutions: 100 }, edit });
    expect([depth.edits, depth.probes, depth.rounds, depth.executionsUsed, depth.stopReason]).toEqual([2, 2, 2, 12, "depth"]);
    const budget = await loop({ loopId: "budget", proposals: proposals(2), limits: { width: 2, depth: 3, maxExecutions: 6 }, edit });
    expect([budget.edits, budget.probes, budget.rounds, budget.executionsUsed, budget.stopReason]).toEqual([1, 1, 1, 6, "budget"]);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await loop({ loopId: "cancelled", proposals: proposals(2), limits: { width: 2, depth: 2, maxExecutions: 100 }, edit, signal: controller.signal });
    expect([cancelled.edits, cancelled.probes, cancelled.executionsUsed, cancelled.stopReason]).toEqual([0, 0, 0, "cancelled"]);
    // An identical candidate reuses its measured probe instead of executing again.
    const same = await loop({ loopId: "same", proposals: proposals(1), limits: { width: 1, depth: 2, maxExecutions: 100 },
      edit: async (attempt) => writeFileSync(join(attempt.dir, "candidate.txt"), "Same edit") });
    expect([same.edits, same.probes, same.executionsUsed]).toEqual([2, 1, 6]);
    expect(executions).toBe(36);
    // A probe that could not be measured selects nothing: the baseline stays.
    expect([width.selection, depth.selection, budget.selection]).toEqual(["baseline", "baseline", "baseline"]);
  });

  test.each(["before-start", "after-executions"] as const)("a crash %s of a probe resumes without repeating a completed execution", async (phase) => {
    const runner = fixtureRunner();
    const record = session.recordProjectedEvidence.bind(session);
    let probesSeen = 0;
    session.recordProjectedEvidence = (row) => {
      const target = phase === "before-start" ? "started" : "completed";
      if (row.meta.kind === "improvement/stage" && row.meta.stage === "probe" && row.meta.status === target && ++probesSeen === 2) throw new Error("injected crash");
      return record(row);
    };
    const options = { loopId: "crash", proposals: proposals(2), limits: { width: 2, depth: 1, maxExecutions: 100 }, edit: writingEditor("USE-TOOL"), runner };
    const before = definition();
    await expect(loop(options)).rejects.toThrow(/injected crash/);
    expect(executions).toBe(phase === "before-start" ? 6 : 12);
    expect(definition()).toBe(before); // a crash mid-probe leaves the operator's definition as it was
    session.recordProjectedEvidence = record;

    // Changed inputs cannot resume over the recorded stages.
    await expect(loop({ ...options, policy: { ...POLICY, minUpliftValuePoints: 51 } })).rejects.toThrow(/inputs differ/);
    const resumed = await loop(options);
    expect(executions).toBe(12); // the first probe is reused; the second runs once in all
    expect(resumed.executionsUsed).toBe(12);
    expect(resumed.unknownStages).toHaveLength(phase === "before-start" ? 0 : 1); // never replayed
    expect(resumed.selection).toBe("candidate");
    expect(resumed.selected!.upliftValuePoints).toBeGreaterThan(0);
    expect(definition()).toBe(before);
    // A loop candidate carries no auditor signature, and ordinary admission and promotion refuse it.
    const file = resumed.selected!.candidateFile;
    expect(existsSync(`${file}.sig`)).toBe(false);
    expect(verifySignedCandidateFile(ws, file).valid).toBe(false);
    expect(() => setExperimentCandidate({ workspace: ws, agentId: "default", experimentId, candidateFile: file })).toThrow(/verification failed/);
    const own = listExperiments({ workspace: ws, agentId: "default" }).filter((row) => row.experimentId !== experimentId);
    expect(own).toHaveLength(1);
    const policyFile = join(ws, "policy.json");
    writeFileSync(policyFile, JSON.stringify(POLICY));
    const gate = gateExperiment({ workspace: ws, agentId: "default", experimentId: own[0]!.experimentId, policyPath: policyFile });
    expect(gate.decision).not.toBe("promote-candidate");
    expect(gate.reasons.join("; ")).toMatch(/candidate configuration is no longer admitted/);
    // Outside the loop, the persisted loop candidate admits no executed trial either.
    const calls = executions;
    await expect(runExecutedExperimentAsync({ workspace: ws, agentId: "default", experimentId: own[0]!.experimentId, mode: "supervise",
      trials: { runTrial: stubRunner, executorIdentity: "native:fixture" } })).rejects.toThrow(/candidate/);
    expect(executions).toBe(calls);
    // Every stage is a signed, chained row of the owning session.
    const stages = loadSessionEventHistory({ workspace: ws, sessionId: "improver" }).events
      .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>).filter((meta) => meta.kind === "improvement/stage");
    expect(stages.filter((meta) => meta.stage === "probe" && meta.status === "started")).toHaveLength(2);
    expect(stages.filter((meta) => meta.stage === "select")).toHaveLength(1);
  });

  test("an editor attempt gets a fresh copy outside the operator workspace and cannot hand back an operator file", async () => {
    const seen: EditorAttempt[] = [];
    const baselineFile = join(ws, "baseline.txt");
    const operatorFile = join(ws, "workspace", "n.txt"); // an operator file other than the parent
    const before = readFileSync(baselineFile);
    const edit: ImprovementEditor = async (attempt) => {
      seen.push(attempt);
      expect(readFileSync(join(attempt.dir, "candidate.txt"))).toEqual(before);
      writeFileSync(join(attempt.dir, "candidate.txt"), "edited copy"); // the copy, never the operator's file
      if (attempt.mission === "mission 2") { unlinkSync(join(attempt.dir, "candidate.txt")); symlinkSync(operatorFile, join(attempt.dir, "candidate.txt")); }
      if (attempt.mission === "mission 3") { unlinkSync(join(attempt.dir, "candidate.txt")); linkSync(operatorFile, join(attempt.dir, "candidate.txt")); }
    };
    const result = await loop({ loopId: "isolation", proposals: proposals(3), limits: { width: 3, depth: 1, maxExecutions: 100 }, edit });
    expect(readFileSync(baselineFile)).toEqual(before);
    expect(new Set(seen.map((attempt) => attempt.dir)).size).toBe(3);
    for (const attempt of seen) {
      expect(Object.keys(attempt).sort()).toEqual(["dir", "mission", "route", "signal"]);
      expect(`${attempt.dir}${sep}`.startsWith(`${ws}${sep}`)).toBe(false);
      expect(existsSync(attempt.dir)).toBe(false); // harvested, then removed
    }
    expect([result.edits, result.probes]).toEqual([3, 1]); // the linked candidates are refused, never probed
  });

  test("with no improving candidate the unchanged baseline is retained", async () => {
    const before = definition();
    const result = await loop({ loopId: "no-gain", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100 },
      edit: writingEditor("Answer differently from memory."), runner: fixtureRunner() });
    expect(result.probes).toBe(1);
    expect(executions).toBe(6);
    expect(result.selection).toBe("baseline");
    expect(result.selected).toBeNull();
    expect(definition()).toBe(before); // the failing candidate is not left as the experiment's candidate
    // A measured gain the gate policy does not accept is not an improvement either.
    const strict = await loop({ loopId: "strict", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100 },
      edit: writingEditor("USE-TOOL"), runner: fixtureRunner(), policy: { ...POLICY, minUpliftValuePoints: 101 } });
    expect(executions).toBe(12);
    expect(strict.selection).toBe("baseline");
    // A later round whose passing candidate only matches its parent's measured uplift keeps the parent.
    const refined = await loop({ loopId: "refine", proposals: proposals(1), limits: { width: 1, depth: 2, maxExecutions: 100 },
      edit: writingEditor("USE-TOOL"), runner: fixtureRunner() });
    expect([refined.probes, refined.rounds, executions]).toEqual([2, 2, 24]);
    expect(refined.selected!.candidateDigest).toBe(sha256Hex(Buffer.from("USE-TOOL (mission 1 #1)")));
  });

  test("the editor route needs provider with model and a step limit (H2X-10)", () => {
    expect(editorRouteSchema.safeParse(ROUTE).success).toBe(true);
    const { provider: _provider, ...noProvider } = ROUTE;
    expect(editorRouteSchema.safeParse(noProvider).success).toBe(false);
    const { maxSteps: _steps, ...noSteps } = ROUTE;
    expect(editorRouteSchema.safeParse(noSteps).success).toBe(false);
  });

  test("an attempt's audit digest changes when only its context path changes (H2X-11)", () => {
    const record = { mission: "m", contextPath: "/tmp/a", parentDigest: "0".repeat(64), route: ROUTE, proposalId: "p1", harvestedDigest: null };
    expect(attemptAuditDigest(record)).not.toBe(attemptAuditDigest({ ...record, contextPath: "/tmp/b" }));
  });

  test("branches: a seeded, recorded domain order, one branch per domain first, bounded concurrency and shared budget (H2-05, H2-06, H2-08)", async () => {
    const domains = [["a1", "alpha"], ["a2", "alpha"], ["b1", "beta"], ["c1", "gamma"]] as const;
    const branched: ImprovementProposal[] = domains.map(([id, domain]) => ({ proposalId: id, mission: `mission ${id}`, evidenceClass: "repeated-failure", evidence: null, domain }));
    const order = (seed: string) => ["alpha", "beta", "gamma"].sort((a, b) =>
      sha256Hex(`improvement-domain-order/1\0${seed}\0${a}`).localeCompare(sha256Hex(`improvement-domain-order/1\0${seed}\0${b}`)));
    let inFlight = 0, peak = 0;
    const seen: string[] = [];
    const slow: ImprovementEditor = async (attempt) => {
      seen.push(attempt.mission);
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      writeFileSync(join(attempt.dir, "candidate.txt"), `Try ${attempt.mission}`);
      inFlight -= 1;
    };
    const parallel = await loop({ loopId: "domains", seed: "s1", proposals: branched, limits: { width: 3, depth: 1, maxExecutions: 100, concurrency: 2 }, edit: slow });
    expect(parallel.domainOrder).toEqual(order("s1"));
    expect([...seen].sort()).toEqual(["mission a1", "mission b1", "mission c1"]); // every domain before a second alpha branch
    expect([parallel.edits, parallel.probes, parallel.executionsUsed, peak]).toEqual([3, 3, 18, 2]);
    const plan = loadSessionEventHistory({ workspace: ws, sessionId: "improver" }).events
      .map((row) => JSON.parse(row.meta_json) as Record<string, unknown>).filter((meta) => meta.kind === "improvement/stage" && meta.stage === "plan");
    expect(plan).toHaveLength(1);
    // Resumed with another concurrency, the same branches are reused: nothing is edited or executed again.
    const editorCalls = seen.length, calls = executions;
    const resumed = await loop({ loopId: "domains", seed: "s1", proposals: branched, limits: { width: 3, depth: 1, maxExecutions: 100, concurrency: 1 }, edit: slow });
    expect([seen.length, executions, resumed.executionsUsed]).toEqual([editorCalls, calls, 18]);
    // A different seed records its own order; width 4 then gives alpha its second branch last.
    seen.length = 0; peak = 0;
    const serial = await loop({ loopId: "serial", seed: "s2", proposals: branched, limits: { width: 4, depth: 1, maxExecutions: 100 }, edit: slow });
    expect(serial.domainOrder).toEqual(order("s2"));
    expect(seen.at(-1)).toBe("mission a2");
    expect(peak).toBe(1); // the default concurrency is serial
    // Branches in flight hold their reservations: three at once cannot overrun a budget of two probes.
    const budget = await loop({ loopId: "budget-parallel", proposals: branched, limits: { width: 3, depth: 1, maxExecutions: 12, concurrency: 3 }, edit: slow });
    expect([budget.probes, budget.executionsUsed, budget.stopReason]).toEqual([2, 12, "budget"]);
    await expect(loop({ loopId: "bad", proposals: branched, limits: { width: 3, depth: 1, maxExecutions: 12, concurrency: 0 }, edit: slow })).rejects.toThrow(/concurrency 1\.\.8/);
    await expect(loop({ loopId: "bad", proposals: [{ ...branched[0]!, domain: "Not A Domain" }], limits: { width: 1, depth: 1, maxExecutions: 12 }, edit: slow })).rejects.toThrow(/domain/);
  });

  test("an invalid edit gets at most `repairs` re-edits from the same parent, then the parent stays (H2-21)", async () => {
    const missions: string[] = [];
    const flaky = (failures: number): ImprovementEditor => async (attempt) => {
      missions.push(attempt.mission);
      expect(readFileSync(join(attempt.dir, "candidate.txt"), "utf8")).toBe("Answer briefly from memory."); // the unchanged parent each time
      if (missions.length <= failures) throw new Error("bad edit");
      writeFileSync(join(attempt.dir, "candidate.txt"), "Try harder");
    };
    const repaired = await loop({ loopId: "repaired", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100, repairs: 2 }, edit: flaky(2) });
    expect([repaired.edits, repaired.repairs, repaired.probes]).toEqual([3, 2, 1]);
    expect(missions[1]).toMatch(/^mission 1\n\nRepair 1 of 2: the previous edit was invalid \(editor failed: bad edit\)/);
    // Resumed, the journalled attempts are reused: the editor is not called again.
    await loop({ loopId: "repaired", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100, repairs: 2 }, edit: flaky(2) });
    expect(missions).toHaveLength(3);
    missions.length = 0;
    const exhausted = await loop({ loopId: "exhausted", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100, repairs: 1 }, edit: flaky(9) });
    expect([exhausted.edits, exhausted.repairs, exhausted.probes, exhausted.selection]).toEqual([2, 1, 0, "baseline"]);
    missions.length = 0;
    const none = await loop({ loopId: "no-repair", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100 }, edit: flaky(9) });
    expect([none.edits, none.repairs]).toEqual([1, 0]);
    // An unchanged edit is valid: it is not repaired.
    const unchanged = await loop({ loopId: "unchanged", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100, repairs: 3 }, edit: async () => undefined });
    expect([unchanged.edits, unchanged.repairs, unchanged.probes]).toEqual([1, 0, 0]);
    await expect(loop({ loopId: "bad", proposals: proposals(1), limits: { width: 1, depth: 1, maxExecutions: 100, repairs: 4 }, edit: flaky(0) })).rejects.toThrow(/repairs 0\.\.3/);
  });

  test("composition joins two measured improvements, and the composite is executed and judged as a new candidate (H2-10)", async () => {
    const policy = { ...POLICY, minUpliftSuccessRate: 0.2, minUpliftValuePoints: 20 };
    // More model calls in a minute than the default per-minute budget admits.
    writeFileSync(budgetsPath(ws), readFileSync(budgetsPath(ws), "utf8").replace(/maxLlmRequests: 60\b/, "maxLlmRequests: 1000"));
    signBudgetsConfig(ws);
    // The model reads the note for a case only when the persona names it: USE-TOOL:case_a,case_b.
    const readsNote = (body: string) => {
      const named = /USE-TOOL:([a-z0-9_,]+)/.exec(body)?.[1]?.split(",") ?? [];
      const caseId = /\((case_\d+)\)/.exec(body)?.[1];
      return caseId !== undefined && named.includes(caseId);
    };
    const heldOut = (loopId: string) => {
      const row = listExperiments({ workspace: ws, agentId: "default" }).find((item) => item.name === `improvement-loop:${loopId}`)!;
      return experimentHoldout(ws, "default", loadExperiment(ws, "default", row.experimentId)).heldOut;
    };
    const contrasts: string[][] = [];
    const editor = (loopId: string, cover: (held: string[]) => Record<string, string[]>): ImprovementEditor => async (attempt) => {
      const held = heldOut(loopId);
      if (attempt.mission.startsWith("Compose")) {
        const a = readFileSync(join(attempt.dir, "contrast-a.txt"), "utf8"), b = readFileSync(join(attempt.dir, "contrast-b.txt"), "utf8");
        contrasts.push([a, b]);
        const named = [a, b].flatMap((text) => /USE-TOOL:([a-z0-9_,]+)/.exec(text)![1]!.split(","));
        writeFileSync(join(attempt.dir, "candidate.txt"), `USE-TOOL:${[...new Set(named)].sort().join(",")}`);
        return;
      }
      writeFileSync(join(attempt.dir, "candidate.txt"), `USE-TOOL:${(cover(held)[attempt.mission] ?? []).join(",")}`);
    };
    const halves = (held: string[]) => ({ "mission 1": [held[0]!], "mission 2": [held[1]!] });
    const options = { proposals: proposals(2), runner: fixtureRunner(readsNote), policy };
    // Without composition the two equal improvements tie, and the parent stays.
    const tied = await loop({ ...options, loopId: "tied", limits: { width: 2, depth: 1, maxExecutions: 100 }, edit: editor("tied", halves) });
    expect([tied.probes, tied.composites, tied.selection]).toEqual([2, 0, "baseline"]);
    const calls = executions;
    const composed = await loop({ ...options, loopId: "composed", compose: true, limits: { width: 2, depth: 2, maxExecutions: 100, concurrency: 2 }, edit: editor("composed", halves) });
    expect(contrasts).toHaveLength(1);
    expect(composed.composites).toBe(1);
    expect(executions - calls).toBe(18); // two branches and the composite, each executed once; round 2 reuses all three probes
    expect(composed.selection).toBe("candidate");
    const twoCases = heldOut("composed").slice(0, 2).sort().join(",");
    expect(composed.selected!.candidateDigest).toBe(sha256Hex(Buffer.from(`USE-TOOL:${twoCases}`)));
    expect(existsSync(`${composed.selected!.candidateFile}.sig`)).toBe(false); // never auditor-signed
    // Round 2: the branches pass but no longer beat the composite parent, so nothing is composed again.
    expect([composed.rounds, composed.edits]).toEqual([2, 5]);
    // A passing candidate and one the gate refuses are no contrast pair, however much the refused one improved.
    const strict = await loop({ ...options, loopId: "gate-refused", compose: true, policy: { ...policy, minUpliftValuePoints: 50 },
      limits: { width: 2, depth: 1, maxExecutions: 100 }, edit: editor("gate-refused", (held) => ({ "mission 1": [held[0]!], "mission 2": [held[0]!, held[1]!] })) });
    expect([strict.composites, contrasts.length]).toEqual([0, 1]);
    // The composite needs its own execution budget.
    const short = await loop({ ...options, loopId: "short", compose: true, limits: { width: 2, depth: 1, maxExecutions: 12 }, edit: editor("short", halves) });
    expect([short.composites, short.stopReason, short.executionsUsed, contrasts.length]).toEqual([0, "budget", 12, 1]);
  });
});
