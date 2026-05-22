import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDiagnosticBank } from "../diagnostic/bank/bankLoader.js";
import { runAutoAnswer } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { getForecastLatestForApi } from "../forecast/forecastApi.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadCanon } from "../canon/canonLoader.js";
import { cgxLatestPackForApi } from "../cgx/cgxApi.js";
import { loadMechanicTargets, mechanicTargetsPath } from "./targetsStore.js";
import { buildGapAnalysis } from "./gapAnalysis.js";
import { mechanicPlanSchema, type MechanicUpgradePlan, type MechanicActionKind } from "./upgradePlanSchema.js";

function qidDimension(qid: string): 1 | 2 | 3 | 4 | 5 {
  if (qid.startsWith("AMC-1.")) return 1;
  if (qid.startsWith("AMC-COST-")) return 1;
  if (qid.startsWith("AMC-SPORT-")) return 1;
  if (qid.startsWith("AMC-OPS-")) return 1;
  if (qid.startsWith("AMC-OINT-")) return 1;
  if (qid.startsWith("AMC-TUNE-")) return 1;
  if (qid.startsWith("AMC-2.")) return 2;
  if (qid.startsWith("AMC-HOQ-")) return 2;
  if (qid.startsWith("AMC-GOV-PROACTIVE-")) return 2;
  if (qid.startsWith("AMC-BCON-")) return 2;
  if (qid.startsWith("AMC-EUAI-")) return 2;
  if (qid.startsWith("AMC-3.")) return 3;
  if (qid.startsWith("AMC-SOCIAL-")) return 3;
  if (qid.startsWith("AMC-4.")) return 4;
  if (qid.startsWith("AMC-MEM-")) return 4;
  if (qid.startsWith("AMC-DIST-")) return 4;
  if (qid.startsWith("AMC-RES-")) return 4;
  if (qid.startsWith("AMC-SK-")) return 4;
  if (qid.startsWith("AMC-THR-")) return 4;
  if (qid.startsWith("AMC-A2A-")) return 5;
  if (qid.startsWith("AMC-VOICE-")) return 5;
  return 5;
}

