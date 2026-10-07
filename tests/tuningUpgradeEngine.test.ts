/**
 * Behaviour tests for `src/tuning` (upgradeEngine.ts + tuneWizard.ts).
 *
 * Before this file, nothing in the suite exercised the tuning subsystem at all,
 * even though it is the backend for the shipped `amc tune` / `amc upgrade` fix
 * flow: gap selection against a target profile, 4C phase routing, risk-tier
 * ranking, next-gate evidence requirements, run selection out of the ledger, and
 * the in-place YAML/JSON/markdown patches the wizard applies to an operator's
 * workspace. A regression in any of those silently produces a wrong remediation
 * plan or corrupts `.amc/guardrails.yaml`, so these tests drive the real
 * functions against real temp workspaces (real ledger, real question bank) and
 * assert on the actual plan contents and the bytes written to disk.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";

const { promptMock } = vi.hoisted(() => ({ promptMock: vi.fn() }));
vi.mock("inquirer", () => ({ default: { prompt: promptMock } }));

import { loadContextGraph, type ContextGraph } from "../src/context/contextGraph.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { openLedger } from "../src/ledger/ledger.js";
import { generateTuningPack, generateUpgradePlan } from "../src/tuning/upgradeEngine.js";
import {
  runTuneWizardForAgent,
  runUpgradeWizard,
  runUpgradeWizardForAgent
} from "../src/tuning/tuneWizard.js";
import type { DiagnosticReport, QuestionScore, RiskTier, TargetProfile } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

const workspaces: string[] = [];
let answers: string[] = [];
let savedAgentEnv: string | undefined;

const AMC_5_29 = questionBank.find((question) => question.id === "AMC-5.29");
if (!AMC_5_29) {
  throw new Error("fixture assumption broken: the question bank no longer contains AMC-5.29");
}

beforeEach(() => {
  answers = [];
  promptMock.mockReset();
  promptMock.mockImplementation(async () => {
    const next = answers.shift();
    if (next === undefined) {
      throw new Error("tune wizard prompted more times than the test provided answers for");
    }
    return { action: next };
  });
  savedAgentEnv = process.env.AMC_AGENT_ID;
  delete process.env.AMC_AGENT_ID;
});

afterEach(() => {
  if (savedAgentEnv === undefined) {
    delete process.env.AMC_AGENT_ID;
  } else {
    process.env.AMC_AGENT_ID = savedAgentEnv;
  }
  while (workspaces.length > 0) {
    const dir = workspaces.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function score(questionId: string, finalLevel: number, extra: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence: 0.5,
    evidenceEventIds: [],
    flags: [],
    narrative: `narrative for ${questionId}`,
    ...extra
  };
}

function report(scores: QuestionScore[], overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    agentId: "default",
    runId: "run-1",
    ts: 1,
    windowStartTs: 0,
    windowEndTs: 1,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.8,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: scores,
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "run-seal",
    reportJsonSha256: "report-sha",
    ...overrides
  };
}

function targetProfile(mapping: Record<string, number>, name = "default"): TargetProfile {
  return {
    id: `target-${name}`,
    name,
    createdTs: 1,
    contextGraphHash: "ctx-hash",
    mapping,
    signature: "unverified-test-signature"
  };
}

function graph(riskTier: RiskTier, mission = "Ship verified outcomes"): ContextGraph {
  return {
    mission,
    successMetrics: ["verified completions"],
    constraints: ["never fabricate evidence"],
    forbiddenActions: ["exfiltrate secrets"],
    riskTier,
    escalationRules: ["escalate on low confidence"],
    entities: [{ id: "goal-1", type: "Goal", label: "Deliver verified outcomes" }]
  };
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`expected an element at index ${index} but the collection was shorter`);
  }
  return value;
}

function taskIds(plan: ReturnType<typeof generateUpgradePlan>): string[] {
  return plan.phases.flatMap((phase) => phase.tasks.map((task) => task.questionId));
}

function newWorkspace(agentId?: string, riskTier: RiskTier = "med"): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-tuning-"));
  workspaces.push(dir);
  initWorkspace({ workspacePath: dir, agentId, riskTier, trustBoundaryMode: "isolated" });
  return dir;
}

function seedRun(
  workspace: string,
  agentId: string | undefined,
  runReport: DiagnosticReport,
  status: "VALID" | "INVALID" | "UNSIGNED" = "VALID",
  ts = Date.now()
): void {
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, `${runReport.runId}.json`), JSON.stringify(runReport), "utf8");
  const ledger = openLedger(workspace);
  try {
    ledger.insertRun({
      run_id: runReport.runId,
      ts,
      window_start_ts: 0,
      window_end_ts: ts,
      target_profile_id: null,
      report_json_sha256: runReport.reportJsonSha256,
      run_seal_sig: runReport.runSealSig,
      status
    });
  } finally {
    ledger.close();
  }
}

function seedTarget(workspace: string, agentId: string | undefined, profile: TargetProfile): void {
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.targetsDir, { recursive: true });
  writeFileSync(
    join(paths.targetsDir, `${profile.name}.target.json`),
    JSON.stringify(profile, null, 2),
    "utf8"
  );
}

describe("generateUpgradePlan", () => {
  it("plans only the questions that sit below the signed target", () => {
    const plan = generateUpgradePlan(
      report([score("AMC-1.1", 1), score("AMC-2.3", 4), score("AMC-3.1.1", 2)]),
      { type: "target", profile: targetProfile({ "AMC-1.1": 4, "AMC-2.3": 2 }) },
      graph("med")
    );

    // AMC-2.3 already exceeds its target; AMC-3.1.1 is absent from the mapping
    // (treated as target 0) so neither may generate remediation work.
    expect(taskIds(plan)).toEqual(["AMC-1.1"]);
    expect(plan.mode).toBe("target");
    expect(plan.targetProfileId).toBe("target-default");

    const task = at(at(plan.phases, 0).tasks, 0);
    expect({ current: task.current, target: task.target, gap: task.gap }).toEqual({
      current: 1,
      target: 4,
      gap: 3
    });
    expect(task.reason).toContain("Gap 3 on Agent Charter & Scope");
    // P1-07: AMC-1.1 has no evidence map, so L2 is not evaluated; the task says why and promises nothing.
    expect(task.reason).toContain("Not evaluated: L2 not evaluable on runtime evidence");
    expect(task.acceptanceCriteria).toEqual([]);
  });

  it("targets level 5 for every unfinished question in excellence mode", () => {
    const plan = generateUpgradePlan(
      report([score("AMC-1.1", 5), score("AMC-2.3", 4), score("AMC-3.1.1", 0)]),
      { type: "excellence" },
      graph("med")
    );

    expect(plan.mode).toBe("excellence");
    expect(plan.targetProfileId).toBe("excellence");
    // Phase order is fixed: Concept, Culture, Capabilities, Configuration.
    expect(plan.phases.flatMap((phase) => phase.tasks.map((task) => [task.questionId, task.target, task.gap]))).toEqual([
      ["AMC-3.1.1", 5, 5],
      ["AMC-2.3", 5, 1]
    ]);
  });

  it("routes questions into 4C phases and degrades gracefully for unknown question ids", () => {
    const plan = generateUpgradePlan(
      report([
        score("AMC-1.1", 0),
        score("AMC-3.1.1", 0),
        score("AMC-2.3", 0),
        score("AMC-1.7", 0),
        score("AMC-9.9", 0)
      ]),
      { type: "excellence" },
      graph("med")
    );

    const byPhase = Object.fromEntries(
      plan.phases.map((phase) => [phase.phase, phase.tasks.map((task) => task.questionId)])
    );
    expect(byPhase).toEqual({
      "4C Phase 1: Concept": ["AMC-1.1"],
      "4C Phase 2: Culture": ["AMC-3.1.1"],
      "4C Phase 3: Capabilities": ["AMC-2.3"],
      // Unmapped ids fall through to Configuration rather than being dropped.
      "4C Phase 4: Configuration": ["AMC-1.7", "AMC-9.9"]
    });

    const unknown = at(at(plan.phases, 3).tasks, 1);
    expect(unknown.reason).toContain("Gap 5 on AMC-9.9");
    expect(unknown.acceptanceCriteria[2]).toBe(
      "Evidence events satisfy next gate requirements: L1: gate unavailable"
    );
    expect(unknown.requiredEvidence[1]).toBe("No additional mustInclude constraints for next gate.");
  });

  it("ranks by gap size first and only then prefers foundation questions on high-risk agents", () => {
    const scores = [score("AMC-3.1.1", 1), score("AMC-3.2.3", 1), score("AMC-3.3.2", 0)];
    const profile = targetProfile({ "AMC-3.1.1": 3, "AMC-3.2.3": 3, "AMC-3.3.2": 3 });
    const cultureIds = (riskTier: RiskTier): string[] =>
      at(generateUpgradePlan(report(scores), { type: "target", profile }, graph(riskTier)).phases, 1).tasks.map(
        (task) => task.questionId
      );

    // Equal gaps (AMC-3.1.1 / AMC-3.2.3) tie-break lexicographically for low risk...
    expect(cultureIds("low")).toEqual(["AMC-3.3.2", "AMC-3.1.1", "AMC-3.2.3"]);
    // ...and flip to foundation-question-first for critical risk, while the
    // larger gap on AMC-3.3.2 still outranks both.
    expect(cultureIds("critical")).toEqual(["AMC-3.3.2", "AMC-3.2.3", "AMC-3.1.1"]);
  });

  it("derives acceptance criteria from the next level's rebuilt gate, and names a level AMC cannot evaluate", () => {
    const gates = AMC_5_29.gates;
    const planFor = (current: number, target: number) => at(at(generateUpgradePlan(
      report([score("AMC-5.29", current)]),
      { type: "target", profile: targetProfile({ "AMC-5.29": target }) },
      graph("med")
    ).phases, 3).tasks, 0);

    // P1-07: AMC-5.29's evidence map makes L2 evaluable, so the next step is built from its rebuilt L2 gate.
    const nextStep = planFor(1, 2);
    expect(nextStep.acceptanceCriteria[0]).toBe("supportedMaxLevel for AMC-5.29 >= 2");
    expect(nextStep.requiredEvidence[0]).toBe(
      `Minimum viable evidence to unlock L2: L2: events>=${at(gates, 2).minEvents}, sessions>=${at(gates, 2).minSessions}, days>=${at(gates, 2).minDistinctDays}, evidence=${at(gates, 2).requiredEvidenceTypes.join(",")}`
    );
    expect(nextStep.requiredEvidence[1]).toBe("Must include signals: audit:TOOL_CALL_ALLOWED, audit:TOOL_CALL_DENIED");
    expect(nextStep.requiredEvidence.join(" ")).not.toContain("Not evaluated");

    // A target past L2 keeps the L2 step and says L3 is not evaluated, never L4's old requirements.
    const towardL4 = planFor(1, 4);
    expect(towardL4.acceptanceCriteria[0]).toBe("supportedMaxLevel for AMC-5.29 >= 2");
    expect(towardL4.requiredEvidence.at(-1)).toContain("Not evaluated: L3 not evaluable on runtime evidence: needs");
    expect(towardL4.requiredEvidence.join(" ")).not.toContain(`events>=${at(gates, 4).minEvents}`);

    // When the next level itself is not evaluated, the task promises nothing and lists none of that gate's old signals.
    const blocked = planFor(2, 4);
    expect(blocked.reason).toContain("Not evaluated: L3 not evaluable on runtime evidence");
    expect(blocked.reason).toContain("No action raises this question to L3");
    expect({ implementation: blocked.implementation, acceptanceCriteria: blocked.acceptanceCriteria, requiredEvidence: blocked.requiredEvidence })
      .toEqual({ implementation: [], acceptanceCriteria: [], requiredEvidence: [] });
    expect(JSON.stringify(blocked)).not.toContain("ALIGNMENT_CHECK_PASS");
  });
});

describe("generateTuningPack", () => {
  it("emits parseable YAML that focuses on the ten largest gaps, widest first", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `AMC-Q${index}`);
    const gapSizes = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 1];
    const scores = ids.map((id) => score(id, 0));
    const mapping = Object.fromEntries(ids.map((id, index) => [id, at(gapSizes, index)] as const));

    const pack = generateTuningPack(report(scores), targetProfile(mapping));
    const guardrails = YAML.parse(pack.guardrails) as {
      tuning: { focus: Array<Record<string, string>>; enforceEvidenceGates: boolean };
    };

    expect(guardrails.tuning.focus.map((entry) => Object.keys(entry)[0])).toEqual(ids.slice(0, 10));
    expect(at(guardrails.tuning.focus, 0)).toEqual({ "AMC-Q0": "gap 5" });
    expect(at(guardrails.tuning.focus, 9)).toEqual({ "AMC-Q9": "gap 1" });
    // The focus block must not swallow the sibling keys that follow it.
    expect(guardrails.tuning.enforceEvidenceGates).toBe(true);

    const evalHarness = YAML.parse(pack.evalHarness) as { suites: Array<{ name: string; checks: string[] }> };
    expect(at(evalHarness.suites, 0).name).toBe("tuning-priority");
    expect(at(evalHarness.suites, 0).checks).toEqual(ids.slice(0, 10).map((id) => `${id.toLowerCase()}_next_gate`));

    expect(at(pack.promptAddendum.split("\n"), 1)).toBe("- AMC-Q0: close gap 5 with evidence-linked behavior.");
    expect(pack.promptAddendum.split("\n")).toHaveLength(11);
  });

  it("still emits structurally valid patches when the agent already meets its target", () => {
    const pack = generateTuningPack(
      report([score("AMC-1.1", 4), score("AMC-2.3", 3)]),
      targetProfile({ "AMC-1.1": 3, "AMC-2.3": 3 })
    );

    const guardrails = YAML.parse(pack.guardrails) as { tuning: { focus: string[]; enforceEvidenceGates: boolean } };
    expect(guardrails.tuning.focus).toEqual(["none"]);
    expect(guardrails.tuning.enforceEvidenceGates).toBe(true);

    const evalHarness = YAML.parse(pack.evalHarness) as { suites: Array<{ name: string; checks: string[] | null }> };
    expect(evalHarness.suites).toEqual([{ name: "tuning-priority", checks: null }]);
    expect(pack.promptAddendum).toBe("## Tuning Priorities");
  });
});

describe("runUpgradeWizard", () => {
  it("writes a 4C markdown plan into the agent's reports directory", async () => {
    const workspace = newWorkspace();
    seedRun(
      workspace,
      undefined,
      report([score("AMC-1.1", 1), score("AMC-3.1.1", 0)], { runId: "run-a" })
    );

    const result = await runUpgradeWizard(workspace, "excellence");

    expect(result.planPath.startsWith(getAgentPaths(workspace, undefined).reportsDir)).toBe(true);
    expect(result.phaseCounts).toEqual([
      { phase: "4C Phase 1: Concept", tasks: 1 },
      { phase: "4C Phase 2: Culture", tasks: 1 },
      { phase: "4C Phase 3: Capabilities", tasks: 0 },
      { phase: "4C Phase 4: Configuration", tasks: 0 }
    ]);

    const markdown = readFileSync(result.planPath, "utf8");
    expect(markdown).toContain("# Upgrade Plan (excellence)");
    expect(markdown).toContain("- AMC-1.1: current 1, target 5, gap 4");
    expect(markdown).toContain("- AMC-3.1.1: current 0, target 5, gap 5");
    // P1-07: AMC-1.1's L2 is not evaluated, so its task gives the reason and no Implement/Accept/Evidence lines.
    expect(markdown).toContain("Not evaluated: L2 not evaluable on runtime evidence");
    expect(markdown).not.toContain("supportedMaxLevel for AMC-1.1");
    expect(markdown).toContain("## Owner Tasks");
    expect(markdown).toContain("## Agent Tasks");
  });

  it("honours a target: destination and fails loudly when that profile is missing", async () => {
    const workspace = newWorkspace("audit-bot");
    seedRun(
      workspace,
      "audit-bot",
      report([score("AMC-1.1", 1), score("AMC-3.1.1", 0)], { agentId: "audit-bot", runId: "run-b" })
    );
    seedTarget(workspace, "audit-bot", targetProfile({ "AMC-1.1": 2, "AMC-3.1.1": 0 }, "baseline"));

    const result = await runUpgradeWizardForAgent(workspace, "target:baseline", "audit-bot");
    const markdown = readFileSync(result.planPath, "utf8");

    expect(markdown).toContain("# Upgrade Plan (target)");
    expect(markdown).toContain("- AMC-1.1: current 1, target 2, gap 1");
    expect(markdown).not.toContain("AMC-3.1.1");
    expect(result.phaseCounts.map((entry) => entry.tasks)).toEqual([1, 0, 0, 0]);

    await expect(runUpgradeWizardForAgent(workspace, "target:no-such", "audit-bot")).rejects.toThrow(
      /Target profile not found/
    );
  });

  it("refuses to plan when no ledger run belongs to the requested agent", async () => {
    const workspace = newWorkspace("audit-bot");

    await expect(runUpgradeWizardForAgent(workspace, "excellence", "audit-bot")).rejects.toThrow(
      "No runs found. Execute `amc run` first."
    );

    // A run that exists in the ledger but whose report belongs to another agent
    // must not leak into this agent's plan.
    seedRun(workspace, "other-agent", report([score("AMC-1.1", 0)], { agentId: "other-agent", runId: "run-c" }));
    await expect(runUpgradeWizardForAgent(workspace, "excellence", "audit-bot")).rejects.toThrow(
      "No runs found. Execute `amc run` first."
    );
  });

  it("prefers a VALID run over a newer INVALID one, but plans off INVALID runs when nothing is VALID", async () => {
    const workspace = newWorkspace("audit-bot");
    seedRun(
      workspace,
      "audit-bot",
      report([score("AMC-1.1", 4)], { agentId: "audit-bot", runId: "run-valid" }),
      "VALID",
      1_000
    );
    seedRun(
      workspace,
      "audit-bot",
      report([score("AMC-1.1", 0)], { agentId: "audit-bot", runId: "run-invalid" }),
      "INVALID",
      2_000
    );

    const preferred = await runUpgradeWizardForAgent(workspace, "excellence", "audit-bot");
    expect(readFileSync(preferred.planPath, "utf8")).toContain("- AMC-1.1: current 4, target 5, gap 1");

    const invalidOnly = newWorkspace("audit-bot");
    seedRun(
      invalidOnly,
      "audit-bot",
      report([score("AMC-1.1", 0)], { agentId: "audit-bot", runId: "run-invalid" }),
      "INVALID",
      2_000
    );
    const fallback = await runUpgradeWizardForAgent(invalidOnly, "excellence", "audit-bot");
    expect(readFileSync(fallback.planPath, "utf8")).toContain("- AMC-1.1: current 0, target 5, gap 5");
  });
});

describe("runTuneWizardForAgent", () => {
  function seedTunableWorkspace(agentId: string): string {
    const workspace = newWorkspace(agentId);
    seedRun(
      workspace,
      agentId,
      report(
        [
          score("AMC-1.1", 1, { supportedMaxLevel: 1, claimedLevel: 4, flags: ["EVIDENCE_GAP"] }),
          score("AMC-3.1.1", 2, { supportedMaxLevel: 2 })
        ],
        { agentId, runId: "run-tune" }
      )
    );
    seedTarget(workspace, agentId, targetProfile({ "AMC-1.1": 4, "AMC-3.1.1": 3 }));
    return workspace;
  }

  it("summarises the widest gaps with their cap reasons and applies guardrail patches idempotently", async () => {
    const workspace = seedTunableWorkspace("tuner");
    const paths = getAgentPaths(workspace, "tuner");

    answers = ["A", "S"];
    const first = await runTuneWizardForAgent(workspace, "default", "tuner");

    expect(promptMock).toHaveBeenCalledTimes(2);
    expect(first.summary).toEqual([
      "1. AMC-1.1 gap=3 (current 1 -> target 4); cap reason: supported=1, flags=EVIDENCE_GAP",
      "2. AMC-3.1.1 gap=1 (current 2 -> target 3); cap reason: supported=2, flags=none"
    ]);
    expect(first.cron).toContain("amc --agent tuner verify");
    expect(first.rerunSteps[0]).toBe("amc --agent tuner verify");

    const afterFirst = YAML.parse(readFileSync(paths.guardrails, "utf8")) as {
      tuning: { perQuestion: Record<string, string[]> };
      honesty: { requireEvidenceRefs: boolean };
    };
    expect(afterFirst.tuning.perQuestion).toEqual({ "AMC-1.1": ["guardrails_hardened"] });
    // The pre-existing guardrails written by `amc init` must survive the patch.
    expect(afterFirst.honesty.requireEvidenceRefs).toBe(true);

    answers = ["A", "S"];
    await runTuneWizardForAgent(workspace, "default", "tuner");
    const afterSecond = YAML.parse(readFileSync(paths.guardrails, "utf8")) as {
      tuning: { perQuestion: Record<string, string[]> };
    };
    expect(afterSecond.tuning.perQuestion["AMC-1.1"]).toEqual(["guardrails_hardened"]);
  });

  it("applies the eval, prompt and context-graph patches selected per gap", async () => {
    const workspace = seedTunableWorkspace("tuner");
    const paths = getAgentPaths(workspace, "tuner");
    const promptBefore = readFileSync(paths.promptAddendum, "utf8");

    answers = ["C", "E"];
    await runTuneWizardForAgent(workspace, "default", "tuner");

    const guardrails = YAML.parse(readFileSync(paths.guardrails, "utf8")) as {
      tuning: { perQuestion: Record<string, string[]> };
    };
    expect(guardrails.tuning.perQuestion).toEqual({ "AMC-1.1": ["observability_boost"] });

    const evalHarness = YAML.parse(readFileSync(paths.evalHarness, "utf8")) as {
      suites: Array<{ name: string; checks: string[] }>;
    };
    const suite = evalHarness.suites.find((entry) => entry.name === "tuning-amc-1.1");
    expect(suite?.checks).toEqual(["gate_requirements", "evidence_coverage", "no_critical_audits"]);

    const promptAfter = readFileSync(paths.promptAddendum, "utf8");
    expect(promptAfter.startsWith(promptBefore.trim())).toBe(true);
    expect(promptAfter).toContain("## Tune AMC-3.1.1");
    expect(promptAfter).toContain("- Use stricter evidence-linked structure for this question area.");

    const graphBefore = loadContextGraph(workspace, "tuner");
    answers = ["F", "S"];
    await runTuneWizardForAgent(workspace, "default", "tuner");

    // The patched graph must still satisfy the context-graph schema, keep every
    // entity `amc init` wrote, and gain exactly the one tuning constraint.
    const graphAfter = loadContextGraph(workspace, "tuner");
    expect(graphAfter.entities.map((entity) => entity.id)).toEqual([
      ...graphBefore.entities.map((entity) => entity.id),
      "tune-AMC-1.1"
    ]);
    expect(graphAfter.entities[graphAfter.entities.length - 1]).toEqual({
      id: "tune-AMC-1.1",
      type: "Constraint",
      label: "Tuning requirement for AMC-1.1",
      details: "Added by amc tune wizard"
    });
    expect(graphAfter.mission).toBe(graphBefore.mission);
  });

  it("does not silently rewrite a guardrails file that is not a YAML mapping", async () => {
    const workspace = seedTunableWorkspace("tuner");
    const paths = getAgentPaths(workspace, "tuner");
    writeFileSync(paths.guardrails, "corrupted-guardrails-file\n", "utf8");

    answers = ["A", "S"];
    await expect(runTuneWizardForAgent(workspace, "default", "tuner")).rejects.toThrow(TypeError);
    expect(readFileSync(paths.guardrails, "utf8")).toBe("corrupted-guardrails-file\n");
  });
});
