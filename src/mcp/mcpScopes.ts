import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { resolveAmcHome } from "../credentials/credentialsPaths.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { loadNativeMcpConfiguration, NativeMcpConfigError, type LoadedNativeMcpConfiguration, type NativeMcpConfiguration } from "../setup/nativeMcpConfig.js";
import { sha256Hex } from "../utils/hash.js";
import { writeFileAtomic } from "../utils/fs.js";

/**
 * MCP config scopes (SH-EXT-02): one reviewed `NativeMcpConfiguration` file per server, in the user scope
 * (`<AMC home>/mcp/<id>.json`, the same home the OAuth token store and `AMC_HOME` use) or the project scope
 * (`<workspace>/.amc/mcp/<id>.json`). `--mcp <id>` resolves an id to the file and its sha256 pin and hands both to
 * the unchanged `--mcp-config` review, so a scoped mount needs exactly what an explicit one needs: a reviewed
 * catalog digest, grants, and the signed tool allowlist.
 *
 * NO MERGE, NO SILENT SHADOWING. Claude Code lets a project `.mcp.json` shadow the user's server of the same id; a
 * cloned repository could then substitute a server whose generated tool names still match the operator's signed
 * grants. Here an id present in both scopes is refused until the operator writes `project:<id>` or `user:<id>`. A
 * project file must carry a valid `<file>.sig` BUNDLE signature; a user file must be the operator's own private
 * file. `${VAR}` expansion is not offered: AMC's `envRefs`/`headerRefs` credential references already keep values
 * out of the file.
 */

export type McpScope = "user" | "project";
export const MCP_SCOPES: readonly McpScope[] = Object.freeze(["user", "project"]);
export const MCP_SCOPED_ID = /^[a-zA-Z0-9_-]{1,32}$/;

export interface McpScopeDirs { readonly user: string; readonly project: string }
export function scopedMcpDirs(workspace: string, credentialsHome?: string): McpScopeDirs {
  return { user: join(resolveAmcHome(credentialsHome === undefined ? {} : { homeDir: credentialsHome }), "mcp"), project: join(resolve(workspace), ".amc", "mcp") };
}

export class McpScopeError extends Error {
  constructor(message: string, readonly code = "mcp-scope-invalid") { super(message); this.name = "McpScopeError"; }
}
const refuse = (message: string, code?: string): never => { throw new McpScopeError(message, code); };

export interface ScopedMcpConfig {
  readonly id: string;
  readonly scope: McpScope;
  readonly path: string;
  readonly sha256: string;
  readonly transport: "stdio" | "streamable-http";
  /** Catalog digest and grants present: the file can be mounted once the allowlist names its tools. */
  readonly reviewed: boolean;
  /** Project scope: whether `<file>.sig` verifies. User scope: null. */
  readonly signatureValid: boolean | null;
  readonly config: NativeMcpConfiguration;
}
export interface ScopedMcpProblem { readonly scope: McpScope; readonly path: string; readonly reason: string }

/** Owner-only regular file in a directory nobody else can write; the check is on the opened descriptor. */
export function assertPrivateFile(path: string, uid: number | undefined = typeof process.getuid === "function" ? process.getuid() : undefined): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) refuse(`${path} is not a regular file`);
    if (uid === undefined) return; // Windows: no POSIX owner or mode bits to check
    if (stat.uid !== uid) refuse(`${path} is not owned by the current user`);
    if ((stat.mode & 0o022) !== 0) refuse(`${path} is group- or world-writable`);
    const parent = lstatSync(dirname(path));
    if (parent.uid !== uid || (parent.mode & 0o022) !== 0) refuse(`${dirname(path)} is not a private directory owned by the current user`);
  } finally { closeSync(fd); }
}

function projectSignatureValid(workspace: string, loaded: LoadedNativeMcpConfiguration): boolean {
  const sidecar = `${loaded.path}.sig`;
  if (!existsSync(sidecar)) return false;
  try { return verifyAuditorSignatureBytes(workspace, "BUNDLE", readFileSync(loaded.path), readFileSync(sidecar)).valid; }
  catch { return false; }
}

function describe(workspace: string, scope: McpScope, path: string, uid?: number): ScopedMcpConfig {
  if (scope === "user") assertPrivateFile(path, uid);
  const loaded = loadNativeMcpConfiguration(path);
  const id = basename(path, ".json");
  if (loaded.config.server.id !== id) refuse(`${path} declares server id ${JSON.stringify(loaded.config.server.id)}; a scoped file must be named exactly <id>.json`);
  return { id, scope, path, sha256: loaded.sha256, transport: loaded.config.server.transport ?? "stdio",
    reviewed: typeof loaded.config.expectedCatalogDigest === "string" && (loaded.config.grants?.length ?? 0) > 0,
    signatureValid: scope === "project" ? projectSignatureValid(workspace, loaded) : null, config: loaded.config };
}

