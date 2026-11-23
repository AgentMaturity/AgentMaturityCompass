// Small pieces the console's secondary pages share (C-09, C-16, C-18): records as readable rows with the raw record under
// "Show the record", an inline question instead of a browser prompt, and a second press to confirm a change that cannot be
// taken back. Everything that came from Studio, a file or an agent is escaped here.
import { icon, picture } from "./iconSet.js";

export function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** A host path inside the workspace's .amc folder reads as `.amc/...` (the rest of the path says nothing to a reader). */
export function workspacePath(text) {
  return /^(?:\/|[A-Za-z]:\\).*[\\/]\.amc[\\/]/.test(text) ? text.slice(text.search(/[\\/]\.amc[\\/]/) + 1).replaceAll("\\", "/") : text;
}

const jsonText = (value) => JSON.stringify(value, (_key, item) => typeof item === "string" ? workspacePath(item) : item, 2) ?? "";

/** The raw record, closed, under "Show the record". */
export function recordDetails(value, summary = "Show the record") {
  return `<details class="record"><summary>${esc(summary)}</summary><pre class="scroll">${esc(jsonText(value))}</pre></details>`;
}

/** camelCase or snake_case key in words: "lastCertStatus" → "Last cert status". */
// Keys whose mechanical reading would not mean much to a person.
const KEY_WORDS = {
  ts: "Time", dbSizeBytes: "Database size", totalEvents: "Records in the evidence log", archivedEvents: "Records archived",
  prunedEvents: "Records with their content removed", blobRows: "Records with a stored attachment", prunedBlobRows: "Attachments removed",
  segmentCount: "Archive parts", latestSegmentId: "Newest archive part", latestSegmentTs: "Newest archive part made",
  dbPath: "Database file", blobs: "Stored attachments", cacheBytes: "Cache size", logsBytes: "Log size", lastBackupTs: "Last backup"
};

export function keyWords(key) {
  if (Object.hasOwn(KEY_WORDS, key)) return KEY_WORDS[key];
  const words = String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/** A reason code in words, the code itself kept in the title: "GATE_FAIL_LOW_INTEGRITY" → "low integrity". */
export function codeWords(code) {
  const text = String(code ?? "");
  const words = text.replace(/^GATE_FAIL_/, "").replace(/^MISSING_(.+)$/, "no $1").replace(/_PASS$/, " that passed").toLowerCase().replaceAll("_", " ");
  return `<span title="${esc(text)}">${esc(words)}</span>`;
}

function cell(value, key = "") {
  if (value === null || value === undefined || value === "") return '<span class="muted">none</span>';
  // A time in milliseconds under a key that names one (ts, createdTs, generatedAt…) reads as a date.
  if (typeof value === "number" && value > 1e12 && /(?:^ts$|Ts$|At$|_ts$)/.test(key)) return esc(new Date(value).toLocaleString());
  if (typeof value === "boolean") return value ? "yes" : "no";
  // A size in bytes reads as KB, MB or GB.
  if (typeof value === "number" && /(?:^b|B)ytes$/.test(key) && value >= 0) {
    const [size, unit] = value >= 1e9 ? [value / 1e9, "GB"] : value >= 1e6 ? [value / 1e6, "MB"] : value >= 1e3 ? [value / 1e3, "KB"] : [value, "bytes"];
    return esc(`${unit === "bytes" ? size : size.toFixed(1)} ${unit}`);
  }
  if (typeof value === "number") return esc(Number.isInteger(value) ? value : Number(value.toFixed(3)));
  if (Array.isArray(value) && value.every((item) => item === null || typeof item !== "object")) return value.length ? esc(value.join(", ")) : '<span class="muted">none</span>';
  if (typeof value === "object") return recordDetails(value, `${Array.isArray(value) ? `${value.length} items` : "Details"}`);
  // A state code reads as words, the code kept in the title: "READY" → "Ready", "INSUFFICIENT_EVIDENCE" → "Insufficient evidence".
  if (typeof value === "string" && /^[A-Z]{3,}(?:_[A-Z0-9]+)*$/.test(value)) {
    const words = value.toLowerCase().replaceAll("_", " ");
    return `<span title="${esc(value)}">${esc(words[0].toUpperCase() + words.slice(1))}</span>`;
  }
  return esc(workspacePath(String(value)));
}

/** A record as rows of label and value; nested parts stay closed. The whole record sits under "Show the record". */
export function recordRows(value, { record = true } = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return `<p>${cell(value)}</p>`;
  const rows = Object.entries(value).map(([key, item]) => `<tr><th scope="row">${esc(keyWords(key))}</th><td>${cell(item, key)}</td></tr>`).join("");
  return `<div class="scroll"><table class="record-rows"><tbody>${rows || '<tr><td class="muted">Nothing recorded.</td></tr>'}</tbody></table></div>${record ? recordDetails(value) : ""}`;
}

/**
 * Asks for one line of text beside `anchor`, instead of window.prompt. Resolves with the trimmed text, or null when
 * cancelled. `required` refuses an empty answer; `check(text)` returns a message for a wrong one.
 */
export function askInline(anchor, { label, value = "", required = true, check = null, submit = "Continue", type = "text" }) {
  return new Promise((resolve) => {
    anchor.parentElement?.querySelector(":scope > .ask-inline")?.remove();
    const form = anchor.ownerDocument.createElement("form");
    form.className = "ask-inline row wrap";
    form.noValidate = true;
    form.innerHTML = `<label><span class="muted">${esc(label)}</span><input type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} /></label>
      <button type="submit">${esc(submit)}</button><button type="button" class="secondary" data-cancel>Cancel</button><p class="muted" role="alert"></p>`;
    const input = form.querySelector("input"), problem = form.querySelector("[role=alert]");
    const finish = (answer) => { form.remove(); anchor.focus?.(); resolve(answer); };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      const wrong = required && !text ? "This is needed." : check?.(text);
      if (wrong) { problem.textContent = wrong; problem.className = "status-bad"; input.focus(); return; }
      finish(text);
    });
    form.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
    form.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); finish(null); } });
    anchor.insertAdjacentElement("afterend", form);
    input.focus();
    input.select?.();
  });
}

