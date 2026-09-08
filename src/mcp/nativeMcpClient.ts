import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolListChangedNotificationSchema, CallToolResultSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { AgentToolset } from "../agent/agentToolset.js";
import type { ActionClass } from "../types.js";
import { isActionClass } from "../governor/actionCatalog.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { NativeMcpHttpTransport, type NativeMcpHttpServer } from "./nativeMcpHttpTransport.js";

export interface NativeMcpStdioServer {
  readonly transport?: "stdio";
  readonly id: string;
  readonly command: string;
  readonly args?: readonly string[];
  /** Explicit values for the child only. Never serialized into catalog or error output. */
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}
export type NativeMcpServer = NativeMcpStdioServer | NativeMcpHttpServer;

export interface NativeMcpCatalogTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown> | null;
  readonly annotations: Record<string, unknown> | null;
  readonly execution: Record<string, unknown> | null;
}

export interface NativeMcpCatalog {
  readonly serverId: string;
  readonly digest: string;
  readonly tools: readonly NativeMcpCatalogTool[];
}

export interface NativeMcpGrant {
  readonly name: string;
  /** Operator classification, not a server-provided assertion of safety. */
  readonly actionClass: ActionClass;
}

export function nativeMcpToolName(serverId: string, remoteName: string): string {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(serverId) || !remoteName) throw new Error("Invalid MCP tool identity");
  return `mcp_${serverId}_${createHash("sha256").update(remoteName).digest("hex").slice(0,16)}`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

function scrubString(value: string, secrets: readonly string[]): string {
  for (const secret of secrets) value = value.split(secret).join("[REDACTED]");
  return value;
}
function scrubResult(value: unknown, secrets: readonly string[], depth = 0): unknown {
  if (depth > 64) throw new Error("MCP result nesting limit exceeded");
  if (typeof value === "string") return scrubString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => scrubResult(item, secrets, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [scrubString(key, secrets), scrubResult(item, secrets, depth + 1)]));
  return value;
}

function serverSecrets(server: NativeMcpServer, transport?: Transport): string[] {
  const values = Object.values(server.transport === "streamable-http" ? server.headers ?? {} : server.env ?? {}).filter(Boolean);
  if (server.transport === "streamable-http") {
    for (const [name, value] of Object.entries(server.headers ?? {})) {
      if (name.toLowerCase() === "authorization" && /^Bearer\s+/i.test(value)) values.push(value.replace(/^Bearer\s+/i, ""));
    }
    if (transport?.sessionId) values.push(transport.sessionId);
  }
  return values;
}

function transportFailure(transport: Transport, fallback: string): string {
  return transport instanceof NativeMcpHttpTransport ? transport.failureMessage ?? fallback : fallback;
}

function parameters(server: NativeMcpServer, workspace: string): { transport: Transport; client: Client; timeout: number } {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(server.id)) throw new Error("MCP server id must be 1–32 letters, digits, underscores or hyphens");
  const timeout = server.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new Error("MCP timeout must be between 1 and 300000 milliseconds");
  let transport: Transport;
  if (server.transport === "streamable-http") transport = new NativeMcpHttpTransport(server, timeout);
  else {
    if (!server.command || server.command.includes("\0")) throw new Error("MCP server requires an explicit executable");
    const stdio = new StdioClientTransport({ command: server.command, args: [...(server.args ?? [])],
      cwd: resolve(workspace), env: { ...getDefaultEnvironment(), ...server.env }, stderr: "pipe", maxBufferSize: 4 * 1024 * 1024 });
    stdio.stderr?.on("data", () => {}); transport = stdio;
  }
  const client = new Client({ name: "amc-governed-native-tools", version: "1.0.0" }, { capabilities: {} });
  return { transport, client, timeout };
}

