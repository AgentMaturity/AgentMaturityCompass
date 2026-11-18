// The daily screens' own pieces (studio-ui lane, slice "daily"): My agent's score as an ink dial with its labels and its
// gaps as a short list, an approval request as a card with its route and its people, the eight surfaces as tiles, the
// Industry Pack catalog by station, and live runs as cards. Pure drawing of what Studio returned; app.js wires them.
// A score is drawn in ink, never in the accent and never beside a tick or a badge.
import { esc, moreInfo, personChip, routeTrack } from "./pageKit.js";
import { icon } from "./iconSet.js";
import { plainCode } from "./plainError.js";

const list = (value) => (Array.isArray(value) ? value : []);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const cap = (text) => `${String(text).charAt(0).toUpperCase()}${String(text).slice(1)}`;
const clamp = (value, max) => Math.max(0, Math.min(max, num(value)));

/** A page's heading and its one sentence, with optional notice chips and actions beside them. */
export function pageIntroHtml(title, line, { chips = "", actions = "", id = "" } = {}) {
  return `<header class="page-intro"${id ? ` id="${esc(id)}"` : ""}><h2>${esc(title)}</h2><p>${esc(line)}</p>`
    + `${chips ? `<div class="chip-row">${chips}</div>` : ""}${actions ? `<div class="row wrap page-actions">${actions}</div>` : ""}</header>`;
}

/**
 * The overall level (0 to 5) as a half dial in ink: track, five ticks, a needle, the number and its label.
 * @param {number} value
 * @param {{ label?: string, max?: number, notes?: Array<string | null | undefined> }} [options]
 */
export function scoreDialHtml(value, { label = "Overall level", max = 5, notes = [] } = {}) {
  const v = clamp(value, max);
  const angle = Math.PI * (1 - v / max);
  const x = (r) => (100 + r * Math.cos(angle)).toFixed(1), y = (r) => (100 - r * Math.sin(angle)).toFixed(1);
  const ticks = Array.from({ length: max + 1 }, (_, i) => {
    const a = Math.PI * (1 - i / max), c = Math.cos(a), s = Math.sin(a);
    return `<path d="M${(100 + 70 * c).toFixed(1)} ${(100 - 70 * s).toFixed(1)}L${(100 + 80 * c).toFixed(1)} ${(100 - 80 * s).toFixed(1)}"/>`
      + `<text x="${(100 + 58 * c).toFixed(1)}" y="${(104 - 58 * s).toFixed(1)}">${i}</text>`;
  }).join("");
  return `<figure class="score-dial"><svg viewBox="0 0 200 112" width="220" height="123" aria-hidden="true" focusable="false">
      <path class="dial-track" d="M20 100a80 80 0 0 1 160 0"/><g class="dial-ticks">${ticks}</g>
      <path class="dial-needle" d="M100 100L${x(46)} ${y(46)}"/><circle class="dial-hub" cx="100" cy="100" r="5"/></svg>
    <figcaption><strong class="dial-value">${esc(v.toFixed(1))}</strong><span class="dial-of">of ${esc(max)}</span>`
    + `<span class="dial-label">${esc(label)}</span>${notes.filter(Boolean).map((note) => `<span class="dial-note">${esc(note)}</span>`).join("")}</figcaption></figure>`;
}

/** Each layer's average level as an ink bar out of 5, with its name and number in words beside it. */
export function layerBarsHtml(layers, max = 5) {
  const rows = list(layers).map((layer) => {
    const v = clamp(layer?.avgFinalLevel, max);
    return `<li><span class="bar-name">${esc(layer?.layerName ?? "")}</span><span class="bar-track" aria-hidden="true">`
      + `<span class="bar-fill" style="width:${((v / max) * 100).toFixed(1)}%"></span></span><span class="bar-value">${esc(v.toFixed(1))}</span></li>`;
  }).join("");
  return rows ? `<ul class="ink-bars" aria-label="Level by area, out of ${esc(max)}">${rows}</ul>` : "";
}

