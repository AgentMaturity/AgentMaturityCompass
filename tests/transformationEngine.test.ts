/**
 * Behavioural tests for src/transformation (the 4C transformation engine).
 *
 * Before this file, none of the twelve modules under src/transformation had a single
 * direct test: the transform-map schema, the 4C routing model, plan construction, the
 * scoring roll-ups, the status/report CLI surface and the attestation index all shipped
 * with zero executable coverage. That matters because these modules decide what remediation
 * work an operator is told to do, in what order, and which evidence is required to call it
 * done — a silently wrong 4C mapping or a target-clamping bug produces a plausible-looking
 * plan that sends people at the wrong problems, and a schema hole lets a corrupt map reach
 * plan construction and crash there instead of being rejected at load time.
 *
 * These tests drive the real code paths (no doc-string assertions) against throwaway
 * workspaces in the OS temp dir. Signing paths (initTransformMap / saveTransformMap /
 * writeTransformAttestation) require an unlocked vault and are exercised elsewhere; here we
 * use the preview/read paths and hand-written on-disk artefacts, which need no keys.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { questionIds } from "../src/diagnostic/questionBank.js";
import { FOUR_CS, normalizeFourC, type FourC } from "../src/transformation/fourCs.js";
import { defaultTransformMap } from "../src/transformation/builtInTransformMap.js";
import { transformMapSchema } from "../src/transformation/transformMapSchema.js";
import { createTransformPlan, loadTransformMap } from "../src/transformation/transformPlanner.js";
import { summarizeBy4C, type TransformTask } from "../src/transformation/transformTasks.js";
import { nextTasks, percentDone, topBlockers } from "../src/transformation/transformScoring.js";
import { transformReportCli, transformStatusCli } from "../src/transformation/transformCli.js";
import {
  findLatestAttestationForTask,
  listTransformAttestations
} from "../src/transformation/transformAttestations.js";

const workspaces: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-transformation-"));
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  while (workspaces.length > 0) {
    rmSync(workspaces.pop()!, { recursive: true, force: true });
  }
});

/** Writes the minimal diagnostic run that deriveAgentBaseline() reads. */
function seedRun(
  workspace: string,
  agentId: string,
  options: {
    integrityIndex?: number;
    correlationRatio?: number;
    questionLevels?: Record<string, number>;
  } = {}
): void {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  mkdirSync(runsDir, { recursive: true });
  const now = 1_700_000_000_000;
  const run: Record<string, unknown> = {
    agentId,
    runId: `run_${agentId}`,
    ts: now,
    windowStartTs: now - 14 * 86_400_000,
    windowEndTs: now,
    status: "VALID",
    integrityIndex: options.integrityIndex ?? 0.95,
    trustLabel: "MEDIUM_TRUST",
    correlationRatio: options.correlationRatio ?? 0.99,
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 2 }],
    questionScores: Object.entries(options.questionLevels ?? {}).map(([questionId, finalLevel]) => ({
      questionId,
      finalLevel
    })),
    evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 }
  };
  writeFileSync(join(runsDir, "run.json"), JSON.stringify(run));
}

/** A deep clone of the built-in map as loose JSON, so tests can corrupt individual fields. */
function mutableBuiltInMap(): Record<string, any> {
  return JSON.parse(JSON.stringify(defaultTransformMap())) as Record<string, any>;
}

/** Indexes gap-closing tasks by their question id (sustainment tasks are not question-specific). */
function byQuestion(tasks: TransformTask[]): Map<string | undefined, TransformTask> {
  return new Map(
    tasks
      .filter((entry) => !entry.createdFrom.interventionId.startsWith("sustainment."))
      .map((entry) => [entry.questionIds[0], entry])
  );
}

