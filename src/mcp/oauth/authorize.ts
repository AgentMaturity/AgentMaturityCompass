/**
 * OAuth 2.1 client for MCP HTTP servers (spec 2026-07-28, basic/authorization).
 * Interactive authorization runs only from `amc agent-loop mcp-catalog --authorize`;
 * every other run uses a stored or refreshed grant or fails with AUTH_REQUIRED.
 * Tokens and codes are never logged, put in a URL or returned in a receipt.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  NATIVE_MCP_AUTHORIZE_HINT, NativeMcpOAuthRefused, discoverNativeMcpAuthorizationServer, discoverNativeMcpProtectedResource, isLoopbackHttp, nativeMcpOAuthNetwork, type NativeMcpOAuthNetwork,
  nativeMcpOAuthChallenge, nativeMcpOAuthFetch, nativeMcpOAuthUrl, nativeMcpScopes,
  type NativeMcpAuthorizationServer, type NativeMcpProtectedResource
} from "./discovery.js";
import type { NativeMcpOAuthGrant, NativeMcpOAuthTokenStore } from "./tokenStore.js";

export interface NativeMcpOAuthConfig {
  readonly kind: "oauth2";
  /** Pre-registered public client id for this authorization server. */
  readonly clientId?: string;
  /** HTTPS Client ID Metadata Document URL the operator hosts. */
  readonly clientIdMetadataUrl?: string;
  /** Deprecated RFC 7591 registration; off unless the operator enables it. */
  readonly allowDynamicRegistration?: boolean;
  readonly scopes?: readonly string[];
  /** Loopback callback port; an ephemeral port when absent. */
  readonly redirectPort?: number;
}
/** What a receipt may say about a grant: never the token. */
export interface NativeMcpOAuthReceipt {
  readonly issuer: string;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: string | null;
}

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_MARGIN_MS = 60_000;
export const NATIVE_MCP_OAUTH_STEP_UPS = 2;

const refuse = (message: string, code: "AUTH_REQUIRED" | "REFUSED" = "REFUSED"): never => { throw new NativeMcpOAuthRefused(message, code); };
const base64url = (bytes: Buffer) => bytes.toString("base64url");
const union = (...lists: (readonly string[] | undefined)[]) => [...new Set(lists.flatMap(list => list ?? []))];

export function nativeMcpOAuthReceipt(grant: NativeMcpOAuthGrant): NativeMcpOAuthReceipt {
  return { issuer: grant.issuer, scopes: [...grant.scopes], tokenExpiresAt: grant.expiresAt ?? null };
}

interface Discovered {
  readonly resource: NativeMcpProtectedResource; readonly server: NativeMcpAuthorizationServer; readonly network: NativeMcpOAuthNetwork;
  readonly challengeScopes?: readonly string[];
}
async function discover(endpoint: URL, timeoutMs: number): Promise<Discovered> {
  const network = await nativeMcpOAuthNetwork(endpoint);
  const challenge = await nativeMcpOAuthChallenge(endpoint, timeoutMs);
  const resource = await discoverNativeMcpProtectedResource(endpoint, challenge, timeoutMs, network);
  const server = await discoverNativeMcpAuthorizationServer(resource.authorizationServer, network, timeoutMs);
  return { resource, server, network, ...(challenge.scopes ? { challengeScopes: challenge.scopes } : {}) };
}

/** OAuth 2.1 §3.2.3 token response; only Bearer tokens that fit one header line are accepted. */
async function tokenRequest(server: NativeMcpAuthorizationServer, form: Record<string, string>, network: NativeMcpOAuthNetwork, timeoutMs: number) {
  const { status, body } = await nativeMcpOAuthFetch(nativeMcpOAuthUrl(server.tokenEndpoint, network.development), { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: new URLSearchParams(form).toString() }, timeoutMs, network);
  const token = body as Record<string, unknown> | undefined;
  if (status !== 200 || !token || typeof token !== "object") return refuse(`MCP OAuth token endpoint refused the request (HTTP ${status}); nothing was stored.`, "AUTH_REQUIRED");
  const { access_token: accessToken, token_type: tokenType, refresh_token: refreshToken, expires_in: expiresIn } = token;
  if (typeof accessToken !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(accessToken) || typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer"
    || (refreshToken !== undefined && (typeof refreshToken !== "string" || !refreshToken || refreshToken.length > 8192))
    || (expiresIn !== undefined && (typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn < 0))) {
    return refuse("MCP OAuth token response is not a usable Bearer token; nothing was stored.");
  }
  return { accessToken, ...(typeof refreshToken === "string" ? { refreshToken } : {}),
    ...(typeof expiresIn === "number" ? { expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() } : {}),
    scopes: nativeMcpScopes(token.scope) };
}

