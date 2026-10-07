import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ToolListChangedNotificationSchema, CallToolResultSchema, InitializeResultSchema, ListToolsResultSchema, ResultSchema,
  LATEST_PROTOCOL_VERSION, McpError, ErrorCode, type ClientRequest
} from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { AgentToolset } from "../agent/agentToolset.js";
import type { ActionClass } from "../types.js";
import { isActionClass } from "../governor/actionCatalog.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { NativeMcpHttpTransport, NativeMcpHttpRefused, type NativeMcpHttpServer } from "./nativeMcpHttpTransport.js";
import { NATIVE_MCP_RECONNECT_LIMITS } from "./nativeMcpReconnect.js";
import {
  MCP_CLIENT_INFO, MCP_LEGACY_PROTOCOL_VERSIONS, MCP_STATELESS_PROTOCOL_VERSION, NativeMcpProtocolRefused,
  classifyNativeMcpDiscover, nativeMcpResultType, nativeMcpServerInfo, statelessRequestMeta, type NativeMcpProtocolReceipt
} from "./protocol/version.js";
import { mcpParamHeaderBindings } from "./protocol/headers.js";
import type { NativeMcpOAuthReceipt } from "./oauth/authorize.js";

export interface NativeMcpStdioServer {
  readonly transport?: "stdio";
  readonly id: string;
  readonly command: string;
  readonly args?: readonly string[];
  /** Explicit values for the child only. Never serialized into catalog or error output. */
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Exact protocol version; absent means probe server/discover, then fall back to initialize. */
  readonly protocolVersion?: string;
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
  /** SHA-256 of the negotiated protocol version and the tools; a version change needs fresh review. */
  readonly digest: string;
  readonly protocol: NativeMcpProtocolReceipt;
  readonly tools: readonly NativeMcpCatalogTool[];
  /** Tools a 2026-07-28 HTTP client must exclude (invalid x-mcp-header annotations). */
  readonly excludedTools?: readonly { readonly name: string; readonly reason: string }[];
}

/** What a mount records: the protocol and authorization facts, never a credential. */
export interface NativeMcpMountReceipt {
  readonly serverId: string;
  readonly catalogDigest: string;
  readonly protocol: NativeMcpProtocolReceipt;
  readonly auth: NativeMcpOAuthReceipt | null;
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

function scrubString(value: string, secrets: readonly string[], transport?: Transport): string {
  if (transport instanceof NativeMcpHttpTransport) value = transport.redactString(value);
  for (const secret of secrets) value = value.split(secret).join("[REDACTED]");
  return value;
}
function scrubResult(value: unknown, secrets: readonly string[], depth = 0, transport?: Transport): unknown {
  if (depth > 64) throw new Error("MCP result nesting limit exceeded");
  if (typeof value === "string") return scrubString(value, secrets, transport);
  if (Array.isArray(value)) return value.map((item) => scrubResult(item, secrets, depth + 1, transport));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [scrubString(key, secrets, transport), scrubResult(item, secrets, depth + 1, transport)]));
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

/** Keeps a classified HTTP failure (and its step-up scopes) or a fixed protocol refusal; hides everything else. */
function connectionFailure(transport: Transport, error: unknown, fallback: string): Error {
  if (transport instanceof NativeMcpHttpTransport && transport.failureMessage) {
    return new NativeMcpHttpRefused(transport.failureMessage, transport.failureCode, transport.requiredScopes);
  }
  return error instanceof NativeMcpProtocolRefused ? error : new Error(fallback, { cause: error instanceof Error ? error.name : "unknown" });
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
  const client = new Client({ ...MCP_CLIENT_INFO }, { capabilities: {} });
  return { transport, client, timeout };
}

const PROBE_TIMEOUT_MS = 5_000;
/** The SDK types only the initialize-era methods; 2026-07-28 adds server/discover. */
const rpc = (method: string, params: Record<string, unknown>) => ({ method, params }) as unknown as ClientRequest;
/** basic/index §_meta: every 2026-07-28 request carries the protocol fields. */
function requestParams(protocol: NativeMcpProtocolReceipt, params: Record<string, unknown>): Record<string, unknown> {
  return protocol.mode === "stateless" ? { ...params, _meta: statelessRequestMeta() } : params;
}