function task(overrides: Partial<TransformTask> = {}): TransformTask {
  return {
    taskId: "tsk_a",
    title: "t",
    description: "d",
    fourC: "Concept",
    questionIds: ["AMC-1.1"],
    fromLevel: 1,
    toLevel: 3,
    priority: 3,
    effort: 3,
    phase: "phase3",
    impact: { indices: {}, value: {} },
    owners: { primaryRole: "OWNER", secondaryRoles: [] },
    evidenceCheckpoints: [{ kind: "metric_min" }],
    recommendedActions: ["amc verify"],
    status: "NOT_STARTED",
    statusReason: "",
    evidenceRefs: { eventHashes: [], receipts: [], artifacts: [] },
    createdFrom: { interventionId: "int_x", mapVersion: 1 },
    ...overrides
  };
}

describe("transform map schema", () => {
  it("routes every diagnostic question to a 4C plus a distinct secondary pair", () => {
    const map = defaultTransformMap().transformMap;

    expect(Object.keys(map.questionTo4C).sort()).toEqual([...questionIds].sort());
    expect(Object.keys(map.questionInterventions).sort()).toEqual([...questionIds].sort());

    for (const questionId of questionIds) {
      const mapping = map.questionTo4C[questionId]!;
      expect(FOUR_CS).toContain(mapping.primary);
      expect(mapping.secondary).toHaveLength(2);
      expect(mapping.secondary).not.toContain(mapping.primary);
      expect(new Set(mapping.secondary).size).toBe(2);

      const interventions = map.questionInterventions[questionId]!;
      expect(interventions).toHaveLength(1);
      const intervention = interventions[0]!;
      expect(intervention.fourC).toBe(mapping.primary);
      expect(intervention.id).toBe(`int_${questionId.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}`);
      expect(intervention.recommendedActions).toHaveLength(3);
      expect(intervention.recommendedActions.every((action) => action.startsWith("amc "))).toBe(true);
      // Configuration is gated on three signed config files; the other three Cs on two ledger checks.
      expect(intervention.completionEvidence.requiresLedgerQuery).toHaveLength(
        mapping.primary === "Configuration" ? 3 : 2
      );
    }

    // Named overrides beat the layer default...
    expect(map.questionTo4C["AMC-1.1"]!.primary).toBe("Concept");
    expect(map.questionTo4C["AMC-1.4"]!.primary).toBe("Concept");
    expect(map.questionTo4C["AMC-2.5"]!.primary).toBe("Culture");
    expect(map.questionTo4C["AMC-5.3"]!.primary).toBe("Configuration");
    // ...and everything else falls back to its layer.
    expect(map.questionTo4C["AMC-1.2"]!.primary).toBe("Configuration"); // Strategic Agent Operations
    expect(map.questionTo4C["AMC-2.1"]!.primary).toBe("Capabilities"); // Leadership & Autonomy
    expect(map.questionTo4C["AMC-3.1.1"]!.primary).toBe("Culture"); // Culture & Alignment
    expect(map.questionTo4C["AMC-4.1"]!.primary).toBe("Capabilities"); // Resilience
    expect(map.questionTo4C["AMC-5.1"]!.primary).toBe("Capabilities"); // Skills (default branch)
  });

  it("rejects maps that would silently mis-plan", () => {
    const missingMapping = mutableBuiltInMap();
    delete missingMapping.transformMap.questionTo4C["AMC-1.2"];
    const a = transformMapSchema.safeParse(missingMapping);
    expect(a.success).toBe(false);
    expect(a.error?.issues.map((issue) => issue.message)).toContain(
      "transformMap.questionTo4C missing questionId AMC-1.2"
    );

    const missingIntervention = mutableBuiltInMap();
    delete missingIntervention.transformMap.questionInterventions["AMC-4.1"];
    const b = transformMapSchema.safeParse(missingIntervention);
    expect(b.success).toBe(false);
    expect(b.error?.issues.map((issue) => issue.message)).toContain(
      "transformMap.questionInterventions missing questionId AMC-4.1"
    );

    const corruptions: Array<[string, (map: Record<string, any>) => void]> = [
      ["unknown 4C", (m) => { m.transformMap.questionTo4C["AMC-1.1"].primary = "Chaos"; }],
      ["no recommended actions", (m) => { m.transformMap.questionInterventions["AMC-1.1"][0].recommendedActions = []; }],
      ["unknown evidence kind", (m) => {
        m.transformMap.questionInterventions["AMC-1.1"][0].completionEvidence.requiresLedgerQuery = [{ kind: "vibes_ok" }];
      }],
      ["assurance score above 100", (m) => {
        m.transformMap.questionInterventions["AMC-1.1"][0].completionEvidence.requiresLedgerQuery = [
          { kind: "assurance_pack_min", packId: "hallucination", minScore: 140 }
        ];
      }],
      ["prerequisite level above 5", (m) => {
        m.transformMap.questionInterventions["AMC-1.1"][0].prerequisites.minLevels = { "AMC-1.2": 9 };
      }],
      ["unsupported map version", (m) => { m.transformMap.version = 2; }],
      ["question with zero interventions", (m) => { m.transformMap.questionInterventions["AMC-1.1"] = []; }]
    ];

    for (const [label, corrupt] of corruptions) {
      const map = mutableBuiltInMap();
      corrupt(map);
      expect(transformMapSchema.safeParse(map).success, label).toBe(false);
    }
  });

  it("fills optional intervention fields with defaults instead of failing", () => {
    const map = mutableBuiltInMap();
    const intervention = map.transformMap.questionInterventions["AMC-1.1"][0];
    delete map.transformMap.questionTo4C["AMC-1.1"].secondary;
    delete intervention.prerequisites;
    delete intervention.impact.indices;
    delete intervention.impact.outcomes;
    delete intervention.completionEvidence;

    const parsed = transformMapSchema.parse(map);
    const parsedIntervention = parsed.transformMap.questionInterventions["AMC-1.1"]![0]!;
    expect(parsed.transformMap.questionTo4C["AMC-1.1"]!.secondary).toEqual([]);
    expect(parsedIntervention.prerequisites).toEqual({});
    expect(parsedIntervention.impact).toEqual({ indices: [], outcomes: [] });
    // NOTE: the completionEvidence default violates the schema's own `min(1)` rule and is
    // accepted anyway (zod does not re-validate defaults). See the plan-construction test
    // "surfaces a map without completion evidence as a plan-build failure" for the fallout.
    expect(parsedIntervention.completionEvidence).toEqual({ requiresLedgerQuery: [] });
  });
});

