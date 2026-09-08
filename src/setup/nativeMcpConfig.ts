import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { credentialRef } from "../credentials/credentialRef.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { nativeMcpToolName, type NativeMcpGrant, type NativeMcpServer } from "../mcp/nativeMcpClient.js";
import type { ActionClass } from "../types.js";
import { nativeMcpHttpEndpoint, nativeMcpNotificationLifetime, validateNativeMcpHeaderNames } from "../mcp/nativeMcpHttpTransport.js";

interface StdioConfiguration {
  readonly transport?: "stdio";
  readonly id: string;
  readonly command: string;
  readonly args?: readonly string[];
  /** Child variable name -> AMC credential reference. Literal env is refused. */
  readonly envRefs?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}
interface HttpConfiguration {
  readonly transport: "streamable-http";
  readonly id: string;
  readonly url: string;
  readonly origin: string;
  /** Complete header value, such as a Bearer credential, resolved privately. */
  readonly headerRefs?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly notificationLifetimeMs?: number;
}

export interface NativeMcpConfiguration {
  readonly schemaVersion: 1;
  readonly server: StdioConfiguration | HttpConfiguration;
  readonly expectedCatalogDigest?: string;
  readonly grants?: readonly NativeMcpGrant[];
}
export interface LoadedNativeMcpConfiguration {
  readonly path: string;
  readonly sha256: string;
  readonly config: NativeMcpConfiguration;
}
export class NativeMcpConfigError extends Error {}
const refuse = (message: string): never => { throw new NativeMcpConfigError(message); };
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

/** The explicit file is operator input; parser diagnostics never echo its bytes. */
export function loadNativeMcpConfiguration(path: string, expectedSha256?: string): LoadedNativeMcpConfiguration {
  const absolute = resolve(path);
  let bytes: Buffer;
  try {
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size > 256 * 1024) return refuse("MCP config must be a JSON file no larger than 256 KiB.");
    bytes = readFileSync(absolute);
    if (bytes.length > 256 * 1024) return refuse("MCP config exceeds 256 KiB.");
  } catch (error) {
    if (error instanceof NativeMcpConfigError) throw error;
    return refuse("Could not read the explicit MCP config file.");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined && (!/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== sha256)) {
    return refuse("MCP configuration changed from its pinned digest. Review it explicitly before starting another run.");
  }
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { return refuse("MCP config is not valid JSON. File content is withheld."); }
  if (!object(value) || value.schemaVersion !== 1 || !onlyKeys(value, ["schemaVersion", "server", "expectedCatalogDigest", "grants"]) || !object(value.server)) {
    return refuse("MCP config requires schemaVersion 1 and one explicit server; unsupported fields are refused.");
  }
  const server = value.server;
  if (typeof server.id !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(server.id)) return refuse("MCP server requires a supported explicit id.");
  if (server.timeoutMs !== undefined && (typeof server.timeoutMs !== "number" || !Number.isSafeInteger(server.timeoutMs) || server.timeoutMs < 1 || server.timeoutMs > 300_000)) {
    return refuse("MCP server timeoutMs must be an integer from 1 through 300000.");
  }
  const http = server.transport === "streamable-http";
  if (http) {
    if (!onlyKeys(server, ["transport", "id", "url", "origin", "headerRefs", "timeoutMs", "notificationLifetimeMs"]) || typeof server.url !== "string" || typeof server.origin !== "string") {
      return refuse("MCP HTTP requires explicit url and origin. Use headerRefs; literal headers and stdio fields are refused.");
    }
    try { nativeMcpHttpEndpoint(server.url, server.origin); }
    catch { return refuse("MCP HTTP requires the exact pinned HTTPS origin, or literal loopback HTTP for development, without URL credentials, query or fragment."); }
    if (server.notificationLifetimeMs !== undefined) {
      if (typeof server.notificationLifetimeMs !== "number") return refuse("MCP HTTP notificationLifetimeMs must be an integer from 1 through 86400000.");
      try { nativeMcpNotificationLifetime(server.notificationLifetimeMs); }
      catch { return refuse("MCP HTTP notificationLifetimeMs must be an integer from 1 through 86400000."); }
    }
  } else {
    if ((server.transport !== undefined && server.transport !== "stdio") || !onlyKeys(server, ["transport", "id", "command", "args", "envRefs", "timeoutMs"])
      || typeof server.command !== "string" || !server.command.trim() || /[\x00-\x1f\x7f]/.test(server.command)) {
      return refuse("MCP server requires an id and executable. Use envRefs for credential references; literal env and unsupported server fields are refused.");
    }
    if (server.args !== undefined && (!Array.isArray(server.args) || server.args.length > 256 || server.args.some(arg => typeof arg !== "string" || arg.includes("\0")))) {
      return refuse("MCP server args must be a bounded array of strings without NUL bytes.");
    }
  }
  const references = http ? server.headerRefs : server.envRefs;
  if (references !== undefined) {
    if (!object(references) || Object.keys(references).length > (http ? 32 : 64)) return refuse("MCP credential references must be a bounded map.");
    if (http) {
      try { validateNativeMcpHeaderNames(Object.keys(references)); }
      catch { return refuse("MCP headerRefs has duplicate, invalid or transport-controlled names."); }
    }
    for (const [name, ref] of Object.entries(references)) {
      try {
        if (!http) credentialRef(name);
        if (typeof ref !== "string") throw new Error("Invalid reference");
        credentialRef(ref);
      } catch { return refuse("MCP contains an invalid credential reference. Values are withheld."); }
    }
  }
  if (value.expectedCatalogDigest !== undefined && (typeof value.expectedCatalogDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedCatalogDigest))) {
    return refuse("MCP expectedCatalogDigest must be the reviewed lowercase SHA-256 catalog digest.");
  }
  if (value.grants !== undefined) {
    if (!Array.isArray(value.grants) || value.grants.length > 256) return refuse("MCP grants must be a bounded array of remote tool names and action classes.");
    const names = new Set<string>();
    for (const grant of value.grants) {
      if (!object(grant) || !onlyKeys(grant, ["name", "actionClass"]) || typeof grant.name !== "string" || !grant.name ||
          typeof grant.actionClass !== "string" || !isActionClass(grant.actionClass) || names.has(grant.name)) {
        return refuse("MCP grants require unique remote tool names and valid explicit action classes.");
      }
      names.add(grant.name);
    }
  }
  return { path: absolute, sha256, config: value as unknown as NativeMcpConfiguration };
}