/**
 * Negotiates the era (basic/versioning §Backward Compatibility). A pinned
 * version is used exactly; otherwise server/discover is probed first and an
 * initialize-era server is spoken to through the SDK's legacy handshake. The
 * SDK Client always sends initialize from connect(), so AMC attaches the
 * transport with the base Protocol and sends initialize itself when needed.
 */
async function negotiate(client: Client, transport: Transport, server: NativeMcpServer, timeout: number, signal?: AbortSignal): Promise<NativeMcpProtocolReceipt> {
  const pinned = server.protocolVersion;
  const http = transport instanceof NativeMcpHttpTransport ? transport : undefined;
  if (pinned === undefined || pinned === MCP_STATELESS_PROTOCOL_VERSION) {
    http?.beginStatelessProbe();
    await Protocol.prototype.connect.call(client, transport);
    let outcome: ReturnType<typeof classifyNativeMcpDiscover>;
    try {
      const result = await client.request(rpc("server/discover", { _meta: statelessRequestMeta() }), ResultSchema,
        { timeout: http ? timeout : Math.min(timeout, PROBE_TIMEOUT_MS), ...(signal ? { signal } : {}) });
      outcome = classifyNativeMcpDiscover({ result });
    } catch (error) {
      // transports/stdio §Backward Compatibility: no answer in time means legacy. HTTP has no such rule.
      if (signal?.aborted || !(error instanceof McpError) || (http && error.code === ErrorCode.RequestTimeout)) throw error;
      outcome = classifyNativeMcpDiscover({ errorCode: error.code });
    }
    if (outcome.kind === "stateless") {
      http?.useStateless();
      return { negotiatedVersion: MCP_STATELESS_PROTOCOL_VERSION, mode: "stateless", serverInfo: outcome.serverInfo };
    }
    if (outcome.kind === "refused") throw new NativeMcpProtocolRefused(outcome.reason);
    if (pinned !== undefined) throw new NativeMcpProtocolRefused(`MCP server did not accept the pinned protocol version ${pinned}.`);
    http?.useLegacy();
  } else await Protocol.prototype.connect.call(client, transport);
  const init = await client.request({ method: "initialize", params: { protocolVersion: pinned ?? LATEST_PROTOCOL_VERSION,
    capabilities: {}, clientInfo: { ...MCP_CLIENT_INFO } } }, InitializeResultSchema, { timeout, ...(signal ? { signal } : {}) });
  if (!MCP_LEGACY_PROTOCOL_VERSIONS.includes(init.protocolVersion) || (pinned !== undefined && init.protocolVersion !== pinned)) {
    throw new NativeMcpProtocolRefused("MCP server negotiated a protocol version that is unsupported or differs from the pinned one.");
  }
  transport.setProtocolVersion?.(init.protocolVersion);
  await client.notification({ method: "notifications/initialized" });
  return { negotiatedVersion: init.protocolVersion, mode: "legacy", serverInfo: nativeMcpServerInfo(init.serverInfo) };
}

async function readCatalog(client: Client, server: NativeMcpServer, timeout: number, protocol: NativeMcpProtocolReceipt, signal?: AbortSignal, transport?: Transport): Promise<NativeMcpCatalog> {
  const tools: NativeMcpCatalogTool[] = [];
  const excludedTools: { name: string; reason: string }[] = [];
  const headerAware = protocol.mode === "stateless" && transport instanceof NativeMcpHttpTransport;
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.request(rpc("tools/list", requestParams(protocol, cursor ? { cursor } : {})), ListToolsResultSchema, { timeout, ...(signal ? { signal } : {}) });
    if (nativeMcpResultType(page) !== "complete") throw new NativeMcpProtocolRefused("MCP tools/list returned input_required, which the protocol does not allow; it was refused.");
    for (const tool of page.tools) {
      if (tools.length + excludedTools.length >= 256 || tools.some((item) => item.name === tool.name) || excludedTools.some((item) => item.name === tool.name)) {
        throw new Error("MCP catalog is oversized or repeats a tool name");
      }
      // 2026-07-28 streamable-http §Schema Extension: a client MUST exclude a tool with an invalid x-mcp-header.
      const bindings = headerAware ? mcpParamHeaderBindings(tool.inputSchema) : [];
      if (typeof bindings === "string") { excludedTools.push({ name: tool.name, reason: bindings }); continue; }
      tools.push({ name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema ?? null, annotations: tool.annotations ?? null,
        execution: tool.execution ?? null });
    }
    cursor = page.nextCursor;
    if (cursor) { if (cursors.has(cursor)) throw new Error("MCP catalog pagination repeated a cursor"); cursors.add(cursor); }
    if (cursors.size > 32) throw new Error("MCP catalog has too many pages");
  } while (cursor);
  tools.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  // The negotiated version is part of what was reviewed: an era or version change needs fresh review.
  const bytes = canonical({ protocolVersion: protocol.negotiatedVersion, tools });
  if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error("MCP catalog exceeds the accepted size");
  // A server can echo its environment into a description or schema. Reject the
  // whole catalog before publishing it; redacting would change what was reviewed.
  const published = bytes + canonical(protocol.serverInfo) + canonical(excludedTools);
  for (const secret of serverSecrets(server, transport)) {
    if (secret && published.includes(JSON.stringify(secret).slice(1,-1))) throw new Error("MCP catalog contains credential material");
  }
  if (transport instanceof NativeMcpHttpTransport && transport.containsSensitiveMaterial(published)) {
    throw new Error("MCP catalog contains credential material");
  }
  return { serverId: server.id, protocol, tools, ...(excludedTools.length ? { excludedTools } : {}),
    digest: createHash("sha256").update(bytes).digest("hex") };
}

