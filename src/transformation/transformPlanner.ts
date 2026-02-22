import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import YAML from "yaml";
import { questionBank, questionIds } from "../diagnostic/questionBank.js";
import { latestRunForAgent } from "../governor/actionPolicyEngine.js";
import { computeOrgScorecard } from "../org/orgEngine.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { parseWindowToMs } from "../utils/time.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { defaultTransformMap } from "./builtInTransformMap.js";
import { transformMapSchema, type TransformMap } from "./transformMapSchema.js";
import type { FourC } from "./fourCs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { percentDone, topBlockers, nextTasks } from "./transformScoring.js";
import { summarizeBy4C, transformMapPath, transformPlanSchema, type TransformPlan, type TransformTask, writeSignedTransformPlan } from "./transformTasks.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolhubConfig } from "../toolhub/toolhubCli.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";

interface AgentBaseline {
  runId: string;
  overall: number;
  layers: Record<string, number>;
  integrityIndex: number;
  trustLabel: string;
  indices: Record<string, number>;
  valueScore: number;
  economicSignificanceIndex: number;
  questionLevels: Record<string, number>;
  correlationRatio: number;
}

interface NodeBaseline {
  runId: string;
  overall: number;
  layers: Record<string, number>;
  integrityIndex: number;
  trustLabel: string;
  indices: Record<string, number>;
  valueScore: number;
  economicSignificanceIndex: number;
  questionLevels: Record<string, number>;
  correlationRatio: number;
}

export function initTransformMap(workspace: string): {
  path: string;
  sigPath: string;
  map: TransformMap;
} {
  ensureDir(join(workspace, ".amc"));
  const map = defaultTransformMap();
  const path = transformMapPath(workspace);
  writeFileAtomic(path, YAML.stringify(map), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  appendTransparencyEntry({
    workspace,
    type: "TRANSFORM_MAP_UPDATED",
    agentId: "system",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(readUtf8(path)),
      id: "transform-map"
    }
  });
  return {
    path,
    sigPath,
    map
  };
}

