import { apiGet, apiPost, showSignIn, whoami } from "./api.js";
import { renderSimBandChart } from "./components/simBandChart.js";

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

async function resolvePlanId() {
  const latest = await apiGet("/mechanic/plan/latest").catch(() => null);
  return latest?.plan?.planId ?? null;
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

  const planId = await resolvePlanId();
  if (!planId) {
    root.innerHTML = card("Simulator", "<p class='muted'>No plan found. Create a mechanic plan first.</p>");
    return;
  }

  const simulation = await apiPost("/mechanic/simulate", { planId }).catch((error) => ({ error: String(error) }));
  root.innerHTML = `
    ${card(
      "What-If Simulator",
      `
      <p class="muted">
        Projections are bands, not promises. Numeric deltas are gated by integrity and correlation evidence.
      </p>
      <div class="grid">
        <div><div class="muted">Plan</div><div class="tile-value">${esc(planId)}</div></div>
        <div><div class="muted">Simulation Status</div><div class="tile-value">${esc(simulation?.simulation?.status || "ERROR")}</div></div>
      </div>
      <pre id="simOut" class="scroll muted">${esc(JSON.stringify(simulation, null, 2))}</pre>
      <div id="simChart"></div>
    `
    )}
  `;
  const candidate = simulation?.simulation?.candidates?.[0];
  renderSimBandChart(document.getElementById("simChart"), candidate);
}

void main();

