import { renderChartBand } from "./components/chartBand.js";
import { renderIndicatorList } from "./components/indicatorList.js";
import { renderAdvisoryCards } from "./components/advisoryCard.js";
import { renderEtaCard } from "./components/etaCard.js";
import { renderChartMini } from "./components/chartMini.js";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scopeLabel(scope, targetId) {
  if (scope === "agent") return `Agent ${targetId || "default"}`;
  if (scope === "node") return `Node ${targetId || "unknown"}`;
  return "Workspace";
}

export async function renderForecastScopePage(params) {
  const { root, card, apiGet, scope, targetId } = params;
  const query = new URLSearchParams({ scope });
  if (targetId) {
    query.set("targetId", targetId);
  }
  const latest = await apiGet(`/forecast/latest?${query.toString()}`);
  const advisories = await apiGet(`/advisories?${query.toString()}`).catch(() => ({ advisories: [] }));
  const forecastAdvisories = Array.isArray(advisories.advisories) ? advisories.advisories : advisories;
  const status = latest.status || "INSUFFICIENT_EVIDENCE";
  const latestMaturity = latest?.series?.maturityOverall?.points?.at(-1)?.value ?? null;
  const latestIntegrity = latest?.series?.integrityIndex?.points?.at(-1)?.value ?? null;
  const latestCorrelation = latest?.series?.correlationRatio?.points?.at(-1)?.value ?? null;

  root.innerHTML = `
    ${card(`Forecast · ${scopeLabel(scope, targetId)}`, `
      <p><strong>Status:</strong> ${htmlEscape(status)}</p>
      ${
        status !== "OK"
          ? `<div class="card status-bad"><strong>Honesty:</strong> INSUFFICIENT_EVIDENCE<br/>${(latest.reasons || []).map((r) => htmlEscape(r)).join("<br/>")}</div>`
          : `<div class="grid">
               <div><div class="muted">Maturity</div><div class="tile-value">${latestMaturity === null ? "n/a" : Number(latestMaturity).toFixed(3)}</div></div>
               <div><div class="muted">Integrity</div><div class="tile-value">${latestIntegrity === null ? "n/a" : Number(latestIntegrity).toFixed(3)}</div></div>
               <div><div class="muted">Correlation</div><div class="tile-value">${latestCorrelation === null ? "n/a" : Number(latestCorrelation).toFixed(3)}</div></div>
             </div>`
      }
      <canvas id="forecastMaturityBand" width="680" height="180" role="img" aria-label="Forecast maturity band chart with observed and forecast points."></canvas>
      <canvas id="forecastIntegrityMini" width="680" height="120" role="img" aria-label="Forecast integrity index trend chart."></canvas>
    `)}
    ${card("Leading Indicators (Why)", `<div id="forecastIndicators"></div>`)}
    ${card("ETA to Target", `<div id="forecastEta"></div>`)}
    ${card("Advisories", `<div id="forecastAdvisories"></div>`)}
    ${card("Evidence refs", `<pre class="scroll">${htmlEscape(JSON.stringify({
      runIds: latest.leadingIndicators?.flatMap((i) => i.evidenceRefs?.runIds || []) || [],
      eventHashes: latest.leadingIndicators?.flatMap((i) => i.evidenceRefs?.eventHashes || []) || []
    }, null, 2))}</pre>`)}
  `;

  renderChartBand(
    document.getElementById("forecastMaturityBand"),
    latest?.series?.maturityOverall?.points || [],
    latest?.series?.maturityOverall?.forecast || null
  );
  renderChartMini(
    document.getElementById("forecastIntegrityMini"),
    latest?.series?.integrityIndex?.points?.map((p) => p.value) || [],
    "#2563eb"
  );
  renderIndicatorList(document.getElementById("forecastIndicators"), latest.leadingIndicators || []);
  renderEtaCard(document.getElementById("forecastEta"), latest.etaToTarget);
  renderAdvisoryCards(document.getElementById("forecastAdvisories"), forecastAdvisories);
}