export function loadTransformMap(workspace: string): TransformMap {
  const path = transformMapPath(workspace);
  if (!pathExists(path)) {
    return defaultTransformMap();
  }
  return transformMapSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function saveTransformMap(workspace: string, map: TransformMap): {
  path: string;
  sigPath: string;
  map: TransformMap;
} {
  const parsed = transformMapSchema.parse(map);
  const path = transformMapPath(workspace);
  writeFileAtomic(path, YAML.stringify(parsed), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  appendTransparencyEntry({
    workspace,
    type: "TRANSFORM_MAP_UPDATED",
    agentId: "system",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(readUtf8(path)),
      id: "transform-map"
    }
  });
  return {
    path,
    sigPath,
    map: parsed
  };
}

export function verifyTransformMap(workspace: string): ReturnType<typeof verifySignedFileWithAuditor> {
  return verifySignedFileWithAuditor(workspace, transformMapPath(workspace));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function loadLatestOutcomeSummary(workspace: string, agentId: string): {
  valueScore: number;
  economicSignificanceIndex: number;
} {
  const reportsDir = join(workspace, ".amc", "agents", agentId, "outcomes", "reports");
  if (!pathExists(reportsDir)) {
    return {
      valueScore: 0,
      economicSignificanceIndex: 0
    };
  }
  const files = readdirSync(reportsDir)
    .filter((name: string) => name.endsWith(".json"))
    .sort((a: string, b: string) => a.localeCompare(b));
  if (files.length === 0) {
    return {
      valueScore: 0,
      economicSignificanceIndex: 0
    };
  }
  try {
    const parsed = JSON.parse(readUtf8(join(reportsDir, files[files.length - 1]!))) as {
      valueScore?: number;
      economicSignificanceIndex?: number;
    };
    return {
      valueScore: Number(parsed.valueScore ?? 0),
      economicSignificanceIndex: Number(parsed.economicSignificanceIndex ?? 0)
    };
  } catch {
    return {
      valueScore: 0,
      economicSignificanceIndex: 0
    };
  }
}

function deriveAgentBaseline(workspace: string, agentId: string): AgentBaseline {
  const run = latestRunForAgent(workspace, agentId);
  if (!run) {
    throw new Error(`No diagnostic run found for agent '${agentId}'. Run 'amc run --agent ${agentId} --window 14d' first.`);
  }
  const layerMap: Record<string, number> = {};
  for (const layer of run.layerScores) {
    layerMap[layer.layerName] = Number(layer.avgFinalLevel ?? 0);
  }
  const questionLevels: Record<string, number> = {};
  for (const q of questionBank) {
    questionLevels[q.id] = Number(run.questionScores.find((row) => row.questionId === q.id)?.finalLevel ?? 0);
  }
  const level = (questionId: string): number => Number(questionLevels[questionId] ?? 0);
  const outcome = loadLatestOutcomeSummary(workspace, agentId);
  return {
    runId: run.runId,
    overall: Number(average(Object.values(layerMap)).toFixed(3)),
    layers: layerMap,
    integrityIndex: Number(run.integrityIndex ?? 0),
    trustLabel: run.trustLabel,
    indices: {
      EcosystemFocusRisk: 100 - Math.round((level("AMC-1.4") + level("AMC-1.5") + level("AMC-5.4")) / 3 * 20),
      ClarityPathRisk: 100 - Math.round((level("AMC-1.1") + level("AMC-1.9") + level("AMC-3.3.5")) / 3 * 20),
      EconomicSignificanceRisk: 100 - Math.round((level("AMC-3.2.4") + level("AMC-3.2.5") + level("AMC-1.7")) / 3 * 20),
      RiskAssuranceRisk: 100 - Math.round((level("AMC-1.8") + level("AMC-4.6") + level("AMC-4.1")) / 3 * 20),
      DigitalDualityRisk: 100 - Math.round((level("AMC-1.5") + level("AMC-5.3") + level("AMC-2.3")) / 3 * 20)
    },
    valueScore: outcome.valueScore,
    economicSignificanceIndex: outcome.economicSignificanceIndex,
    questionLevels,
    correlationRatio: Number(run.correlationRatio ?? 0)
  };
}

function deriveNodeBaseline(workspace: string, nodeId: string, window: string): NodeBaseline {
  const scorecard = computeOrgScorecard({
    workspace,
    window
  });
  const node = scorecard.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Node not found in org scorecard: ${nodeId}`);
  }
  const questionLevels: Record<string, number> = {};
  for (const q of questionBank) {
    questionLevels[q.id] = Number(node.questionScores.find((row) => row.questionId === q.id)?.median ?? 0);
  }
  const layers: Record<string, number> = {};
  for (const layer of node.layerScores) {
    layers[layer.layerName] = Number(layer.median ?? 0);
  }
  return {
    runId: `node_${nodeId}_${scorecard.computedAt}`,
    overall: Number(node.headline.median ?? 0),
    layers,
    integrityIndex: Number(node.integrityIndex ?? 0),
    trustLabel: node.trustLabel,
    indices: Object.fromEntries((node.riskIndices ?? []).map((risk) => [risk.id, Number(risk.score0to100 ?? 0)])),
    valueScore: Number(node.valueScore ?? 0),
    economicSignificanceIndex: Number(node.economicSignificanceIndex ?? 0),
    questionLevels,
    correlationRatio: Number(node.evidenceCoverage?.medianCorrelationRatio ?? 0)
  };
}

function targetMapForAgent(workspace: string, agentId: string, mode: "SIGNED_EQUALIZER" | "EXCELLENCE_5" | "CUSTOM", override?: Record<string, number>): Record<string, number> {
  if (mode === "EXCELLENCE_5") {
    return Object.fromEntries(questionIds.map((id) => [id, 5]));
  }
  if (mode === "CUSTOM" && override) {
    const out: Record<string, number> = {};
    for (const qid of questionIds) {
      out[qid] = Math.max(0, Math.min(5, Math.round(Number(override[qid] ?? 0))));
    }
    return out;
  }
  try {
    const target = loadTargetProfile(workspace, "default", agentId);
    const out: Record<string, number> = {};
    for (const qid of questionIds) {
      out[qid] = Math.max(0, Math.min(5, Math.round(Number(target.mapping[qid] ?? 0))));
    }
    return out;
  } catch {
    return Object.fromEntries(questionIds.map((id) => [id, 3]));
  }
}

function targetMapForNode(workspace: string, nodeId: string, mode: "SIGNED_EQUALIZER" | "EXCELLENCE_5" | "CUSTOM", override?: Record<string, number>): Record<string, number> {
  if (mode === "EXCELLENCE_5") {
    return Object.fromEntries(questionIds.map((id) => [id, 5]));
  }
  if (mode === "CUSTOM" && override) {
    const out: Record<string, number> = {};
    for (const qid of questionIds) {
      out[qid] = Math.max(0, Math.min(5, Math.round(Number(override[qid] ?? 0))));
    }
    return out;
  }
  const scorecard = computeOrgScorecard({ workspace, window: "14d" });
  const node = scorecard.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Node not found for targets: ${nodeId}`);
  }
  const out: Record<string, number> = {};
  for (const qid of questionIds) {
    out[qid] = Math.max(0, Math.min(5, Math.round(Number(node.questionScores.find((row) => row.questionId === qid)?.targetMedian ?? 0))));
  }
  return out;
}

