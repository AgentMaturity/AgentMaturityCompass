// Every button on a page answers (C-04, C-05): while the requests it started run, it is marked busy; when they end it
// says "Done" with the time, and a failure nobody caught becomes a plain message beside it instead of a line in the
// browser console. api.js reports each request here; page modules need no change to get this.
import { plainErrorText } from "./plainError.js";

// A request belongs to the last pressed control while that control's work is still going: started within this long of
// the press or of its previous request ending. Background refreshes after that are not its work.
const QUIET_MS = 1500;
const SETTLE_MS = 400;
// A4 Forge and Native Tasks report on every action themselves.
const OWN_FEEDBACK = /\/(?:a4|a4Project|native-tasks)$/;
let last = null; // { control, at, requests, failed }

const timeNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function note(control, kind, text) {
  const holder = control.parentElement;
  if (!holder) return;
  holder.querySelectorAll(":scope > .action-done, :scope > .action-error[data-feedback]").forEach((old) => old.remove());
  const line = control.ownerDocument.createElement("p");
  line.className = kind === "error" ? "action-error status-bad" : "action-done muted";
  line.setAttribute("role", kind === "error" ? "alert" : "status");
  if (kind === "error") line.dataset.feedback = "1";
  line.textContent = text;
  control.insertAdjacentElement("afterend", line);
}

/** api.js calls this when a request starts; the returned function when it ends (ok true or false). */
export function trackRequest() {
  const entry = last && (last.requests > 0 || Date.now() - last.at < QUIET_MS) ? last : null;
  if (!entry) return () => {};
  entry.requests += 1;
  entry.control.setAttribute("aria-busy", "true");
  return (ok) => {
    entry.requests -= 1;
    entry.at = Date.now();
    if (!ok) entry.failed = true;
    if (entry.requests > 0) return;
    // Handlers often send one request after another and re-render in between: answer only once the work has been
    // quiet for a moment. A page that re-rendered the same control (same id) gets the line on the new one, so a
    // refresh that changed nothing still answers.
    setTimeout(() => {
      if (entry.requests > 0 || Date.now() - entry.at < SETTLE_MS - 50) return;
      entry.control.removeAttribute("aria-busy");
      const control = current(entry.control);
      control?.removeAttribute("aria-busy");
      if (control && !entry.failed && !control.parentElement?.querySelector(":scope > .action-error")) note(control, "done", `Done at ${timeNow()}.`);
    }, SETTLE_MS);
  };
}

const current = (control) => control.isConnected ? control : control.id ? control.ownerDocument.getElementById(control.id) : null;

function remember(event) {
  const control = event.target?.closest?.("button, input[type=submit]");
  if (!control || control.disabled || !control.closest("main") || control.closest("nav, .topbar, dialog")) return;
  if (OWN_FEEDBACK.test(control.ownerDocument.location?.pathname || "")) return;
  last = { control, at: Date.now(), requests: 0, failed: false };
  control.parentElement?.querySelectorAll(":scope > .action-done, :scope > .action-error[data-feedback]").forEach((old) => old.remove());
}

function failed(reason) {
  const control = last && Date.now() - last.at < 10 * QUIET_MS ? current(last.control) : null;
  if (!control) return false;
  last.failed = true;
  control.removeAttribute("aria-busy");
  note(control, "error", plainErrorText(reason));
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("click", remember, true);
  window.addEventListener("unhandledrejection", (event) => { if (failed(event.reason)) event.preventDefault(); });
  window.addEventListener("error", (event) => { if (event.error && failed(event.error)) event.preventDefault(); });
}