/** Run preflight; the signed allowlist remains an independent permission boundary. */
export function requireReviewedNativeMcpGrants(loaded: LoadedNativeMcpConfiguration, workspace: string, approvalClass: ActionClass): {
  readonly expectedCatalogDigest: string;
  readonly grants: readonly NativeMcpGrant[];
} {
  const { expectedCatalogDigest, grants } = loaded.config;
  if (!expectedCatalogDigest || !grants?.length) return refuse("Discover and review the MCP catalog, then add its expectedCatalogDigest and explicit grants before running tools.");
  if (grants.some(grant => grant.actionClass !== approvalClass)) return refuse("Every MCP grant must match --approve-tools. Use separate runs for different approval action classes.");
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config) return refuse("MCP mounting requires a verifiable signed tool allowlist; no policy was changed.");
  for (const grant of grants) {
    const name = nativeMcpToolName(loaded.config.server.id, grant.name);
    const allowed = snapshot.config.tools.allowedTools.find(tool => tool.name === name);
    if (!allowed || allowed.actionClass !== grant.actionClass) return refuse("Each granted MCP tool must already appear under its exact generated name and action class in the signed allowlist. Review mcp-catalog output and update policy explicitly.");
  }
  return { expectedCatalogDigest, grants };
}

/** Values exist only in the private server launch object, never the config/receipt. */
export async function resolveNativeMcpServer(config: NativeMcpConfiguration, options: {
  readonly workspace: string;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
}): Promise<NativeMcpServer> {
  const source = config.server;
  const references = source.transport === "streamable-http" ? source.headerRefs : source.envRefs;
  const server: NativeMcpServer = source.transport === "streamable-http"
    ? { transport: source.transport, id: source.id, url: source.url, origin: source.origin,
      ...(source.timeoutMs === undefined ? {} : { timeoutMs: source.timeoutMs }),
      ...(source.notificationLifetimeMs === undefined ? {} : { notificationLifetimeMs: source.notificationLifetimeMs }) }
    : { id: source.id, command: source.command, ...(source.transport === undefined ? {} : { transport: source.transport }),
      ...(source.args === undefined ? {} : { args: source.args }), ...(source.timeoutMs === undefined ? {} : { timeoutMs: source.timeoutMs }) };
  if (references === undefined || Object.keys(references).length === 0) return server;
  let store: LocalCredentialsService | undefined;
  try {
    store = new LocalCredentialsService({ watch: false, projectDir: options.workspace,
      ...(options.credentialsHome === undefined ? {} : { homeDir: options.credentialsHome }),
      ...(options.credentialsFile === undefined ? {} : { path: options.credentialsFile }) });
    const values: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, ref] of Object.entries(references)) {
      const value = store.resolve(credentialRef(ref));
      if (value === null) return refuse("An MCP credential reference is not configured. Set it through AMC credentials and retry.");
      values[name] = value;
    }
    return server.transport === "streamable-http" ? { ...server, headers: values } : { ...server, env: values };
  } catch (error) {
    if (error instanceof NativeMcpConfigError) throw error;
    return refuse("Could not resolve the MCP credential references. Inspect credential metadata separately; values and file content are withheld.");
  } finally { await store?.close(); }
}
