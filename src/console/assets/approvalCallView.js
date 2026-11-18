// What a person is approving (UX-04): the tool, the change as text (a diff, a command and its folder, a host), the
// working folder and the kind of action in plain words. Studio sends the call only when its recorded arguments hash to
// the digest the signed request binds; otherwise it sends the reason. Everything is escaped and shown as text.
import { esc } from "./pageKit.js";
import { plainCode } from "./plainError.js";

const RISK = { low: "low", medium: "medium", med: "medium", high: "high", critical: "critical" };
const SHOWN_LINES = 40;

function linesHtml(lines) {
  const all = lines.map((line) => esc(line)).join("\n");
  if (lines.length <= SHOWN_LINES) return `<pre class="scroll approval-call-lines">${all}</pre>`;
  return `<pre class="scroll approval-call-lines">${lines.slice(0, SHOWN_LINES).map((line) => esc(line)).join("\n")}</pre>
    <details><summary>Show all ${lines.length} lines</summary><pre class="scroll approval-call-lines">${all}</pre></details>`;
}

/** The card shown above one request's decision buttons. */
export function approvalCallHtml(row) {
  const call = row.call;
  const kind = `${esc(plainCode(row.actionClass || ""))} (risk ${esc(RISK[row.riskTier] || row.riskTier || "not stated")})`;
  const head = `<p><strong>Tool:</strong> ${esc(row.toolName || "not recorded")} · <strong>Kind of action:</strong> ${kind}</p>`;
  if (!call) return `<section class="card approval-call"><h3>What you are approving</h3>${head}<p class="muted">Your role sees the request, not the call it would run.</p></section>`;
  if (Array.isArray(call.withheld)) return `<section class="card approval-call"><h3>What you are approving</h3>${head}<p class="status-bad">This call contains something that looks like a secret (${esc(call.withheld.join(", "))}) that AMC cannot show here without hiding part of the command, so it is not shown and cannot be approved from this page. Decide it at the terminal where the agent runs, where you see the whole command; you can still deny it here.</p></section>`;
  if (call.unavailable) return `<section class="card approval-call"><h3>What you are approving</h3>${head}<p class="status-bad">The call cannot be shown: ${esc(call.unavailable)}.</p></section>`;
  return `<section class="card approval-call"><h3>What you are approving: ${esc(call.title)}</h3>${head}
    <p><strong>Working folder:</strong> ${call.folder === "." ? "this workspace (the folder AMC runs in); paths below are inside it" : esc(call.folder)}</p>
    ${linesHtml(Array.isArray(call.lines) ? call.lines : [])}
    ${Array.isArray(call.hidden) && call.hidden.length > 0 ? `<p class="status-warn"><strong>Hidden from this view:</strong> ${esc(call.hidden.join(", "))}. Only secret-shaped text is hidden; every command and path is shown.</p>` : ""}
    <p class="muted">Approving covers the exact call the agent made (arguments digest ${esc(String(call.digest || "").slice(0, 16))}…), not this rendering of it.</p>
    ${call.complete ? `<p class="muted">This is the whole call, checked against the signed request.</p>`
      : `<p class="status-bad">Part of this call could not be shown in full (long, hidden or unreadable characters). Read it with care.</p>`}
  </section>`;
}