/** client-registration §priority: pre-registered, then CIMD when advertised, then opt-in DCR. */
async function clientIdFor(config: NativeMcpOAuthConfig, server: NativeMcpAuthorizationServer, redirectUri: string, network: NativeMcpOAuthNetwork, timeoutMs: number): Promise<string> {
  if (config.clientId) return config.clientId;
  if (config.clientIdMetadataUrl && server.clientIdMetadataDocumentSupported) return config.clientIdMetadataUrl;
  if (!config.allowDynamicRegistration) {
    return refuse("No usable MCP OAuth client: set auth.clientId, or auth.clientIdMetadataUrl for an authorization server that supports Client ID Metadata Documents. Dynamic client registration is off unless auth.allowDynamicRegistration is true.");
  }
  if (!server.registrationEndpoint) return refuse("The MCP authorization server offers no dynamic client registration endpoint.");
  // client-registration §Dynamic Client Registration: a CLI is a native application.
  const { status, body } = await nativeMcpOAuthFetch(nativeMcpOAuthUrl(server.registrationEndpoint, network.development), { method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_name: "AMC governed MCP client", redirect_uris: [redirectUri], application_type: "native",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }) }, timeoutMs, network);
  const registered = body as Record<string, unknown> | undefined;
  if ((status !== 200 && status !== 201) || typeof registered?.client_id !== "string" || !registered.client_id) {
    return refuse(`MCP OAuth dynamic client registration was refused (HTTP ${status}).`);
  }
  if (registered.client_secret !== undefined) return refuse("MCP OAuth registration issued a confidential client; configure a pre-registered public auth.clientId instead.");
  return registered.client_id;
}

/** Loopback redirect only (security-considerations §Communication Security); first callback wins. */
async function loopbackCallback(port: number, signal?: AbortSignal) {
  let settle!: (value: URLSearchParams | Error) => void;
  const outcome = new Promise<URLSearchParams | Error>(resolve => { settle = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/callback") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" })
      .end("AMC received the authorization response. Return to the terminal.");
    settle(url.searchParams);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve()); })
    .catch(() => refuse("Could not listen on the loopback OAuth redirect port."));
  const address = server.address();
  const timer = setTimeout(() => settle(new NativeMcpOAuthRefused("MCP OAuth authorization was not completed in time.", "AUTH_REQUIRED")), CALLBACK_TIMEOUT_MS);
  const abort = () => settle(new NativeMcpOAuthRefused("MCP OAuth authorization was cancelled.", "AUTH_REQUIRED"));
  signal?.addEventListener("abort", abort, { once: true });
  return {
    redirectUri: `http://127.0.0.1:${typeof address === "object" && address ? address.port : port}/callback`,
    wait: async () => { const value = await outcome; if (value instanceof Error) throw value; return value; },
    close: () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); server.closeAllConnections(); server.close(); }
  };
}

/**
 * authorization §Authorization Response Validation (RFC 9207 table) and
 * security-considerations §Open Redirection (state). Server error text is never shown.
 */
export function validateNativeMcpAuthorizationResponse(params: URLSearchParams, state: string, server: NativeMcpAuthorizationServer): string {
  if (params.get("state") !== state) return refuse("MCP OAuth response did not carry the expected state; it was discarded.", "AUTH_REQUIRED");
  const iss = params.get("iss");
  if (iss !== null ? iss !== server.issuer : server.issParameterSupported) {
    return refuse("MCP OAuth response issuer (iss) did not match the recorded authorization server; it was discarded.", "AUTH_REQUIRED");
  }
  if (params.has("error")) return refuse("The MCP authorization server did not grant access.", "AUTH_REQUIRED");
  const code = params.get("code");
  if (!code || code.length > 4096) return refuse("MCP OAuth response carried no authorization code.", "AUTH_REQUIRED");
  return code;
}

