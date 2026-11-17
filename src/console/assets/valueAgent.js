import { renderValuePage } from "./value.js";
import { renderValueEvidenceBanner } from "./components/valueEvidenceBanner.js";
import { esc, recordRows } from "./pageKit.js";

export async function renderValueAgentPage(params) {
  const agentId = typeof params.currentAgent === "function" ? params.currentAgent() : "default";
  const encodedId = encodeURIComponent(agentId);
  // Reading only (C-01): the latest snapshot. A new value report is made on the Value page's button.
  const snapshot = await params.apiGet(`/value/snapshot/latest?scope=agent&id=${encodedId}`).catch(() => null);

  if (!snapshot) {
    await renderValuePage(params);
    return;
  }

  params.root.innerHTML = `
    ${renderValueEvidenceBanner(snapshot)}
    <section class="card">
      <h3>Value for agent <code>${esc(agentId)}</code></h3>
      <p class="muted">This agent's value figures, how much they matter to the business, and whether the records are enough to back them.</p>
      <div class="row wrap">
        <a href="./value">Value for the whole workspace</a>
        <a href="./valueKpis">KPI detail</a>
      </div>
      ${recordRows(snapshot)}
    </section>
  `;

  if (typeof params.subscribe === "function") {
    params.subscribe((event) => {
      // Not VALUE_EVIDENCE_INSUFFICIENT: this page's own read sends it, and re-reading on it would never stop.
      if (!event || !["VALUE_UPDATED", "VALUE_REGRESSION_DETECTED"].includes(event.type)) {
        return;
      }
      renderValueAgentPage(params).catch(() => undefined);
    });
  }
}