function ownerRolesForFourC(fourC: FourC): { primaryRole: "OWNER" | "OPERATOR" | "APPROVER" | "AUDITOR" | "AGENT"; secondaryRoles: Array<"OWNER" | "OPERATOR" | "APPROVER" | "AUDITOR" | "AGENT"> } {
  if (fourC === "Concept") {
    return { primaryRole: "OWNER", secondaryRoles: ["OPERATOR"] };
  }
  if (fourC === "Culture") {
    return { primaryRole: "OWNER", secondaryRoles: ["APPROVER", "AUDITOR"] };
  }
  if (fourC === "Capabilities") {
    return { primaryRole: "OPERATOR", secondaryRoles: ["AGENT"] };
  }
  return { primaryRole: "OWNER", secondaryRoles: ["OPERATOR", "AUDITOR"] };
}

function phaseForTask(params: {
  questionId: string;
  fourC: FourC;
  integrityIndex: number;
  correlationRatio: number;
}): "phase0" | "phase1" | "phase2" | "phase3" {
  const governanceQuestions = new Set([
    "AMC-1.5",
    "AMC-1.8",
    "AMC-3.2.3",
    "AMC-4.6",
    "AMC-2.5",
    "AMC-3.3.1",
    "AMC-SCI-1",
    "AMC-SCI-2",
    "AMC-SCI-3"
  ]);
  const evidenceFoundation = new Set(["AMC-1.7", "AMC-2.3", "AMC-3.3.1", "AMC-3.3.5", "AMC-4.3"]);
  if ((params.integrityIndex < 0.85 || params.correlationRatio < 0.9) && evidenceFoundation.has(params.questionId)) {
    return "phase0";
  }
  if (governanceQuestions.has(params.questionId) || params.fourC === "Configuration" || params.fourC === "Culture") {
    return "phase1";
  }
  if (params.fourC === "Capabilities") {
    return "phase2";
  }
  return "phase3";
}

function priorityForTask(gap: number, phase: string, integrityIndex: number): number {
  if (integrityIndex < 0.85 && phase === "phase0") {
    return 1;
  }
  if (phase === "phase1") {
    return gap >= 2 ? 1 : 2;
  }
  if (phase === "phase2") {
    return gap >= 2 ? 2 : 3;
  }
  return gap >= 2 ? 3 : 4;
}

function effortForTask(gap: number, fourC: FourC): number {
  const base = fourC === "Configuration" ? 4 : fourC === "Capabilities" ? 3 : 2;
  return Math.max(1, Math.min(5, Math.round(base + gap / 2)));
}

function configSignatureCheckStatus(workspace: string): {
  actionPolicy: boolean;
  tools: boolean;
  budgets: boolean;
  approvalPolicy: boolean;
} {
  return {
    actionPolicy: verifyActionPolicySignature(workspace).valid,
    tools: verifyToolhubConfig(workspace).valid,
    budgets: verifyBudgetsConfigSignature(workspace).valid,
    approvalPolicy: verifyApprovalPolicySignature(workspace).valid
  };
}