/**
 * A change that cannot simply be taken back asks for a second press: the first press turns the button into
 * "Press again to <what>" for a few seconds. Returns true on the second press.
 */
export function confirmPress(button, what, ms = 6000) {
  if (button.dataset.confirming === "1") {
    clearTimeout(Number(button.dataset.confirmTimer));
    button.textContent = button.dataset.label;
    delete button.dataset.confirming;
    return true;
  }
  button.dataset.label = button.textContent;
  button.dataset.confirming = "1";
  button.textContent = `Press again to ${what}`;
  button.dataset.confirmTimer = String(setTimeout(() => {
    button.textContent = button.dataset.label;
    delete button.dataset.confirming;
  }, ms));
  return false;
}

/**
 * An action's result (C-09): one plain line, then the record as readable rows with the raw record under "Show the
 * record". A <pre> output becomes a live region the first time; a handler that still holds the old element is followed
 * to the new one by its id.
 */
export function showResult(target, value, words = `Done at ${new Date().toLocaleTimeString()}.`) {
  let el = target && !target.isConnected && target.id ? target.ownerDocument.getElementById(target.id) : target;
  if (!el) return;
  if (el.tagName === "PRE") {
    const div = el.ownerDocument.createElement("div");
    div.id = el.id;
    div.setAttribute("aria-live", "polite");
    el.replaceWith(div);
    el = div;
  }
  el.innerHTML = `<p class="status-ok">${esc(words)}</p>${recordRows(value)}`;
}

// The redesign's shared pieces (studio-ui lane): the route, picture cards, notice chips, "more info" and empty states.
// Every one is plain markup styled by styles.css; words passed in are escaped, `html` arguments are the console's own.

const ROUTE_WORDS = { done: "done", now: "you are here", wait: "waiting for a person", stop: "stopped", todo: "not started" };
const ROUTE_ICONS = { done: "check", wait: "wait", stop: "refused" };

