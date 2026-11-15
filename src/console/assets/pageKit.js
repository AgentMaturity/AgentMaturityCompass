// Small pieces the console's secondary pages share (C-09, C-16, C-18): records as readable rows with the raw record under
// "Show the record", an inline question instead of a browser prompt, and a second press to confirm a change that cannot be
// taken back. Everything that came from Studio, a file or an agent is escaped here.

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
export function keyWords(key) {
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
  if (typeof value === "number") return esc(Number.isInteger(value) ? value : Number(value.toFixed(3)));
  if (Array.isArray(value) && value.every((item) => item === null || typeof item !== "object")) return value.length ? esc(value.join(", ")) : '<span class="muted">none</span>';
  if (typeof value === "object") return recordDetails(value, `${Array.isArray(value) ? `${value.length} items` : "Details"}`);
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