function extractRiskTier(workspace: string, agentId: string): "low" | "med" | "high" | "critical" {
  try {
    const context = loadContextGraph(workspace, agentId);
    const tier = String((context as Record<string, unknown>).riskTier ?? "med").toLowerCase();
    if (tier === "low" || tier === "med" || tier === "high" || tier === "critical") {
      return tier;
    }
    return "med";
  } catch {
    return "med";
  }
}

function buildPhaseList(tasks: TransformTask[]): TransformPlan["phases"] {
  const phaseDefinitions = [
    { id: "phase0", title: "Phase 0: Evidence & Integrity foundations", fourC: ["Configuration"] as FourC[] },
    { id: "phase1", title: "Phase 1: Governance & Safety", fourC: ["Configuration", "Culture"] as FourC[] },
    { id: "phase2", title: "Phase 2: Capability uplift", fourC: ["Capabilities"] as FourC[] },
    { id: "phase3", title: "Phase 3: Concept & Ecosystem alignment", fourC: ["Concept"] as FourC[] },
    { id: "phase4", title: "Phase 4: Excellence sustainment", fourC: ["Concept", "Culture", "Capabilities", "Configuration"] as FourC[] }
  ];
  const phaseMap = new Map<string, string[]>();
  for (const phase of phaseDefinitions) {
    phaseMap.set(phase.id, []);
  }
  for (const task of tasks) {
    phaseMap.get(task.phase)?.push(task.taskId);
  }
  return phaseDefinitions.map((phase) => ({
    ...phase,
    taskIds: (phaseMap.get(phase.id) ?? []).sort((a, b) => a.localeCompare(b))
  }));
}

function renewalCadenceFor(scopeType: "AGENT" | "NODE", trustLabel: string, riskTier?: "low" | "med" | "high" | "critical"): "weekly" | "biweekly" {
  if (trustLabel.includes("LOW") || trustLabel.includes("UNTRUSTED")) {
    return "weekly";
  }
  if (riskTier === "high" || riskTier === "critical") {
    return "weekly";
  }
  if (scopeType === "NODE") {
    return "weekly";
  }
  return "biweekly";
}

function addSustainmentTasks(tasks: TransformTask[], mapVersion: number): void {
  const sustainment: TransformTask[] = [
    {
      taskId: `tsk_sustain_verify_${randomUUID().slice(0, 6)}`,
      title: "Run continuous verification cadence",
      description: "Maintain weekly integrity verification and drift checks.",
      fourC: "Configuration",
      questionIds: ["AMC-1.7", "AMC-1.8"],
      fromLevel: 0,
      toLevel: 5,
      priority: 2,
      effort: 2,
      phase: "phase4",
      impact: {
        indices: {
          RiskAssuranceRisk: -20,
          ClarityPathRisk: -10
        },
        value: {
          Brand: 20,
          Functional: 10
        }
      },
      owners: {
        primaryRole: "OPERATOR",
        secondaryRoles: ["OWNER"]
      },
      evidenceCheckpoints: [
        {
          kind: "metric_min",
          metric: "correlation_ratio",
          min: 0.9
        }
      ],
      recommendedActions: [
        "amc verify",
        "amc loop run --agent <id> --days 14",
        "amc drift check --agent <id> --against previous"
      ],
      status: "NOT_STARTED",
      statusReason: "",
      evidenceRefs: {
        eventHashes: [],
        receipts: [],
        artifacts: []
      },
      createdFrom: {
        interventionId: "sustainment.verify",
        mapVersion
      }
    },
    {
      taskId: `tsk_sustain_assurance_${randomUUID().slice(0, 6)}`,
      title: "Re-run assurance packs on cadence",
      description: "Sustain anti-cheat and anti-hallucination posture with recurring assurance evidence.",
      fourC: "Culture",
      questionIds: ["AMC-2.5", "AMC-3.3.1"],
      fromLevel: 0,
      toLevel: 5,
      priority: 2,
      effort: 3,
      phase: "phase4",
      impact: {
        indices: {
          RiskAssuranceRisk: -25,
          DigitalDualityRisk: -15
        },
        value: {
          Brand: 30,
          Emotional: 10
        }
      },
      owners: {
        primaryRole: "OWNER",
        secondaryRoles: ["APPROVER", "AUDITOR"]
      },
      evidenceCheckpoints: [
        {
          kind: "assurance_pack_min",
          packId: "hallucination",
          minScore: 85
        },
        {
          kind: "assurance_pack_min",
          packId: "governance_bypass",
          minScore: 85
        }
      ],
      recommendedActions: [
        "amc assurance run --agent <id> --all --mode sandbox",
        "amc outcomes report --agent <id> --window 14d"
      ],
      status: "NOT_STARTED",
      statusReason: "",
      evidenceRefs: {
        eventHashes: [],
        receipts: [],
        artifacts: []
      },
      createdFrom: {
        interventionId: "sustainment.assurance",
        mapVersion
      }
    }
  ];
  tasks.push(...sustainment);
}

