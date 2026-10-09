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
}

async function request(path, options) {
  const response = await fetch(withBase(path), {
    method: options?.method || "GET",
    credentials: "include",
    signal: options?.signal,
    cache: options?.cache,
    headers: buildHeaders(options?.headers),
    body: options?.body ? JSON.stringify(options.body) : undefined
  });
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
  if (!result.ok) {
    state.me = null;
    return null;
  }
  state.me = result.data;
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