/** A notification gap invalidates an in-progress catalog snapshot, not the pin. */
async function catalog(client: Client, server: NativeMcpServer, timeout: number, protocol: NativeMcpProtocolReceipt, signal?: AbortSignal, transport?: Transport): Promise<NativeMcpCatalog> {
  if (!(transport instanceof NativeMcpHttpTransport)) return readCatalog(client, server, timeout, protocol, signal, transport);
  for (let attempt = 0; attempt <= NATIVE_MCP_RECONNECT_LIMITS.retries; attempt++) {
    await transport.waitForRecovery(signal);
    const generation = transport.recoveryGeneration;
    const current = await readCatalog(client, server, timeout, protocol, signal, transport);
    await transport.waitForRecovery(signal);
    if (generation === transport.recoveryGeneration) return current;
  }
  throw new Error("MCP catalog did not stabilize within the bounded recovery window");
}

/** Connects only to the explicit server to inspect its catalog, then disposes the transport. */
export async function discoverNativeMcpCatalog(server: NativeMcpServer, workspace: string, signal?: AbortSignal): Promise<NativeMcpCatalog> {
  if (signal?.aborted) throw new Error("MCP discovery cancelled before launch");
  const { transport, client, timeout } = parameters(server, workspace);
  const abort = () => { void client.close().finally(() => transport.close()).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const protocol = await negotiate(client, transport, server, timeout, signal);
    return await catalog(client, server, timeout, protocol, signal, transport);
  } catch (error) { throw connectionFailure(transport, error, "MCP catalog discovery failed; no tool grant was created"); }
  finally {
    signal?.removeEventListener("abort", abort);
    // Preserve a classified authentication/session failure even if remote DELETE
    // is also refused. A successful discovery still exposes termination failure.
    try { try { await client.close(); } finally { await transport.close(); } }
    // oxlint-disable-next-line no-unsafe-finally -- Successful discovery must expose termination failure; classified HTTP failures are preserved.
    catch (error) { if (!(transport instanceof NativeMcpHttpTransport) || !transport.failureMessage) throw error; }
  }
}

export interface MountedNativeMcpServer {
  readonly catalog: NativeMcpCatalog;
  readonly toolNames: readonly string[];
  readonly receipt: NativeMcpMountReceipt;
  close(): Promise<void>;
}

