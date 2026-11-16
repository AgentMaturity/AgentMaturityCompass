import { renderKpiCard } from "./components/kpiCard.js";
import { renderValueEvidenceBanner } from "./components/valueEvidenceBanner.js";
import { recordRows } from "./pageKit.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderValueKpisPage(params) {
  const agentId = typeof params.currentAgent === "function" ? params.currentAgent() : "default";
  const scope = "agent";
  const id = encodeURIComponent(agentId);
  let missingCode = null;
  const snapshot = await params.apiGet(`/value/snapshot/latest?scope=${scope}&id=${id}`).catch((error) => { missingCode = error?.code ?? null; return null; });
  const contract = await params.apiGet(`/value/contracts?scope=${scope}&id=${id}`).catch(() => null);
  const cards = Array.isArray(snapshot?.kpis) ? snapshot.kpis.map((row) => renderKpiCard(row)).join("") : "";

  params.root.innerHTML = [
    renderValueEvidenceBanner(snapshot, missingCode),
    params.card(
      "KPI Contract",
      `
      <p class="muted">The signed value contract says which numbers count as value for this agent and how they are weighed.</p>
      ${contract ? recordRows(contract) : `<p>No value contract for <strong>${escapeHtml(agentId)}</strong> yet. A workspace owner creates one with <code>amc value init</code> in the workspace folder.</p>`}
      `
    ),
    params.card("KPI Detail", cards || "<div class='card muted'>No KPI rows available.</div>")
  ].join("");

  if (typeof params.subscribe === "function") {
    params.subscribe((event) => {
      // Not VALUE_EVIDENCE_INSUFFICIENT: this page's own read sends it, and re-reading on it would never stop.
      if (!event || !["VALUE_UPDATED", "VALUE_REGRESSION_DETECTED"].includes(event.type)) {
        return;
      }
      renderValueKpisPage(params).catch(() => undefined);
    });
  }
}
