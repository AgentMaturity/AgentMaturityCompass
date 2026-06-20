import { renderValueTile } from "./components/valueTile.js";
import { renderKpiCard } from "./components/kpiCard.js";
import { renderValueTrendChart } from "./components/valueTrendChart.js";
import { renderValueEvidenceBanner } from "./components/valueEvidenceBanner.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function iso(ts) {
  return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString() : "-";
}

function tileGrid(snapshot) {
  const dims = snapshot?.valueDimensions ?? {};
  return `<div class="grid">
    ${renderValueTile({ label: "Emotional Value", value: dims.emotional, status: snapshot?.status || "UNKNOWN" })}
    ${renderValueTile({ label: "Functional Value", value: dims.functional, status: snapshot?.status || "UNKNOWN" })}
    ${renderValueTile({ label: "Economic Value", value: dims.economic, status: snapshot?.status || "UNKNOWN" })}
    ${renderValueTile({ label: "Brand Value", value: dims.brand, status: snapshot?.status || "UNKNOWN" })}
    ${renderValueTile({ label: "Lifetime Value", value: dims.lifetime, status: snapshot?.status || "UNKNOWN" })}
    ${renderValueTile({ label: "Value Score", value: dims.valueScore, status: snapshot?.status || "UNKNOWN" })}
  </div>`;
}

function kpiCards(snapshot, count = 8) {
  const rows = Array.isArray(snapshot?.kpis) ? snapshot.kpis.slice(0, count) : [];
  if (rows.length === 0) {
    return "<div class='card muted'>No KPI rows available for this scope.</div>";
  }
  return rows.map((row) => renderKpiCard(row)).join("");
}

async function renderScope(params, scope, id, title) {
  const encodedId = encodeURIComponent(id);
  const snapshot = await params.apiGet(`/value/snapshot/latest?scope=${scope}&id=${encodedId}`).catch(() => null);
  const reportResp = await params.apiGet(`/value/report?scope=${scope}&id=${encodedId}&windowDays=30`).catch(() => null);
  const report = reportResp?.report ?? reportResp ?? null;
  const points = Array.isArray(report?.series?.valueScore) ? report.series.valueScore : [];

  params.root.innerHTML = [
    renderValueEvidenceBanner(snapshot),
    params.card(
      title,
      `
      ${tileGrid(snapshot)}
      <div class="grid">
        <div>
          <div class="muted">Economic Significance</div>
          <div class="tile-value">${escapeHtml(typeof snapshot?.economicSignificance?.score === "number" ? snapshot.economicSignificance.score.toFixed(2) : "UNKNOWN")}</div>
        </div>
        <div>
          <div class="muted">Economic Significance Risk</div>
          <div class="tile-value">${escapeHtml(typeof snapshot?.economicSignificance?.risk === "number" ? snapshot.economicSignificance.risk.toFixed(2) : "UNKNOWN")}</div>
        </div>
        <div>
          <div class="muted">Generated</div>
          <div class="tile-value">${escapeHtml(iso(snapshot?.generatedTs))}</div>
        </div>
        <div>
          <div class="muted">Baseline Window (days)</div>
          <div class="tile-value">${escapeHtml(String(snapshot?.baselines?.windowDays ?? "-"))}</div>
        </div>
      </div>
      <div class="row wrap">
        <button id="valueRefreshBtn">Refresh Value Snapshot</button>
        <a href="./valueKpis">Open KPI Detail</a>
      </div>
      <canvas id="valueTrendCanvas" width="640" height="170" role="img" aria-label="Value realization trend chart for the selected scope."></canvas>
      <p class="muted">Realtime + continuous recurrence: value snapshots refresh on cadence and key governance events.</p>
      `
    ),
    params.card("KPI Signals", kpiCards(snapshot))
  ].join("");

  const canvas = document.getElementById("valueTrendCanvas");
  renderValueTrendChart(canvas, points);

  document.getElementById("valueRefreshBtn")?.addEventListener("click", async () => {
    await params.apiGet(`/value/report?scope=${scope}&id=${encodedId}&windowDays=30`);
    await renderScope(params, scope, id, title);
  });

  if (typeof params.subscribe === "function") {
    params.subscribe((event) => {
      if (!event || !["VALUE_UPDATED", "VALUE_REGRESSION_DETECTED", "VALUE_EVIDENCE_INSUFFICIENT"].includes(event.type)) {
        return;
      }
      renderScope(params, scope, id, title).catch(() => undefined);
    });
  }
}

export async function renderValuePage(params) {
  await renderScope(params, "workspace", "workspace", "Value Realization: Workspace");
}
