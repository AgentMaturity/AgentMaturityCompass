import type { AdvisoryRecord, ForecastArtifact } from "./forecastSchema.js";

function num(value: number): string {
  return Number(value).toFixed(3);
}

function projectionLine(label: string, row: ForecastArtifact["series"]["maturityOverall"]["forecast"]["short"]): string {
  if (!row) {
    return `- ${label}: n/a`;
  }
  return `- ${label}: ${num(row.value)} (band ${num(row.low)} .. ${num(row.high)}) @ ${new Date(row.atTs).toISOString()}`;
}

function advisoryMarkdown(advisory: AdvisoryRecord): string {
  return [
    `### ${advisory.advisoryId} (${advisory.severity})`,
    `- Category: ${advisory.category}`,
    `- Summary: ${advisory.summary}`,
    `- Why now: ${advisory.whyNow.length > 0 ? advisory.whyNow.join("; ") : "n/a"}`,
    `- Evidence refs: runs=${advisory.evidenceRefs.runIds.join(", ") || "none"} events=${advisory.evidenceRefs.eventHashes.join(", ") || "none"}`,
    `- Recommended actions:`,
    ...advisory.recommendedNextSteps.map((step) => `  - ${step}`),
    advisory.acknowledged
      ? `- Acknowledged: ${advisory.acknowledged.by} @ ${new Date(advisory.acknowledged.ts).toISOString()} (${advisory.acknowledged.note})`
      : "- Acknowledged: no",
    ""
  ].join("\n");
}

export function renderForecastMarkdown(forecast: ForecastArtifact): string {
  return [
    `# Forecast (${forecast.scope.type}:${forecast.scope.id})`,
    "",
    `- Generated: ${new Date(forecast.generatedTs).toISOString()}`,
    `- Model: ${forecast.modelVersion}`,
    `- Status: ${forecast.status}`,
    `- Policy sha256: ${forecast.policySha256}`,
    forecast.reasons.length > 0 ? `- Reasons: ${forecast.reasons.join("; ")}` : "- Reasons: none",
    "",
    "## Unified Clarity",
    `- Maturity (now): ${num(forecast.series.maturityOverall.points.at(-1)?.value ?? 0)}`,
    `- Integrity (now): ${num(forecast.series.integrityIndex.points.at(-1)?.value ?? 0)}`,
    `- Correlation (now): ${num(forecast.series.correlationRatio.points.at(-1)?.value ?? 0)}`,
    "",
    "## Maturity Forecast",
    projectionLine("Short", forecast.series.maturityOverall.forecast.short),
    projectionLine("Mid", forecast.series.maturityOverall.forecast.mid),
    projectionLine("Long", forecast.series.maturityOverall.forecast.long),
    "",
    "## Strategy-Failure Risk Indices (short horizon)",
    ...Object.entries(forecast.series.indices).map(([id, series]) => `- ${id}: ${num(series.forecast.short?.value ?? series.points.at(-1)?.value ?? 0)}`),
    "",
    "## Value Dimensions (short horizon)",
    ...Object.entries(forecast.series.value).map(([id, series]) => `- ${id}: ${num(series.forecast.short?.value ?? series.points.at(-1)?.value ?? 0)}`),
    "",
    "## Leading Indicators",
    ...forecast.leadingIndicators.map((indicator) => `- ${indicator.label}: ${indicator.direction} (z=${indicator.robustZ.toFixed(3)})`),
    "",
    "## Drift",
    ...(forecast.drift.length > 0
      ? forecast.drift.map((drift) => `- ${drift.metricId}: ${drift.severity} (delta=${drift.delta.toFixed(3)}, window=${drift.window})`)
      : ["- none"]),
    "",
    "## Anomalies",
    ...(forecast.anomalies.length > 0
      ? forecast.anomalies.map((anomaly) => `- ${anomaly.type}: ${anomaly.severity} (${anomaly.explanationTemplateId})`)
      : ["- none"]),
    "",
    "## ETA To Target",
    ...(forecast.transformPlanInput ? [
      `- Transform plan input: ${forecast.transformPlanInput.outcome}${forecast.transformPlanInput.reason ? ` (${forecast.transformPlanInput.reason})` : ""}`
    ] : []),
    `- Status: ${forecast.etaToTarget.status}`,
    ...(forecast.etaToTarget.status === "OK"
      ? [
          `- Optimistic days: ${num(forecast.etaToTarget.optimisticDays ?? 0)}`,
          `- Expected days: ${num(forecast.etaToTarget.expectedDays ?? 0)}`,
          `- Conservative days: ${num(forecast.etaToTarget.conservativeDays ?? 0)}`
        ]
      : [`- Reasons: ${(forecast.etaToTarget.reasons ?? []).join("; ") || "insufficient history"}`]),
    "",
    "## Advisories",
    ...(forecast.advisories.length > 0 ? forecast.advisories.map(advisoryMarkdown) : ["- none"]),
    "",
    "## Non-claims",
    "- This forecast is deterministic and evidence-gated; it is not a guarantee.",
    "- Numeric projections are suppressed when evidence gates fail.",
    "- No LLM judgement is used in forecast generation.",
    ""
  ].join("\n");
}

