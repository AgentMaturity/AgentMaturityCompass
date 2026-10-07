/**
 * Authorization-server discovery for MCP HTTP (spec 2026-07-28,
 * basic/authorization/authorization-server-discovery). Every fetch here is
 * unauthenticated, refuses redirects and is bounded; no response text is echoed.
 */
import { MCP_STATELESS_PROTOCOL_VERSION, statelessRequestMeta } from "../protocol/version.js";

export const NATIVE_MCP_OAUTH_LIMITS = Object.freeze({ bodyBytes: 64 * 1024, timeoutMs: 10_000, scopes: 32 });
export const NATIVE_MCP_AUTHORIZE_HINT = "Run `amc agent-loop mcp-catalog --config <this config file> --authorize` in a terminal to authorize this server.";

export class NativeMcpOAuthRefused extends Error {
  constructor(message: string, readonly code: "AUTH_REQUIRED" | "REFUSED" = "REFUSED") {
    super(message); this.name = "NativeMcpOAuthRefused";
  }
}
const refuse = (message: string, code?: "AUTH_REQUIRED" | "REFUSED"): never => { throw new NativeMcpOAuthRefused(message, code); };

export interface NativeMcpOAuthChallenge {
  readonly error?: string;
  readonly scopes?: readonly string[];
  readonly resourceMetadata?: string;
}
export interface NativeMcpProtectedResource {
  readonly resource: string;
  readonly authorizationServer: string;
  readonly scopesSupported?: readonly string[];
}
export interface NativeMcpAuthorizationServer {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint?: string;
  readonly clientIdMetadataDocumentSupported: boolean;
  readonly issParameterSupported: boolean;
  readonly scopesSupported?: readonly string[];
}

/** Literal loopback HTTP endpoints are development-only, as for the MCP endpoint itself. */
export function isLoopbackHttp(url: URL): boolean {
  return url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * security-considerations §Communication Security: authorization-server
 * endpoints MUST be HTTPS. Loopback HTTP is accepted only beside a loopback MCP endpoint.
 */
export function nativeMcpOAuthUrl(value: unknown, development: boolean): URL {
  let url: URL | undefined;
  try { if (typeof value === "string" && !/[\x00-\x20\x7f]/.test(value)) url = new URL(value); } catch { /* refused below */ }
  if (!url || url.username || url.password || url.hash || !(url.protocol === "https:" || (development && isLoopbackHttp(url)))) {
    return refuse("MCP OAuth metadata named an endpoint that is not HTTPS (or development loopback HTTP); it was refused.");
  }
  return url;
}

/** RFC 6749 scope tokens, bounded; anything else is dropped rather than echoed. */
export function nativeMcpScopes(value: unknown): string[] | undefined {
  const list = typeof value === "string" ? value.split(" ").filter(Boolean) : Array.isArray(value) ? value : undefined;
  if (!list || list.length > NATIVE_MCP_OAUTH_LIMITS.scopes
    || list.some(scope => typeof scope !== "string" || scope.length > 128 || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(scope))) return undefined;
  return [...new Set(list as string[])];
}

/** RFC 6750 §3 / RFC 9728 §5.1: parameters of the Bearer challenge only. */
export function parseNativeMcpBearerChallenge(header: string | null): NativeMcpOAuthChallenge {
  const start = header?.search(/(^|[\s,])Bearer(\s|$)/i) ?? -1;
  if (!header || start < 0 || header.length > 8192) return {};
  const params: Record<string, string> = {};
  for (const match of header.slice(start).replace(/^[\s,]*Bearer/i, "").matchAll(/([A-Za-z_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,"]+))/g)) {
    const key = match[1]!.toLowerCase();
    params[key] ??= (match[2] ?? match[3] ?? "").replace(/\\(.)/g, "$1");
  }
  const scopes = nativeMcpScopes(params.scope);
  return { ...(params.error && /^[a-z_]{1,64}$/.test(params.error) ? { error: params.error } : {}),
    ...(scopes ? { scopes } : {}), ...(params.resource_metadata ? { resourceMetadata: params.resource_metadata } : {}) };
}

export async function nativeMcpOAuthFetch(url: URL, init: RequestInit, timeoutMs: number): Promise<{ status: number; body?: unknown; headers: Headers }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "manual", credentials: "omit", cache: "no-store",
      referrerPolicy: "no-referrer", signal: AbortSignal.timeout(Math.min(timeoutMs, NATIVE_MCP_OAUTH_LIMITS.timeoutMs)) });
  } catch { return refuse("MCP OAuth request failed or timed out; nothing was authorized."); }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => {});
    return refuse("MCP OAuth redirects are refused; review the server's authorization metadata.");
  }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); return { status: response.status, headers: response.headers }; }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > NATIVE_MCP_OAUTH_LIMITS.bodyBytes) {
    await response.body?.cancel().catch(() => {});
    return refuse("MCP OAuth response exceeds its size limit.");
  }
  let text: string;
  try { text = await response.text(); } catch { return refuse("MCP OAuth response could not be read."); }
  if (Buffer.byteLength(text) > NATIVE_MCP_OAUTH_LIMITS.bodyBytes) return refuse("MCP OAuth response exceeds its size limit.");
  try { return { status: response.status, body: JSON.parse(text) as unknown, headers: response.headers }; }
  catch { return refuse("MCP OAuth response is not JSON."); }
}