function mapHintsToActionKinds(qid: string, hints: string[]): MechanicActionKind[] {
  const normalized = hints.map((hint) => hint.toLowerCase());
  const out = new Set<MechanicActionKind>();
  if (normalized.some((hint) => hint.includes("plugin"))) {
    out.add("PLUGIN_INSTALL");
  }
  if (normalized.some((hint) => hint.includes("assurance") || hint.includes("eval") || hint.includes("test"))) {
    out.add("ASSURANCE_RUN");
  }
  if (normalized.some((hint) => hint.includes("budget") || hint.includes("cost") || hint.includes("token"))) {
    out.add("BUDGETS_APPLY");
  }
  if (normalized.some((hint) => hint.includes("approval") || hint.includes("govern") || hint.includes("policy"))) {
    out.add("APPROVAL_POLICY_APPLY");
  }
  if (normalized.some((hint) => hint.includes("tool") || hint.includes("bridge") || hint.includes("receipt"))) {
    out.add("TOOLS_APPLY");
  }

  if (out.size === 0) {
    const dim = qidDimension(qid);
    if (dim === 1 || dim === 2) {
      out.add("APPROVAL_POLICY_APPLY");
    } else if (dim === 3) {
      out.add("TOOLS_APPLY");
    } else if (dim === 4) {
      out.add("BUDGETS_APPLY");
    } else {
      out.add("ASSURANCE_RUN");
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function currentOverall(measured: Record<string, number>): number {
  const values = Object.values(measured);
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function targetOverall(targets: Record<string, number>): number {
  const values = Object.values(targets);
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

function etaFromForecast(workspace: string): MechanicUpgradePlan["eta"] {
  try {
    const forecast = getForecastLatestForApi({
      workspace,
      scope: "workspace"
    });
    if (forecast.etaToTarget.status === "OK") {
      return {
        status: "OK",
        optimisticDays: forecast.etaToTarget.optimisticDays,
        expectedDays: forecast.etaToTarget.expectedDays,
        conservativeDays: forecast.etaToTarget.conservativeDays,
        reasons: []
      };
    }
    return {
      status: "UNKNOWN",
      reasons: forecast.etaToTarget.reasons ?? ["insufficient completion history"]
    };
  } catch {
    return {
      status: "UNKNOWN",
      reasons: ["forecast unavailable"]
    };
  }
}

function approvalNeeded(kind: MechanicActionKind): boolean {
  return [
    "POLICY_PACK_APPLY",
    "BUDGETS_APPLY",
    "TOOLS_APPLY",
    "APPROVAL_POLICY_APPLY",
    "PLUGIN_INSTALL",
    "FREEZE_SET"
  ].includes(kind);
}

function actionGoal(kind: MechanicActionKind): string {
  const map: Record<MechanicActionKind, string> = {
    POLICY_PACK_APPLY: "Apply signed policy baseline",
    BUDGETS_APPLY: "Align cost/token/tool budgets",
    TOOLS_APPLY: "Enforce safe tool/model routing",
    APPROVAL_POLICY_APPLY: "Strengthen dual-control quorum",
    PLUGIN_INSTALL: "Install verified content extension",
    ASSURANCE_RUN: "Collect hard evidence via assurance",
    TRANSFORM_PLAN_CREATE: "Create transformation task plan",
    FREEZE_SET: "Set protective execution freeze",
    BENCH_CREATE: "Create benchmark checkpoint",
    FORECAST_REFRESH: "Refresh forecast checkpoint"
  };
  return map[kind];
}

export async function createMechanicUpgradePlan(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}): Promise<{
  plan: MechanicUpgradePlan;
  measured: Awaited<ReturnType<typeof runAutoAnswer>>;
  gap: ReturnType<typeof buildGapAnalysis>;
}> {
  const targets = loadMechanicTargets(params.workspace);
  const bank = loadDiagnosticBank(params.workspace);
  const canon = loadCanon(params.workspace);
  const agentId = params.scopeType === "AGENT" ? params.scopeId : "default";
  const measured = await runAutoAnswer({
    workspace: params.workspace,
    agentId,
    createPlan: false
  });

  const gap = buildGapAnalysis({
    workspace: params.workspace,
    scope: {
      type: params.scopeType,
      id: params.scopeId
    },
    targets,
    measured
  });

  const bankById = new Map(bank.diagnosticBank.questions.map((row) => [row.qId, row]));
  const perQuestion = gap.perQuestion.filter((row) => row.gap > 0).sort((a, b) => b.gap - a.gap || a.qId.localeCompare(b.qId));

  const perQuestionPlan = perQuestion.map((row) => {
    const hints = bankById.get(row.qId)?.upgradeHints.relatedInterventions ?? [];
    const actions = mapHintsToActionKinds(row.qId, hints).map((kind) => `${kind.toLowerCase()}-${row.qId.toLowerCase()}`);
    return {
      qId: row.qId,
      measured: row.measured,
      target: row.desired,
      actions,
      expectedEvidence: bankById.get(row.qId)?.upgradeHints.expectedEvidence ?? []
    };
  });

  const instrumentationKinds = new Set<MechanicActionKind>(["TOOLS_APPLY", "ASSURANCE_RUN"]);
  const governanceKinds = new Set<MechanicActionKind>(["APPROVAL_POLICY_APPLY", "BUDGETS_APPLY", "POLICY_PACK_APPLY"]);
  const capabilityKinds = new Set<MechanicActionKind>(["TRANSFORM_PLAN_CREATE", "PLUGIN_INSTALL", "FREEZE_SET"]);
  const checkpointKinds = new Set<MechanicActionKind>(["FORECAST_REFRESH", "BENCH_CREATE"]);

  for (const row of perQuestion) {
    const kinds = mapHintsToActionKinds(row.qId, bankById.get(row.qId)?.upgradeHints.relatedInterventions ?? []);
    for (const kind of kinds) {
      if (row.status === "UNKNOWN") {
        instrumentationKinds.add(kind);
      } else if (["APPROVAL_POLICY_APPLY", "BUDGETS_APPLY", "POLICY_PACK_APPLY", "TOOLS_APPLY"].includes(kind)) {
        governanceKinds.add(kind);
      } else {
        capabilityKinds.add(kind);
      }
    }
  }

  capabilityKinds.add("TRANSFORM_PLAN_CREATE");
  checkpointKinds.add("FORECAST_REFRESH");
  checkpointKinds.add("BENCH_CREATE");

  const makeActions = (kinds: Set<MechanicActionKind>, phaseTag: string) =>
    [...kinds]
      .sort((a, b) => a.localeCompare(b))
      .map((kind) => ({
        id: `${phaseTag}-${kind.toLowerCase()}`,
        kind,
        requiresApproval: approvalNeeded(kind),
        effect: actionGoal(kind),
        evidenceToVerify: [
          "re-run diagnostic to confirm measured changes",
          "verify signatures and transparency entries"
        ],
        params: {
          scopeType: params.scopeType,
          scopeId: params.scopeId,
          agentId
        }
      }));

  let cgxPackSha256 = "0".repeat(64);
  try {
    const pack = cgxLatestPackForApi({
      workspace: params.workspace,
      agentId
    });
    if (pack) {
      cgxPackSha256 = sha256Hex(canonicalize(pack));
    }
  } catch {
    // keep default deterministic zero hash when no pack is available
  }

  const measuredSha = sha256Hex(canonicalize({
    measuredScores: measured.measuredScores,
    evidenceCoverage: measured.evidenceCoverage,
    unknownReasons: measured.unknownReasons
  }));
  const targetsSha = sha256Hex(readFileSync(mechanicTargetsPath(params.workspace)));

  const highRiskActionsCount = [
    ...instrumentationKinds,
    ...governanceKinds,
    ...capabilityKinds,
    ...checkpointKinds
  ].filter((kind) => approvalNeeded(kind)).length;

  const plan = mechanicPlanSchema.parse({
    v: 1,
    planId: `plan_${sha256Hex(canonicalize({
      scope: {
        type: params.scopeType,
        id: params.scopeId
      },
      targetsSha,
      measuredSha,
      bankVersion: bank.diagnosticBank.version,
      canonVersion: canon.compassCanon.version,
      cgxPackSha256,
      instrumentationKinds: [...instrumentationKinds].sort((a, b) => a.localeCompare(b)),
      governanceKinds: [...governanceKinds].sort((a, b) => a.localeCompare(b)),
      capabilityKinds: [...capabilityKinds].sort((a, b) => a.localeCompare(b)),
      checkpointKinds: [...checkpointKinds].sort((a, b) => a.localeCompare(b)),
      perQuestionPlan
    })).slice(0, 24)}`,
    scope: {
      type: params.scopeType,
      id: params.scopeId
    },
    generatedTs: Date.now(),
    inputs: {
      targetsSha256: targetsSha,
      measuredScorecardSha256: measuredSha,
      bankVersion: bank.diagnosticBank.version,
      canonVersion: canon.compassCanon.version,
      cgxPackSha256
    },
    summary: {
      currentOverall: currentOverall(measured.measuredScores),
      targetOverall: targetOverall(targets.mechanicTargets.targets),
      gapPointsTotal: Number(perQuestion.reduce((sum, row) => sum + Math.max(0, row.gap), 0).toFixed(6)),
      unknownQuestionsCount: perQuestion.filter((row) => row.status === "UNKNOWN").length,
      integrityIndex: Number(measured.integrityIndex.toFixed(6)),
      correlationRatio: Number((gap.global.correlationRatio ?? 0).toFixed(6)),
      readiness: gap.global.upgradeReadiness
    },
    phases: [
      {
        phaseId: "P1-INSTRUMENTATION",
        goal: "Increase OBSERVED evidence coverage",
        actions: makeActions(instrumentationKinds, "p1")
      },
      {
        phaseId: "P2-GOVERNANCE",
        goal: "Apply governance controls and risk boundaries",
        actions: makeActions(governanceKinds, "p2")
      },
      {
        phaseId: "P3-CAPABILITIES",
        goal: "Deploy capability interventions and execution safeguards",
        actions: makeActions(capabilityKinds, "p3")
      },
      {
        phaseId: "P4-CHECKPOINT",
        goal: "Run signed recurrence checkpoints",
        actions: makeActions(checkpointKinds, "p4")
      }
    ],
    perQuestionPlan,
    eta: etaFromForecast(params.workspace),
    safety: {
      highRiskActionsCount,
      requiresDualControl: highRiskActionsCount > 0,
      blockedByFreeze: false,
      warnings: perQuestion.filter((row) => row.status !== "OK").slice(0, 8).map((row) => `${row.qId}: ${row.reasons.join("; ") || row.status}`)
    }
  });

  return {
    plan,
    measured,
    gap
  };
}
