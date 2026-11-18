// Agent sessions (UX-04, UX-05): every chat or run of the native agent, from the terminal or this console, with each
// action it took and who approved it, and an "Export for auditor" button any signed-in reader may press. The export is
// the signed record (no message text); an auditor checks it with amc-verify or amc session verify-export.
import { apiDownload, apiGet, applyRoleGates, getCurrentUser } from "./api.js";
import { esc } from "./pageKit.js";

const OUTCOMES = { OK: "ran", DENIED: "refused, did not run", ERROR: "failed", CANCELLED: "cancelled", TOOL_OUTCOME_UNKNOWN: "may have run (outcome unknown)" };

function when(ts) {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function actionLine(action) {
  const outcome = OUTCOMES[action.outcome] || "no result recorded";
  const approved = action.approvedBy ? ` · approved by ${esc(action.approvedBy)}` : "";
  return `<li><strong>${esc(action.tool)}</strong> ${esc(outcome)}${approved} <span class="muted">${esc(when(action.at))}</span></li>`;
}

function sessionHtml(session) {
  const id = esc(session.sessionId);
  const state = session.sealed ? "Sealed: closed and signed at its end." : "Not sealed: left open so it can be continued. An export says so.";
  const actions = session.actions.length === 0 ? `<p class="muted">No tool actions in this session.</p>`
    : `<ul class="agent-session-actions">${session.actions.map(actionLine).join("")}</ul>${session.moreActions ? `<p class="muted">${session.moreActions} earlier action(s) are in the export.</p>` : ""}`;
  return `<article class="agent-session" data-session="${id}">
    <h4>${esc(when(session.startedAt))} · agent ${esc(session.agentId || "unknown")} · ${Number(session.turns) || 0} turn(s)</h4>
    <p class="muted">Session ${id}. ${esc(state)}</p>
    ${actions}
    <div class="studio-actions">
      <button type="button" data-export="json" data-roles="AUDITOR,OWNER" data-session="${id}">Export for auditor</button>
      <button type="button" class="secondary" data-export="html" data-roles="AUDITOR,OWNER" data-session="${id}">Readable page</button>
    </div>
    ${mayExport() ? "" : `<p class="muted">Only an auditor or an owner can export a session: the signed record can include what the agent wrote and the arguments it used.</p>`}
    <p class="muted agent-session-result" role="status"></p>
  </article>`;
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

/** Fills a card at the top of `root` (after its first section): the newest sessions, or `limit` of them. */
export async function renderAgentSessionsInto(root, agentId, limit = 10) {
  const section = document.createElement("section");
  section.className = "card agent-sessions";
  section.innerHTML = `<h3>Agent sessions</h3><p class="muted">Loading the agent's chats and runs…</p>`;
  (root.firstElementChild || root).after(section);
  let data;
  try {
    const envelope = await apiGet(`/api/v1/evidence/sessions?agentId=${encodeURIComponent(agentId)}`);
    data = envelope && envelope.data ? envelope.data : envelope;
  } catch (error) {
    section.innerHTML = `<h3>Agent sessions</h3><p class="status-bad">The agent's sessions could not be read: ${esc(error && error.message ? error.message : error)}</p>`;
    return;
  }
  const sessions = Array.isArray(data && data.sessions) ? data.sessions.slice(0, limit) : [];
  section.innerHTML = `<h3>Agent sessions</h3>
    <p class="muted">Every chat or run of the agent, from a terminal or this console. Each action is listed with its result and who approved it. "Export for auditor" saves the signed record of one session; an auditor can check it with amc-verify, without AMC.</p>
    ${sessions.length === 0 ? `<p>No agent sessions yet. They appear here after a chat (amc agent-loop chat) or a task.</p>` : sessions.map(sessionHtml).join("")}
    ${data && data.total > sessions.length ? `<p class="muted">${data.total - sessions.length} older session(s) not shown.</p>` : ""}`;
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