async function catalog(client: Client, server: NativeMcpServer, timeout: number, signal?: AbortSignal, transport?: Transport): Promise<NativeMcpCatalog> {
  const tools: NativeMcpCatalogTool[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : {}, { timeout, signal });
    for (const tool of page.tools) {
      if (tools.length >= 256 || tools.some((item) => item.name === tool.name)) throw new Error("MCP catalog is oversized or repeats a tool name");
      tools.push({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema ?? null, annotations: tool.annotations ?? null,
        execution: tool.execution ?? null });
    }
    cursor = page.nextCursor;
    if (cursor) { if (cursors.has(cursor)) throw new Error("MCP catalog pagination repeated a cursor"); cursors.add(cursor); }
    if (cursors.size > 32) throw new Error("MCP catalog has too many pages");
  } while (cursor);
  tools.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const bytes = canonical(tools);
  if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error("MCP catalog exceeds the accepted size");
  // A server can echo its environment into a description or schema. Reject the
  // whole catalog before publishing it; redacting would change what was reviewed.
  for (const secret of serverSecrets(server, transport)) {
    if (secret && bytes.includes(JSON.stringify(secret).slice(1,-1))) throw new Error("MCP catalog contains credential material");
  }
  return { serverId: server.id, tools, digest: createHash("sha256").update(bytes).digest("hex") };
}

/** Connects only to the explicit server to inspect its catalog, then disposes the transport. */
export async function discoverNativeMcpCatalog(server: NativeMcpServer, workspace: string, signal?: AbortSignal): Promise<NativeMcpCatalog> {
  if (signal?.aborted) throw new Error("MCP discovery cancelled before launch");
  const { transport, client, timeout } = parameters(server, workspace);
  const abort = () => { void client.close().finally(() => transport.close()).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.connect(transport, { timeout, signal });
    return await catalog(client, server, timeout, signal, transport);
  } catch { throw new Error(transportFailure(transport, "MCP catalog discovery failed; no tool grant was created")); }
  finally { signal?.removeEventListener("abort", abort); try { await client.close(); } finally { await transport.close(); } }
}

export interface MountedNativeMcpServer {
  readonly catalog: NativeMcpCatalog;
  readonly toolNames: readonly string[];
  close(): Promise<void>;
}

/**
 * Adds pinned tools to an existing governed toolset. Registry guards, approvals,
 * budgets and signed call recording remain on the toolset's execution path.
 * No automatic allowlist edits, reconnect or tenant-global cache.
 */