function planForScope(params: {
  workspace: string;
  scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string };
  mode: "SIGNED_EQUALIZER" | "EXCELLENCE_5" | "CUSTOM";
  window: string;
  targetOverride?: Record<string, number>;
}): TransformPlan {
  const map = loadTransformMap(params.workspace);
  const mapVersion = map.transformMap.version;
  const windowMs = parseWindowToMs(params.window);
  const windowDays = Math.max(1, Math.round(windowMs / 86_400_000));

  const baseline = params.scope.type === "AGENT"
    ? deriveAgentBaseline(params.workspace, params.scope.agentId)
    : deriveNodeBaseline(params.workspace, params.scope.nodeId, params.window);

  const targetMap = params.scope.type === "AGENT"
    ? targetMapForAgent(params.workspace, params.scope.agentId, params.mode, params.targetOverride)
    : targetMapForNode(params.workspace, params.scope.nodeId, params.mode, params.targetOverride);

  const signatureStatus = configSignatureCheckStatus(params.workspace);
  const tasks: TransformTask[] = [];

  for (const question of questionBank) {
    const current = Math.max(0, Math.min(5, Number(baseline.questionLevels[question.id] ?? 0)));
    const target = Math.max(0, Math.min(5, Number(targetMap[question.id] ?? 0)));
    if (target <= current) {
      continue;
    }
    const mapping = map.transformMap.questionTo4C[question.id];
    const interventions = map.transformMap.questionInterventions[question.id] ?? [];
    const intervention = interventions[0];
    if (!mapping || !intervention) {
      continue;
    }
    const phase = phaseForTask({
      questionId: question.id,
      fourC: mapping.primary,
      integrityIndex: baseline.integrityIndex,
      correlationRatio: baseline.correlationRatio
    });
    const gap = target - current;
    const priority = priorityForTask(gap, phase, baseline.integrityIndex);
    const taskId = `tsk_${question.id.replace(/[^A-Za-z0-9]/g, "_").toLowerCase()}_${randomUUID().slice(0, 6)}`;
    const owners = ownerRolesForFourC(mapping.primary);

    const evidenceCheckpoints = intervention.completionEvidence.requiresLedgerQuery.map((check) => ({ ...check }));
    if (mapping.primary === "Configuration" && !signatureStatus.actionPolicy) {
      evidenceCheckpoints.push({ kind: "config_signature_valid", path: ".amc/action-policy.yaml" });
    }
    if (mapping.primary === "Configuration" && !signatureStatus.tools) {
      evidenceCheckpoints.push({ kind: "config_signature_valid", path: ".amc/tools.yaml" });
    }
    if (mapping.primary === "Configuration" && !signatureStatus.budgets) {
      evidenceCheckpoints.push({ kind: "config_signature_valid", path: ".amc/budgets.yaml" });
    }
    if (mapping.primary === "Configuration" && !signatureStatus.approvalPolicy) {
      evidenceCheckpoints.push({ kind: "config_signature_valid", path: ".amc/approval-policy.yaml" });
    }

    tasks.push({
      taskId,
      title: `${question.id} ${current.toFixed(1)} -> ${target.toFixed(1)} (${mapping.primary})`,
      description: `Improve ${question.title} by closing a ${gap.toFixed(1)} level gap with evidence-gated checkpoints.`,
      fourC: mapping.primary,
      questionIds: [question.id],
      fromLevel: Number(current.toFixed(3)),
      toLevel: Number(target.toFixed(3)),
      priority,
      effort: effortForTask(gap, mapping.primary),
      phase,
      impact: {
        indices: Object.fromEntries(intervention.impact.indices.map((id) => [id, Number((-8 * gap).toFixed(2))])),
        value: Object.fromEntries(intervention.impact.outcomes.map((id) => [id, Number((6 * gap).toFixed(2))]))
      },
      owners,
      evidenceCheckpoints,
      recommendedActions: intervention.recommendedActions,
      status: "NOT_STARTED",
      statusReason: "",
      evidenceRefs: {
        eventHashes: [],
        receipts: [],
        artifacts: []
      },
      createdFrom: {
        interventionId: intervention.id,
        mapVersion
      }
    });
  }

  addSustainmentTasks(tasks, mapVersion);

  tasks.sort((a, b) => a.priority - b.priority || a.effort - b.effort || a.taskId.localeCompare(b.taskId));

  const by4C = summarizeBy4C(tasks);
  const summary = {
    percentDone: percentDone(tasks),
    by4C,
    topBlockers: topBlockers(tasks, 5),
    next3Tasks: nextTasks(tasks, 3)
  };

  const riskTier = params.scope.type === "AGENT" ? extractRiskTier(params.workspace, params.scope.agentId) : "high";
  const plan = transformPlanSchema.parse({
    v: 1,
    planId: `tp_${Date.now()}_${randomUUID().slice(0, 8)}`,
    scope: params.scope,
    createdTs: Date.now(),
    windowDays,
    baseline: {
      runId: baseline.runId,
      overall: Number(baseline.overall.toFixed(3)),
      layers: baseline.layers,
      integrityIndex: Number(baseline.integrityIndex.toFixed(4)),
      trustLabel: baseline.trustLabel,
      indices: baseline.indices,
      value: {
        ValueScore: Number((baseline.valueScore ?? 0).toFixed(3)),
        EconomicSignificanceIndex: Number((baseline.economicSignificanceIndex ?? 0).toFixed(3))
      }
    },
    target: {
      mode: params.mode,
      questionTargets: targetMap
    },
    phases: buildPhaseList(tasks),
    tasks,
    summary,
    renewalCadence: renewalCadenceFor(params.scope.type, baseline.trustLabel, riskTier)
  });

  return plan;
}

