import { apiGet, whoami, onClaims } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";

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

function row(item) {
  const bench = item?.bench ?? {};
  return `
    <tr>
      <td>${esc(item.workspaceId)}</td>
      <td>${bench.hasComparison ? "YES" : "NO"}</td>
      <td>${bench.latestGeneratedTs ? new Date(bench.latestGeneratedTs).toISOString() : "n/a"}</td>
      <td>${bench.importsCount ?? 0}</td>
      <td>${bench.warningsCount ?? 0}</td>
      <td>${bench.populationCount ?? 0}</td>
    </tr>
  `;
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
  const portfolio = await apiGet("/api/bench/portfolio").catch(() => ({ workspaces: [] }));
  const rows = (portfolio.workspaces || []).map((item) => row(item)).join("");
  app.innerHTML = `
    ${card(
      "Bench Portfolio",
      `
      <table>
        <thead>
          <tr>
            <th>Workspace</th>
            <th>Has Comparison</th>
            <th>Latest</th>
            <th>Imports</th>
            <th>Warnings</th>
            <th>Population</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No workspace data.</td></tr>`}</tbody>
      </table>
      `
    )}
    ${card("Raw", `<pre class="scroll">${esc(JSON.stringify(portfolio, null, 2))}</pre>`)}
  `;
}

installClaimStrip(document.body.dataset.page, onClaims);
void main();
