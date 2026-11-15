// The A4 pages' write path and shared page state, moved unchanged from a4.js (the a4-plain split): one write at a time,
// the unconfirmed action and its Retry, the notice line, the signed-in person and the claim strip's sink.
import { apiNativeRequest } from "./api.js";
import { definiteNativeSubmissionRefusal } from "./nativeTaskSubmission.js";
import { esc } from "./a4View.js";
import { errorHtml } from "./a4Start.js";

export const API = "/api/v1/a4";
export const root = document.getElementById("app");
export const notice = document.getElementById("a4Notice");
export const params = new URLSearchParams(location.search);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);
export const one = (data, key) => (isObject(data?.[key]) ? data[key] : data);

export let me = null;
export const setMe = (who) => { me = who; };
// The labelled claims the responses of the page load in flight carried, and the strip's "show these instead" hook: the
// strip shows a load's claims only once that load has rendered, so it never mixes a superseded load's labels in.
export let claimSink = null;
export const setClaimSink = (sink) => { claimSink = sink; };
export let showClaims = () => {};
export const setShowClaims = (show) => { showClaims = show; };
let pending = null; // the unconfirmed mutation; a retry repeats its clientRequestId so Studio returns the recorded result
let busy = false; // one write in flight at a time, so a double click cannot mint a second, non-deduplicable request id

/** Runs one user-started write; a click or submit while another is in flight is ignored. */
export async function guarded(work) {
  if (busy) return undefined;
  busy = true;
  root?.setAttribute("aria-busy", "true"); // a4.css dims the actions until the write and the reload after it end
  try {
    return await work();
  } finally {
    busy = false;
    root?.removeAttribute("aria-busy");
  }
}

export function uuid() {
  if (typeof crypto?.randomUUID !== "function") throw new Error("Open Studio over HTTPS or localhost before changing a project.");
  return crypto.randomUUID();
}

export function errorText(error) {
  const message = error?.message ?? String(error);
  // P1-57's error text already starts with its code; it is printed once.
  const code = typeof error?.code === "string" && !["HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code)
    && !message.startsWith(`${error.code}:`) ? `${error.code}: ` : "";
  return `${code}${message}`;
}

export function showError(error) {
  if (!notice || error?.name === "AbortError") return;
  // A sentence and the next step first; Studio's code stays, in small print (a4Start.errorHtml).
  notice.innerHTML = `${errorHtml(error)}${pending ? ` Studio did not confirm "${esc(pending.label)}".
    Retry repeats the same request id, so Studio returns the recorded result if the first attempt was admitted. A refused
    retry does not show that the first attempt failed: reload the page and check the project, its decisions and its
    comments before doing it again. <button type="button" id="a4Retry">Retry</button>` : ""}`;
}

export function tell(message) {
  if (notice) notice.textContent = message;
}

/**
 * POSTs one action. Only a definite refusal of a first attempt clears the unconfirmed action: a refused retry says
 * nothing about the first attempt (auth, rate and ownership checks run before Studio's idempotent lookup). While one
 * action is unconfirmed no other is sent, so a second lost acknowledgement can never go unreported.
 */
export async function send(action, retry = false) {
  if (pending !== null && pending !== action) throw new Error("Nothing was sent.");
  try {
    const data = await apiNativeRequest(action.path, { method: "POST", body: action.body, nativeCsrfToken: me?.nativeCsrfToken ?? undefined });
    pending = null;
    tell(`Done: ${action.label}. Studio recorded it.`); // a visible confirmation after every write (A4-14)
    return data;
  } catch (error) {
    const refused = (error?.code === "NATIVE_CSRF_REQUIRED" && !retry) || definiteNativeSubmissionRefusal(error, retry);
    pending = refused ? null : action;
    throw error;
  }
}

notice?.addEventListener("click", (event) => {
  if (event.target.id !== "a4Retry" || !pending) return;
  const action = pending;
  void guarded(async () => action.after?.(await send(action, true))).catch(showError);
});

/** The Industry Pack a project started from, per browser (localStorage can be absent or refuse: then only the address keeps it). */
export function storedPack(projectId) {
  try { return localStorage.getItem(`amc.a4.pack.${projectId}`); } catch { return null; }
}
export function storePack(projectId, pack) {
  try { localStorage.setItem(`amc.a4.pack.${projectId}`, pack); } catch { /* the address still carries it */ }
}


/**
 * The preview gate: null only for the gate's own refusal, or for a 404 that carries no code (a Studio without the A4
 * router, where the preview cannot be on). A4_ROUTE_NOT_FOUND and every other error is an error, not "not enabled".
 */
export async function previewOptions() {
  try {
    return await apiNativeRequest(`${API}/options`);
  } catch (error) {
    if (error?.code === "A4_PREVIEW_DISABLED" || (error?.status === 404 && error?.code === "HTTP_ERROR")) return null;
    throw error;
  }
}
