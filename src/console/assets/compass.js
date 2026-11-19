import { esc, keyWords } from "./pageKit.js";

function latestValue(series, key) {
  const row = series?.[key];
  const point = row?.points?.[row.points.length - 1];
  return typeof point?.value === "number" ? point.value : null;
}

function cardRow(label, value) {
  return `<div><div class="muted">${esc(label)}</div><div class="tile-value">${esc(value)}</div></div>`;
}

export async function renderCompassPage(params) {
  const agentId = params.currentAgent();
  const [auto, forecast, scheduler, render] = await Promise.all([
    params.apiGet(`/diagnostic/auto-answer?agentId=${encodeURIComponent(agentId)}`),
    params.apiGet(`/forecast/latest?scope=agent&targetId=${encodeURIComponent(agentId)}`),
    params.apiGet("/forecast/scheduler/status").catch(() => null),
    params.apiGet(`/diagnostic/render?agentId=${encodeURIComponent(agentId)}`)
  ]);
  const measured = auto.measuredScores ?? {};
  const byDimension = new Map((render.dimensions ?? []).map((row) => [row.dimensionId, row.name]));
  const dimensionScores = new Map();
  for (const question of render.questions ?? []) {
    const dimension = byDimension.get(question.dimensionId) ?? `Dimension ${question.dimensionId}`;
    const current = dimensionScores.get(dimension) ?? [];
    current.push(Number(measured[question.qId] ?? 0));
    dimensionScores.set(dimension, current);
  }
  const dimensionRows = [...dimensionScores.entries()]
    .map(([name, values]) => ({
      name,
      score: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const insufficient = forecast.status === "INSUFFICIENT_EVIDENCE";
  const riskShort = latestValue(forecast.series?.indices ?? {}, "RiskAssuranceRisk");
  const maturityShort = latestValue(forecast.series ?? {}, "maturityOverall");
  const integrity = latestValue(forecast.series ?? {}, "integrityIndex");
  const unknownCount = (auto.unknownReasons ?? []).length;

  const dimensionGrid = dimensionRows.map((row) => cardRow(row.name, row.score.toFixed(2))).join("");
  const riskGrid = [
    ["EcosystemFocusRisk", latestValue(forecast.series?.indices ?? {}, "EcosystemFocusRisk")],
    ["ClarityPathRisk", latestValue(forecast.series?.indices ?? {}, "ClarityPathRisk")],
    ["EconomicSignificanceRisk", latestValue(forecast.series?.indices ?? {}, "EconomicSignificanceRisk")],
    ["RiskAssuranceRisk", latestValue(forecast.series?.indices ?? {}, "RiskAssuranceRisk")],
    ["DigitalDualityRisk", latestValue(forecast.series?.indices ?? {}, "DigitalDualityRisk")]
  ]
    .map(([label, value]) => cardRow(keyWords(label), typeof value === "number" ? value.toFixed(1) : "n/a"))
    .join("");
  const valueGrid = [
    ["EmotionalValue", latestValue(forecast.series?.value ?? {}, "EmotionalValue")],
    ["FunctionalValue", latestValue(forecast.series?.value ?? {}, "FunctionalValue")],
    ["EconomicValue", latestValue(forecast.series?.value ?? {}, "EconomicValue")],
    ["BrandValue", latestValue(forecast.series?.value ?? {}, "BrandValue")],
    ["LifetimeValue", latestValue(forecast.series?.value ?? {}, "LifetimeValue")]
  ]
    .map(([label, value]) => cardRow(keyWords(label), typeof value === "number" ? value.toFixed(1) : "n/a"))
    .join("");

  params.root.innerHTML = `
    ${params.card("Compass", `
      <div class="grid">
        ${cardRow("Agent", agentId)}
        ${cardRow("Maturity", typeof maturityShort === "number" ? maturityShort.toFixed(2) : "n/a")}
        ${cardRow("Integrity", typeof integrity === "number" ? integrity.toFixed(3) : "n/a")}
        ${cardRow("Drift Risk", typeof riskShort === "number" ? riskShort.toFixed(1) : "n/a")}
        ${cardRow("Unknown Questions", unknownCount)}
        ${cardRow("Next Refresh", scheduler?.nextRefreshTs ? new Date(scheduler.nextRefreshTs).toISOString() : "n/a")}
      </div>
      ${insufficient ? `<p class="status-bad"><strong>Not enough records yet.</strong> The forecast numbers are for information only.</p>` : ""}
    `)}
    ${params.card("Five Dimensions", `<div class="grid">${dimensionGrid}</div>`)}
    ${params.card("Five Strategy-Failure Risks", `<div class="grid">${riskGrid}</div>`)}
    ${params.card("Five Value Dimensions", `<div class="grid">${valueGrid}</div>`)}
  `;
}
