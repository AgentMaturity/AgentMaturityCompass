import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { agentToolset, type AgentToolset } from "../../src/agent/agentToolset.js";
import { runToolCalls } from "../../src/agent/toolCalls.js";
import { DEFAULT_AGENT_LOOP_CONFIG } from "../../src/agent/loopTypes.js";
import type { ToolCallOutcome } from "../../src/agent/toolSeam.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { toolCallId } from "../../src/llm/streamChunk.js";
import { discoverNativeMcpCatalog, mountNativeMcpServer, nativeMcpToolName,
  type MountedNativeMcpServer, type NativeMcpCatalog, type NativeMcpGrant } from "../../src/mcp/nativeMcpClient.js";
import { NativeMcpHttpRefused, type NativeMcpHttpServer } from "../../src/mcp/nativeMcpHttpTransport.js";
import { NativeMcpProtocolRefused } from "../../src/mcp/protocol/version.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { SessionService } from "../../src/session/sessionService.js";
import { initToolsConfig, loadToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { canonicalize } from "../../src/utils/json.js";
import { initWorkspace } from "../../src/workspace.js";
import { removeActionPolicy } from "../helpers/actionPolicyFixtures.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const MODERN = "2026-07-28";
const SERVER_ID = "stateless_fixture";
const SERVER_INFO = { name: "synthetic-stateless-untrusted", version: "1" };
const RESPONSE_SESSION = "synthetic-stateless-response-session";
const QUERY = "caf\u00e9";
const INPUT_SCHEMA = { type: "object", properties: { query: { type: "string", "x-mcp-header": "Query" } },
  required: ["query"], additionalProperties: false };
const TOOL = { name: "lookup", description: "Synthetic stateless lookup", inputSchema: INPUT_SCHEMA };
const EXPECTED_META = { "io.modelcontextprotocol/protocolVersion": MODERN,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "amc-governed-native-tools", version: "1.0.0" } };
type ErrorFact = { scope: string; name: string; message: string; stack: string | null };
type HttpFact = {
  ordinal: number; httpMethod: string; path: string; rpc: string | null; id: string | number | null;
  meta: unknown; bodyBytes: number; bodySha256: string; query: string | null;
  protocolHeader: string | null; methodHeader: string | null; nameHeader: string | null; paramHeader: string | null;
  originMatches: boolean; acceptJson: boolean; acceptSse: boolean;
  requestSessionPresent: boolean; lastEventIdPresent: boolean;
  requestEnded: boolean; requestComplete: boolean; requestClosed: boolean;
  responseStatus: number; responseKind: "json" | "finite-sse-eof" | "empty";
  responseId: string | number | null; responseResultType: string | null;
  responseSessionPresent: boolean; responseFinished: boolean; responseClosed: boolean;
};
type ToolEvidence = {
  id: string; eventType: string; signed: boolean; payloadSha256: string;
  meta: Record<string, unknown>;
};
type ResultTypeMode = "missing" | "complete" | "input_required" | "invalid";
interface FixtureOptions {
  listEofs?: 1 | 2;
  listResultType?: ResultTypeMode;
  callResultType?: ResultTypeMode;
  callErrorMarker?: boolean;
  wrongListResponseId?: boolean;
}
interface Fixture {
  root: string; server: NativeMcpHttpServer; requests: HttpFact[]; toolName: string;
  reviewed: NativeMcpCatalog | null; mount: MountedNativeMcpServer | null;
  outcomes: { callId: string; result: ToolCallOutcome }[]; toolEvidence: ToolEvidence[];
  observations: unknown[]; toolDescription: string;
  mountReviewed(): Promise<MountedNativeMcpServer>;
  mountPinned(expectedCatalogDigest: string, grants: readonly NativeMcpGrant[]): Promise<MountedNativeMcpServer>;
  call(): Promise<ToolCallOutcome>;
  toolRequests(): HttpFact[];
  effectCount(): number;
  granted(): boolean;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Owned stateless endpoint requires one JSON-RPC object");
  return value as Record<string, unknown>;
}
function errorFact(scope: string, error: unknown): ErrorFact {
  const clean = (text: string) => text.replaceAll("stateless-fixture-vault-only", "[owned-passphrase]");
  return { scope, name: error instanceof Error ? error.name : typeof error,
    message: clean(error instanceof Error ? error.message : String(error)),
    stack: error instanceof Error && error.stack ? clean(error.stack) : null };
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
function typedResult(value: Record<string, unknown>, mode: ResultTypeMode = "complete"): Record<string, unknown> {
  return mode === "missing" ? value : { ...value, resultType: mode === "invalid" ? "synthetic-invalid-result-type" : mode };
}

// Every fixture retains its owned root and public HTTP/lifecycle facts. Cleanup
// uses public close APIs and natural finite responses; no socket destroy or rm.
async function owned(label: string, loseFirstToolResponse: boolean, body: (f: Fixture) => Promise<void>, options: FixtureOptions = {}): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p139-stateless-")));
  const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  const errors: ErrorFact[] = [], cleanupErrors: unknown[] = [];
  const requestClosures: Promise<void>[] = [], socketClosures: Promise<void>[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const socketFacts: { closed: boolean; hadError: boolean }[] = [];
  let origin = "", started = false, closed = false, remoteEffects = 0;
  let session: SessionService | undefined, toolset: AgentToolset | undefined;
  let sessionOpened = false, turnStarted = false, stepStarted = false;
  let stepEnded = false, turnEnded = false, turnSealed = false, sessionClosed = false, toolsetClosed = false;
  let bodyError: unknown, bodyFailed = false, sequence = 0, lists = 0;
  const f: Fixture = {
    root, requests: [], outcomes: [], toolEvidence: [], reviewed: null, mount: null,
    observations: [], toolDescription: TOOL.description,
    toolName: nativeMcpToolName(SERVER_ID, TOOL.name),
    server: { transport: "streamable-http", id: SERVER_ID, url: "", origin: "" },
    mountReviewed: async () => {
      if (!toolset) throw new Error("Owned stateless toolset is unavailable");
      f.reviewed = await discoverNativeMcpCatalog(f.server, root);
      f.mount = await mountNativeMcpServer({ server: f.server, workspace: root, agentId: "default", toolset,
        expectedCatalogDigest: f.reviewed.digest, grants: [{ name: TOOL.name, actionClass: "READ_ONLY" }] });
      return f.mount;
    },
    mountPinned: async (expectedCatalogDigest, grants) => {
      if (!toolset) throw new Error("Owned stateless toolset is unavailable");
      f.mount = await mountNativeMcpServer({ server: f.server, workspace: root, agentId: "default", toolset,
        expectedCatalogDigest, grants });
      return f.mount;
    },
    call: async () => {
      if (!session || !toolset) throw new Error("Owned stateless session/toolset is unavailable");
      const activeSession = session, activeToolset = toolset;
      const id = toolCallId(`stateless-call-${++sequence}`), rawArguments = JSON.stringify({ query: QUERY });
      // Mirror the public loop order: commit the call before dispatch, then let
      // runToolCalls commit the real seam outcome. The adapter only observes.
      activeSession.recordToolCall({ toolCallId: id, toolName: f.toolName, dispatch: "native", parentToken: null, args: rawArguments });
      await runToolCalls({ session: activeSession, turn: 1, step: 1, signal: new AbortController().signal,
        maxParallel: 1, abandonGraceMs: DEFAULT_AGENT_LOOP_CONFIG.toolAbandonGraceMs, parentToken: null,
        acceptContext: text => { throw new Error(`Unexpected owned stateless context (${text.length} bytes)`); },
        calls: [{ kind: "tool_use", id, name: f.toolName, arguments: rawArguments }],
        tools: { schemas: () => activeToolset.seam.schemas(), executionMode: request => activeToolset.seam.executionMode(request),
          execute: async request => {
            const result = await activeToolset.seam.execute(request);
            f.outcomes.push({ callId: id, result }); return result;
          } } });
      f.toolEvidence = activeSession.readEvents().filter(row => row.event_type === "tool/call" || row.event_type === "tool/result")
        .map(row => ({ id: row.id, eventType: row.event_type, signed: row.writer_sig !== "unsigned",
          payloadSha256: row.payload_sha256, meta: object(JSON.parse(row.meta_json)) }));
      const outcome = f.outcomes.find(row => row.callId === id)?.result;
      if (!outcome) throw new Error("Owned stateless call produced no real seam outcome");
      return outcome;
    },
    toolRequests: () => f.requests.filter(row => row.rpc === "tools/call"),
    effectCount: () => remoteEffects,
    granted: () => toolset?.registry.visible("default").has(f.toolName) ?? false
  };
  const http = createServer((req, res) => {
    const header = (name: string) => typeof req.headers[name] === "string" ? req.headers[name] as string : null;
    const accept = header("accept") ?? "";
    const row: HttpFact = { ordinal: f.requests.length + 1, httpMethod: req.method ?? "", path: req.url ?? "", rpc: null, id: null,
      meta: null, bodyBytes: 0, bodySha256: "", query: null,
      protocolHeader: header("mcp-protocol-version"), methodHeader: header("mcp-method"), nameHeader: header("mcp-name"), paramHeader: header("mcp-param-query"),
      originMatches: req.headers.origin === origin, acceptJson: accept.includes("application/json"), acceptSse: accept.includes("text/event-stream"),
      requestSessionPresent: req.headers["mcp-session-id"] !== undefined, lastEventIdPresent: req.headers["last-event-id"] !== undefined,
      requestEnded: false, requestComplete: false, requestClosed: false,
      responseStatus: 0, responseKind: "empty", responseId: null, responseResultType: null,
      responseSessionPresent: false, responseFinished: false, responseClosed: false };
    f.requests.push(row);
    req.on("error", error => errors.push(errorFact("request", error)));
    res.on("error", error => errors.push(errorFact("response", error)));
    req.once("end", () => { row.requestEnded = true; });
    res.once("finish", () => { row.responseFinished = res.writableFinished; });
    requestClosures.push(new Promise<void>(resolve => req.once("close", () => {
      row.requestClosed = true; row.requestComplete = req.complete; resolve();
    })), new Promise<void>(resolve => res.once("close", () => { row.responseClosed = true; resolve(); })));
    const reply = (status: number, value?: unknown) => {
      row.responseStatus = status; row.responseKind = value === undefined ? "empty" : "json";
      const envelope = value as { id?: unknown; result?: { resultType?: unknown } } | undefined;
      if (typeof envelope?.id === "string" || typeof envelope?.id === "number") row.responseId = envelope.id;
      if (typeof envelope?.result?.resultType === "string") row.responseResultType = envelope.result.resultType;
      // A modern response may carry this irrelevant legacy header. It must
      // never become a request session, a GET subscription or a DELETE.
      row.responseSessionPresent = true;
      res.writeHead(status, { connection: "close", "mcp-session-id": RESPONSE_SESSION,
        ...(value === undefined ? {} : { "content-type": "application/json" }) });
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    void (async () => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks); row.bodyBytes = bytes.length; row.bodySha256 = createHash("sha256").update(bytes).digest("hex");
      if (req.method !== "POST" || req.url !== "/mcp") { reply(405); return; }
      const rpc = object(JSON.parse(bytes.toString("utf8")));
      if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string" || (typeof rpc.id !== "string" && typeof rpc.id !== "number")) {
        throw new Error("Owned stateless request requires a JSON-RPC method and id");
      }
      row.rpc = rpc.method; row.id = rpc.id;
      const params = object(rpc.params); row.meta = params._meta ?? null;
      let result: unknown;
      if (rpc.method === "server/discover") {
        result = { resultType: "complete", supportedVersions: [MODERN], _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } };
      } else if (rpc.method === "tools/list") {
        lists++;
        if (lists <= (options.listEofs ?? 0)) {
          row.responseStatus = 200; row.responseKind = "finite-sse-eof";
          res.writeHead(200, { connection: "close", "content-type": "text/event-stream" });
          res.end(": synthetic finite list response with no result\n\n"); return;
        }
        result = typedResult({ tools: [{ ...TOOL, description: f.toolDescription }], ttlMs: 86_400_000, cacheScope: "server" }, options.listResultType);
      } else if (rpc.method === "tools/call") {
        if (params.name !== TOOL.name) throw new Error("Owned stateless tool name differs");
        const args = object(params.arguments);
        if (typeof args.query !== "string") throw new Error("Owned stateless query is absent");
        row.query = args.query; remoteEffects++;
        if (loseFirstToolResponse && remoteEffects === 1) {
          row.responseStatus = 200; row.responseKind = "finite-sse-eof";
          res.writeHead(200, { connection: "close", "content-type": "text/event-stream" });
          // Finite normal EOF, with no matching JSON-RPC result. An unwanted
          // second call receives JSON below, so replay cannot hide in a hang.
          res.end(": synthetic finite response with no result\n\n"); return;
        }
        result = typedResult({
          content: [{ type: "text", text: options.callErrorMarker
            ? "Synthetic remote error: TOOL_OUTCOME_UNKNOWN" : "synthetic lookup completed" }],
          ...(options.callErrorMarker ? { isError: true } : {})
        }, options.callResultType);
      } else throw new Error("Unexpected owned stateless RPC method");
      reply(200, { jsonrpc: "2.0", id: options.wrongListResponseId && rpc.method === "tools/list" ? "synthetic-unrelated-response" : rpc.id, result });
    })().catch(error => {
      errors.push(errorFact("handler", error));
      if (!res.headersSent) reply(500);
      else if (!res.writableEnded) res.end();
    });
  });
  http.on("error", error => errors.push(errorFact("server", error)));
  http.once("close", () => { closed = true; });
  http.on("connection", socket => {
    sockets.add(socket);
    const row = { closed: false, hadError: false }; socketFacts.push(row);
    socket.on("error", error => errors.push(errorFact("socket", error)));
    socketClosures.push(new Promise<void>(resolve => socket.once("close", hadError => {
      row.closed = true; row.hadError = hadError; sockets.delete(socket); resolve();
    })));
  });
  try {
    process.env.AMC_VAULT_PASSPHRASE = "stateless-fixture-vault-only";
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    removeActionPolicy(root); // AXR-02: no Action Policy configured, as before; this file is not about it (amc init signs one). initBudgets(root);
    writeRuntimeFirewallPolicy({ workspace: root, mode: "observe" });
    const configured = loadToolsConfig(root);
    initToolsConfig(root, { ...configured, tools: { ...configured.tools,
      allowedTools: [...configured.tools.allowedTools, { name: f.toolName, actionClass: "READ_ONLY" }] } });
    session = new SessionService(root);
    session.open({ agentId: "default", harnessVersion: "stateless-fixture", compositionDigest: "stateless-fixture", policyDigest: "stateless-fixture" });
    sessionOpened = true;
    session.startTurn({ trigger: "user" }); turnStarted = true;
    session.startStep(); stepStarted = true;
    toolset = agentToolset({ workspace: root, agentId: "default", sessionId: session.sessionId, recorder: session });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { http.removeListener("listening", onListen); reject(error); };
      const onListen = () => { http.removeListener("error", onError); resolve(); };
      http.once("error", onError); http.once("listening", onListen); http.listen(0, "127.0.0.1");
    });
    started = true;
    const address = http.address();
    if (!address || typeof address === "string" || address.port <= 0) throw new Error("Owned stateless server has no positive port");
    origin = `http://127.0.0.1:${address.port}`;
    f.server = { transport: "streamable-http", id: SERVER_ID, url: `${origin}/mcp`, origin, protocolVersion: MODERN };
    await body(f);
  } catch (error) { bodyFailed = true; bodyError = error; }
  finally {
    const closeStage = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
    await closeStage(async () => { if (f.mount) await f.mount.close(); });
    await closeStage(() => { if (toolset) { toolset.close(); toolsetClosed = true; } });
    await closeStage(() => { if (session && stepStarted) { session.endStep({ stopReason: "end_turn", usage: null }); stepEnded = true; } });
    await closeStage(() => { if (session && turnStarted) { session.endTurn({ reason: bodyFailed ? "error" : "complete" }); turnEnded = true; } });
    await closeStage(() => { if (session && turnEnded) { session.sealTurn(); turnSealed = true; } });
    await closeStage(() => { if (session && sessionOpened) { session.close({ reason: bodyFailed ? "error" : "completed" }); sessionClosed = true; } });
    await closeStage(async () => {
      if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      await Promise.all([...requestClosures, ...socketClosures]);
    });
    if (started && (!closed || http.listening || sockets.size !== 0)) cleanupErrors.push(new Error("Owned stateless server did not close completely"));
    if (sessionOpened && (!toolsetClosed || !stepEnded || !turnEnded || !turnSealed || !sessionClosed)) cleanupErrors.push(new Error("Owned stateless public session lifecycle incomplete"));
    for (const row of f.requests) if (!row.requestEnded || !row.requestComplete || !row.requestClosed || !row.responseFinished || !row.responseClosed) {
      cleanupErrors.push(new Error(`Owned stateless HTTP lifecycle incomplete at request ${row.ordinal}`));
    }
    for (const row of socketFacts) if (!row.closed || row.hadError) cleanupErrors.push(new Error("Owned stateless socket closure failed"));
    if (errors.length) cleanupErrors.push(new Error("Owned stateless endpoint recorded errors"));
    if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
    const environmentRestored = process.env.AMC_VAULT_PASSPHRASE === previousPassphrase;
    if (!environmentRestored) cleanupErrors.push(new Error("Owned stateless environment was not restored"));
    const evidence = join(root, "public-evidence.json");
    try {
      writeFileSync(evidence, `${JSON.stringify({ schema: "amc-p139-stateless/2", label, synthetic: true, checkout: CHECKOUT,
        retainedRoot: root, configuredProtocolVersion: MODERN, loseFirstToolResponse, remoteEffects,
        options, observations: f.observations,
        requests: f.requests, sockets: socketFacts,
        reviewed: f.reviewed, receipt: f.mount?.receipt ?? null, outcomes: f.outcomes, toolEvidence: f.toolEvidence,
        lifecycle: { started, closed, listening: http.listening, openSockets: sockets.size,
          sessionOpened, stepEnded, turnEnded, turnSealed, sessionClosed, toolsetClosed },
        errors, bodyFailed, bodyError: bodyFailed ? errorFact("body", bodyError) : null,
        cleanupErrors: cleanupErrors.map(error => errorFact("cleanup", error)),
        environmentMutated: true, environmentRestored, childProcessCreated: false, signalsSent: false,
        typedUnknownQualification: label === "strict-typed-unknown-evidence" ? "strict assertion retained" : "not claimed by this case" }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 });
      console.log(`AMC_P139_STATELESS_PUBLIC_EVIDENCE ${evidence}`);
    } catch (error) { cleanupErrors.push(error); console.log(`AMC_P139_STATELESS_RETAINED_ROOT ${root}`); }
  }
  if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "owned stateless cleanup failed");
  if (bodyFailed) throw bodyError;
}

function assertStatelessWire(f: Fixture): void {
  expect(f.requests.length).toBeGreaterThan(0);
  for (const row of f.requests) {
    expect(row).toMatchObject({ httpMethod: "POST", path: "/mcp", originMatches: true,
      protocolHeader: MODERN, methodHeader: row.rpc, requestSessionPresent: false, lastEventIdPresent: false,
      acceptJson: true, acceptSse: true });
    // WP41 PXB-01: tools/call also carries the SDK's progress token so progress can renew its timeout.
    expect(row.meta).toEqual(row.rpc === "tools/call" ? { ...EXPECTED_META, progressToken: expect.any(Number) } : EXPECTED_META);
    if (row.rpc === "tools/call") {
      expect(row).toMatchObject({ nameHeader: TOOL.name, query: QUERY,
        paramHeader: `=?base64?${Buffer.from(QUERY, "utf8").toString("base64")}?=` });
    } else expect({ name: row.nameHeader, parameter: row.paramHeader }).toEqual({ name: null, parameter: null });
  }
}
function assertRecordedPair(f: Fixture, callIndex: number, outcome: ToolCallOutcome): ToolEvidence {
  const observed = f.outcomes[callIndex];
  expect(observed).toBeDefined();
  const rows = f.toolEvidence.filter(row => row.meta.toolCallId === observed!.callId);
  expect(rows.map(row => row.eventType)).toEqual(["tool/call", "tool/result"]);
  expect(rows.every(row => row.signed && /^[a-f0-9]{64}$/.test(row.payloadSha256))).toBe(true);
  expect(rows[0]!.meta).toMatchObject({ toolName: f.toolName, dispatch: "native", parentToken: null, turn: 1, step: 1 });
  expect(rows[1]!.meta).toMatchObject({ outcome: outcome.outcome, exitCode: outcome.exitCode,
    timedOut: outcome.timedOut, denied: outcome.denied, turn: 1, step: 1 });
  return rows[1]!;
}

describe("P1-39 governed stateless MCP public flow", () => {
  test("reviews a version-bound catalog and executes one granted call without a session", async () => {
    await owned("stateless-governed-call", false, async f => {
      const mount = await f.mountReviewed();
      const tools = [{ ...TOOL, outputSchema: null, annotations: null, execution: null }];
      expect(f.reviewed?.protocol).toEqual({ mode: "stateless", negotiatedVersion: MODERN, serverInfo: SERVER_INFO });
      expect(f.reviewed?.tools).toEqual(tools);
      expect(f.reviewed?.digest).toBe(digest({ protocolVersion: MODERN, tools }));
      expect(f.reviewed?.digest).not.toBe(digest({ protocolVersion: "2025-11-25", tools }));
      expect(mount.receipt).toEqual({ serverId: SERVER_ID, catalogDigest: f.reviewed!.digest,
        protocol: f.reviewed!.protocol, auth: null });
      expect(mount.toolNames).toEqual([f.toolName]); expect(f.granted()).toBe(true);
      const outcome = await f.call();
      expect(outcome).toMatchObject({ outcome: "OK", exitCode: 0, timedOut: false, denied: false });
      expect(String(outcome.content)).toContain("synthetic lookup completed");
      expect(f.requests.map(row => row.rpc)).toEqual(["server/discover", "tools/list", "server/discover", "tools/list", "tools/list", "tools/call"]);
      expect(f.toolRequests()).toHaveLength(1);
      assertStatelessWire(f); assertRecordedPair(f, 0, outcome);
      await mount.close(); expect(f.granted()).toBe(false);
      expect(f.requests.every(row => row.httpMethod === "POST")).toBe(true);
    });
  });

  test("a finite broken tools/call response is not replayed and disposes its grant", async () => {
    await owned("stateless-tool-no-replay", true, async f => {
      await f.mountReviewed();
      const outcome = await f.call();
      // First sensitive assertion for the replay control: the endpoint counts
      // an effect before losing the response; a second POST would count twice.
      expect(f.effectCount()).toBe(1);
      expect(f.toolRequests()).toHaveLength(1);
      expect(f.toolRequests()[0]).toMatchObject({ responseStatus: 200, responseKind: "finite-sse-eof" });
      expect(outcome.outcome).not.toBe("OK"); expect(outcome.timedOut).toBe(false);
      expect(String(outcome.content)).toContain("TOOL_OUTCOME_UNKNOWN");
      expect(String(outcome.content)).toContain("may have executed"); expect(String(outcome.content)).toMatch(/not replayed/i);
      assertStatelessWire(f); assertRecordedPair(f, 0, outcome);
      expect(f.granted()).toBe(false);
      const requestsBeforeDenied = f.requests.length, denied = await f.call();
      expect(denied.outcome).toBe("DENIED"); expect(f.requests).toHaveLength(requestsBeforeDenied);
      expect(f.toolRequests()).toHaveLength(1); assertRecordedPair(f, 1, denied);
    });
  });

  test("a broken tools/call is recorded with strict typed unknown evidence", async () => {
    await owned("strict-typed-unknown-evidence", true, async f => {
      await f.mountReviewed(); const outcome = await f.call();
      expect(f.toolRequests()).toHaveLength(1);
      const result = assertRecordedPair(f, 0, outcome);
      // The current ordinary native-client failure may map to ERROR here.
      // Keep the specification's typed-evidence assertion; do not relabel it.
      expect(result.meta.outcome).toBe("TOOL_OUTCOME_UNKNOWN");
      expect(outcome.outcome).toBe("TOOL_OUTCOME_UNKNOWN");
      expect(String(outcome.content)).toContain("TOOL_OUTCOME_UNKNOWN");
    });
  });

  test("one finite tools/list EOF is reissued once with a new wire id", async () => {
    await owned("list-one-reissue", false, async f => {
      const catalog = await discoverNativeMcpCatalog(f.server, f.root); f.reviewed = catalog;
      const lists = f.requests.filter(row => row.rpc === "tools/list");
      f.observations.push({ kind: "one-list-reissue", catalog, lists });
      expect(f.requests.map(row => row.rpc)).toEqual(["server/discover", "tools/list", "tools/list"]);
      expect(lists).toHaveLength(2);
      expect(lists[0]).toMatchObject({ responseStatus: 200, responseKind: "finite-sse-eof", responseId: null });
      expect(lists[1]).toMatchObject({ responseStatus: 200, responseKind: "json", responseId: lists[1]!.id });
      expect(lists[1]!.id).not.toBe(lists[0]!.id);
      expect(lists[0]!.id).not.toBeNull(); expect(lists[1]!.id).not.toBeNull();
      expect(catalog.tools).toEqual([{ ...TOOL, outputSchema: null, annotations: null, execution: null }]);
      expect(catalog.digest).toBe(digest({ protocolVersion: MODERN, tools: catalog.tools }));
      expect(f.toolRequests()).toEqual([]); assertStatelessWire(f);
    }, { listEofs: 1 });
  });

  test("two finite tools/list EOFs exhaust the single reissue allowance", async () => {
    await owned("list-reissue-exhausted", false, async f => {
      let failure: unknown;
      try { f.reviewed = await discoverNativeMcpCatalog(f.server, f.root); }
      catch (error) { failure = error; f.observations.push({ kind: "exhausted-list-refusal", error: errorFact("expected-refusal", error) }); }
      const lists = f.requests.filter(row => row.rpc === "tools/list");
      expect(lists).toHaveLength(2);
      expect(lists.map(row => ({ status: row.responseStatus, kind: row.responseKind, responseId: row.responseId })))
        .toEqual([{ status: 200, kind: "finite-sse-eof", responseId: null }, { status: 200, kind: "finite-sse-eof", responseId: null }]);
      expect(lists[1]!.id).not.toBe(lists[0]!.id);
      expect(lists[0]!.id).not.toBeNull(); expect(lists[1]!.id).not.toBeNull();
      expect(failure).toBeInstanceOf(NativeMcpHttpRefused);
      expect(failure).toMatchObject({ message: "MCP HTTP connection failed; review the endpoint and credential references." });
      expect(f.reviewed).toBeNull(); expect(f.toolRequests()).toEqual([]); assertStatelessWire(f);
    }, { listEofs: 2 });
  });

  test("catalog and explicit grant admission refuse before dispatch and ignore a long TTL after catalog drift", async () => {
    await owned("digest-grant-and-fresh-catalog", false, async f => {
      const catalog = await discoverNativeMcpCatalog(f.server, f.root); f.reviewed = catalog;
      const attempts: { label: string; accepted: boolean; visible: boolean; requestDelta: number; error: ErrorFact | null }[] = [];
      for (const row of [
        { label: "wrong-digest", digest: "0".repeat(64), grants: [{ name: TOOL.name, actionClass: "READ_ONLY" as const }] },
        { label: "empty-grants", digest: catalog.digest, grants: [] },
        { label: "absent-remote-tool", digest: catalog.digest, grants: [{ name: "absent", actionClass: "READ_ONLY" as const }] }
      ]) {
        const before = f.requests.length;
        let accepted = false, visible = false, failure: ErrorFact | null = null;
        try {
          const mount = await f.mountPinned(row.digest, row.grants);
          accepted = true; visible = f.granted(); await mount.close();
        } catch (error) { failure = errorFact("expected-admission-refusal", error); visible = f.granted(); }
        attempts.push({ label: row.label, accepted, visible, requestDelta: f.requests.length - before, error: failure });
        f.observations.push({ kind: "admission-attempt", attempt: attempts[attempts.length - 1] });
      }
      await f.mountReviewed();
      f.toolDescription = "Synthetic changed catalog despite long TTL";
      const beforeCall = f.requests.length, outcome = await f.call();
      f.observations.push({ kind: "changed-catalog-call", advertisedTtlMs: 86_400_000, cacheScope: "server",
        description: f.toolDescription, requestsAfterCall: f.requests.slice(beforeCall), outcome, granted: f.granted() });
      expect(attempts.map(row => ({ label: row.label, accepted: row.accepted, visible: row.visible, message: row.error?.message }))).toEqual([
        { label: "wrong-digest", accepted: false, visible: false, message: "MCP mount refused; review the configured server, catalog digest and tool grants" },
        { label: "empty-grants", accepted: false, visible: false, message: "Choose an explicit bounded MCP tool grant" },
        { label: "absent-remote-tool", accepted: false, visible: false, message: "MCP mount refused; review the configured server, catalog digest and tool grants" }
      ]);
      expect(attempts[1]!.requestDelta).toBe(0);
      expect(f.toolRequests()).toEqual([]); expect(f.effectCount()).toBe(0);
      expect(f.requests.slice(beforeCall).map(row => row.rpc)).toEqual(["tools/list"]);
      expect(outcome.outcome).not.toBe("OK"); expect(outcome.timedOut).toBe(false);
      expect(String(outcome.content)).toMatch(/catalog changed/i);
      expect(f.granted()).toBe(false);
      assertStatelessWire(f); assertRecordedPair(f, 0, outcome);
    });
  });

  test("missing resultType remains complete for the real catalog and governed call", async () => {
    await owned("missing-result-type", false, async f => {
      await f.mountReviewed(); const outcome = await f.call();
      expect(outcome).toMatchObject({ outcome: "OK", exitCode: 0, timedOut: false, denied: false });
      expect(f.reviewed?.tools).toEqual([{ ...TOOL, outputSchema: null, annotations: null, execution: null }]);
      expect(f.requests.filter(row => row.rpc === "tools/list" || row.rpc === "tools/call").every(row => row.responseResultType === null)).toBe(true);
      expect(f.toolRequests()).toHaveLength(1); expect(f.effectCount()).toBe(1);
      assertStatelessWire(f); assertRecordedPair(f, 0, outcome);
    }, { listResultType: "missing", callResultType: "missing" });
  });

  test.each(["input_required", "invalid"] as const)("tools/list %s resultType is refused before a catalog or tool call", async mode => {
    await owned(`list-result-type-${mode}`, false, async f => {
      let failure: unknown;
      try { f.reviewed = await discoverNativeMcpCatalog(f.server, f.root); }
      catch (error) { failure = error; f.observations.push({ kind: "list-result-type-refusal", mode, error: errorFact("expected-refusal", error) }); }
      expect(failure).toBeInstanceOf(NativeMcpProtocolRefused);
      expect(failure).toMatchObject({ message: mode === "input_required"
        ? "MCP tools/list returned input_required, which the protocol does not allow; it was refused."
        : "MCP result has an unrecognized resultType; it was refused." });
      expect(f.requests.map(row => row.rpc)).toEqual(["server/discover", "tools/list"]);
      expect(f.requests[1]).toMatchObject({ responseStatus: 200, responseKind: "json",
        responseResultType: mode === "invalid" ? "synthetic-invalid-result-type" : "input_required" });
      expect(f.reviewed).toBeNull(); expect(f.toolRequests()).toEqual([]); expect(f.effectCount()).toBe(0);
      assertStatelessWire(f);
    }, { listResultType: mode });
  });

  test.each(["input_required", "invalid"] as const)("tools/call %s resultType cannot complete or trigger a replay", async mode => {
    await owned(`call-result-type-${mode}`, false, async f => {
      await f.mountReviewed(); const outcome = await f.call();
      f.observations.push({ kind: "call-result-type", mode, outcome, granted: f.granted() });
      expect(f.toolRequests()).toHaveLength(1); expect(f.effectCount()).toBe(1);
      expect(f.toolRequests()[0]).toMatchObject({ responseStatus: 200, responseKind: "json",
        responseResultType: mode === "invalid" ? "synthetic-invalid-result-type" : "input_required" });
      expect(outcome.outcome).not.toBe("OK"); expect(outcome).toMatchObject({ timedOut: false, denied: false, exitCode: 1 });
      if (mode === "input_required") expect(String(outcome.content)).toContain("input_required");
      else { expect(String(outcome.content)).toMatch(/received result was discarded/i); expect(f.granted()).toBe(false); }
      assertStatelessWire(f); assertRecordedPair(f, 0, outcome);
    }, { callResultType: mode });
  });

  test("a tools/list response for another id is refused without response remapping", async () => {
    await owned("wrong-list-response-id", false, async f => {
      let failure: unknown;
      try { f.reviewed = await discoverNativeMcpCatalog(f.server, f.root); }
      catch (error) { failure = error; f.observations.push({ kind: "response-id-refusal", error: errorFact("expected-refusal", error) }); }
      expect(failure).toBeInstanceOf(NativeMcpHttpRefused);
      expect(failure).toMatchObject({ message: "MCP HTTP response is not one JSON-RPC response for its request." });
      expect(f.requests.map(row => row.rpc)).toEqual(["server/discover", "tools/list"]);
      expect(f.requests[1]).toMatchObject({ responseStatus: 200, responseKind: "json", responseId: "synthetic-unrelated-response" });
      expect(f.requests[1]!.responseId).not.toBe(f.requests[1]!.id);
      expect(f.reviewed).toBeNull(); expect(f.toolRequests()).toEqual([]); assertStatelessWire(f);
    }, { wrongListResponseId: true });
  });

  test("untrusted unknown-marker text in a received tool error stays ERROR", async () => {
    await owned("untrusted-error-marker-stays-error", false, async f => {
      await f.mountReviewed(); const outcome = await f.call();
      f.observations.push({ kind: "untrusted-error-marker", outcome, remoteEffects: f.effectCount(), calls: f.toolRequests() });
      expect(f.toolRequests()).toHaveLength(1); expect(f.effectCount()).toBe(1);
      const call = f.toolRequests()[0]!;
      expect(call).toMatchObject({ responseStatus: 200, responseKind: "json", responseResultType: "complete" });
      expect(call.responseId).toBe(call.id);
      expect(outcome).toMatchObject({ outcome: "ERROR", exitCode: 1, timedOut: false, denied: false });
      const recorded = assertRecordedPair(f, 0, outcome);
      expect(recorded.meta.outcome).toBe("ERROR");
      expect(JSON.parse(String(outcome.content))).toEqual({
        content: [{ type: "text", text: "Synthetic remote error: TOOL_OUTCOME_UNKNOWN" }],
        isError: true, resultType: "complete"
      });
      expect(f.requests.map(row => row.rpc)).toEqual(["server/discover", "tools/list", "server/discover", "tools/list", "tools/list", "tools/call"]);
      assertStatelessWire(f);
    }, { callErrorMarker: true });
  });
});
