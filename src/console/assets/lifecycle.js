// Lifecycle panel on agent.html (P2-23): the governed agent's state, transitions and reassessments as Studio returns them,
// and the owner transition form. Every string from Studio goes through esc(). Studio resolves the actor from the sign-in
// and re-checks every move (OWNER, bound approval); the form is a convenience, never the guard.
import { apiGet, apiPost, ConsoleApiError } from "./api.js";
import { routeTrack } from "./pageKit.js";

const panel = document.getElementById("lifecyclePanel");
const agentId = new URLSearchParams(location.search).get("agent") || "default";
const API = `/api/v1/lifecycle/agents/${encodeURIComponent(agentId)}`;
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
const list = (value) => (Array.isArray(value) ? value : []);
const when = (ts) => (typeof ts === "number" ? new Date(ts).toISOString() : "none");
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th scope="col">${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);

async function render(message) {
  const { state, transitions, reassessments } = (await apiGet(API)).data;
  // The agent's state as a route (proposed, approved, active); suspended or retired stop it. The records stay one click away.
  // A waypoint is done only when a recorded transition reached it; the state now is "you are here" (or stopped). An
  // implicit state (no lifecycle record yet) ticks nothing it was never recorded to pass.
  const order = ["proposed", "approved", "active"];
  const reached = new Set(list(transitions).map((row) => row.to));
  const label = (name) => String(name)[0].toUpperCase() + String(name).slice(1);
  const steps = order.map((name) => ({ label: label(name), state: name === state.state ? "now" : reached.has(name) ? "done" : "todo" }));
  if (!order.includes(state.state)) steps.push({ label: label(state.state), state: "stop" });
  const fold = (summary, html) => `<details class="more-info"><summary>${esc(summary)}</summary><div class="more-info-body">${html}</div></details>`;
  panel.innerHTML = `<h2 class="section-title">Agent state</h2>
    ${message ? `<p role="status">${esc(message)}</p>` : ""}
    ${routeTrack(steps, { label: `State of ${agentId}`, className: "route-small" })}
    <p><strong>${esc(state.state)}</strong> (${esc(state.reason)}), claim kind ${esc(state.claimKind)}${state.implicit ? ", no lifecycle record yet" : ""}.</p>
    ${fold(`Lifecycle: ${agentId}`, `<p>Approval ${esc(state.approvalId ?? "none")}; review due ${esc(when(state.reviewDueTs))}${state.reviewAdvisory ? " (advisory)" : ""}.</p>`)}
    ${fold(`Transitions (${list(transitions).length})`, table(["Time", "From", "To", "Reason", "Actor", "Approval"], list(transitions).map((row) =>
      [when(row.ts), row.from ?? "none", row.to, row.reason, row.actor?.username ?? "", row.approvalId ?? ""]), "No transition recorded."))}
    ${fold(`Reassessments (${list(reassessments).length})`, table(["Opened", "Trigger", "Changed", "Invalidated controls", "Required tests", "Status", "Envelope"], list(reassessments).map((row) =>
      [when(row.createdTs), row.trigger, list(row.changed).join(", "), list(row.invalidatedControls).join(", "), list(row.requiredTests).join(", "), row.status, row.envelopeId ?? ""]),
      "No reassessment recorded."))}
    ${fold("Change its state", `<form id="lifecycleForm"><h3>Transition (owner)</h3>
      <p class="muted">Approving, resuming and approving a migrated agent need an approval bound to this agent, target, manifest and plan, decided by people other than you.</p>
      <label>To <select id="lifecycleTo">${["proposed", "approved", "active", "suspended", "retired"].map((to) => `<option>${to}</option>`).join("")}</select></label>
      <label>Approval id <input id="lifecycleApproval" maxlength="200" autocomplete="off" /></label>
      <label>Note <input id="lifecycleNote" maxlength="2000" autocomplete="off" /></label>
      <label><input id="lifecycleRequest" type="checkbox" /> Request the approval instead</label>
      <button type="submit" class="secondary">Submit</button></form>`)}`;
  document.getElementById("lifecycleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const approvalId = document.getElementById("lifecycleApproval").value.trim();
    const note = document.getElementById("lifecycleNote").value.trim();
    const body = { to: document.getElementById("lifecycleTo").value, ...(approvalId ? { approvalId } : {}), ...(note ? { note } : {}),
      ...(document.getElementById("lifecycleRequest").checked ? { requestApproval: true } : {}) };
    try {
      const data = (await apiPost(`${API}/transition`, body)).data;
      await render(data.approval ? `Approval requested: ${data.approval.approvalRequestId}` : "Transition recorded.");
    } catch (error) {
      await render(error instanceof ConsoleApiError ? `${error.code ?? error.status}: ${error.message}` : String(error));
    }
  });
}

if (panel) render().catch((error) => { panel.textContent = error instanceof ConsoleApiError ? `${error.code ?? error.status}: ${error.message}` : String(error); });