describe("4C model and progress scoring", () => {
  it("normalizes 4C names strictly, naming the offending value on rejection", () => {
    for (const value of FOUR_CS) {
      expect(normalizeFourC(value)).toBe(value);
      expect(normalizeFourC(`  ${value}\n`)).toBe(value);
    }
    expect(() => normalizeFourC("concept")).toThrow("Invalid 4C value: concept");
    expect(() => normalizeFourC("Config")).toThrow("Invalid 4C value: Config");
    expect(() => normalizeFourC("")).toThrow(/Invalid 4C value/);
  });

  it("rolls up progress per 4C and orders the next tasks by priority, effort, then id", () => {
    const tasks: TransformTask[] = [
      task({ taskId: "tsk_concept_done", fourC: "Concept", status: "DONE" }),
      task({ taskId: "tsk_concept_open", fourC: "Concept", status: "NOT_STARTED" }),
      task({ taskId: "tsk_culture_attested", fourC: "Culture", status: "ATTESTED" }),
      task({ taskId: "tsk_config_blocked", fourC: "Configuration", status: "BLOCKED", statusReason: "signature invalid" }),
      task({ taskId: "tsk_config_blocked_silent", fourC: "Configuration", status: "BLOCKED", statusReason: "" })
    ];

    expect(summarizeBy4C(tasks)).toEqual({
      Concept: 50,
      Culture: 100,
      Capabilities: 0, // no Capabilities tasks at all -> 0, not NaN
      Configuration: 0
    });
    expect(percentDone(tasks)).toBe(40);
    expect(percentDone([])).toBe(0);
    expect(summarizeBy4C([])).toEqual({ Concept: 0, Culture: 0, Capabilities: 0, Configuration: 0 });

    expect(topBlockers(tasks)).toEqual([
      "tsk_config_blocked: signature invalid",
      "tsk_config_blocked_silent: missing evidence"
    ]);
    expect(topBlockers(tasks, 1)).toEqual(["tsk_config_blocked: signature invalid"]);

    const queue: TransformTask[] = [
      task({ taskId: "tsk_z_low_effort", priority: 1, effort: 1, status: "BLOCKED" }),
      task({ taskId: "tsk_a_high_effort", priority: 1, effort: 4, status: "NOT_STARTED" }),
      task({ taskId: "tsk_b_same", priority: 2, effort: 2, status: "IN_PROGRESS" }),
      task({ taskId: "tsk_a_same", priority: 2, effort: 2, status: "NOT_STARTED" }),
      task({ taskId: "tsk_done_first", priority: 1, effort: 1, status: "DONE" }),
      task({ taskId: "tsk_attested_first", priority: 1, effort: 1, status: "ATTESTED" })
    ];

    expect(nextTasks(queue, 4)).toEqual([
      "tsk_z_low_effort",
      "tsk_a_high_effort",
      "tsk_a_same",
      "tsk_b_same"
    ]);
    expect(nextTasks(queue)).toHaveLength(3);
  });
});

