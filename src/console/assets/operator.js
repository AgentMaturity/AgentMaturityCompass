// Operator workflow pages (P2-22): operator-plan.html, operator-inbox.html and review-packet.html mount this module and
// pick their view from <body data-page>. Every string from Studio goes through esc(); statuses, kinds, claim kinds and
// reasons are printed as Studio returned them. The inbox never says "all clear": an empty list says what was evaluated
// and when, and an unavailable source is shown as such. Studio re-checks every action; buttons are conveniences.
import { apiGet, apiPost, showSignIn, whoami } from "./api.js";
import { plainErrorText } from "./plainError.js";
import { renderControlStatusChip } from "./components/controlStatusChip.js";
import { createReviewTimer } from "./reviewTimer.js";

const API = "/api/v1/operator";
const page = document.body.dataset.page;
const root = document.getElementById("app");
const status = document.getElementById("status");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
const list = (value) => (Array.isArray(value) ? value : []);
const code = (value) => `<code>${esc(value)}</code>`;
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th scope="col">${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);
const say = (text, bad = false) => { status.textContent = text; status.className = bad ? "status-bad" : "muted"; };
/** A failure is said at the top and, when a form or button sent it, beside that control (C-05), in plain words (C-10). */
const failure = (error, near = null) => {
  const text = plainErrorText(error);
  say(text, true);
  if (!near) return;
  near.parentElement?.querySelector(":scope > .action-error")?.remove();
  near.insertAdjacentHTML("afterend", `<p class="action-error status-bad" role="alert">${esc(text)}</p>`);
};
const get = async (path) => (await apiGet(`${API}${path}`)).data;
const post = async (path, body) => (await apiPost(`${API}${path}`, body)).data;

function sourcesLine(sources) {
  const entries = Object.entries(sources ?? {});
  const down = entries.filter(([, state]) => state !== "ok").map(([name]) => name);
  return down.length ? `<p class="status-bad" role="alert">Unavailable sources: ${down.map(code).join(", ")}. Nothing they hold is shown as clear.</p>`
    : `<p class="muted">Sources read: ${entries.map(([name]) => code(name)).join(", ")}</p>`;
}

// ---- Plan diff and activation ----
function renderDiff(diff) {
  const leaf = (rows) => list(rows).map((row) => [code(row.path), code(JSON.stringify(row.before)), code(JSON.stringify(row.after))]);
  return `<h3>Requirements</h3>${table(["Control", "Change", "Before", "After", "Why (compiler)"], list(diff.requirements).map((row) =>
    [code(row.controlId), esc(row.change), code(row.before ?? "absent"), code(row.after ?? "absent"), esc(row.reason)]), "No requirement changed.")}
    <h3>Conflict resolutions</h3>${table(["Path", "Before", "After"], leaf(diff.conflicts), "No change.")}
    <h3>Runtime policy</h3>${table(["Path", "Before", "After"], leaf(diff.runtimePolicy), "No change.")}
    <h3>Evidence plan</h3>${table(["Path", "Before", "After"], leaf(diff.evidencePlan), "No change.")}`;
}

async function planPage() {
  const data = await get("/plans");
  const plans = list(data.plans);
  const options = plans.map((plan) => `<option value="${esc(plan.planDigest)}">${esc(plan.planDigest.slice(0, 19))}… ${esc(plan.status)} ${esc(plan.source.kind)}${plan.active ? " (active)" : ""}</option>`).join("");
  root.innerHTML = `${sourcesLine(data.sources)}
    ${table(["Plan", "Status", "Source", "Signature", "Active", "Previous"], plans.map((plan) => [code(plan.planDigest), esc(plan.status),
      esc(plan.source.kind === "a4" ? `A4 ${plan.source.projectId} r${plan.source.revisionNo}` : "control journal"), esc(plan.signature), plan.active ? "yes" : "no",
      plan.previousPlanDigest ? code(plan.previousPlanDigest) : "none"]), "No plan was found. A plan an A4 project signs at Adapt Build appears here.")}
    <form id="diffForm" class="card"><h2>Compare</h2>
      <label>From <select id="diffFrom" required>${options}</select></label>
      <label>To <select id="diffTo" required>${options}</select></label>
      <button type="submit" id="diffBtn"${plans.length < 2 ? " disabled" : ""}>Show diff</button>
      ${plans.length < 2 ? '<p class="muted">Comparing needs at least two plans.</p>' : ""}</form>
    <section id="diffOut" aria-live="polite"></section>
    <form id="activateForm" class="card"><h2>Activate (owner)</h2>
      <p class="muted">Needs a plan review approved for exactly this plan, with decisions bound to the review request's digest, by people other than you.</p>
      <label>Plan <select id="activatePlan" required>${options}</select></label>
      <label>Approval id <input id="activateApproval" required maxlength="200" autocomplete="off" /></label>
      <button type="submit" id="activateBtn"${plans.length ? "" : " disabled"}>Activate</button>
      ${plans.length ? "" : '<p class="muted">There is no plan to activate yet.</p>'}</form>`;
  document.getElementById("diffForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const out = await get(`/plans/diff?from=${encodeURIComponent(document.getElementById("diffFrom").value)}&to=${encodeURIComponent(document.getElementById("diffTo").value)}`);
      document.getElementById("diffOut").innerHTML = renderDiff(out.diff);
    } catch (error) { failure(error, document.getElementById("diffBtn")); }
  });
  document.getElementById("activateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const out = await post("/plans/activate", { planDigest: document.getElementById("activatePlan").value, approvalId: document.getElementById("activateApproval").value });
      say(`Activated as journal revision ${out.revision}.`);
    } catch (error) { failure(error, document.getElementById("activateBtn")); }
  });
}

