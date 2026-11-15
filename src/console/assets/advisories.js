import { recordDetails } from "./pageKit.js";
import { renderAdvisoryCards } from "./components/advisoryCard.js";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderAdvisoriesPage(params) {
  const { root, card, apiGet, apiPost, currentAgent } = params;
  const agentId = currentAgent();
  const list = await apiGet(`/advisories?scope=agent&targetId=${encodeURIComponent(agentId)}`).catch(() => ({ advisories: [] }));
  const rows = Array.isArray(list.advisories) ? list.advisories : Array.isArray(list) ? list : [];

  root.innerHTML = `
    ${card("Advisories", `
      <p class="muted">Advisories are warnings AMC raised from your agent's records. An owner or operator acknowledges one to say it was seen.</p>
      ${rows.length ? `<div class="row wrap">
        <label><span class="muted">Advisory</span><select id="advisoryAckId">${rows.map((row) => `<option value="${htmlEscape(row.advisoryId ?? row.id ?? "")}">${htmlEscape(row.summary ?? row.title ?? row.category ?? row.advisoryId ?? "")}</option>`).join("")}</select></label>
        <label><span class="muted">Note (optional)</span><input id="advisoryAckNote" maxlength="500" /></label>
        <button id="advisoryAckBtn" data-roles="OWNER,OPERATOR">Acknowledge</button>
      </div>` : "<p>No advisories for this agent right now.</p>"}
      <div id="advisoryAckOut" aria-live="polite"></div>
    `)}
    ${card("Active Advisory Cards", `<div id="advisoryCards"></div>`)}
    ${card("The full record", recordDetails(rows))}
  `;
  renderAdvisoryCards(document.getElementById("advisoryCards"), rows);
  document.getElementById("advisoryAckBtn")?.addEventListener("click", async () => {
    const advisoryId = document.getElementById("advisoryAckId")?.value || "";
    const note = document.getElementById("advisoryAckNote")?.value.trim() || "Acknowledged";
    const outEl = document.getElementById("advisoryAckOut");
    try {
      const out = await apiPost(`/advisories/${encodeURIComponent(advisoryId)}/ack`, { note });
      outEl.innerHTML = `<p class="status-ok">Acknowledged.</p>${recordDetails(out)}`;
    } catch (error) {
      outEl.innerHTML = `<p class="status-bad" role="alert">${htmlEscape(String(error))}</p>`;
    }
  });
}