/** "AMC-2.15 (Delegation Trust Chain Verification): raise from 0 to 2 …" → its title and the two levels, when it says them. */
function gapParts(control) {
  const action = String(control?.action ?? "");
  const title = /^\S+\s+\(([^)]+)\)/.exec(action)?.[1] ?? String(control?.questionId ?? "");
  const levels = /raise from (\d) to (\d)/.exec(action);
  return { title, now: levels ? Number(levels[1]) : null, next: levels ? Number(levels[2]) : null, action };
}

/** The first gaps the report suggests, as a short list: the question's name and a five-step level track in ink. */
export function gapListHtml(report, limit = 3) {
  const controls = list(report?.recommendationControls);
  const actions = list(report?.prioritizedUpgradeActions);
  if (!controls.length && !actions.length) return "";
  const items = controls.slice(0, limit).map((control) => {
    const gap = gapParts(control);
    const cells = gap.now === null ? "" : `<span class="level-track" aria-hidden="true">${[1, 2, 3, 4, 5].map((level) =>
      `<span class="${level <= gap.now ? "is-on" : level <= gap.next ? "is-next" : ""}"></span>`).join("")}</span>`;
    const words = gap.now === null ? "" : `<span class="gap-levels">Level ${esc(gap.now)} now, next ${esc(gap.next)}</span>`;
    return `<li title="${esc(control?.questionId ?? "")}"><span class="gap-title">${esc(gap.title)}</span>${cells}${words}</li>`;
  }).join("");
  const all = actions.length ? moreInfo(`All suggestions (${actions.length})`, `<ol class="gap-all">${actions.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>`) : "";
  return `${items ? `<ol class="gap-list">${items}</ol>` : ""}${all}`;
}

const DECIDED_LABEL = { PENDING: "Waiting", QUORUM_MET: "Approved", CONSUMED: "Approved", APPROVED: "Approved", DENIED: "Turned down", EXPIRED: "Expired", CANCELLED: "Cancelled" };

/** An approval request's path: asked, then its decision in two words, then used. */
export function approvalRoute(status) {
  const s = String(status ?? "");
  const decided = s === "PENDING" ? "wait" : ["QUORUM_MET", "CONSUMED", "APPROVED"].includes(s) ? "done" : "stop";
  return routeTrack([
    { label: "Asked", state: "done" },
    { label: DECIDED_LABEL[s] ?? "Decided", state: decided, hint: plainCode(s) },
    { label: s === "CONSUMED" ? "Used" : "Done", state: s === "CONSUMED" ? "done" : "todo" }
  ], { label: "Where this request is", className: "route-small" });
}

const DECISION_WORDS = { APPROVE_EXECUTE: "approved", APPROVE_SIMULATE: "approved as a dry run", DENY: "turned down" };

/**
 * Who decided (initials with their decision), the places still open while the request waits, and who may decide, from
 * the request's own record. `detail` is GET /approvals/requests/:id (or the row when it already carries decisions).
 * @param {any} row
 * @param {any} [detail]
 */
export function approvalPeopleHtml(row, detail = null) {
  const decisions = list(detail?.decisions ?? row?.decisions);
  const required = num(row?.quorum?.required ?? detail?.quorum?.required);
  const received = num(row?.quorum?.received ?? detail?.quorum?.received);
  const chips = decisions.map((d) => personChip(d.username ?? "someone", String(d.decision).startsWith("APPROVE") ? "done" : "stop",
    DECISION_WORDS[d.decision] ?? plainCode(d.decision)));
  const open = row?.status === "PENDING" ? Math.max(required - received, 0) : 0;
  for (let i = 0; i < open; i += 1) chips.push('<li class="a4-person is-wait"><span class="a4-avatar" aria-hidden="true">?</span>'
    + '<span class="a4-person-words"><strong>An approver</strong><small>not decided yet</small></span></li>');
  const roles = list(detail?.request?.rolesAllowed ?? row?.rolesAllowed).map((role) => plainCode(role).toLowerCase());
  // The count is the request's own while it waits; once decided the route and the people say what happened.
  const count = row?.status === "PENDING" ? `${received} of ${required} approvals. ` : "";
  const who = `<p class="a4-count">${esc(`${count}${roles.length ? `Who may decide: ${roles.join(" or ")}.` : ""}`.trim())}</p>`;
  return `${chips.length ? `<ul class="a4-people-row" aria-label="Who decides">${chips.join("")}</ul>` : ""}${who}`;
}