// ---- Blocker inbox ----
/**
 * A source that is switched off holds nothing, so it is no blocker: the A4 source reports the preview being off as an
 * unreadable source (blockerInbox.ts names the code in nextAction). That one entry is dropped, and the page says A4 is off.
 */
const previewOff = (item) => item?.id === "source:a4" && String(item.nextAction ?? "").includes("(A4_PREVIEW_DISABLED)");

export function withoutDisabledPreview(inbox) {
  const off = list(inbox?.items).some(previewOff);
  if (!off) return { inbox, a4Off: false };
  const sources = Object.fromEntries(Object.entries(inbox.sources ?? {}).filter(([name]) => name !== "a4"));
  return { inbox: { ...inbox, items: list(inbox.items).filter((item) => !previewOff(item)), sources }, a4Off: true };
}

async function inboxPage() {
  const { inbox, a4Off } = withoutDisabledPreview(await get("/inbox"));
  const items = list(inbox.items);
  const empty = Object.values(inbox.sources ?? {}).some((state) => state !== "ok")
    ? "Some sources could not be read, so this list is not complete."
    : `No blocker was found in this evaluation (${inbox.evaluatedAt}). This lists only what these sources show; it does not mean nothing needs attention.`;
  root.innerHTML = `${sourcesLine(inbox.sources)}
    ${a4Off ? '<p class="muted">A4 agent projects are turned off in this workspace, so they are not checked here.</p>' : ""}
    <p class="muted">Expiry window: ${esc(inbox.expiryWindowDays)} days. Evaluated ${esc(inbox.evaluatedAt)}.</p>
    ${table(["Kind", "Severity", "Control", "Agent", "Due", "Next action"], items.map((item) => [code(item.kind), esc(item.severity),
      item.controlId ? code(item.controlId) : "", esc(item.subject?.agentId ?? ""), item.dueTs ? esc(new Date(item.dueTs).toISOString()) : "",
      `${esc(item.nextAction)}${list(item.links).map((link) => ` <a href="${esc(link)}">open</a>`).join("")}`]), empty)}`;
}

// ---- Review packet and opt-in timing ----
let timer = null;
let session = null;
document.addEventListener("visibilitychange", () => timer?.setHidden(document.visibilityState === "hidden"));

function renderPacket(packet, timing) {
  const dims = packet.verifier?.dimensions;
  const items = list(packet.files).filter((file) => !file.path.startsWith("verifier/"));
  return `<section class="card" id="packetOut"><h2>Packet ${code(packet.packetId)}</h2>
    <p><a id="packetDownload" href="${API}/review-packets/${esc(packet.packetId)}/download">Download zip</a> · sha256 ${code(packet.sha256)}</p>
    <p class="muted">Verify it yourself with amc-verify and the issuer key pinned in your trust list; keys inside a packet only identify the signer.</p>
    ${dims ? table(["Dimension", "Build-time verifier"], Object.entries(dims).map(([name, value]) => [esc(name), renderControlStatusChip(value === "pass" ? "PASS" : value === "fail" ? "FAIL" : value)]), "")
      : "<p class=\"status-warn\">The standalone verifier was not available when this packet was built.</p>"}
    ${timing.enabled ? `<div id="timingNotice" class="card"><p>${esc(timing.notice)}</p><button type="button" id="timingAccept">Accept and start review</button></div>` : ""}
    <h3>Items</h3>${table(["Item", "Decision"], items.map((file) => [code(file.path), ["confirmed", "disputed", "needs_more"].map((decision) =>
      `<button type="button" data-item="${esc(file.path)}" data-decision="${decision}">${esc(decision.replace("_", " "))}</button>`).join(" ")]), "No items.")}
    ${timing.enabled ? "<button type=\"button\" id=\"timingComplete\">Complete review</button>" : ""}
    <p id="decisionLog" role="status" class="muted"></p></section>`;
}