/**
 * The route: waypoints on a line, one per step `{ label, state: "done"|"now"|"wait"|"stop"|"todo", hint? }`. An ordered
 * list for assistive technology; the current step (the first "now", else the first "wait" or "stop") carries
 * aria-current="step", and each state is said in hidden words. Labels are at most two words; a hint is the tooltip; `href` makes the label a link.
 * `diagram: true` draws an explanation, not progress: no state words are said.
 */
export function routeTrack(steps, { label = "Progress", className = "", diagram = false } = {}) {
  const list = Array.isArray(steps) ? steps : [];
  const states = list.map((step) => (Object.hasOwn(ROUTE_WORDS, step?.state) ? step.state : "todo"));
  const current = ["now", "wait", "stop"].map((state) => states.indexOf(state)).find((at) => at >= 0) ?? -1;
  const items = list.map((step, at) => {
    const state = states[at];
    const mark = ROUTE_ICONS[state] ? icon(ROUTE_ICONS[state], { size: 14 }) : "";
    return `<li class="route-step is-${state}${step.viewed ? " is-viewed" : ""}"${at === current ? ' aria-current="step"' : ""}${step.hint ? ` title="${esc(step.hint)}"` : ""}>`
      + `<span class="route-dot" aria-hidden="true">${mark}</span>${step.href ? `<a class="route-label route-link" href="${esc(step.href)}">${esc(step.label)}</a>`
        : `<span class="route-label">${esc(step.label)}</span>`}`
      + (diagram ? "" : `<span class="visually-hidden">: ${ROUTE_WORDS[state]}${step.hint ? `. ${esc(step.hint)}` : ""}</span>`) + "</li>";
  }).join("");
  return `<ol class="route${className ? ` ${esc(className)}` : ""}" aria-label="${esc(label)}">${items}</ol>`;
}

/**
 * A choice or a way in, drawn as a card: a picture (or a large icon), a 2-4 word title and one line. With `href` it is a
 * link; with `input` (a real radio or checkbox, same name and value as before) it is that input's label; else a button.
 */
export function pictureCard({ title, line = "", href = "", input = "", pictureName = "", iconName = "", id = "", className = "" }) {
  const art = (pictureName && picture(pictureName)) || (iconName ? `<span class="picture-card-icon">${icon(iconName, { size: 28 })}</span>` : "");
  const body = `${art}<strong class="picture-card-title">${esc(title)}</strong>${line ? `<span class="picture-card-line">${esc(line)}</span>` : ""}`;
  const attrs = `class="picture-card${className ? ` ${esc(className)}` : ""}"${id ? ` id="${esc(id)}"` : ""}`;
  if (input) return `<label ${attrs}>${input}${body}</label>`;
  return href ? `<a ${attrs} href="${esc(href)}">${body}</a>` : `<button type="button" ${attrs}>${body}</button>`;
}

/** A required notice as a neutral chip of 2-3 words that opens the full sentence, unchanged. Never green. */
export function noticeChip(label, text) {
  return `<details class="notice-chip"><summary>${icon("info", { size: 16 })}<span>${esc(label)}</span></summary><p>${esc(text)}</p></details>`;
}

/** Everything a screen keeps but does not need at first sight, one click away under a 2-4 word summary. */
export function moreInfo(summary, html, { id = "" } = {}) {
  return `<details class="more-info"${id ? ` id="${esc(id)}"` : ""}><summary>${esc(summary)}</summary><div class="more-info-body">${html}</div></details>`;
}

/** An empty state: a spot drawing, one line, and one action (the console's own markup). */
export function emptyState({ pictureName = "empty", line, action = "" }) {
  return `<div class="empty-state">${picture(pictureName) ?? ""}<p>${esc(line)}</p>${action}</div>`;
}

const initials = (name) => String(name ?? "?").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";

/** A person as initials in a circle, their name and their state ("done" | "wait" | "stop" | "todo") in words. A list item. */
export function personChip(name, state, words) {
  return `<li class="a4-person is-${esc(state)}"><span class="a4-avatar" aria-hidden="true">${esc(initials(name))}</span>`
    + `<span class="a4-person-words"><strong>${esc(name)}</strong><small>${esc(words)}</small></span></li>`;
}
