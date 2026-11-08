import { hostRouterPath } from "./hostPortfolio.js";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderPortfolioForecastPage(params) {
  const { root, card, apiGet, pathname } = params;
  const workspaceForecast = async () => {
    const latest = await apiGet("/forecast/latest?scope=workspace");
    return {
      workspaceCount: 1,
      rows: [
        {
          workspaceId: "workspace",
          name: "Current Workspace",
          status: "ACTIVE",
          roles: [],
          readiness: { ready: true, reasons: [] },
          forecast: {
            generatedTs: latest.generatedTs ?? null,
            status: latest.status ?? "MISSING",
            maturityOverall: latest?.series?.maturityOverall?.points?.at(-1)?.value ?? null,
            integrityIndex: latest?.series?.integrityIndex?.points?.at(-1)?.value ?? null,
            riskIndexComposite: null,
            valueComposite: null,
            advisoryCount: Array.isArray(latest.advisories) ? latest.advisories.length : 0
          }
        }
      ]
    };
  };
  const hostPath = hostRouterPath("/api/portfolio/forecast", pathname);
  const data = hostPath === null ? await workspaceForecast() : await apiGet(hostPath).catch(workspaceForecast);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  root.innerHTML = `
    ${card("Portfolio Forecast", `
      <p class="muted">Unified Clarity across accessible workspaces.</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Workspace</th><th>Status</th><th>Readiness</th><th>Maturity</th><th>Integrity</th><th>Risk</th><th>Value</th><th>Advisories</th></tr></thead>
          <tbody>
            ${rows
              .map((row) => `<tr>
                <td>${htmlEscape(row.workspaceId)}</td>
                <td>${htmlEscape(row.status || "-")}</td>
                <td>${row.readiness?.ready ? "READY" : "NOT_READY"}</td>
                <td>${row.forecast?.maturityOverall == null ? "n/a" : Number(row.forecast.maturityOverall).toFixed(3)}</td>
                <td>${row.forecast?.integrityIndex == null ? "n/a" : Number(row.forecast.integrityIndex).toFixed(3)}</td>
                <td>${row.forecast?.riskIndexComposite == null ? "n/a" : Number(row.forecast.riskIndexComposite).toFixed(2)}</td>
                <td>${row.forecast?.valueComposite == null ? "n/a" : Number(row.forecast.valueComposite).toFixed(2)}</td>
                <td>${Number(row.forecast?.advisoryCount || 0)}</td>
              </tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
    `)}
    ${card("Raw", `<pre class="scroll">${htmlEscape(JSON.stringify(data, null, 2))}</pre>`)}
  `;
}