async function timing(event) {
  if (session === null) return null;
  return post("/review-timing/events", { ...event, sessionId: session });
}

async function packetPage() {
  const timingStatus = await get("/review-timing/status");
  const day = 86_400_000;
  root.innerHTML = `<form id="packetForm" class="card" novalidate><h2>Build a review packet</h2>
      <p class="muted">A review packet bundles one plan and the records from a time window, for a reviewer to check on their own machine.</p>
      <label>Plan digest (copy it from the <a href="./operator-plan">Plans</a> page; it starts with sha256:) <input id="packetPlan" required pattern="sha256:[0-9a-f]{64}" autocomplete="off" /></label>
      <label>From <input id="packetFrom" type="datetime-local" required value="${new Date(Date.now() - 30 * day).toISOString().slice(0, 16)}" /></label>
      <label>To <input id="packetTo" type="datetime-local" required value="${new Date(Date.now() - 60_000).toISOString().slice(0, 16)}" /></label>
      <fieldset><legend>Formats</legend>${["json", "oscal", "pdf"].map((format) => `<label><input type="checkbox" name="format" value="${format}" checked /> ${format}</label>`).join(" ")}</fieldset>
      <button type="submit" id="packetBuild">Build packet</button></form><div id="packetArea"></div>`;
  document.getElementById("packetForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const build = document.getElementById("packetBuild");
    if (!/^sha256:[0-9a-f]{64}$/.test(document.getElementById("packetPlan").value.trim())) {
      failure(new Error("Paste a plan digest from the Plans page: sha256: followed by 64 letters and digits."), build);
      return;
    }
    if (!document.querySelector("input[name=format]:checked")) {
      failure(new Error("Choose at least one format."), build);
      return;
    }
    try {
      const formats = [...document.querySelectorAll("input[name=format]:checked")].map((box) => box.value);
      const packet = await post("/review-packets", { planDigest: document.getElementById("packetPlan").value.trim(), formats,
        window: { fromTs: Date.parse(document.getElementById("packetFrom").value + "Z"), toTs: Date.parse(document.getElementById("packetTo").value + "Z") } });
      document.getElementById("packetArea").innerHTML = renderPacket(packet, timingStatus);
      bindPacket(packet);
      say(`Packet ${packet.packetId} built.`);
    } catch (error) { failure(error, build); }
  });
}

function bindPacket(packet) {
  document.getElementById("timingAccept")?.addEventListener("click", async () => {
    try {
      const started = await post("/review-timing/events", { event: "review_session_started", noticeAccepted: true, packetId: packet.packetId });
      session = started.sessionId;
      timer = createReviewTimer();
      document.getElementById("timingNotice").innerHTML = `<p class="muted">Review timing is recording under a pseudonym (session ${code(session)}).</p>`;
    } catch (error) { failure(error); }
  });
  document.getElementById("timingComplete")?.addEventListener("click", async () => {
    try {
      await timing({ event: "review_session_completed", activeSeconds: timer ? timer.activeSeconds() : 0 });
      session = null;
      timer = null;
      document.getElementById("decisionLog").textContent = "Review session completed.";
    } catch (error) { failure(error); }
  });
  for (const button of document.querySelectorAll("button[data-decision]")) {
    button.addEventListener("click", async () => {
      const itemId = button.dataset.item.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 128);
      try {
        await timing({ event: "review_item_opened", itemId });
        await timing({ event: "review_item_decided", itemId, decision: button.dataset.decision, activeSeconds: timer ? timer.lap() : 0 });
        document.getElementById("decisionLog").textContent = `Recorded ${button.dataset.decision} for ${button.dataset.item}.`;
      } catch (error) { failure(error); }
    });
  }
}

async function main() {
  const me = await whoami();
  if (me === null) {
    showSignIn(status);
    return;
  }
  say(`Signed in as ${me.username ?? "admin"}.`);
  await ({ "operator-plan": planPage, "operator-inbox": inboxPage, "review-packet": packetPage }[page] ?? (async () => {}))();
}

main().catch(failure);
