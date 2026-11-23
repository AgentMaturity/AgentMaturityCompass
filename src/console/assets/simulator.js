import { apiGet, apiPost, showSignIn, whoami } from "./api.js";
import { renderSimBandChart } from "./components/simBandChart.js";
import { recordDetails } from "./pageKit.js";

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
    root.innerHTML = card("Simulator", "<p>No upgrade plan yet. Make one on the <a href='./upgradeWizard'>Upgrade plan</a> page first; the simulator shows what it could change.</p>");
    return;
  }

  // Opening the page only reads the latest simulation (C-01). Running one writes a signed record, so it is a button
  // (OPERATOR or OWNER); other roles read the latest one.
  const canRun = !Array.isArray(user.roles) || user.roles.some((role) => role === "OPERATOR" || role === "OWNER");
  const show = (simulation) => {
    const sim = simulation?.simulation;
    root.innerHTML = `
    ${card(
      "What-If Simulator",
      `
      <p class="muted">
        Projections are ranges, not promises. A number is shown only where the records are trustworthy enough to support it.
      </p>
      <div class="grid">
        <div><div class="muted">Simulation</div><div class="tile-value">${sim ? esc(sim.status || "recorded") : "None yet"}</div></div>
        <div><div class="muted">Made</div><div class="tile-value">${sim?.generatedTs ? esc(new Date(sim.generatedTs).toLocaleString()) : "-"}</div></div>
      </div>
      ${sim ? "" : `<p>No simulation has been run for the current upgrade plan yet.${canRun ? " Run one to see what the plan could change." : " An operator or owner can run one."}</p>`}
      ${simulation?.error ? `<p class="status-bad" role="alert">${esc(simulation.error)}</p>` : ""}
      <div class="row wrap"><button id="simRunBtn" data-roles="OPERATOR,OWNER"${canRun ? "" : " disabled"}>Run a new simulation</button></div>
      <div id="simChart"></div>
      ${sim ? recordDetails(simulation) : ""}
    `
    )}
  `;
    renderSimBandChart(document.getElementById("simChart"), sim?.candidates?.[0]);
    document.getElementById("simRunBtn")?.addEventListener("click", async () => {
      show(await apiPost("/mechanic/simulate", { planId }).catch((error) => ({ error: String(error) })));
    });
  };
  show(await apiGet("/mechanic/simulations/latest").catch(() => null));
}

void main();