/**
 * One approval request as a card: what it is, its route, its people and the decision controls (passed in unchanged).
 * @param {any} row
 * @param {{ controls?: string, href?: string, selected?: boolean, detail?: any, details?: string }} [options]
 */
export function approvalCardHtml(row, { controls = "", href = "", selected = false, detail = null, details = "" } = {}) {
  const id = String(row?.approvalRequestId ?? "");
  const risk = row?.riskTier ? `${String(row.riskTier)[0].toUpperCase()}${String(row.riskTier).slice(1)} risk` : "";
  const title = plainCode(row?.actionClass || "Request");
  return `<article class="appr-card${selected ? " selected" : ""}" data-appr="${esc(id)}">
    <div class="appr-head">${icon("approvals", { size: 22 })}<div><strong class="appr-title">${esc(title)}</strong>`
    + `<span class="appr-sub">${esc([risk, row?.agentId ? `agent ${row.agentId}` : ""].filter(Boolean).join(", "))}</span></div>`
    + `${href ? `<a class="appr-open" href="${esc(href)}" title="${esc(id)}">Open</a>` : ""}</div>
    ${approvalRoute(row?.status)}
    <div data-appr-people="${esc(id)}">${approvalPeopleHtml(row, detail)}</div>
    <div class="appr-actions">${controls}</div>
    ${details}
  </article>`;
}

const SURFACE_ICONS = { score: "score", shield: "shield", enforce: "lock", vault: "records", watch: "live", comply: "file", fleet: "people", passport: "person" };
/** A state code in words: "PENDING" (nothing ran yet) and plain codes that have no words of their own read in sentence case. */
const stateWords = (status) => {
  const code = String(status ?? "").toUpperCase();
  if (code === "PENDING") return "Not run yet";
  const words = plainCode(code);
  return words === code ? cap(code.toLowerCase().replaceAll("_", " ")) : words;
};
const surfaceState = (status) => {
  const s = String(status ?? "").toUpperCase();
  return s === "COMPLETE" ? "done" : ["DEGRADED", "FAILED", "FAIL", "INVALID", "MISSING"].includes(s) ? "stop" : "todo";
};

/** The eight surfaces as tiles: icon, name and its state in words (a dot, never a tick). Long words sit in a fold. */
export function surfaceTilesHtml(definitions, order, surfaces) {
  const byName = new Map(list(definitions).map((item) => [item.surface, item]));
  const tiles = list(order).map((name) => {
    const summary = surfaces?.[name] ?? null;
    const definition = byName.get(name) ?? { surface: name, headline: "", description: "" };
    const status = summary?.status || "pending";
    return `<li class="surface-chip is-${surfaceState(status)}">${icon(SURFACE_ICONS[String(name).toLowerCase()] ?? "info", { size: 20 })}`
      + `<span class="surface-name">${esc(definition.surface)}</span><span class="surface-state" title="${esc(status)}"><span class="state-dot" aria-hidden="true"></span>${esc(stateWords(status))}</span></li>`;
  }).join("");
  const words = list(order).map((name) => {
    const definition = byName.get(name) ?? { surface: name };
    return `<li><strong>${esc(definition.surface)}</strong>: ${esc(definition.headline ?? "")}. <span class="muted">${esc(surfaces?.[name]?.summary || definition.description || "")}</span></li>`;
  }).join("");
  return `<ul class="surface-chips" aria-label="The eight parts of AMC for this agent">${tiles}</ul>${moreInfo("What each part says", `<ul>${words}</ul>`)}`;
}

/** Counts as a row of small ink numbers with their names. `items` is [[label, count], ...]. */
export function statRowHtml(items) {
  return `<ul class="stat-row">${list(items).map(([label, count]) => `<li><strong>${esc(count ?? 0)}</strong><span>${esc(label)}</span></li>`).join("")}</ul>`;
}

