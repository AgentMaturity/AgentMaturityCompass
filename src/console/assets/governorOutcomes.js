// The Governor page (UX-06): what really happens to each kind of action in this workspace, read from the signed Action
// Policy in force through the same verdict the agent's tools apply (GET /api/v1/governor/outcomes). A read; it records nothing.
import { apiGet } from "./api.js";
import { esc, recordDetails } from "./pageKit.js";
import { plainCode } from "./plainError.js";

const COLUMNS = [
  ["runs", "Runs", "status-ok"],
  ["asks a person", "Asks a person first", "status-warn"],
  ["dry run", "Dry run only", "muted"],
  ["blocked", "Blocked", "status-bad"]
];

export async function renderGovernorOutcomes(agentId) {
  let data;
  try {
    const envelope = await apiGet(`/api/v1/governor/outcomes?agentId=${encodeURIComponent(agentId)}`);
    data = envelope && envelope.data ? envelope.data : envelope;
  } catch (error) {
    return `<section class="card"><h3>Governor</h3><p class="status-bad">What the agent may do could not be read: ${esc(error && error.message ? error.message : error)}</p></section>`;
  }
  const outcomes = Array.isArray(data && data.outcomes) ? data.outcomes : [];
  const intro = data && data.policy === "not configured"
    ? "This workspace has no signed Action Policy, so the policy does not hold anything back; the tool allowlist and approvals still apply."
    : data && data.policy === "untrusted"
      ? "The Action Policy here does not verify, so every governed action is blocked until it is restored or signed again."
      : "What happens when the agent asks to really do each kind of action, by the signed Action Policy in force here.";
  const rows = outcomes.map((row) => `<tr><th scope="row">${esc(plainCode(row.actionClass))}</th>${COLUMNS.map(([key, , cls]) =>
    `<td class="governor-cell${row.outcome === key ? ` ${cls} on` : ""}">${row.outcome === key ? "●" : ""}</td>`).join("")}</tr>`).join("");
  return `<section class="card governor-outcomes"><h3>What the agent may do here</h3>
    <p class="muted">${esc(intro)} Agent: ${esc((data && data.agentId) || agentId)}.</p>
    <div class="scroll"><table class="governor-grid"><thead><tr><th>Kind of action</th>${COLUMNS.map(([, label]) => `<th>${esc(label)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted">"Asks a person first": the policy runs it only after a person approves that one call; with nobody asked it runs as a dry run, which records what would happen and changes nothing. Reading runs even as a dry run, because a read changes nothing. A chat's approval mode can add a question before a call; nothing lets a blocked action through.</p>
    ${recordDetails(outcomes, "Show the reasons")}
  </section>`;
}
