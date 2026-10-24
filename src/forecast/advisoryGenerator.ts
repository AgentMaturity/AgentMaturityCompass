import { randomUUID } from "node:crypto";
import type { AdvisoryRecord, ForecastAnomaly, ForecastDrift, ForecastScope } from "./forecastSchema.js";
import { loadLatestTransformPlan } from "../transformation/transformTasks.js";

function defaultNextSteps(category: AdvisoryRecord["category"], scope: ForecastScope): string[] {
  const target =
    scope.type === "AGENT"
      ? `--agent ${scope.id}`
      : scope.type === "NODE"
        ? `--node ${scope.id}`
        : "--agent default";
  const base = [
    `amc transform plan ${target} --to targets --window 14d`,
    `amc transform track ${target}`,
    `amc assurance run ${scope.type === "AGENT" ? `--agent ${scope.id}` : "--agent default"} --all --mode sandbox`
  ];
  if (category === "NOTARY") {
    return [
      "amc trust status",
      "amc notary status",
      ...base
    ];
  }
  if (category === "VALUE_REGRESSION") {
    return [
      `amc outcomes report ${scope.type === "AGENT" ? `--agent ${scope.id}` : ""} --window 14d --out /tmp/outcomes.md`.trim(),
      "amc experiment list",
      ...base
    ];
  }
  if (category === "INTEGRITY" || category === "ANOMALY") {
    return [
      `amc run ${scope.type === "AGENT" ? `--agent ${scope.id}` : ""} --window 14d`.trim(),
      `amc indices ${scope.type === "AGENT" ? `--agent ${scope.id}` : ""} --run <runId>`.trim(),
      ...base
    ];
  }
  return base;
}

function topTransformTaskSteps(workspace: string, scope: ForecastScope): string[] {
  const plan =
    scope.type === "AGENT"
      ? loadLatestTransformPlan(workspace, { type: "AGENT", agentId: scope.id })
      : scope.type === "NODE"
        ? loadLatestTransformPlan(workspace, { type: "NODE", nodeId: scope.id })
        : null;
  if (!plan) {
    return [];
  }
  return plan.tasks
    .filter((task) => task.status !== "DONE" && task.status !== "ATTESTED")
    .sort((a, b) => a.priority - b.priority || a.effort - b.effort || a.taskId.localeCompare(b.taskId))
    .slice(0, 3)
    .map((task) => `Task ${task.taskId}: ${task.title}`);
}

function createAdvisory(params: {
  scope: ForecastScope;
  severity: AdvisoryRecord["severity"];
  category: AdvisoryRecord["category"];
  summary: string;
  evidenceRefs: AdvisoryRecord["evidenceRefs"];
  whyNow: string[];
  workspace: string;
  transformSteps?: () => readonly string[];
}): AdvisoryRecord {
  const advisoryId = `adv_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const steps = [
    ...defaultNextSteps(params.category, params.scope),
    ...(params.transformSteps?.() ?? topTransformTaskSteps(params.workspace, params.scope))
  ];
  return {
    advisoryId,
    scope: params.scope,
    severity: params.severity,
    category: params.category,
    summary: params.summary,
    whyNow: params.whyNow,
    evidenceRefs: params.evidenceRefs,
    recommendedNextSteps: [...new Set(steps)].slice(0, 8),
    createdTs: Date.now()
  };
}

export function generateAdvisories(params: {
  workspace: string;
  transformSteps?: () => readonly string[];
  scope: ForecastScope;
  drift: ForecastDrift[];
  anomalies: ForecastAnomaly[];
  riskScore: number;
  valueDrop: number;
  thresholds: {
    riskScoreWarn: number;
    riskScoreCritical: number;
  };
  insufficientEvidenceReasons: string[];
}): AdvisoryRecord[] {
  const advisories: AdvisoryRecord[] = [];

  if (params.insufficientEvidenceReasons.length > 0) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: "CRITICAL",
        category: "INTEGRITY",
        summary: "Forecast blocked due to insufficient trusted evidence.",
        evidenceRefs: {
          runIds: [],
          eventHashes: []
        },
        whyNow: [...params.insufficientEvidenceReasons]
      })
    );
  }

  for (const drift of params.drift) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: drift.severity,
        category: "DRIFT",
        summary: `Detected ${drift.severity.toLowerCase()} drift on ${drift.metricId} (${drift.delta.toFixed(3)}).`,
        evidenceRefs: drift.evidenceRefs,
        whyNow: [`Window=${drift.window}`, `Delta=${drift.delta.toFixed(3)}`]
      })
    );
  }

  for (const anomaly of params.anomalies) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: anomaly.severity,
        category: "ANOMALY",
        summary: `Anomaly detected: ${anomaly.type}.`,
        evidenceRefs: anomaly.evidenceRefs,
        whyNow: [anomaly.explanationTemplateId]
      })
    );
  }

  if (params.riskScore >= params.thresholds.riskScoreCritical) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: "CRITICAL",
        category: "RISK_INDEX",
        summary: `Forecasted risk score is critical (${params.riskScore.toFixed(2)}).`,
        evidenceRefs: { runIds: [], eventHashes: [] },
        whyNow: ["Risk index composite exceeded critical threshold."]
      })
    );
  } else if (params.riskScore >= params.thresholds.riskScoreWarn) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: "WARN",
        category: "RISK_INDEX",
        summary: `Forecasted risk score is elevated (${params.riskScore.toFixed(2)}).`,
        evidenceRefs: { runIds: [], eventHashes: [] },
        whyNow: ["Risk index composite exceeded warning threshold."]
      })
    );
  }

  if (params.valueDrop > 0.05) {
    advisories.push(
      createAdvisory({
        workspace: params.workspace,
        transformSteps: params.transformSteps,
        scope: params.scope,
        severity: params.valueDrop > 0.15 ? "CRITICAL" : "WARN",
        category: "VALUE_REGRESSION",
        summary: `Value trend indicates regression (${(params.valueDrop * 100).toFixed(2)}% expected drop).`,
        evidenceRefs: { runIds: [], eventHashes: [] },
        whyNow: ["Value dimensions trend downward versus baseline."]
      })
    );
  }

  return advisories;
}

export function captureAdvisoryRecommendations(workspace: string, input: ForecastScope) {
  const scope = { ...input }, steps = topTransformTaskSteps(workspace, scope), expected = JSON.stringify(steps);
  return { steps, assertCurrent() {
    if (JSON.stringify(topTransformTaskSteps(workspace, scope)) !== expected) throw new Error("selected forecast recommendation inputs changed while signing");
  } };
}
