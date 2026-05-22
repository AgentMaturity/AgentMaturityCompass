import { questionBank } from "../diagnostic/questionBank.js";
import type { AutoAnswerOutput } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { getForecastLatestForApi } from "../forecast/forecastApi.js";
import type { MechanicTargets } from "./targetSchema.js";
import { mechanicGapReportSchema, type MechanicGapReport } from "./mechanicSchema.js";

function dimensionIdForQuestion(questionId: string): "DIM-1" | "DIM-2" | "DIM-3" | "DIM-4" | "DIM-5" {
  if (questionId.startsWith("AMC-1.")) return "DIM-1";
  if (questionId.startsWith("AMC-COST-")) return "DIM-1";
  if (questionId.startsWith("AMC-SPORT-")) return "DIM-1";
  if (questionId.startsWith("AMC-OPS-")) return "DIM-1";
  if (questionId.startsWith("AMC-OINT-")) return "DIM-1";
  if (questionId.startsWith("AMC-TUNE-")) return "DIM-1";
  if (questionId.startsWith("AMC-2.")) return "DIM-2";
  if (questionId.startsWith("AMC-HOQ-")) return "DIM-2";
  if (questionId.startsWith("AMC-GOV-PROACTIVE-")) return "DIM-2";
  if (questionId.startsWith("AMC-BCON-")) return "DIM-2";
  if (questionId.startsWith("AMC-EUAI-")) return "DIM-2";
  if (questionId.startsWith("AMC-3.")) return "DIM-3";
  if (questionId.startsWith("AMC-SOCIAL-")) return "DIM-3";
  if (questionId.startsWith("AMC-4.")) return "DIM-4";
  if (questionId.startsWith("AMC-MEM-")) return "DIM-4";
  if (questionId.startsWith("AMC-DIST-")) return "DIM-4";
  if (questionId.startsWith("AMC-RES-")) return "DIM-4";
  if (questionId.startsWith("AMC-SK-")) return "DIM-4";
  if (questionId.startsWith("AMC-THR-")) return "DIM-4";
  if (questionId.startsWith("AMC-A2A-")) return "DIM-5";
  if (questionId.startsWith("AMC-VOICE-")) return "DIM-5";
  return "DIM-5";
}

function summarizeReadiness(integrityIndex: number, correlationRatio: number, trustLabel: string): "READY" | "NEEDS_EVIDENCE" | "UNTRUSTED" {
  if (trustLabel.includes("UNRELIABLE")) {
    return "UNTRUSTED";
  }
  if (integrityIndex < 0.85 || correlationRatio < 0.9) {
    return "NEEDS_EVIDENCE";
  }
  return "READY";
}

export function buildGapAnalysis(params: {
  workspace: string;
  scope: MechanicTargets["mechanicTargets"]["scope"];
  targets: MechanicTargets;
  measured: AutoAnswerOutput;
}): MechanicGapReport {
  const unknownMap = new Map(params.measured.unknownReasons.map((row) => [row.questionId, row.reasons]));
  const byQuestion = [...questionBank]
    .map((question) => {
      const measured = Math.max(0, Math.min(5, params.measured.measuredScores[question.id] ?? 0));
      const desiredRaw = params.targets.mechanicTargets.targets[question.id] ?? 0;
      const dim = dimensionIdForQuestion(question.id);
      const dimMin = params.targets.mechanicTargets.dimensionMinimums[dim];
      const desired = typeof dimMin === "number" ? Math.max(desiredRaw, dimMin) : desiredRaw;
      const gap = Number((desired - measured).toFixed(6));
      const reasons = [...(unknownMap.get(question.id) ?? [])];
      let status: "OK" | "UNKNOWN" | "BLOCKED" = "OK";
      if (reasons.length > 0) {
        status = "UNKNOWN";
      }
      if (gap > 0 && dim === "DIM-1" && desired >= 4 && measured <= 2) {
        status = "BLOCKED";
        reasons.push("target requires stronger governance baseline before autonomy increase");
      }
      return {
        qId: question.id,
        measured,
        desired,
        gap,
        status,
        reasons,
        evidenceCoverage: params.measured.evidenceCoverage[question.id] ?? 0
      };
    })
    .sort((a, b) => a.qId.localeCompare(b.qId));

  const perDimension = ["DIM-1", "DIM-2", "DIM-3", "DIM-4", "DIM-5"].map((dimensionId) => {
    const rows = byQuestion.filter((row) => dimensionIdForQuestion(row.qId) === dimensionId);
    const measuredAverage = rows.length > 0 ? rows.reduce((sum, row) => sum + row.measured, 0) / rows.length : 0;
    const targetAverage = rows.length > 0 ? rows.reduce((sum, row) => sum + row.desired, 0) / rows.length : 0;
    const unknownCount = rows.filter((row) => row.status === "UNKNOWN").length;
    const topGaps = [...rows]
      .sort((a, b) => b.gap - a.gap || a.qId.localeCompare(b.qId))
      .slice(0, 5)
      .map((row) => ({ qId: row.qId, gap: row.gap }));
    return {
      dimensionId,
      measuredAverage: Number(measuredAverage.toFixed(6)),
      targetAverage: Number(targetAverage.toFixed(6)),
      unknownCount,
      topGaps
    };
  });

  const latestForecast = getForecastLatestForApi({
    workspace: params.workspace,
    scope: "workspace"
  });

  const riskKeys = [
    "EcosystemFocusRisk",
    "ClarityPathRisk",
    "EconomicSignificanceRisk",
    "RiskAssuranceRisk",
    "DigitalDualityRisk"
  ] as const;
  const valueKeys = ["EmotionalValue", "FunctionalValue", "EconomicValue", "BrandValue", "LifetimeValue"] as const;

  const strategyFailureRisks: Record<string, number> = {};
  for (const key of riskKeys) {
    const value = latestForecast.series.indices[key]?.points.at(-1)?.value;
    if (typeof value === "number") {
      strategyFailureRisks[key] = Number(value.toFixed(6));
    }
  }

  const valueDimensions: Record<string, number> = {};
  for (const key of valueKeys) {
    const value = latestForecast.series.value[key]?.points.at(-1)?.value;
    if (typeof value === "number") {
      valueDimensions[key] = Number(value.toFixed(6));
    }
  }

  const readiness = summarizeReadiness(params.measured.integrityIndex, latestForecast.series.integrityIndex.points.at(-1)?.value ?? params.measured.evidenceTrustCoverage.observed, params.measured.trustLabel);

  return mechanicGapReportSchema.parse({
    v: 1,
    generatedTs: Date.now(),
    scope: params.scope,
    readiness,
    perQuestion: byQuestion,
    perDimension,
    global: {
      upgradeReadiness: readiness,
      integrityIndex: Number(params.measured.integrityIndex.toFixed(6)),
      correlationRatio: Number((latestForecast.series.integrityIndex.points.at(-1)?.value ?? 0).toFixed(6)),
      strategyFailureRisks,
      valueDimensions
    }
  });
}
