import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { NativeMcpConfigError, type NativeMcpConfiguration } from "../setup/nativeMcpConfig.js";
import { writeFileAtomic } from "../utils/fs.js";
import {
  listScopedMcpConfigs, MCP_SCOPES, McpScopeError, removeScopedMcpConfig, resolveScopedMcpSelection, scopedMcpDirs, writeScopedMcpConfig, type McpScope
} from "./mcpScopes.js";

/**
 * `amc mcp add | remove | list | get | sign` (SH-EXT-02). `add` writes an UNREVIEWED file: mounting still needs the
 * catalog reviewed (`amc agent-loop mcp-catalog --mcp-config <path>`), `expectedCatalogDigest` and `grants` written
 * into the file, the generated tool names in the signed allowlist, and for the project scope `amc mcp sign`.
 */

const collect = (value: string, previous: string[] = []) => [...previous, value];
function fail(error: unknown, json: boolean): void {
  const code = error instanceof McpScopeError ? error.code : error instanceof NativeMcpConfigError ? error.code : "mcp-scope-failed";
  const message = error instanceof Error ? error.message : "The MCP scope operation failed.";
  if (json) console.log(JSON.stringify({ ok: false, code, message }, null, 2)); else console.error(message);
  process.exitCode = 1;
}
function scopeOf(value: string | undefined): McpScope {
  if (value === undefined || !MCP_SCOPES.includes(value as McpScope)) throw new McpScopeError("--scope must be user or project.");
  return value as McpScope;
}
const dirsFor = (opts: { credentialsHome?: string }) => scopedMcpDirs(process.cwd(), opts.credentialsHome);