/**
 * Adds pinned tools to an existing governed toolset. Registry guards, approvals,
 * budgets and signed call recording remain on the toolset's execution path.
 * No automatic allowlist edits, fresh-session reconnect or tenant-global cache.
 * HTTP recovery stays inside the original session, pin and authorization snapshot.
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
    const protocol = await negotiate(client, transport, server, timeout, options.signal);
    const initial = await catalog(client, server, timeout, protocol, options.signal, transport);
    if (!active || initial.digest !== options.expectedCatalogDigest) throw new Error("MCP catalog differs from the reviewed digest");
    const secrets = serverSecrets(server, transport);
    const names: string[] = [];
    for (const grant of options.grants) {
      const remote = initial.tools.find((tool) => tool.name === grant.name);
      if (!remote) throw new Error("MCP grant names a tool absent from the pinned catalog");
      // This mount runs synchronous calls. Preserve task admission explicitly;
      // the SDK's page-local metadata cache cannot establish this capability.
      if (remote.execution?.taskSupport === "required") throw new Error("MCP tool requires unsupported task-based execution");
      if (protocol.mode === "stateless" && transport instanceof NativeMcpHttpTransport) {
        const bindings = mcpParamHeaderBindings(remote.inputSchema);
        if (typeof bindings === "string") throw new Error("MCP tool has invalid x-mcp-header annotations");
        transport.pinToolHeaders(remote.name, bindings);
      }
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
          if (!validate(execution.arguments).valid) throw new Error("MCP arguments do not match the reviewed tool schema");
          if (execution.effectiveMode !== "EXECUTE") return { output: "MCP call simulated; the remote tool was not invoked.", exitCode: 0 };
          const signal = execution.signal;
          const abort = () => { void close().catch(() => {}); };
          if (signal?.aborted) throw new Error("MCP call cancelled before dispatch");
          signal?.addEventListener("abort", abort, { once: true });
          let callStarted = false;
          let responseReceived = false;
          try {
            const current = await catalog(client, server, timeout, protocol, signal, transport);
            if (!active || current.digest !== initial.digest) { await close(); throw new Error("catalog changed"); }
            if (signal?.aborted) throw new Error("MCP call cancelled before dispatch");
            // listTools() resets the SDK output-validator cache for EACH page.
            // Accept only AMC's pinned per-tool schema, independently of that
            // mutable cache and before redaction changes returned values.
            callStarted = true;
            const result = await client.request(rpc("tools/call", requestParams(protocol, { name: remote.name, arguments: { ...execution.arguments } })), CallToolResultSchema, { timeout, signal });
            responseReceived = true;
            if (!active || signal?.aborted) throw new Error("MCP grant was disposed while receiving the response");
            // basic/patterns/mrtr: AMC declares no sampling, roots or elicitation capability, so it cannot answer.
            if (nativeMcpResultType(result) === "input_required") {
              return { ok: false, exitCode: 1, output: "MCP server asked for more input (input_required). AMC declares no sampling, roots or elicitation capability; the call did not complete and was not retried." };
            }
            if (validateOutput !== null) {
              if (result.structuredContent === undefined && result.isError !== true) throw new Error("MCP structured output is missing");
              if (result.structuredContent !== undefined && !validateOutput(result.structuredContent).valid) throw new Error("MCP structured output does not match the reviewed schema");
            }
            const output = JSON.stringify(scrubResult(result, secrets, 0, transport));
            return { ok: result.isError !== true, output, bytes: Buffer.byteLength(output), exitCode: result.isError === true ? 1 : 0 };
          } catch (error) {
            await close().catch(() => {});
            const notDispatched = error instanceof NativeMcpHttpRefused && (error.code === "NOT_DISPATCHED" || error.code === "CLOSED");
            const uncertainty = responseReceived
              ? "; the remote tool executed and its received result was discarded. It was not replayed. Inspect the remote service before another invocation."
              : callStarted && !notDispatched
                ? "; the remote tool may have executed. It was not replayed. Inspect the remote service before another invocation."
                : "";
            return { ok: false, exitCode: 1, timedOut: (transport instanceof NativeMcpHttpTransport && transport.failureTimedOut)
                || (error instanceof McpError && error.code === ErrorCode.RequestTimeout),
              output: (signal?.aborted ? "MCP call cancelled; connection and grants disposed"
                : notDispatched ? error.message : transportFailure(transport, "MCP call failed or catalog changed; review and mount again")) + uncertainty };
          } finally { signal?.removeEventListener("abort", abort); }
        }
      }, agentId));
    }
    dispose.push(toolset.registry.guard(`mcp-session-${server.id}`, (execution) => names.includes(execution.name)
      && (!active || execution.agentId !== agentId || resolve(execution.workspace) !== workspace)
      ? "MCP grant is no longer valid in this execution scope" : undefined, agentId));
    const receipt: NativeMcpMountReceipt = { serverId: server.id, catalogDigest: initial.digest, protocol,
      auth: server.transport === "streamable-http" ? server.auth ?? null : null };
    return { catalog: initial, toolNames: names, receipt, close };
  } catch (error) {
    await close().catch(() => {});
    // Do not expose server diagnostics, command arguments or credential environment on failure.
    throw connectionFailure(transport, error, "MCP mount refused; review the configured server, catalog digest and tool grants");
  }
}
