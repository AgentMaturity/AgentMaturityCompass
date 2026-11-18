// The console's page scripts all import this module, so the shared shell (nav, status, banner) and the focusable-scroll
// fix reach their pages from here.
import "./shell.js";
import { renderNavSession, renderTopbar, showShellNotice } from "./shell.js";
import "./focusableScroll.js";
import { trackRequest } from "./actionFeedback.js";
import { plainErrorText } from "./plainError.js";

const state = {
  adminToken: null,
  me: null
};

export function setAdminToken(token) {
  state.adminToken = token && token.length > 0 ? token : null;
}

export function getAdminToken() {
  return state.adminToken;
}

export function getCurrentUser() {
  return state.me;
}

/** The one visible line a page shows when it greys out at least one control; the hover title alone went unseen. */
export function roleGateNoteText(me) {
  return me?.userId === "local-demo"
    ? "View-only demo. To use this, start your own workspace: run amc up in a terminal."
    : `Your role (${(me?.roles || []).join(", ")}) cannot use the greyed-out controls on this page.`;
}

/** Write controls carry data-roles; a signed-in user without one of them sees them disabled (H3), and one line above #app says why. */
export function applyRoleGates(scope = document) {
  const roles = state.me?.roles;
  if (!Array.isArray(roles)) return; // admin-token session: the server decides
  let gated = 0;
  for (const control of scope.querySelectorAll("[data-roles]")) {
    const needed = control.dataset.roles.split(",");
    if (needed.some((role) => roles.includes(role))) continue;
    control.disabled = true;
    control.title = `Requires role: ${needed.join(" or ")}`;
    gated += 1;
  }
  const doc = scope.ownerDocument || scope;
  const app = doc.getElementById?.("app");
  if (gated === 0 || !app || doc.getElementById("roleGateNote")) return;
  const note = doc.createElement("p");
  note.id = "roleGateNote";
  note.className = "muted";
  note.textContent = roleGateNoteText(state.me);
  app.parentNode.insertBefore(note, app); // outside #app, so a re-render keeps it and the #app observer does not refire
}

/** A signed-out page links to sign-in, which returns here afterwards (M9). */
export function showSignIn(statusEl) {
  if (!statusEl) return;
  const link = document.createElement("a");
  link.href = `./login?next=${encodeURIComponent(`${window.location.pathname.split("/").pop() || "home"}${window.location.search}`)}`;
  link.textContent = "Sign in";
  statusEl.replaceChildren("Authentication required. ", link);
}

function buildHeaders(extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (state.adminToken) {
    headers["x-amc-admin-token"] = state.adminToken;
  }
  return headers;
}

function runtimeBasePrefix() {
  const path = window.location.pathname || "/";
  if (path.startsWith("/w/")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return `/${parts[0]}/${parts[1]}`;
    }
  }
  if (path.startsWith("/host/")) {
    return "/host";
  }
  return "";
}

function withBase(path) {
  if (!path || typeof path !== "string") {
    return path;
  }
  if (/^https?:\/\//i.test(path) || path.startsWith("//")) {
    return path;
  }
  if (path.startsWith("/w/") || path.startsWith("/host/")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const prefix = runtimeBasePrefix();
  return `${prefix}${normalized}`;
}

export class ConsoleApiError extends Error {
  constructor(message, status, code, data = null) {
    super(message);
    this.name = "ConsoleApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }

  /** Shown wherever a page prints the error: plain words, never the class name or a server code (C-10). */
  toString() {
    return plainErrorText(this);
  }
}

async function request(path, options) {
  const finished = trackRequest();
  try {
    const result = await requestOnce(path, options);
    finished(result.ok !== false);
    return result;
  } catch (error) {
    finished(false);
    throw error;
  }
}

async function requestOnce(path, options) {
  let response;
  try {
    response = await fetch(withBase(path), {
      method: options?.method || "GET",
      credentials: "include",
      signal: options?.signal,
      cache: options?.cache,
      headers: buildHeaders(options?.headers),
      body: options?.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    // No answer at all: AMC stopped or the network is gone. One shared notice says so (C-06); the caller still sees the error.
    if (error?.name !== "AbortError") showShellNotice("offline");
    throw error;
  }
  // A session that ended mid-visit: one sign-in prompt instead of each page's own error (C-11). /auth/me asks on purpose.
  if (response.status === 401 && !options?.allowAuthErrors && state.me !== null) {
    state.me = null;
    showShellNotice("signedOut");
    renderNavSession(document, null);
  }
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; }
  catch { throw new ConsoleApiError("Studio returned an unreadable response. Refresh the task status before trying another action.", response.status, "INVALID_RESPONSE"); }
  if (!response.ok) {
    if (options?.allowAuthErrors && (response.status === 401 || response.status === 403)) {
      return {
        ok: false,
        status: response.status,
        data: parsed,
        error: parsed.error || `HTTP ${response.status}`
      };
    }
    throw new ConsoleApiError(typeof parsed.error === "string" ? parsed.error : `HTTP ${response.status}`,
      response.status, typeof parsed.code === "string" ? parsed.code : "HTTP_ERROR", parsed);
  }
  recordClaims(parsed);
  return {
    ok: true,
    status: response.status,
    data: parsed
  };
}

// P0-23: result routes carry claim fields beside a result or a `claim` on each list item.
const claimListeners = new Set();

export function onClaims(listener) {
  claimListeners.add(listener);
}

function recordClaims(body) {
  if (!body || typeof body !== "object" || claimListeners.size === 0) return;
  const claims = typeof body.claimKind === "string" ? [body] : [];
  const holder = body.data && typeof body.data === "object" ? body.data : body;
  for (const value of Object.values(holder)) {
    if (Array.isArray(value)) claims.push(...value.map((item) => item?.claim).filter((claim) => typeof claim?.claimKind === "string"));
  }
  if (claims.length > 0) for (const listener of claimListeners) listener(claims);
}

export async function login(params) {
  if (params?.pairingCode) {
    await request("/pair/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { code: params.pairingCode }
    });
  }
  await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: {
      username: params.username,
      password: params.password
    }
  });
  return whoami();
}

