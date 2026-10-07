import { apiGet, apiPost, whoami, onClaims } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";
import { renderBenchPercentileTable } from "./components/benchPercentileTable.js";
import { renderBenchWarnings } from "./components/benchWarnings.js";

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

async function loadLatest() {
  return apiGet("/bench/comparison/latest").catch(() => ({ latest: null, exists: false }));
}

function render(root, latest) {
  root.innerHTML = `
    ${card(
      "Run Comparison",
      `
      <div class="row wrap">
        <select id="benchScope">
          <option value="workspace">workspace</option>
          <option value="node">node</option>
          <option value="agent">agent</option>
        </select>
        <input id="benchScopeId" placeholder="scope id (workspace|nodeId|agentId)" />
        <input id="benchAgainst" placeholder="imported or registry:<id>" value="imported" />
        <button id="benchCompareRun">Run Compare</button>
      </div>
      <pre id="benchCompareOut" class="scroll muted"></pre>
    `
    )}
    ${card("Percentiles", `<div id="benchPercentiles"></div>`)}
    ${card("Warnings", `<div id="benchWarnings"></div>`)}
    ${card("Peer Group", `<pre id="benchPeer" class="scroll"></pre>`)}
  `;

  const comparison = latest?.latest ?? null;
  renderBenchPercentileTable(document.getElementById("benchPercentiles"), comparison?.percentiles ?? {});
  renderBenchWarnings(document.getElementById("benchWarnings"), comparison?.warnings ?? []);
  document.getElementById("benchPeer").textContent = JSON.stringify(comparison?.peerGroup ?? {}, null, 2);
}

function wireActions() {
  const out = document.getElementById("benchCompareOut");
  document.getElementById("benchCompareRun")?.addEventListener("click", async () => {
    try {
      const scope = document.getElementById("benchScope")?.value || "workspace";
      const id = document.getElementById("benchScopeId")?.value || "workspace";
      const against = document.getElementById("benchAgainst")?.value || "imported";
      const result = await apiPost("/bench/compare", { scope, id, against });
      out.textContent = JSON.stringify(result, null, 2);
      const latest = await loadLatest();
      render(document.getElementById("app"), latest);
      wireActions();
    } catch (error) {
      out.textContent = String(error);
    }
  });
}

async function main() {
  const status = document.getElementById("status");
  const app = document.getElementById("app");
  const me = await whoami().catch(() => null);
  if (!me) {
    status.textContent = "Authentication required.";
    return;
  }
  status.textContent = `Signed in as ${me.username ?? me.userId ?? "user"}`;
  const latest = await loadLatest();
  render(app, latest);
  wireActions();
}

installClaimStrip(document.body.dataset.page, onClaims);
void main();