describe("transformation plan construction", () => {
  it("builds one gap-closing task per below-target question plus sustainment, without writing in preview mode", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo", { questionLevels: { "AMC-1.1": 1, "AMC-1.2": 5 } });

    const result = createTransformPlan({
      workspace,
      scope: { type: "AGENT", agentId: "demo" },
      to: "excellence",
      preview: true
    });

    expect(result.written).toBeNull();
    expect(existsSync(join(workspace, ".amc", "agents", "demo", "transform"))).toBe(false);

    const plan = result.plan;
    // AMC-1.2 is already at 5, so it gets no task; the other 243 questions do, plus 2 sustainment tasks.
    expect(plan.tasks).toHaveLength(questionIds.length - 1 + 2);
    expect(plan.tasks.filter((t) => t.questionIds.includes("AMC-1.2") && t.phase !== "phase4")).toEqual([]);
    expect(plan.target.mode).toBe("EXCELLENCE_5");
    expect(new Set(Object.values(plan.target.questionTargets))).toEqual(new Set([5]));

    const lifted = plan.tasks.find((t) => t.taskId.startsWith("tsk_amc_1_1_"))!;
    expect(lifted.fromLevel).toBe(1);
    expect(lifted.toLevel).toBe(5);
    expect(lifted.title).toBe("AMC-1.1 1.0 -> 5.0 (Concept)");
    expect(lifted.status).toBe("NOT_STARTED");

    // Sustainment tasks are always appended, in the excellence-sustainment phase.
    const sustainment = plan.tasks.filter((t) => t.createdFrom.interventionId.startsWith("sustainment."));
    expect(sustainment.map((t) => t.createdFrom.interventionId).sort()).toEqual([
      "sustainment.assurance",
      "sustainment.verify"
    ]);
    expect(sustainment.every((t) => t.phase === "phase4")).toBe(true);

    // Every task is filed under exactly one phase, and the plan is sorted priority/effort/id.
    const phased = plan.phases.flatMap((phase) => phase.taskIds);
    expect(phased.slice().sort()).toEqual(plan.tasks.map((t) => t.taskId).sort());
    expect(new Set(phased).size).toBe(phased.length);
    const sortKeys = plan.tasks.map((t) => [t.priority, t.effort, t.taskId] as const);
    expect(sortKeys).toEqual(
      sortKeys.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]))
    );

    expect(plan.summary.percentDone).toBe(0);
    expect(plan.summary.next3Tasks).toEqual(plan.tasks.slice(0, 3).map((t) => t.taskId));
  });

  it("clamps custom targets into 0..5 and skips questions already at or above target", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo", { questionLevels: { "AMC-1.5": 4 } });

    const plan = createTransformPlan({
      workspace,
      scope: { type: "AGENT", agentId: "demo" },
      to: "custom",
      preview: true,
      targetOverride: { "AMC-1.1": 99, "AMC-1.2": -4, "AMC-1.3": 2.6, "AMC-1.5": 4, "AMC-9.9": 5 }
    }).plan;

    expect(plan.target.mode).toBe("CUSTOM");
    expect(plan.target.questionTargets["AMC-1.1"]).toBe(5);
    expect(plan.target.questionTargets["AMC-1.2"]).toBe(0);
    expect(plan.target.questionTargets["AMC-1.3"]).toBe(3);
    expect(plan.target.questionTargets["AMC-9.9"]).toBeUndefined(); // not a real question id
    expect(plan.target.questionTargets["AMC-2.1"]).toBe(0); // unspecified -> 0

    const gapTasks = plan.tasks.filter((t) => !t.createdFrom.interventionId.startsWith("sustainment."));
    expect(gapTasks.map((t) => t.questionIds[0]).sort()).toEqual(["AMC-1.1", "AMC-1.3"]);
    // AMC-1.5 target 4 == current 4, AMC-1.2 target 0 < current 0 -> neither is planned.
    expect(gapTasks.some((t) => t.questionIds[0] === "AMC-1.5")).toBe(false);
  });

  it("front-loads evidence-foundation questions into phase 0 only when integrity is weak", () => {
    const weak = makeWorkspace();
    seedRun(weak, "demo", { integrityIndex: 0.5, correlationRatio: 0.5 });
    const weakPlan = createTransformPlan({
      workspace: weak,
      scope: { type: "AGENT", agentId: "demo" },
      to: "excellence",
      preview: true
    }).plan;

    const weakById = byQuestion(weakPlan.tasks);
    expect(weakById.get("AMC-1.7")!.phase).toBe("phase0");
    expect(weakById.get("AMC-1.7")!.priority).toBe(1);
    expect(weakById.get("AMC-4.3")!.phase).toBe("phase0");
    expect(weakById.get("AMC-1.1")!.phase).toBe("phase3"); // not an evidence-foundation question
    expect(weakPlan.phases.find((p) => p.id === "phase0")!.taskIds).toHaveLength(5);

    const strong = makeWorkspace();
    seedRun(strong, "demo", { integrityIndex: 0.99, correlationRatio: 0.99 });
    const strongPlan = createTransformPlan({
      workspace: strong,
      scope: { type: "AGENT", agentId: "demo" },
      to: "excellence",
      preview: true
    }).plan;

    const strongById = byQuestion(strongPlan.tasks);
    expect(strongPlan.phases.find((p) => p.id === "phase0")!.taskIds).toEqual([]);
    expect(strongById.get("AMC-1.7")!.phase).toBe("phase1"); // Configuration
    expect(strongById.get("AMC-4.3")!.phase).toBe("phase2"); // Capabilities
  });

  it("refuses to plan for an agent that has never been diagnosed", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo");

    expect(() =>
      createTransformPlan({
        workspace,
        scope: { type: "AGENT", agentId: "ghost" },
        to: "excellence",
        preview: true
      })
    ).toThrow("No diagnostic run found for agent 'ghost'. Run 'amc run --agent ghost --window 14d' first.");
  });

  it("takes 4C, owners, actions, evidence and impact weighting from the workspace transform map", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo", { questionLevels: { "AMC-1.1": 2 } });

    const map = mutableBuiltInMap();
    map.transformMap.questionTo4C["AMC-1.1"] = { primary: "Culture", secondary: [] };
    map.transformMap.questionInterventions["AMC-1.1"] = [
      {
        id: "int_custom_charter",
        title: "Custom charter lift",
        fourC: "Culture",
        impact: { indices: ["RiskAssuranceRisk"], outcomes: ["Brand"] },
        prerequisites: {},
        completionEvidence: {
          requiresLedgerQuery: [{ kind: "trust_tier_at_least", trustTier: "OBSERVED" }]
        },
        recommendedActions: ["amc assurance run --agent demo --pack governance_bypass"]
      }
    ];
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "transform-map.yaml"), JSON.stringify(map));

    const plan = createTransformPlan({
      workspace,
      scope: { type: "AGENT", agentId: "demo" },
      to: "excellence",
      preview: true
    }).plan;

    const custom = plan.tasks.find((t) => t.questionIds[0] === "AMC-1.1")!;
    expect(custom.fourC).toBe("Culture");
    expect(custom.phase).toBe("phase1"); // Culture routes to governance & safety, not phase3
    expect(custom.owners).toEqual({ primaryRole: "OWNER", secondaryRoles: ["APPROVER", "AUDITOR"] });
    expect(custom.recommendedActions).toEqual(["amc assurance run --agent demo --pack governance_bypass"]);
    expect(custom.evidenceCheckpoints).toEqual([{ kind: "trust_tier_at_least", trustTier: "OBSERVED" }]);
    expect(custom.createdFrom).toEqual({ interventionId: "int_custom_charter", mapVersion: 1 });
    // gap of 3 levels: risk indices move -8/level, value outcomes +6/level.
    expect(custom.impact).toEqual({ indices: { RiskAssuranceRisk: -24 }, value: { Brand: 18 } });
  });

  it("surfaces a map without completion evidence as a plan-build failure", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo", { questionLevels: { "AMC-1.1": 1 } });

    const map = mutableBuiltInMap();
    for (const interventions of Object.values<any>(map.transformMap.questionInterventions)) {
      delete interventions[0].completionEvidence;
    }
    // The map itself is considered valid...
    expect(transformMapSchema.safeParse(map).success).toBe(true);
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "transform-map.yaml"), JSON.stringify(map));

    // ...but planning explodes deep inside plan validation rather than at map load.
    expect(() =>
      createTransformPlan({
        workspace,
        scope: { type: "AGENT", agentId: "demo" },
        to: "excellence",
        preview: true
      })
    ).toThrow(/evidenceCheckpoints/);
  });

  it("falls back to the built-in map when none is stored and rejects an incomplete stored map", () => {
    const workspace = makeWorkspace();

    expect(Object.keys(loadTransformMap(workspace).transformMap.questionTo4C)).toHaveLength(questionIds.length);

    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(
      join(workspace, ".amc", "transform-map.yaml"),
      JSON.stringify({ transformMap: { version: 1, questionTo4C: {}, questionInterventions: {} } })
    );
    expect(() => loadTransformMap(workspace)).toThrow(/missing questionId/);
  });
});