export async function logout() {
  await request("/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: {}
  });
  state.me = null;
}

export async function whoami() {
  const result = await request("/auth/me", {
    allowAuthErrors: true
  });
  const body = typeof document === "undefined" ? null : document.body;
  state.me = result.ok ? result.data : null;
  if (body && !result.ok && !getAdminToken()) body.dataset.session = "none";
  if (body && result.ok) delete body.dataset.session;
  if (typeof document !== "undefined") {
    const signOut = () => logout().then(() => window.location.assign("./login"), () => window.location.assign("./login"));
    renderNavSession(document, state.me, signOut);
    // Pages with their own script get the top bar here (C-15); app.js redraws its own, so an existing bar is left alone.
    if (!document.querySelector("main .topbar")) renderTopbar(document, state.me, signOut);
  }
  return state.me;
}

export async function apiGet(path, options) {
  const result = await request(path, { signal: options?.signal });
  return result.data;
}

/** Native task writes use the authenticated inspection token, never a URL credential. */
export async function apiNativeRequest(path, options = {}) {
  if (!/^\/api\/v1\/(?:native-tasks|a4)(?:[/?]|$)/.test(path)) throw new Error("Invalid native task API path");
  const method = options.method || "GET";
  const headers = {};
  if (method !== "GET") {
    if (!state.adminToken && (typeof options.nativeCsrfToken !== "string" || !options.nativeCsrfToken)) {
      throw new ConsoleApiError("Refresh task setup before submitting an action.", 403, "NATIVE_CSRF_REQUIRED");
    }
    headers["content-type"] = "application/json";
    headers["x-amc-native-intent"] = "task-workspace-v1";
    if (options.nativeCsrfToken) headers["x-amc-native-csrf"] = options.nativeCsrfToken;
  }
  const result = await request(path, { method, headers, body: options.body, signal: options.signal, cache: "no-store" });
  if (result.data?.ok !== true || !Object.prototype.hasOwnProperty.call(result.data, "data")) {
    throw new ConsoleApiError("Studio returned an unsupported task response. Refresh status before another action.", result.status, "INVALID_RESPONSE");
  }
  return result.data.data;
}

/** A file a read route returns as a download (Content-Disposition), saved by the browser under the name it gives. */
export async function apiDownload(path) {
  const response = await fetch(withBase(path), { credentials: "include", headers: buildHeaders(), cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    let error = `HTTP ${response.status}`;
    try { error = JSON.parse(text).error || error; } catch { /* not JSON */ }
    throw new ConsoleApiError(error, response.status, "HTTP_ERROR");
  }
  const named = /filename="([A-Za-z0-9._-]+)"/.exec(response.headers.get("content-disposition") || "");
  const name = named ? named[1] : "amc-export";
  const url = URL.createObjectURL(new Blob([text], { type: response.headers.get("content-type") || "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export async function apiPost(path, body) {
  const headers = { "content-type": "application/json" };
  // Only existing approval decisions share the native browser intent boundary.
  // Bootstrap admin uses its explicit header; cookie actors need the session proof.
  if (/^\/approvals\/(?:[^/]+\/(?:approve|deny)|requests\/[^/]+\/(?:decide|cancel))$/.test(path)) {
    headers["x-amc-native-intent"] = "task-workspace-v1";
    if (!state.adminToken) {
      if (!state.me?.nativeCsrfToken) await whoami();
      if (state.me?.userId === "local-demo") throw new ConsoleApiError("Sign in with an authorized identity to decide approvals. Demo sessions cannot approve tools.", 403, "NATIVE_DEMO_APPROVAL_REFUSED");
      if (!state.me?.nativeCsrfToken) throw new ConsoleApiError("Sign in again before deciding an approval.", 403, "NATIVE_CSRF_REQUIRED");
      headers["x-amc-native-csrf"] = state.me.nativeCsrfToken;
    }
  }
  const result = await request(path, {
    method: "POST",
    headers,
    body: body || {}
  });
  return result.data;
}