export function createTransformPlan(params: {
  workspace: string;
  scope: { type: "AGENT"; agentId: string } | { type: "NODE"; nodeId: string };
  to: "targets" | "excellence" | "custom";
  window?: string;
  preview?: boolean;
  targetOverride?: Record<string, number>;
}): {
  plan: TransformPlan;
  written: null | {
    planPath: string;
    sigPath: string;
    latestPath: string;
    latestSigPath: string;
  };
} {
  const mode = params.to === "excellence" ? "EXCELLENCE_5" : params.to === "custom" ? "CUSTOM" : "SIGNED_EQUALIZER";
  const window = params.window ?? "14d";
  const plan = planForScope({
    workspace: params.workspace,
    scope: params.scope,
    mode,
    window,
    targetOverride: params.targetOverride
  });
  if (params.preview) {
    return {
      plan,
      written: null
    };
  }
  const written = writeSignedTransformPlan(params.workspace, plan);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "TRANSFORM_PLAN_CREATED",
    agentId: params.scope.type === "AGENT" ? params.scope.agentId : `node:${params.scope.nodeId}`,
    artifact: {
      kind: "policy",
      sha256: sha256Hex(readUtf8(written.planPath)),
      id: plan.planId
    }
  });
  void dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: "TRANSFORM_PLAN_CREATED",
    agentId: params.scope.type === "AGENT" ? params.scope.agentId : `node:${params.scope.nodeId}`,
    summary: `Transformation plan created (${plan.planId})`,
    details: {
      scope: plan.scope,
      planId: plan.planId,
      percentDone: plan.summary.percentDone,
      next3Tasks: plan.summary.next3Tasks
    }
  }).catch(() => undefined);
  return {
    plan,
    written
  };
}