/** Every `<id>.json` in both scopes; a file that cannot be admitted is a problem, never a silent omission. */
export function listScopedMcpConfigs(workspace: string, dirs: McpScopeDirs, uid?: number): { readonly entries: readonly ScopedMcpConfig[]; readonly problems: readonly ScopedMcpProblem[] } {
  const entries: ScopedMcpConfig[] = [], problems: ScopedMcpProblem[] = [];
  for (const scope of MCP_SCOPES) {
    let names: string[];
    try { names = readdirSync(dirs[scope]).filter(name => name.endsWith(".json")).sort(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; problems.push({ scope, path: dirs[scope], reason: "scope directory could not be listed" }); continue; }
    for (const name of names) {
      const path = join(dirs[scope], name);
      if (!MCP_SCOPED_ID.test(basename(name, ".json"))) { problems.push({ scope, path, reason: "file name is not a valid server id" }); continue; }
      try { entries.push(describe(workspace, scope, path, uid)); }
      catch (error) { problems.push({ scope, path, reason: error instanceof McpScopeError || error instanceof NativeMcpConfigError ? error.message : "config could not be read" }); }
    }
  }
  return { entries, problems };
}

/** `id`, `project:id` or `user:id`. */
function parseSelection(item: string): { readonly id: string; readonly scope: McpScope | null } {
  const at = item.indexOf(":");
  const scope = at === -1 ? null : item.slice(0, at), id = at === -1 ? item : item.slice(at + 1);
  if (scope !== null && !MCP_SCOPES.includes(scope as McpScope)) return refuse(`--mcp ${JSON.stringify(item)}: the scope must be project or user.`);
  if (!MCP_SCOPED_ID.test(id)) return refuse(`--mcp ${JSON.stringify(item)}: a server id is 1 to 32 letters, digits, _ or -.`);
  return { id, scope: scope as McpScope | null };
}

/** Resolve `--mcp` ids to admitted files and their exact-bytes pins. */
export function resolveScopedMcpSelection(workspace: string, selection: readonly string[], dirs: McpScopeDirs, uid?: number): { readonly paths: string[]; readonly pins: string[]; readonly entries: ScopedMcpConfig[] } {
  const paths: string[] = [], pins: string[] = [], entries: ScopedMcpConfig[] = [];
  for (const item of selection) {
    const { id, scope } = parseSelection(item);
    const present = MCP_SCOPES.filter(candidate => existsSync(join(dirs[candidate], `${id}.json`)));
    if (present.length === 0) return refuse(`--mcp ${id}: no ${dirs.project}/${id}.json or ${dirs.user}/${id}.json; add one with amc mcp add.`, "mcp-scope-missing");
    if (scope === null && present.length > 1) return refuse(`--mcp ${id} exists in both scopes (${dirs.project}/${id}.json and ${dirs.user}/${id}.json); select project:${id} or user:${id} explicitly.`, "mcp-scope-ambiguous");
    const chosen = scope ?? present[0]!;
    if (!present.includes(chosen)) return refuse(`--mcp ${item}: no ${dirs[chosen]}/${id}.json.`, "mcp-scope-missing");
    const entry = describe(workspace, chosen, join(dirs[chosen], `${id}.json`), uid);
    if (entry.scope === "project" && entry.signatureValid !== true) return refuse(`${entry.path} needs a valid BUNDLE signature in ${entry.path}.sig; review it, then run amc mcp sign ${id} --scope project.`, "mcp-scope-unsigned");
    paths.push(entry.path); pins.push(entry.sha256); entries.push(entry);
  }
  return { paths, pins, entries };
}

/**
 * Glue for run, chat and ACP: append the resolved scoped files to the explicit `--mcp-config` list, pinning every
 * explicit path to its current bytes so the two lists stay paired.
 */
export function mergeScopedMcpSelection<T extends { readonly mcp?: readonly string[]; readonly mcpConfig?: string | readonly string[];
  readonly mcpConfigSha256?: string | readonly string[]; readonly credentialsHome?: string }>(options: T, workspace: string): T {
  if (options.mcp === undefined || options.mcp.length === 0) return options;
  const explicit = options.mcpConfig === undefined ? [] : typeof options.mcpConfig === "string" ? [options.mcpConfig] : [...options.mcpConfig];
  const explicitPins = options.mcpConfigSha256 === undefined ? explicit.map(path => loadNativeMcpConfiguration(path).sha256)
    : typeof options.mcpConfigSha256 === "string" ? [options.mcpConfigSha256] : [...options.mcpConfigSha256];
  const resolved = resolveScopedMcpSelection(workspace, options.mcp, scopedMcpDirs(workspace, options.credentialsHome));
  return { ...options, mcpConfig: [...explicit, ...resolved.paths], mcpConfigSha256: [...explicitPins, ...resolved.pins] };
}

/** `amc mcp add`: write a new unreviewed file; never overwrite, never shadow the other scope, without `--force`. */
export function writeScopedMcpConfig(dirs: McpScopeDirs, scope: McpScope, config: NativeMcpConfiguration, force = false): { readonly path: string; readonly sha256: string } {
  const id = config.server.id;
  if (!MCP_SCOPED_ID.test(id)) return refuse("A server id is 1 to 32 letters, digits, _ or -.");
  const path = join(dirs[scope], `${id}.json`), other = scope === "project" ? "user" : "project";
  if (!force && existsSync(path)) return refuse(`${path} exists; pass --force to replace it (its signature, if any, no longer applies).`);
  if (!force && existsSync(join(dirs[other], `${id}.json`))) return refuse(`${id} already exists in the ${other} scope (${join(dirs[other], `${id}.json`)}); use another id, or --force to create a collision that --mcp must then qualify.`);
  const bytes = `${JSON.stringify(config, null, 2)}\n`;
  writeFileAtomic(path, bytes, 0o600);
  if (existsSync(`${path}.sig`)) unlinkSync(`${path}.sig`);
  loadNativeMcpConfiguration(path); // the written file must admit exactly as an explicit --mcp-config would
  return { path, sha256: sha256Hex(Buffer.from(bytes)) };
}

export function removeScopedMcpConfig(dirs: McpScopeDirs, scope: McpScope, id: string): string {
  if (!MCP_SCOPED_ID.test(id)) return refuse("A server id is 1 to 32 letters, digits, _ or -.");
  const path = join(dirs[scope], `${id}.json`);
  if (!existsSync(path)) return refuse(`${path} does not exist.`, "mcp-scope-missing");
  unlinkSync(path);
  if (existsSync(`${path}.sig`)) unlinkSync(`${path}.sig`);
  return path;
}