describe("transformation status and reporting", () => {
  it("summarizes stored task statuses and renders every task into the report file", () => {
    const workspace = makeWorkspace();
    seedRun(workspace, "demo", { questionLevels: { "AMC-1.1": 4 } });

    // Before any plan exists the scope reads as empty and unsigned, and reporting refuses to run.
    const empty = transformStatusCli({ workspace, scope: { type: "AGENT", agentId: "demo" } });
    expect(empty.plan).toBeNull();
    expect(empty.compact).toBeNull();
    expect(empty.verify.valid).toBe(false);
    expect(empty.verify.signatureExists).toBe(false);
    expect(empty.verify.reason).toBe("file missing");
    expect(() =>
      transformReportCli({ workspace, scope: { type: "AGENT", agentId: "demo" }, outFile: "out.md" })
    ).toThrow("No transformation plan found for scope. Run `amc transform plan` first.");

    const generated = createTransformPlan({
      workspace,
      scope: { type: "AGENT", agentId: "demo" },
      to: "custom",
      preview: true,
      targetOverride: { "AMC-1.1": 5, "AMC-1.2": 5, "AMC-1.3": 5 }
    }).plan;
    const stored = {
      ...generated,
      tasks: generated.tasks.map((current, index) =>
        index === 0
          ? { ...current, status: "DONE", statusReason: "All evidence checkpoints satisfied." }
          : index === 1
            ? { ...current, status: "BLOCKED", statusReason: "assurance pack hallucination missing" }
            : current
      )
    };
    const transformDir = join(workspace, ".amc", "agents", "demo", "transform");
    mkdirSync(transformDir, { recursive: true });
    writeFileSync(join(transformDir, "latest.json"), JSON.stringify(stored, null, 2));

    const status = transformStatusCli({ workspace, scope: { type: "AGENT", agentId: "demo" } });
    expect(status.compact!.scope).toBe("agent:demo");
    expect(status.compact!.planId).toBe(generated.planId);
    expect(status.compact!.statusCounts.DONE).toBe(1);
    expect(status.compact!.statusCounts.BLOCKED).toBe(1);
    expect(status.compact!.statusCounts.NOT_STARTED).toBe(stored.tasks.length - 2);
    expect(status.compact!.statusCounts.ATTESTED).toBe(0);

    const report = transformReportCli({
      workspace,
      scope: { type: "AGENT", agentId: "demo" },
      outFile: "reports/transform.md"
    });
    expect(report.outFile).toBe(join(workspace, "reports", "transform.md"));
    const onDisk = readFileSync(report.outFile, "utf8");
    expect(onDisk).toBe(report.markdown);
    for (const item of stored.tasks) {
      expect(onDisk).toContain(item.taskId);
    }
    expect(onDisk.startsWith(`# Transformation Plan ${generated.planId}\n`)).toBe(true);

    // A corrupted stored plan is rejected rather than silently half-read.
    writeFileSync(join(transformDir, "latest.json"), JSON.stringify({ ...stored, tasks: [] }));
    expect(() => transformStatusCli({ workspace, scope: { type: "AGENT", agentId: "demo" } })).toThrow();
  });
});

