import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { credentialRef } from "../credentials/credentialRef.js";
import { LocalCredentialsService } from "../credentials/localCredentialsService.js";
import { isActionClass } from "../governor/actionCatalog.js";
import { loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { nativeMcpToolName, type NativeMcpGrant, type NativeMcpServer } from "../mcp/nativeMcpClient.js";
import type { ActionClass } from "../types.js";

export interface NativeMcpConfiguration {
  readonly schemaVersion: 1;
  readonly server: {
    readonly id: string;
    readonly command: string;
    readonly args?: readonly string[];
    /** Child variable name -> AMC credential reference. Literal env is refused. */
    readonly envRefs?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
  };
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
  if (!onlyKeys(server, ["id", "command", "args", "envRefs", "timeoutMs"]) ||
      typeof server.id !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(server.id) ||
      typeof server.command !== "string" || !server.command.trim() || /[\x00-\x1f\x7f]/.test(server.command)) {
    return refuse("MCP server requires an id and executable. Use envRefs for credential references; literal env and unsupported server fields are refused.");
  }
  if (server.args !== undefined && (!Array.isArray(server.args) || server.args.length > 256 || server.args.some(arg => typeof arg !== "string" || arg.includes("\0")))) {
    return refuse("MCP server args must be a bounded array of strings without NUL bytes.");
  }
  if (server.timeoutMs !== undefined && (typeof server.timeoutMs !== "number" || !Number.isSafeInteger(server.timeoutMs) || server.timeoutMs < 1 || server.timeoutMs > 300_000)) {
    return refuse("MCP server timeoutMs must be an integer from 1 through 300000.");
  }
  if (server.envRefs !== undefined) {
    if (!object(server.envRefs) || Object.keys(server.envRefs).length > 64) return refuse("MCP envRefs must be a bounded map of environment names to credential references.");
    for (const [name, ref] of Object.entries(server.envRefs)) {
      try {
        credentialRef(name);
        if (typeof ref !== "string") throw new Error("Invalid reference");
        credentialRef(ref);
      } catch { return refuse("MCP envRefs contains an invalid environment name or credential reference. Values are withheld."); }
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
  const { envRefs, ...server } = config.server;
  if (envRefs === undefined || Object.keys(envRefs).length === 0) return server;
  let store: LocalCredentialsService | undefined;
  try {
    store = new LocalCredentialsService({ watch: false, projectDir: options.workspace,
      ...(options.credentialsHome === undefined ? {} : { homeDir: options.credentialsHome }),
      ...(options.credentialsFile === undefined ? {} : { path: options.credentialsFile }) });
    const env: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, ref] of Object.entries(envRefs)) {
      const value = store.resolve(credentialRef(ref));
      if (value === null) return refuse("An MCP environment credential reference is not configured. Set it through AMC credentials and retry.");
      env[name] = value;
    }
    return { ...server, env };
  } catch (error) {
    if (error instanceof NativeMcpConfigError) throw error;
    return refuse("Could not resolve the MCP environment references. Inspect credential metadata separately; values and file content are withheld.");
  } finally { await store?.close(); }
}