/** authorization §Flow Steps: an unauthenticated request reveals the server's Bearer challenge. */
export async function nativeMcpOAuthChallenge(endpoint: URL, timeoutMs: number): Promise<NativeMcpOAuthChallenge> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", origin: endpoint.origin,
        "mcp-protocol-version": MCP_STATELESS_PROTOCOL_VERSION, "mcp-method": "server/discover" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "amc-oauth-challenge", method: "server/discover", params: { _meta: statelessRequestMeta() } }),
      signal: AbortSignal.timeout(Math.min(timeoutMs, NATIVE_MCP_OAUTH_LIMITS.timeoutMs)) });
  } catch { return refuse("MCP OAuth challenge request failed or timed out."); }
  await response.body?.cancel().catch(() => {});
  if (response.redirected || (response.status >= 300 && response.status < 400)) return refuse("MCP HTTP redirects or endpoint changes are refused; review the configured endpoint explicitly.");
  return response.status === 401 || response.status === 403 ? parseNativeMcpBearerChallenge(response.headers.get("www-authenticate")) : {};
}

/**
 * RFC 9728 §3.3 requires the metadata's resource to identify the protected
 * resource. AMC accepts the endpoint itself or a same-origin path prefix of it,
 * so another origin can never claim this server's tokens.
 */
function covers(endpoint: URL, resource: unknown): resource is string {
  if (typeof resource !== "string") return false;
  let url: URL;
  try { url = new URL(resource); } catch { return false; }
  if (url.origin !== endpoint.origin || url.search || url.hash || url.username || url.password) return false;
  const prefix = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.pathname === "/" || endpoint.pathname === url.pathname || endpoint.pathname.startsWith(prefix);
}

/** authorization-server-discovery §Protected Resource Metadata Discovery Requirements. */
export async function discoverNativeMcpProtectedResource(endpoint: URL, challenge: NativeMcpOAuthChallenge, timeoutMs: number): Promise<NativeMcpProtectedResource> {
  const development = isLoopbackHttp(endpoint);
  const path = endpoint.pathname.replace(/\/$/, "");
  const candidates = challenge.resourceMetadata !== undefined ? [nativeMcpOAuthUrl(challenge.resourceMetadata, development)]
    : [...(path ? [new URL(`/.well-known/oauth-protected-resource${path}`, endpoint.origin)] : []),
      new URL("/.well-known/oauth-protected-resource", endpoint.origin)];
  for (const url of candidates) {
    const { status, body } = await nativeMcpOAuthFetch(url, { method: "GET", headers: { accept: "application/json" } }, timeoutMs);
    if (status !== 200) continue;
    const document = body as Record<string, unknown> | null;
    const servers = document?.authorization_servers;
    if (!document || typeof document !== "object" || !covers(endpoint, document.resource)
      || !Array.isArray(servers) || servers.length === 0 || typeof servers[0] !== "string") {
      return refuse("MCP protected resource metadata does not identify this server or names no authorization server; it was refused.");
    }
    nativeMcpOAuthUrl(servers[0], development);
    const scopesSupported = nativeMcpScopes(document.scopes_supported);
    return { resource: document.resource as string, authorizationServer: servers[0], ...(scopesSupported ? { scopesSupported } : {}) };
  }
  return refuse("MCP protected resource metadata was not found; OAuth discovery stopped.");
}

/**
 * authorization-server-discovery §Authorization Server Metadata Discovery: the
 * RFC 8414 and OpenID Connect URLs in the listed order; the document's issuer
 * MUST equal the issuer used to build the URL. security-considerations
 * §Authorization Code Protection: refuse unless S256 PKCE is advertised.
 */
export async function discoverNativeMcpAuthorizationServer(issuer: string, development: boolean, timeoutMs: number): Promise<NativeMcpAuthorizationServer> {
  const base = nativeMcpOAuthUrl(issuer, development);
  if (base.search) return refuse("MCP authorization server issuer has a query; it was refused.");
  const path = base.pathname.replace(/\/$/, "");
  const candidates = path
    ? [`/.well-known/oauth-authorization-server${path}`, `/.well-known/openid-configuration${path}`, `${path}/.well-known/openid-configuration`]
    : ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"];
  for (const candidate of candidates) {
    const { status, body } = await nativeMcpOAuthFetch(new URL(candidate, base.origin), { method: "GET", headers: { accept: "application/json" } }, timeoutMs);
    if (status !== 200) continue;
    const document = body as Record<string, unknown> | null;
    if (!document || typeof document !== "object" || document.issuer !== issuer) {
      return refuse("MCP authorization server metadata names a different issuer; it was refused.");
    }
    const methods = document.code_challenge_methods_supported;
    if (!Array.isArray(methods) || !methods.includes("S256")) {
      return refuse("MCP authorization server does not advertise S256 PKCE (code_challenge_methods_supported); authorization was refused.");
    }
    const scopesSupported = nativeMcpScopes(document.scopes_supported);
    return {
      issuer,
      authorizationEndpoint: nativeMcpOAuthUrl(document.authorization_endpoint, development).href,
      tokenEndpoint: nativeMcpOAuthUrl(document.token_endpoint, development).href,
      ...(document.registration_endpoint === undefined ? {} : { registrationEndpoint: nativeMcpOAuthUrl(document.registration_endpoint, development).href }),
      clientIdMetadataDocumentSupported: document.client_id_metadata_document_supported === true,
      issParameterSupported: document.authorization_response_iss_parameter_supported === true,
      ...(scopesSupported ? { scopesSupported } : {})
    };
  }
  return refuse("MCP authorization server metadata was not found at any RFC 8414 or OpenID Connect discovery URL.");
}