export function registerMcpScopeCommands(mcp: Command): void {
  mcp.command("add <id> [command...]")
    .description("Write an unreviewed MCP server config to the user or project scope; review and sign it before mounting")
    .requiredOption("--scope <scope>", "user (<AMC home>/mcp) or project (.amc/mcp)")
    .option("--transport <kind>", "stdio (default; give the command after --) or streamable-http (give --url and --origin)")
    .option("--url <url>", "streamable-http endpoint").option("--origin <origin>", "streamable-http origin the endpoint must stay on")
    .option("--env-ref <NAME=credentialRef>", "stdio: child variable resolved from an AMC credential reference; repeatable", collect)
    .option("--header-ref <Name=credentialRef>", "streamable-http: header resolved from an AMC credential reference; repeatable", collect)
    .option("--timeout-ms <n>", "per-request timeout")
    .option("--credentials-home <dir>", "AMC home for the user scope").option("--force", "replace an existing file or create a cross-scope collision")
    .option("--json", "machine-readable output")
    .action((id: string, command: string[], opts: { scope?: string; transport?: string; url?: string; origin?: string; envRef?: string[]; headerRef?: string[];
      timeoutMs?: string; credentialsHome?: string; force?: boolean; json?: boolean }) => {
      try {
        const refs = (pairs: string[] | undefined) => pairs === undefined ? {} : Object.fromEntries(pairs.map(pair => {
          const at = pair.indexOf("="); if (at <= 0) throw new McpScopeError(`${pair}: expected NAME=credentialRef.`); return [pair.slice(0, at), pair.slice(at + 1)];
        }));
        const timeout = opts.timeoutMs === undefined ? {} : { timeoutMs: Number(opts.timeoutMs) };
        let server: NativeMcpConfiguration["server"];
        if (opts.transport === "streamable-http") {
          if (opts.url === undefined || opts.origin === undefined) throw new McpScopeError("streamable-http needs --url and --origin.");
          if (command.length > 0 || opts.envRef !== undefined) throw new McpScopeError("streamable-http takes no command or --env-ref.");
          server = { transport: "streamable-http", id, url: opts.url, origin: opts.origin, ...(opts.headerRef === undefined ? {} : { headerRefs: refs(opts.headerRef) }), ...timeout };
        } else {
          if (opts.transport !== undefined && opts.transport !== "stdio") throw new McpScopeError("--transport must be stdio or streamable-http (legacy SSE is not supported).");
          if (command.length === 0) throw new McpScopeError("stdio needs the server command after --, for example: amc mcp add fixture --scope project -- node server.mjs");
          if (opts.url !== undefined || opts.origin !== undefined || opts.headerRef !== undefined) throw new McpScopeError("stdio takes no --url, --origin or --header-ref.");
          server = { id, command: command[0]!, ...(command.length > 1 ? { args: command.slice(1) } : {}), ...(opts.envRef === undefined ? {} : { envRefs: refs(opts.envRef) }), ...timeout };
        }
        const written = writeScopedMcpConfig(dirsFor(opts), scopeOf(opts.scope), { schemaVersion: 1, server }, opts.force === true);
        const next = [`Review the catalog: amc agent-loop mcp-catalog --mcp-config ${written.path}`, "Add expectedCatalogDigest and grants to the file, and the generated tool names to the signed allowlist.",
          ...(opts.scope === "project" ? [`Sign it: amc mcp sign ${id} --scope project`] : []), `Mount it: amc agent-loop run --mcp ${id} --tools workspace --approve-tools READ_ONLY ...`];
        if (opts.json) console.log(JSON.stringify({ ok: true, id, scope: opts.scope, ...written, reviewed: false, next }, null, 2));
        else console.log([`Wrote ${written.path} (sha256 ${written.sha256}); not yet reviewed.`, ...next.map(line => `- ${line}`)].join("\n"));
      } catch (error) { fail(error, opts.json === true); }
    });
  mcp.command("remove <id>")
    .description("Delete a scoped MCP server config and its signature")
    .requiredOption("--scope <scope>", "user or project").option("--credentials-home <dir>", "AMC home for the user scope").option("--json", "machine-readable output")
    .action((id: string, opts: { scope?: string; credentialsHome?: string; json?: boolean }) => {
      try {
        const path = removeScopedMcpConfig(dirsFor(opts), scopeOf(opts.scope), id);
        if (opts.json) console.log(JSON.stringify({ ok: true, id, scope: opts.scope, path }, null, 2)); else console.log(`Removed ${path}.`);
      } catch (error) { fail(error, opts.json === true); }
    });
  mcp.command("list")
    .description("List scoped MCP server configs: scope, path, digest, transport, review and signature state; never secrets")
    .option("--credentials-home <dir>", "AMC home for the user scope").option("--json", "machine-readable output")
    .action((opts: { credentialsHome?: string; json?: boolean }) => {
      try {
        const dirs = dirsFor(opts);
        const listed = listScopedMcpConfigs(process.cwd(), dirs);
        const servers = listed.entries.map(entry => ({ id: entry.id, scope: entry.scope, path: entry.path, sha256: entry.sha256, transport: entry.transport, reviewed: entry.reviewed,
          signatureValid: entry.signatureValid, auth: entry.transport === "streamable-http" && "auth" in entry.config.server && entry.config.server.auth !== undefined
            ? { kind: entry.config.server.auth.kind, scopes: entry.config.server.auth.scopes ?? [] } : null,
          mountable: entry.reviewed && (entry.scope === "user" || entry.signatureValid === true) }));
        const ambiguous = [...new Set(servers.map(server => server.id))].filter(id => servers.filter(server => server.id === id).length > 1);
        if (opts.json) { console.log(JSON.stringify({ ok: listed.problems.length === 0, dirs, servers, ambiguous, problems: listed.problems }, null, 2)); }
        else {
          console.log(`user scope: ${dirs.user}\nproject scope: ${dirs.project}`);
          for (const server of servers) console.log(`${server.scope}:${server.id} ${server.transport} ${server.reviewed ? "reviewed" : "unreviewed"}${server.scope === "project" ? (server.signatureValid ? " signed" : " unsigned") : ""} ${server.path} sha256=${server.sha256}`);
          for (const id of ambiguous) console.log(`${id} exists in both scopes: --mcp must say project:${id} or user:${id}`);
          for (const problem of listed.problems) console.error(`${problem.scope}: ${problem.path}: ${problem.reason}`);
          if (servers.length === 0) console.log("No scoped MCP servers.");
        }
        if (listed.problems.length > 0) process.exitCode = 1;
      } catch (error) { fail(error, opts.json === true); }
    });
  mcp.command("get <selection>")
    .description("Show one scoped config (id, project:id or user:id) as --mcp would admit it")
    .option("--credentials-home <dir>", "AMC home for the user scope").option("--json", "machine-readable output")
    .action((selection: string, opts: { credentialsHome?: string; json?: boolean }) => {
      try {
        const [entry] = resolveScopedMcpSelection(process.cwd(), [selection], dirsFor(opts)).entries;
        if (opts.json) console.log(JSON.stringify({ ok: true, ...entry }, null, 2));
        else console.log(`${entry!.scope}:${entry!.id} ${entry!.path} sha256=${entry!.sha256} ${entry!.reviewed ? "reviewed" : "unreviewed"}\n${JSON.stringify(entry!.config, null, 2)}`);
      } catch (error) { fail(error, opts.json === true); }
    });
  mcp.command("sign <id>")
    .description("Sign a project-scope config's exact bytes with the workspace BUNDLE signing policy (writes <file>.sig)")
    .requiredOption("--scope <scope>", "project (the user scope needs no signature)").option("--json", "machine-readable output")
    .action(async (id: string, opts: { scope?: string; json?: boolean }) => {
      try {
        if (scopeOf(opts.scope) !== "project") throw new McpScopeError("Only the project scope is signed; a user-scope file is admitted as your private file.");
        const path = `${dirsFor({}).project}/${id}.json`;
        const bytes = readFileSync(path);
        const prepared = await prepareFileSignatureWithAuditor(process.cwd(), path, bytes, "BUNDLE");
        prepared.assertCurrent();
        writeFileAtomic(`${path}.sig`, prepared.signatureBytes, 0o600);
        const [entry] = resolveScopedMcpSelection(process.cwd(), [`project:${id}`], dirsFor({})).entries;
        if (opts.json) console.log(JSON.stringify({ ok: true, id, path, sha256: prepared.digestSha256, signaturePath: `${path}.sig`, reviewed: entry!.reviewed }, null, 2));
        else console.log(`Signed ${path} (sha256 ${prepared.digestSha256}) into ${path}.sig${entry!.reviewed ? "" : "; the file is still unreviewed (no expectedCatalogDigest or grants)"}.`);
      } catch (error) { fail(error, opts.json === true); }
    });
}