const STATIONS = ["environment", "health", "wealth", "education", "mobility", "technology", "governance"];
const RISK_WORDS = { "very-high": "Very high risk", critical: "Critical risk", high: "High risk", medium: "Medium risk", low: "Low risk" };

/** A pack's description cut to its first part (before a dash or a semicolon), at most 12 words; the whole is in the pack. */
function shortLine(text) {
  const head = String(text ?? "").split(/\s[—–-]\s|;/)[0].trim();
  const words = head.split(/\s+/).filter(Boolean);
  return words.length > 12 ? `${words.slice(0, 12).join(" ").replace(/[,.]$/, "")}…` : head;
}

/** The pack catalog: the seven stations as filter tiles (with counts), then every pack as a card with Open. */
export function packCatalogHtml(packs) {
  const all = list(packs);
  const count = (station) => all.filter((pack) => pack.domain === station).length;
  const stations = [`<button type="button" class="secondary station-tile" data-station="" aria-pressed="true">${icon("packs", { size: 22 })}<span>All</span><small>${all.length}</small></button>`,
    ...STATIONS.filter(count).map((station) => `<button type="button" class="secondary station-tile" data-station="${esc(station)}" aria-pressed="false">`
      + `${icon(station, { size: 22 })}<span>${esc(cap(station))}</span><small>${count(station)}</small></button>`)].join("");
  const cards = all.map((pack) => `<article class="pack-card" data-station="${esc(pack.domain ?? "")}">
      <div class="pack-card-head">${icon(STATIONS.includes(pack.domain) ? pack.domain : "packs", { size: 22 })}<strong>${esc(pack.name || pack.packId)}</strong></div>
      <p class="pack-card-line">${esc(shortLine(pack.description))}</p>
      <div class="pack-card-foot"><span class="muted">${esc(RISK_WORDS[pack.riskLevel] ?? cap(pack.riskLevel || "active"))}, ${esc(num(pack.questionCount))} questions${pack.contentStatus ? `, ${esc(pack.contentStatus)}, self-reported` : ""}</span>
        <button class="secondary" data-industry-pack="${esc(pack.packId)}" aria-label="Open ${esc(pack.name || pack.packId)}">Open</button></div>
    </article>`).join("");
  return `<div class="station-tiles" role="group" aria-label="Show packs for one field">${stations}</div><div class="pack-grid">${cards}</div>`;
}

/** Station tiles narrow the cards to one station; "All" shows every card again. */
export function bindStationFilter(holder) {
  holder?.querySelector(".station-tiles")?.addEventListener("click", (event) => {
    const tile = event.target.closest?.("[data-station]");
    if (!tile) return;
    const station = tile.getAttribute("data-station");
    for (const other of holder.querySelectorAll(".station-tile")) other.setAttribute("aria-pressed", String(other === tile));
    for (const card of holder.querySelectorAll(".pack-card")) card.hidden = Boolean(station) && card.getAttribute("data-station") !== station;
  });
}

const RUN_STATE = { running: ["now", "Running"], degraded: ["wait", "Needs a look"], completed: ["done", "Finished"], canceled: ["todo", "Stopped"], cancelled: ["todo", "Stopped"] };

/** Live runs as cards: the run's name, its state as a dot and two words, its stage and its counts. */
export function runCardsHtml(runs, when = (value) => String(value ?? "")) {
  return `<ul class="run-cards">${list(runs).map((run) => {
    const [state, words] = RUN_STATE[String(run.status)] ?? ["todo", stateWords(run.status ?? "unknown")];
    return `<li class="run-card is-${state}"><div class="run-card-head"><span class="state-dot" aria-hidden="true"></span><strong>${esc(run.runId)}</strong>`
      + `<span class="run-card-state" title="${esc(run.status)}">${esc(words)}</span></div>`
      + `<p class="muted">${esc(`Stage ${run.currentStage ?? "none"}. ${num(run.eventCount)} events, ${num(run.alertCount)} alerts, ${num(run.policyDecisionCount)} policy decisions. Updated ${when(run.updatedAt)}.`)}</p></li>`;
  }).join("")}</ul>`;
}