/** Interactive authorization: PKCE S256, state, resource indicator, iss check, token exchange, store. */
export async function authorizeNativeMcpOAuth(options: {
  readonly endpoint: URL;
  readonly config: NativeMcpOAuthConfig;
  readonly store: NativeMcpOAuthTokenStore;
  readonly timeoutMs: number;
  /** Step-up: previously requested scopes plus the latest challenge. */
  readonly extraScopes?: readonly string[];
  readonly onAuthorizationUrl: (url: string) => void;
  readonly signal?: AbortSignal;
}): Promise<NativeMcpOAuthReceipt> {
  const { endpoint, config, timeoutMs } = options;
  const development = isLoopbackHttp(endpoint);
  const { resource, server, network, challengeScopes } = await discover(endpoint, timeoutMs);
  // authorization §Scope Selection Strategy: the challenge, else scopes_supported; plus operator scopes and step-up scopes.
  const scopes = union(config.scopes, challengeScopes ?? resource.scopesSupported, options.extraScopes);
  const callback = await loopbackCallback(config.redirectPort ?? 0, options.signal);
  try {
    const clientId = await clientIdFor(config, server, callback.redirectUri, network, timeoutMs);
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    const url = nativeMcpOAuthUrl(server.authorizationEndpoint, development);
    for (const [name, value] of Object.entries({ response_type: "code", client_id: clientId, redirect_uri: callback.redirectUri,
      code_challenge: base64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", state,
      resource: resource.resource, ...(scopes.length ? { scope: scopes.join(" ") } : {}) })) url.searchParams.set(name, value);
    options.onAuthorizationUrl(url.href);
    const code = validateNativeMcpAuthorizationResponse(await callback.wait(), state, server);
    const token = await tokenRequest(server, { grant_type: "authorization_code", code, redirect_uri: callback.redirectUri,
      client_id: clientId, code_verifier: verifier, resource: resource.resource }, network, timeoutMs);
    const grant: NativeMcpOAuthGrant = { v: 1, issuer: server.issuer, resource: resource.resource, clientId,
      scopes: token.scopes ?? scopes, accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}), ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}) };
    await options.store.save(grant);
    return nativeMcpOAuthReceipt(grant);
  } finally { callback.close(); }
}

/**
 * Non-interactive use: rediscover the server's current issuer, then use only
 * the grant stored for that issuer and resource, refreshing it when it is due.
 * A token is therefore never sent to a server whose authorization server did not issue it.
 */
export async function resolveNativeMcpOAuth(options: {
  readonly endpoint: URL;
  readonly config: NativeMcpOAuthConfig;
  readonly store: NativeMcpOAuthTokenStore;
  readonly timeoutMs: number;
}): Promise<{ readonly accessToken: string; readonly receipt: NativeMcpOAuthReceipt }> {
  const { endpoint, config, store, timeoutMs } = options;
  const { resource, server, network } = await discover(endpoint, timeoutMs);
  let grant = await store.load(server.issuer, resource.resource);
  if (!grant || (config.clientId !== undefined && grant.clientId !== config.clientId)) {
    return refuse(`MCP OAuth authorization is required (AUTH_REQUIRED). ${NATIVE_MCP_AUTHORIZE_HINT}`, "AUTH_REQUIRED");
  }
  if (grant.expiresAt !== undefined && Date.parse(grant.expiresAt) - REFRESH_MARGIN_MS <= Date.now()) {
    if (!grant.refreshToken) return refuse(`MCP OAuth access token expired (AUTH_REQUIRED). ${NATIVE_MCP_AUTHORIZE_HINT}`, "AUTH_REQUIRED");
    const token = await tokenRequest(server, { grant_type: "refresh_token", refresh_token: grant.refreshToken,
      client_id: grant.clientId, resource: resource.resource }, network, timeoutMs);
    // Refresh tokens rotate for public clients; keep the old one only when none was issued.
    grant = { ...grant, accessToken: token.accessToken, scopes: token.scopes ?? grant.scopes,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}), ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}) };
    await store.save(grant);
  }
  return { accessToken: grant.accessToken, receipt: nativeMcpOAuthReceipt(grant) };
}

/** authorization §Step-Up Authorization Flow: scope union, at most two re-authorizations, then a permanent failure. */
export async function withNativeMcpOAuthStepUp<T>(options: {
  readonly run: () => Promise<T>;
  readonly requiredScopes: (error: unknown) => readonly string[] | undefined;
  readonly reauthorize: (scopes: readonly string[]) => Promise<void>;
  readonly granted: () => readonly string[];
}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await options.run(); }
    catch (error) {
      const required = options.requiredScopes(error);
      if (!required?.length || attempt >= NATIVE_MCP_OAUTH_STEP_UPS) throw error;
      await options.reauthorize(union(options.granted(), required));
    }
  }
}
