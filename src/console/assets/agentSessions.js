// Agent sessions (UX-04, UX-05): every chat or run of the native agent, from the terminal or this console, with each
// action it took and who approved it, and an "Export for auditor" button any signed-in reader may press. The export is
// the signed record (no message text); an auditor checks it with amc-verify or amc session verify-export.
import { apiDownload, apiGet, applyRoleGates, getCurrentUser } from "./api.js";
import { esc, moreInfo } from "./pageKit.js";

const OUTCOMES = { "no result recorded": "not finished, or no result recorded yet", OK: "ran", DENIED: "refused, did not run", ERROR: "failed", CANCELLED: "cancelled", TOOL_OUTCOME_UNKNOWN: "may have run (outcome unknown)" };
const ABOUT = "Every chat or run of the agent, from a terminal or this console. Each action is listed with its result and who approved it. \"Export for auditor\" saves the signed record of one session; an auditor can check it with amc-verify, without AMC.";
const EXPORT_ROLES = "Only an auditor or an owner can export a session: the signed record can include what the agent wrote and the arguments it used.";

function when(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function actionLine(action) {
  const outcome = OUTCOMES[action.outcome] || "no result recorded";
  const approved = action.approvedBy ? `, approved by ${esc(action.approvedBy)}` : "";
  return `<li><strong>${esc(action.tool)}</strong> ${esc(outcome)}${approved} <span class="muted">${esc(when(action.at))}</span></li>`;
}

function sessionHtml(session) {
  const id = esc(session.sessionId);
  const state = session.sealed ? "Sealed: closed and signed at its end." : "Not sealed: left open so it can be continued. An export says so.";
  const count = session.actions.length;
  const actions = count === 0 ? `<p class="muted">No tool actions in this session.</p>`
    : `<ul class="agent-session-actions">${session.actions.map(actionLine).join("")}</ul>${session.moreActions ? `<p class="muted">${session.moreActions} earlier action(s) are in the export.</p>` : ""}`;
  // A sealed session is recorded and closed (done); an open one can still go on (a ring, never a finished mark).
  return `<li class="run-card agent-session ${session.sealed ? "is-done" : "is-now"}" data-session="${id}">
    <div class="run-card-head"><span class="state-dot" aria-hidden="true"></span><strong>${esc(when(session.startedAt))}</strong>
      <span class="run-card-state">${session.sealed ? "Sealed" : "Open"}</span></div>
    <p class="muted">Agent ${esc(session.agentId || "unknown")}, ${Number(session.turns) || 0} turn(s), ${count}${session.moreActions ? "+" : ""} action(s).</p>
    ${moreInfo(count ? "What it did" : "Details", `<p class="muted">Session ${id}. ${esc(state)}</p>${actions}`)}
    <div class="row wrap agent-session-buttons">
      <button type="button" class="secondary" data-export="json" data-roles="AUDITOR,OWNER" data-session="${id}">Export for auditor</button>
      <button type="button" class="secondary" data-export="html" data-roles="AUDITOR,OWNER" data-session="${id}">Readable page</button>
    </div>
    <p class="muted agent-session-result" role="status"></p>
  </li>`;
}

/** The server refuses an export to any other role (src/api/accessPolicy.ts); an admin-token session is decided there. */
function mayExport() {
  const roles = getCurrentUser()?.roles;
  return !Array.isArray(roles) || roles.includes("AUDITOR") || roles.includes("OWNER");
}

function savedText(name, format) {
  return format === "json"
    ? `Saved ${name}. To check it without AMC: amc-verify verify ${name} --trust-list <your trust list> --trust-root <root key id>. With AMC: amc session verify-export ${name} --expect-monitor <monitor key fingerprint>.`
    : `Saved ${name}. Open it in a browser to read what happened; check the matching .json export with amc-verify.`;
}

/**
 * Fills a card with the newest sessions (`limit` of them), placed after `after` (a selector inside `root`; else after
 * root's first section). `quietWhenEmpty` leaves no card when there is nothing to show (Home).
 */
export async function renderAgentSessionsInto(root, agentId, limit = 10, { after = "", quietWhenEmpty = false } = {}) {
  const section = document.createElement("section");
  section.className = "card agent-sessions";
  section.innerHTML = `<h3>Agent sessions</h3><p class="muted">Loading the agent's chats and runs…</p>`;
  if (quietWhenEmpty) section.hidden = true;
  ((after && root.querySelector(after)) || root.firstElementChild || root).after(section);
  let data;
  try {
    const envelope = await apiGet(`/api/v1/evidence/sessions?agentId=${encodeURIComponent(agentId)}&limit=${encodeURIComponent(String(limit))}`);
    data = envelope && envelope.data ? envelope.data : envelope;
  } catch (error) {
    section.hidden = false;
    section.innerHTML = `<h3>Agent sessions</h3><p class="status-bad">The agent's sessions could not be read: ${esc(error && error.message ? error.message : error)}</p>`;
    return;
  }
  const sessions = Array.isArray(data && data.sessions) ? data.sessions.slice(0, limit) : [];
  if (sessions.length === 0 && quietWhenEmpty) {
    section.remove();
    return;
  }
  section.hidden = false;
  section.innerHTML = `<h3>Agent sessions</h3>
    ${sessions.length === 0 ? `<p>No agent sessions yet. They appear here after a chat (amc agent-loop chat) or a task.</p>` : `<ul class="run-cards">${sessions.map(sessionHtml).join("")}</ul>`}
    ${data && data.total > sessions.length ? `<p class="muted">${data.total - sessions.length} older session(s) not shown.</p>` : ""}
    ${mayExport() ? "" : `<p class="muted">${EXPORT_ROLES}</p>`}
    ${moreInfo("What is a session?", `<p>${esc(ABOUT)}</p>`)}`;
  applyRoleGates(section);
  section.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-export]");
    if (!button) return;
    const format = button.dataset.export;
    const result = button.closest(".agent-session").querySelector(".agent-session-result");
    button.disabled = true;
    try {
      const name = await apiDownload(`/api/v1/evidence/sessions/${encodeURIComponent(button.dataset.session)}/export?format=${format}`);
      result.textContent = savedText(name, format);
    } catch (error) {
      result.textContent = `The export did not work: ${error && error.message ? error.message : error}`;
    } finally {
      button.disabled = false;
    }
  });
}
