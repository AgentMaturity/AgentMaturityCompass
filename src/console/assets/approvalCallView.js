// What a person is approving (UX-04): the tool, the change as text (a diff, a command and its folder, a host), the
// working folder and the kind of action in plain words. Studio sends the call only when its recorded arguments hash to
// the digest the signed request binds; otherwise it sends the reason. Everything is escaped and shown as text.
import { esc, moreInfo } from "./pageKit.js";
import { plainCode } from "./plainError.js";

const RISK = { low: "low", medium: "medium", med: "medium", high: "high", critical: "critical" };
const SHOWN_LINES = 40;

function linesHtml(lines) {
  const all = lines.map((line) => esc(line)).join("\n");
  if (lines.length <= SHOWN_LINES) return `<pre class="scroll approval-call-lines">${all}</pre>`;
  return `<pre class="scroll approval-call-lines">${lines.slice(0, SHOWN_LINES).map((line) => esc(line)).join("\n")}</pre>
    <details><summary>Show all ${lines.length} lines</summary><pre class="scroll approval-call-lines">${all}</pre></details>`;
}

/**
 * The one rule for offering Approve (and Dry run only) on a tool-call request, wherever approval controls are drawn
 * (the inbox list and one request's page): only when Studio sent the call and marked it shown whole with nothing
 * secret-shaped in it (`approveHere`). An agent project's own request (`isProjectRequest`) keeps its project rules.
 * This withholds a console control only; who may approve is decided by the server, unchanged.
 */
export function offersApprove(row, isProjectRequest = false) {
  return isProjectRequest || row?.call?.approveHere === true;
}

const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

/** The card shown above one request's decision buttons: facts as short rows, the call itself, the fine print folded. */
export function approvalCallHtml(row) {
  const call = row.call;
  const kind = `${esc(plainCode(row.actionClass || ""))} (risk ${esc(RISK[row.riskTier] || row.riskTier || "not stated")})`;
  const facts = (more = "") => `<dl class="approval-call-facts">${fact("Tool", esc(row.toolName || "not recorded"))}${fact("Kind of action", kind)}${more}</dl>`;
  if (!call) return `<section class="card approval-call"><h3>What you are approving</h3>${facts()}<p class="muted">Your role sees the request, not the call it would run.</p></section>`;
  const covers = `<p class="muted">Approving covers the exact call the agent made (arguments digest ${esc(String(call.digest || "").slice(0, 16))}…), not any rendering of it.</p>`;
  if (Array.isArray(call.withheld)) return `<section class="card approval-call"><h3>What you are approving</h3>${facts()}<p class="status-bad">This call contains something that looks like a secret (${esc(call.withheld.join(", "))}), so AMC does not show it here. Decide it at the terminal where the agent is running, where you see the whole call, or refuse it here.</p>${moreInfo("What approving covers", covers)}</section>`;
  if (call.unavailable) return `<section class="card approval-call"><h3>What you are approving</h3>${facts()}<p class="status-bad">The call cannot be shown: ${esc(call.unavailable)}.</p></section>`;
  const folder = call.folder === "." ? "this workspace (the folder AMC runs in); paths below are inside it" : esc(call.folder);
  return `<section class="card approval-call"><h3>What you are approving: ${esc(call.title)}</h3>${facts(fact("Working folder", folder))}
    ${linesHtml(Array.isArray(call.lines) ? call.lines : [])}
    ${call.complete ? moreInfo("What approving covers", `${covers}<p class="muted">This is the whole call, checked against the signed request.</p>`)
      : `<p class="status-bad">Part of this call is not shown here (it is long, or has hidden or unreadable characters), so it cannot be approved from this page. Decide it at the terminal where the agent is running, where the whole call is visible, or refuse it here.</p>${moreInfo("What approving covers", covers)}`}
  </section>`;
}
