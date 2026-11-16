// Fleet page: the agent inventory (owner, runtime, last seen, hooks, budget, freeze, cost), agents AMC has seen but
// nobody registered, cost by owner, CSV and JSON downloads, and the "Freeze now" button. Every value that came from
// Studio, a file or an agent is escaped with pageKit's esc; an observed name is shown as text and never acted on.
import { askInline, esc } from "./pageKit.js";

const FREEZE_SCOPE = "A freeze stops only calls that are routed through AMC. An agent that calls a model or a tool directly, without AMC in the path, is not stopped. Read-only actions stay allowed.";
const MAX_SHOWN = 128;

const shown = (value) => {
  const text = String(value ?? "");
  return esc(text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}...` : text);
};
const usd = (value) => `$${Number(value || 0).toFixed(2)}`;
const when = (ts) => (typeof ts === "number" && ts > 0 ? new Date(ts).toLocaleString() : "never");
const list = (value) => (Array.isArray(value) ? value : []);

function runtimeText(row) {
  const items = list(row.runtimes);
  return items.length === 0 ? "not known"
    : items.map((entry) => `${entry.runtime}${entry.version ? ` ${entry.version}` : ""}${entry.qualified === false ? " (not a release AMC has qualified)" : ""}`).join("; ");
}
function hookText(row) {
  const items = list(row.hooks);
  return items.length === 0 ? "none"
    : items.map((hook) => `${hook.provider}: ${hook.state}${hook.mode ? `, ${hook.mode} mode` : ""}${hook.controlVerified ? ", control verified" : ""}`).join("; ");
}
function budgetText(row) {
  if (!row.budget) return "none";
  const dollars = row.budget.maxCostUsdPerDay == null ? "no dollar limit" : `${usd(row.budget.maxCostUsdPerDay)} a day`;
  return `${dollars}, ${Number(row.budget.maxLlmTokensPerDay).toLocaleString()} tokens a day${row.budget.inherited ? " (shared default)" : ""}`;
}
/** Same words as the terminal: an estimate, and "not known" (never $0) when nothing could be priced. */
export function costText(cost) {
  if (!cost) return "not known";
  if (!cost.calls) return "no calls recorded";
  if (cost.estimatedUsd == null) return `not known (${cost.calls} call${cost.calls === 1 ? "" : "s"} with no price)`;
  const unknown = cost.unknownCalls > 0 ? `, plus ${cost.unknownCalls} call${cost.unknownCalls === 1 ? "" : "s"} not known` : "";
  return `about ${usd(cost.estimatedUsd)} (estimate${unknown})`;
}

function agentRow(row) {
  const owner = row.owner ? shown(row.owner) : `<span class="pill warn">no owner</span>`;
  const freeze = row.freeze && row.freeze.active
    ? `<span class="pill warn">frozen</span>`
    : row.freeze ? `<button type="button" class="secondary" data-roles="OWNER" data-fleet-freeze="${esc(row.agentId)}">Freeze now</button>` : "not known";
  const missing = list(row.missing);
  return `<tr>
    <td>${shown(row.agentId)}${row.agentName && row.agentName !== row.agentId ? `<br><span class="muted">${shown(row.agentName)}</span>` : ""}</td>
    <td>${owner}</td>
    <td>${shown(runtimeText(row))}</td>
    <td>${esc(when(row.lastSeenTs))}</td>
    <td>${shown(hookText(row))}</td>
    <td>${esc(budgetText(row))}</td>
    <td>${esc(costText(row.cost))}</td>
    <td>${missing.length ? esc(missing.join(", ")) : `<span class="muted">nothing</span>`}</td>
    <td>${freeze}</td>
  </tr>`;
}

function windowWords(inventory) {
  const span = Math.round((Number(inventory.costWindow?.until) - Number(inventory.costWindow?.since)) / 86_400_000);
  return Number.isFinite(span) && span > 0 ? `the last ${span} day${span === 1 ? "" : "s"}` : "the chosen window";
}

/** HTML for the inventory cards. `card` and `metric` are the page shell's own helpers. */
export function fleetInventoryHtml(inventory, { card, metric }) {
  if (!inventory) {
    return card("Agents", `<p class="muted">The agent list could not be loaded. Check that AMC Studio is running, then reload this page.</p>`);
  }
  const summary = inventory.summary || {};
  const agents = list(inventory.agents);
  const unregistered = list(inventory.unregistered);
  const owners = list(inventory.costByOwner);
  return `
    ${card("Agents", `
      <div class="studio-kpi-grid">
        ${metric("Registered agents", summary.registered ?? 0)}
        ${metric("Without an owner", summary.withoutOwner ?? 0)}
        ${metric("Frozen", summary.frozen ?? 0)}
        ${metric("Seen, not registered", summary.unregistered ?? 0)}
      </div>
      <div class="scroll">
        <table>
          <thead><tr><th>Agent</th><th>Owner</th><th>Runs on</th><th>Last seen</th><th>Hooks</th><th>Budget</th><th>Cost (estimate)</th><th>Still needs</th><th>Freeze</th></tr></thead>
          <tbody>${agents.map(agentRow).join("") || "<tr><td colspan='9' class='muted'>No registered agents yet. Add one in a terminal: amc agent add</td></tr>"}</tbody>
        </table>
      </div>
      <p class="muted" id="fleetFreezeNote">${esc(FREEZE_SCOPE)} Only a person can lift a freeze, at a terminal: <code>amc freeze lift</code>.</p>
      <p class="muted">Cost covers ${esc(windowWords(inventory))}. ${esc(inventory.costNote || "")}${inventory.costProblem ? ` ${shown(inventory.costProblem)}` : ""}</p>
      <p class="muted">"Still needs" lists what an agent lacks from the fleet minimum: an owner, a budget, verified control, a qualified runtime release. To name an owner, run <code>amc fleet tag &lt;agent&gt; --owner "&lt;name&gt;"</code>.</p>
      <div class="row wrap">
        <button type="button" class="secondary" data-fleet-download="csv">Download as CSV</button>
        <button type="button" class="secondary" data-fleet-download="json">Download as JSON</button>
      </div>
    `)}
    ${unregistered.length === 0 ? "" : card("Seen by AMC but not registered", `
      <p class="muted">These names appear in AMC's records or in a hook setup, but nobody has added them to the fleet. They are shown as AMC recorded them. Until one is added on purpose it has no owner and no budget, and it cannot be frozen.</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Name as recorded</th><th>Runs on</th><th>Last seen</th></tr></thead>
          <tbody>${unregistered.map((row) => `<tr><td>${shown(row.agentId)}</td><td>${shown(runtimeText(row))}</td><td>${esc(when(row.lastSeenTs))}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="muted">To add one, run in a terminal: <code>amc agent add --from-observed &lt;id&gt; --owner "&lt;name&gt;"</code></p>
    `)}
    ${owners.length === 0 ? "" : card("Cost by owner", `
      <div class="scroll">
        <table>
          <thead><tr><th>Owner</th><th>Agents</th><th>Cost (estimate)</th></tr></thead>
          <tbody>${owners.map((total) => `<tr><td>${total.owner ? shown(total.owner) : "(no owner)"}</td><td>${esc(String(total.agents))}</td><td>${esc(costText(total))}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    `)}
  `;
}

function download(doc, name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Wires the downloads and the "Freeze now" buttons. `actions` is { apiPost, reload }. */
export function wireFleetInventory(container, actions, inventory) {
  const doc = container.ownerDocument;
  for (const button of container.querySelectorAll("[data-fleet-download]")) {
    button.addEventListener("click", () => {
      if (!inventory) return;
      if (button.dataset.fleetDownload === "csv") download(doc, "amc-fleet-inventory.csv", "text/csv", String(inventory.csv || ""));
      else { const { csv: _csv, ...rest } = inventory; download(doc, "amc-fleet-inventory.json", "application/json", JSON.stringify(rest, null, 2)); }
    });
  }
  for (const button of container.querySelectorAll("[data-fleet-freeze]")) {
    button.addEventListener("click", async () => {
      const agentId = button.getAttribute("data-fleet-freeze");
      const reason = await askInline(button, { label: `Why freeze ${agentId} now? ${FREEZE_SCOPE}`, submit: "Freeze now" });
      if (reason === null) return;
      button.disabled = true;
      try {
        await actions.apiPost("/api/v1/fleet/freeze", { agentId, reason });
        await actions.reload();
      } catch (error) {
        button.disabled = false;
        const line = doc.createElement("p");
        line.className = "status-bad";
        line.setAttribute("role", "alert");
        line.textContent = `${agentId} was not frozen: ${error && error.message ? error.message : "the request failed"}. Freezing needs an owner's sign-in and an unlocked vault.`;
        button.insertAdjacentElement("afterend", line);
      }
    });
  }
}
