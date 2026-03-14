import { apiGet, whoami } from "./api.js";
import { renderGapTable } from "./components/gapTable.js";
import { renderHandholdingSteps } from "./components/handholdingSteps.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function card(title, body) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

function renderDimensionBars(rows) {
  const items = Array.isArray(rows) ? rows : [];
  return items
    .map((row) => {
      const measured = Math.max(0, Math.min(5, Number(row.measuredAverage || 0)));
      const target = Math.max(0, Math.min(5, Number(row.targetAverage || 0)));
      const measuredPct = `${(measured / 5) * 100}%`;
      const targetPct = `${(target / 5) * 100}%`;
      return `
      <div class="card">
        <strong>${esc(row.dimensionId)}</strong>
        <div class="bar"><span style="width:${measuredPct}; background:#4AEF79"></span></div>
        <small>Measured ${measured.toFixed(2)}</small>
        <div class="bar"><span style="width:${targetPct}; background:#2563eb"></span></div>
        <small>Target ${target.toFixed(2)} | Unknown ${Number(row.unknownCount || 0)}</small>
      </div>
    `;
    })
    .join("");
}

async function main() {
  const status = document.getElementById("status");
  const root = document.getElementById("app");
  const user = await whoami().catch(() => null);
  if (!user) {
    status.textContent = "Authentication required.";
    return;
  }
  status.textContent = `Signed in as ${user.username ?? user.userId ?? "user"}`;

  const [gapEnvelope, scheduler, readiness] = await Promise.all([
    apiGet("/mechanic/gap?scope=workspace").catch(() => null),
    apiGet("/forecast/scheduler/status").catch(() => null),
    apiGet("/readyz").catch(() => null)
  ]);
  const gap = gapEnvelope?.gap;
  if (!gap) {
    root.innerHTML = card("Mechanic Workbench", "<p class='muted'>Gap analysis unavailable.</p>");
    return;
  }

  root.innerHTML = `
    ${card(
      "Mechanic Workbench",
      `
      <p class="muted">
        Continuous recurrence uses recurring evidence checkpoints. This dashboard compares measured maturity vs desired targets,
        then guides deterministic upgrades through instrumentation, governance, capabilities, and checkpointing.
      </p>
      <div class="grid">
        <div><div class="muted">Readiness</div><div class="tile-value">${esc(gap.readiness)}</div></div>
        <div><div class="muted">Integrity</div><div class="tile-value">${Number(gap.global?.integrityIndex || 0).toFixed(3)}</div></div>
        <div><div class="muted">Correlation</div><div class="tile-value">${Number(gap.global?.correlationRatio || 0).toFixed(3)}</div></div>
        <div><div class="muted">Next Forecast Refresh</div><div class="tile-value">${scheduler?.scheduler?.nextRefreshTs ? new Date(scheduler.scheduler.nextRefreshTs).toISOString() : "n/a"}</div></div>
      </div>
    `
    )}
    ${card("5 Dimensions: Measured vs Target", `<div class="grid">${renderDimensionBars(gap.perDimension)}</div>`)}
    ${card("Strategy-Failure Risks (Read-Only)", `<pre class="scroll">${esc(JSON.stringify(gap.global?.strategyFailureRisks || {}, null, 2))}</pre>`)}
    ${card("Value Dimensions (Read-Only)", `<pre class="scroll">${esc(JSON.stringify(gap.global?.valueDimensions || {}, null, 2))}</pre>`)}
    ${card("Question Gaps", `<div id="gapTable"></div>`)}
    ${card("Upgrade Autopilot Steps", `<div id="handholdingSteps"></div>`)}
    ${card("Readiness Checks", `<pre class="scroll">${esc(JSON.stringify(readiness || {}, null, 2))}</pre>`)}
  `;
  renderGapTable(document.getElementById("gapTable"), gap);
  renderHandholdingSteps(document.getElementById("handholdingSteps"), [
    { title: "1) Instrumentation", body: "Route model/tool activity through bridge and receipts so unknown scores can become measurable." },
    { title: "2) Governance", body: "Apply signed policy, budget, tools, and approval controls before autonomy increases." },
    { title: "3) Capabilities", body: "Run assurance and transformation actions tied to explicit evidence checkpoints." },
    { title: "4) Checkpoint", body: "Refresh forecast and bench artifacts to measure real progress from observed evidence." }
  ]);
}

void main();