describe("transformation attestations index", () => {
  it("returns the newest attestation per task and skips unreadable files", () => {
    const workspace = makeWorkspace();
    const scope = { type: "AGENT" as const, agentId: "demo" };
    const dir = join(workspace, ".amc", "agents", "demo", "transform", "attestations");

    expect(listTransformAttestations(workspace, scope)).toEqual([]);
    expect(findLatestAttestationForTask(workspace, scope, "tsk_x")).toBeNull();

    mkdirSync(dir, { recursive: true });
    const attestation = (id: string, createdTs: number, taskId: string, user: string) => ({
      v: 1,
      attestationId: id,
      scope: { type: "AGENT", agentId: "demo" },
      taskId,
      createdTs,
      createdByUser: user,
      role: "OWNER",
      statement: "reviewed",
      evidenceLinks: [],
      hashes: { relatedFiles: [] }
    });
    writeFileSync(join(dir, "att_old.json"), JSON.stringify(attestation("att_old", 100, "tsk_x", "ana")));
    writeFileSync(join(dir, "att_new.json"), JSON.stringify(attestation("att_new", 500, "tsk_x", "ben")));
    writeFileSync(join(dir, "att_other.json"), JSON.stringify(attestation("att_other", 900, "tsk_y", "cleo")));
    writeFileSync(join(dir, "att_corrupt.json"), "{ this is not json");
    // Schema-invalid but parseable JSON is dropped too.
    writeFileSync(join(dir, "att_invalid.json"), JSON.stringify({ v: 1, attestationId: "att_invalid" }));
    writeFileSync(join(dir, "notes.txt"), "ignored");

    expect(listTransformAttestations(workspace, scope).map((row) => row.attestationId)).toEqual([
      "att_other",
      "att_new",
      "att_old"
    ]);
    const latest = findLatestAttestationForTask(workspace, scope, "tsk_x")!;
    expect(latest.attestationId).toBe("att_new");
    expect(latest.createdByUser).toBe("ben");
    expect(findLatestAttestationForTask(workspace, scope, "tsk_missing")).toBeNull();
  });
});
