import { apiGet, showSignIn, whoami } from "./api.js";
import { renderGapTable } from "./components/gapTable.js";
import { renderHandholdingSteps } from "./components/handholdingSteps.js";
import { moreInfo, recordRows } from "./pageKit.js";
import { plainErrorText } from "./plainError.js";

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
        <div class="bar"><span style="width:${measuredPct}; background:var(--accent)"></span></div>
        <small>Measured ${measured.toFixed(2)}</small>
        <div class="bar"><span style="width:${targetPct}; background:var(--muted)"></span></div>
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
    showSignIn(status);
    return;
  }
  status.textContent = `Signed in as ${user.username ?? user.userId ?? "user"}`;

  const [gapEnvelope, scheduler, readiness] = await Promise.all([
    // 404: no score yet. A refusal (a record that does not pass its signature check) is shown in its own words.
    apiGet("/mechanic/gap?scope=workspace").catch((error) => (error?.status === 404 ? null : { refused: plainErrorText(error) })),
    apiGet("/forecast/scheduler/status").catch(() => null),
    apiGet("/readyz").catch(() => null)
  ]);
  const gap = gapEnvelope?.gap;
  if (gapEnvelope?.refused) {
    root.innerHTML = card("Mechanic Workbench", `<p role="alert">${esc(gapEnvelope.refused)}</p>`);
    return;
  }
  if (!gap) {
    root.innerHTML = card("Mechanic Workbench", "<p>No score yet, so there is no gap to show. Run a score first (amc run in the workspace folder); this page then compares it with your <a href='./equalizer'>target levels</a>.</p>");
    return;
  }

  root.innerHTML = `
    ${card(
      "Mechanic Workbench",
      `
      <p class="muted">Measured levels next to the levels you want.</p>
      ${moreInfo("How this page works", `<p>Continuous recurrence uses recurring evidence checkpoints. This dashboard compares measured maturity vs desired targets,
        then guides deterministic upgrades through instrumentation, governance, capabilities, and checkpointing.</p>`)}
      <div class="grid">
        <div><div class="muted">Readiness</div><div class="tile-value">${esc(gap.readiness)}</div></div>
        <div><div class="muted">Integrity</div><div class="tile-value">${Number(gap.global?.integrityIndex || 0).toFixed(3)}</div></div>
        <div><div class="muted">Correlation</div><div class="tile-value">${Number(gap.global?.correlationRatio || 0).toFixed(3)}</div></div>
        <div><div class="muted">Next Forecast Refresh</div><div class="tile-value">${scheduler?.scheduler?.nextRefreshTs ? new Date(scheduler.scheduler.nextRefreshTs).toISOString() : "n/a"}</div></div>
      </div>
    `
    )}
    ${card("5 Dimensions: Measured vs Target", `<div class="grid">${renderDimensionBars(gap.perDimension)}</div>`)}
    ${card("Strategy-failure risks (read only)", recordRows(gap.global?.strategyFailureRisks || {}))}
    ${card("Value dimensions (read only)", recordRows(gap.global?.valueDimensions || {}))}
    ${card("Question Gaps", `<div id="gapTable"></div>`)}
    ${card("Upgrade Autopilot Steps", `<div id="handholdingSteps"></div>`)}
    ${card("Readiness checks", recordRows(readiness || {}))}
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