export async function mountNativeMcpServer(options: {
  readonly server: NativeMcpServer;
  readonly workspace: string;
  readonly agentId: string;
  readonly toolset: AgentToolset;
  readonly expectedCatalogDigest: string;
  readonly grants: readonly NativeMcpGrant[];
  readonly signal?: AbortSignal;
}): Promise<MountedNativeMcpServer> {
  if (options.signal?.aborted) throw new Error("MCP mount cancelled before launch");
  if (!/^[a-f0-9]{64}$/.test(options.expectedCatalogDigest)) throw new Error("Pin the reviewed MCP catalog digest before mounting tools");
  if (!options.grants.length || options.grants.length > 256) throw new Error("Choose an explicit bounded MCP tool grant");
  if (new Set(options.grants.map((grant) => grant.name)).size !== options.grants.length
    || options.grants.some((grant) => !isActionClass(grant.actionClass))) throw new Error("MCP tool grants are invalid");
  const { server, toolset, agentId } = options;
  const workspace = resolve(options.workspace);
  const { transport, client, timeout } = parameters(server, workspace);
  const dispose: (() => void)[] = [];
  let active = true;
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closed) return closed;
    active = false;
    options.signal?.removeEventListener("abort", abortMount);
    for (const remove of dispose.splice(0).reverse()) remove();
    closed = (async () => { try { await client.close(); } finally { await transport.close(); } })();
    return closed;
  };
  const abortMount = () => { void close().catch(() => {}); };
  options.signal?.addEventListener("abort", abortMount, { once: true });
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { void close().catch(() => {}); });
  client.onclose = () => { active = false; for (const remove of dispose.splice(0).reverse()) remove(); };
  client.onerror = () => { void close().catch(() => {}); };
  try {
    await client.connect(transport, { timeout, signal: options.signal });
    const initial = await catalog(client, server, timeout, options.signal, transport);
    if (!active || initial.digest !== options.expectedCatalogDigest) throw new Error("MCP catalog differs from the reviewed digest");
    const secrets = serverSecrets(server, transport);
    const names: string[] = [];
    for (const grant of options.grants) {
      const remote = initial.tools.find((tool) => tool.name === grant.name);
      if (!remote) throw new Error("MCP grant names a tool absent from the pinned catalog");
      // This mount runs synchronous calls. Preserve task admission explicitly;
      // the SDK's page-local metadata cache cannot establish this capability.
      if (remote.execution?.taskSupport === "required") throw new Error("MCP tool requires unsupported task-based execution");
      // Stable short names satisfy provider function-name constraints without alias collisions.
      const name = nativeMcpToolName(server.id, remote.name);
      // Each reviewed schema has its own namespace. Reusing an Ajv instance
      // lets one tool's $id select a different tool's previously cached schema.
      const validate = new AjvJsonSchemaValidator().getValidator(remote.inputSchema);
      const validateOutput = remote.outputSchema === null ? null : new AjvJsonSchemaValidator().getValidator(remote.outputSchema);
      if (toolset.registry.visible(agentId).has(name)) throw new Error("MCP tool registration would shadow an existing capability");
      names.push(name);
      dispose.push(toolset.registry.define({ name, actionClass: grant.actionClass,
        description: `${remote.name} on ${server.id}: ${remote.description}`,
        parameters: remote.inputSchema,
        body: async (execution) => {
          if (!active || execution.agentId !== agentId || resolve(execution.workspace) !== workspace) throw new Error("MCP mount is unavailable in this execution scope");
          if (execution.effectiveMode !== "EXECUTE") return { output: "MCP call simulated; the remote tool was not invoked.", exitCode: 0 };
          if (!validate(execution.arguments).valid) throw new Error("MCP arguments do not match the reviewed tool schema");
          const signal = execution.signal;
          const abort = () => { void close().catch(() => {}); };
          if (signal?.aborted) throw new Error("MCP call cancelled before dispatch");
          signal?.addEventListener("abort", abort, { once: true });
          try {
            const current = await catalog(client, server, timeout, signal, transport);
            if (!active || current.digest !== initial.digest) { await close(); throw new Error("catalog changed"); }
            // listTools() resets the SDK output-validator cache for EACH page.
            // Accept only AMC's pinned per-tool schema, independently of that
            // mutable cache and before redaction changes returned values.
            const result = await client.request({ method: "tools/call", params: { name: remote.name, arguments: { ...execution.arguments } } }, CallToolResultSchema, { timeout, signal });
            if (validateOutput !== null) {
              if (result.structuredContent === undefined && result.isError !== true) throw new Error("MCP structured output is missing");
              if (result.structuredContent !== undefined && !validateOutput(result.structuredContent).valid) throw new Error("MCP structured output does not match the reviewed schema");
            }
            const output = JSON.stringify(scrubResult(result, secrets));
            return { ok: result.isError !== true, output, bytes: Buffer.byteLength(output), exitCode: result.isError === true ? 1 : 0 };
          } catch (error) {
            await close().catch(() => {});
            return { ok: false, exitCode: 1, timedOut: (transport instanceof NativeMcpHttpTransport && transport.failureTimedOut)
                || (error instanceof McpError && error.code === ErrorCode.RequestTimeout),
              output: signal?.aborted ? "MCP call cancelled; connection and grants disposed"
                : transportFailure(transport, "MCP call failed or catalog changed; review and mount again") };
          } finally { signal?.removeEventListener("abort", abort); }
        }
      }, agentId));
    }
    dispose.push(toolset.registry.guard(`mcp-session-${server.id}`, (execution) => names.includes(execution.name)
      && (!active || execution.agentId !== agentId || resolve(execution.workspace) !== workspace)
      ? "MCP grant is no longer valid in this execution scope" : undefined, agentId));
    return { catalog: initial, toolNames: names, close };
  } catch (error) {
    await close().catch(() => {});
    // Do not expose server diagnostics, command arguments or credential environment on failure.
    throw new Error(transportFailure(transport, "MCP mount refused; review the configured server, catalog digest and tool grants"), { cause: error instanceof Error ? error.name : "unknown" });
  }
}
