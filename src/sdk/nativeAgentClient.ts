import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { AgentRunVerification } from "../agent/runReport.js";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const STOP_REASONS = new Set(["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"]);
const UPDATE_KINDS = new Set(["agent_message_chunk", "user_message_chunk", "tool_call", "tool_call_update"]);
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_TURN_BYTES = 8 * 1024 * 1024;

export class AMCNativeProtocolError extends Error {
  constructor(message: string) { super(message); this.name = "AMCNativeProtocolError"; }
}

export class AMCNativeRefusedError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message); this.name = "AMCNativeRefusedError";
  }
}

export interface AMCNativeClientOptions {
  readonly workspace: string;
  /** Explicit selection: stub is a local demonstration, never a live-provider fallback. */
  readonly provider: string;
  readonly model?: string;
  readonly credential?: string;
  readonly baseUrl?: string;
  readonly agentId?: string;
  readonly tools?: "none" | "workspace";
  /** Pin the signed workspace tool policy for every native tool dispatch. */
  readonly expectedToolsDigest?: string;
  readonly approveTools?: string;
  readonly approveRisk?: "low" | "medium" | "high" | "critical";
  readonly mcpConfig?: string;
  readonly mcpConfigSha256?: string;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  /** Exclude project and user dotenv fallback in operator-owned server integrations. */
  readonly credentialsMode?: "layered" | "operator-only";
  readonly maxTokens?: number;
  readonly maxSteps?: number;
  /** Defaults to the CLI shipped in this same installed package. Never resolves another AMC from PATH. */
  readonly command?: readonly [string, ...string[]];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Cancel process initialization before it has returned a usable client. */
  readonly startupSignal?: AbortSignal;
}

export interface AMCNativeUpdate {
  readonly sessionId: string;
  /** Committed-block notifications from ACP, not provider token deltas or a verifier verdict. */
  readonly update: Readonly<JsonObject> & { readonly sessionUpdate: string };
}

export interface AMCNativeRunResult {
  readonly sessionId: string;
  readonly state: "completed";
  /** ACP end_turn also represents some lossy endings; inspect meta and verify evidence separately. */
  readonly stopReason: string;
  readonly text: string;
  readonly updates: readonly AMCNativeUpdate[];
  readonly meta: Readonly<JsonObject>;
  readonly verification: "not-verified";
}

export interface AMCNativeReceipt {
  readonly sessionId: string;
  readonly state: "verified";
  readonly scope: "workspace-key-consistency" | "externally-anchored";
  readonly report: AgentRunVerification;
}

/** One prompt in flight. Cancelling requests a stop; only the result establishes its outcome. */
export class AMCNativeTurn implements AsyncIterable<AMCNativeUpdate> {
  readonly result: Promise<AMCNativeRunResult>;
  private resolveResult!: (value: AMCNativeRunResult) => void;
  private rejectResult!: (error: Error) => void;
  private readonly updates: AMCNativeUpdate[] = [];
  private bytes = 0;
  private wake: (() => void) | undefined;
  private done = false;
  private error: Error | undefined;
  private iterated = false;
  state: "submitted" | "receiving" | "cancel-requested" | "completed" | "failed" = "submitted";

  constructor(readonly sessionId: string, private readonly requestCancel: () => void) {
    this.result = new Promise((resolve_, reject) => { this.resolveResult = resolve_; this.rejectResult = reject; });
    // Consumers may read the stream before awaiting result. Keep rejection handled until then.
    void this.result.catch(() => {});
  }

  cancel(): void {
    if (this.done) return;
    this.requestCancel();
    this.state = "cancel-requested";
  }

  /** @internal */
  receive(update: AMCNativeUpdate): void {
    if (this.done) throw new AMCNativeProtocolError("received an update after the prompt result");
    this.bytes += Buffer.byteLength(JSON.stringify(update));
    if (this.bytes > MAX_TURN_BYTES) throw new AMCNativeProtocolError("native turn exceeded the client output limit");
    this.updates.push(update);
    if (this.state !== "cancel-requested") this.state = "receiving";
    this.wake?.();
  }

  /** @internal */
  finish(value: JsonObject): void {
    if (typeof value.stopReason !== "string" || !STOP_REASONS.has(value.stopReason)) {
      this.fail(new AMCNativeProtocolError("native prompt returned an invalid stop reason")); return;
    }
    if (value._meta !== undefined && !object(value._meta)) {
      this.fail(new AMCNativeProtocolError("native prompt returned invalid metadata")); return;
    }
    this.done = true; this.state = "completed";
    const text = this.updates.flatMap(({ update }) => {
      if (update.sessionUpdate !== "agent_message_chunk" || !object(update.content)) return [];
      return update.content.type === "text" && typeof update.content.text === "string" ? [update.content.text] : [];
    }).join("");
    this.resolveResult({ sessionId: this.sessionId, state: "completed", stopReason: value.stopReason,
      text, updates: [...this.updates], meta: object(value._meta) ? value._meta : {}, verification: "not-verified" });
    this.wake?.();
  }

  /** @internal */
  fail(error: Error): void {
    if (this.done) return;
    this.done = true; this.error = error; this.state = "failed"; this.rejectResult(error); this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AMCNativeUpdate> {
    if (this.iterated) throw new Error("A native turn supports one update iterator; its result retains every update.");
    this.iterated = true;
    let cursor = 0;
    try {
      for (;;) {
        while (cursor < this.updates.length) yield this.updates[cursor++]!;
        if (this.done) { if (this.error) throw this.error; return; }
        await new Promise<void>((wake) => { this.wake = wake; });
        this.wake = undefined;
      }
    } finally {
      this.wake = undefined;
      // Breaking out of iteration must not leave a spending turn running invisibly.
      if (!this.done) this.cancel();
    }
  }
}

export class AMCNativeSession {
  readonly state = "accepted" as const;
  constructor(private readonly client: AMCNativeClient, readonly sessionId: string,
    readonly history: readonly AMCNativeUpdate[] = []) {}
  prompt(text: string, options: { readonly signal?: AbortSignal } = {}): AMCNativeTurn {
    return this.client.promptSession(this.sessionId, text, options.signal);
  }
  /** Closing the owned agent seals all its sessions before a fresh verifier reads the ledger. */
  async closeAndVerify(): Promise<AMCNativeReceipt> {
    await this.client.close();
    return this.client.verifySession(this.sessionId);
  }
  /** Relinquish the signed writer without sealing, for a later verified session load. */
  release(): Promise<void> { return this.client.releaseSession(this.sessionId); }
}

interface PendingRequest {
  readonly resolve: (value: JsonObject) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Local operator client. This spawns the governed ACP runtime; it does not turn a bridge lease into execution authority. */
export class AMCNativeClient {
  readonly workspace: string;
  readonly protocolVersion = 1;
  agentInfo: Readonly<JsonObject> = {};
  capabilities: Readonly<JsonObject> = {};
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly command: readonly [string, ...string[]];
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeout: number;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly sessions = new Set<string>();
  private readonly turns = new Map<string, AMCNativeTurn>();
  private readonly loading = new Map<string, { updates: AMCNativeUpdate[]; bytes: number }>();
  private readonly releasing = new Set<string>();
  private nextId = 1;
  private buffer = "";
  private fatal: Error | undefined;
  private closing = false;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly childClosed: Promise<void>;

  private constructor(options: AMCNativeClientOptions) {
    if (!options.provider || (options.provider !== "stub" && !options.model)) {
      throw new Error("Choose an explicit provider and an accessible model; stub is a local demonstration.");
    }
    // The child reports its physical process.cwd(). Pin that same directory,
    // so an authorized symlink alias is not mistaken for a second root.
    this.workspace = realpathSync(resolve(options.workspace));
    this.timeout = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeout) || this.timeout <= 0) throw new Error("timeoutMs must be a positive integer");
    for (const bound of [options.maxTokens, options.maxSteps]) {
      if (bound !== undefined && (!Number.isSafeInteger(bound) || bound <= 0)) throw new Error("Native token/step bounds must be positive integers");
    }
    this.command = options.command ?? [process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))];
    this.env = { ...process.env, ...options.env };
    const args = [...this.command.slice(1), "acp", "--provider", options.provider];
    for (const [flag, value] of [["--model", options.model], ["--credential", options.credential],
      ["--base-url", options.baseUrl], ["--agent-id", options.agentId], ["--tools", options.tools],
      ["--expected-tools-digest", options.expectedToolsDigest],
      ["--approve-tools", options.approveTools], ["--approve-risk", options.approveRisk],
      ["--mcp-config", options.mcpConfig], ["--mcp-config-sha256", options.mcpConfigSha256],
      ["--credentials-home", options.credentialsHome], ["--credentials-file", options.credentialsFile],
      ["--credentials-mode", options.credentialsMode],
      ["--max-tokens", options.maxTokens], ["--max-steps", options.maxSteps]] as const) {
      if (value !== undefined) args.push(flag, String(value));
    }
    this.child = spawn(this.command[0], args, { cwd: this.workspace, env: this.env, stdio: "pipe", shell: false });
    this.childClosed = new Promise((resolve_) => {
      this.child.once("close", () => { this.closed = true; resolve_();
        if (this.buffer.trim()) this.fail(new AMCNativeProtocolError("native agent closed with an incomplete protocol frame"));
        else if (!this.closing || this.pending.size > 0) this.fail(new AMCNativeProtocolError("native agent closed before all requests completed"));
      });
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.ingest(chunk));
    // Drain diagnostics without copying potentially sensitive provider output into errors or receipts.
    this.child.stderr.resume();
    this.child.on("error", () => this.fail(new AMCNativeProtocolError("could not start the installed AMC runtime")));
    this.child.stdin.on("error", () => this.fail(new AMCNativeProtocolError("native agent input closed")));
  }

  static async start(options: AMCNativeClientOptions): Promise<AMCNativeClient> {
    if (options.startupSignal?.aborted) throw new AMCNativeProtocolError("native client startup was cancelled");
    const client = new AMCNativeClient(options);
    const abort = () => { void client.close(); };
    options.startupSignal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await client.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      if (result.protocolVersion !== 1 || !object(result.agentInfo) || result.agentInfo.name !== "agent-maturity-compass"
        || !object(result.agentCapabilities)) throw new AMCNativeProtocolError("unsupported native agent identity or protocol");
      if (options.startupSignal?.aborted) throw new AMCNativeProtocolError("native client startup was cancelled");
      client.agentInfo = result.agentInfo; client.capabilities = result.agentCapabilities;
      return client;
    } catch (error) { await client.close(); throw error; }
    finally { options.startupSignal?.removeEventListener("abort", abort); }
  }

  async newSession(): Promise<AMCNativeSession> {
    const result = await this.request("session/new", { cwd: this.workspace, mcpServers: [] });
    if (typeof result.sessionId !== "string" || !result.sessionId || this.sessions.has(result.sessionId)) {
      throw new AMCNativeProtocolError("native agent returned an invalid or repeated session identity");
    }
    this.sessions.add(result.sessionId);
    return new AMCNativeSession(this, result.sessionId);
  }

  /** A peer must advertise verified loading. Never substitute a new session for a failed resume. */
  async resumeSession(sessionId: string): Promise<AMCNativeSession> {
    if (this.capabilities.loadSession !== true) throw new AMCNativeRefusedError(-32601,
      "This installed ACP runtime does not support session loading. Use the native CLI resume workflow.");
    if (!sessionId || this.sessions.has(sessionId)) throw new Error("Choose an existing session not already open in this client");
    if (this.loading.has(sessionId)) throw new Error("Session loading is already in progress");
    const history = { updates: [] as AMCNativeUpdate[], bytes: 0 };
    this.loading.set(sessionId, history);
    try {
      await this.request("session/load", { sessionId, cwd: this.workspace, mcpServers: [] });
      this.sessions.add(sessionId);
      return new AMCNativeSession(this, sessionId, [...history.updates]);
    } finally { this.loading.delete(sessionId); }
  }

  /** @internal */
  async releaseSession(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error("Session is not owned by this client");
    if (this.turns.has(sessionId)) throw new Error("Wait for the active prompt before releasing its writer");
    if (this.releasing.has(sessionId)) throw new Error("Writer release is already in progress");
    const meta = this.capabilities._meta;
    const extension = object(meta) ? meta["dev.agentmaturity.amc"] : undefined;
    if (!object(extension) || extension.releaseSession !== true) {
      throw new AMCNativeRefusedError(-32601, "This installed runtime does not support resumable writer release");
    }
    this.releasing.add(sessionId);
    try {
      await this.request("_amc/session/release", { sessionId });
      this.sessions.delete(sessionId);
    } finally { this.releasing.delete(sessionId); }
  }

  /** @internal */
  promptSession(sessionId: string, text: string, signal?: AbortSignal): AMCNativeTurn {
    if (!this.sessions.has(sessionId)) throw new Error("Session is not owned by this client");
    if (this.releasing.has(sessionId)) throw new Error("Wait for writer release before starting another operation");
    if (this.turns.has(sessionId)) throw new Error("A prompt is already active in this session");
    if (!text.trim()) throw new Error("A prompt must contain text");
    if (signal?.aborted) throw new Error("Prompt was cancelled before submission");
    const turn = new AMCNativeTurn(sessionId, () => this.notify("session/cancel", { sessionId }));
    this.turns.set(sessionId, turn);
    const abort = () => turn.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    const settle = () => { this.turns.delete(sessionId); signal?.removeEventListener("abort", abort); };
    void this.request("session/prompt", { sessionId, prompt: [{ type: "text", text }] })
      .then((result) => { settle(); turn.finish(result); }, (error: Error) => { settle(); turn.fail(error); });
    return turn;
  }

  private write(frame: JsonObject): void {
    if (this.fatal) throw this.fatal;
    if (this.closing || this.closed) throw new AMCNativeProtocolError("native client is closed");
    const line = JSON.stringify(frame) + "\n";
    if (Buffer.byteLength(line) > MAX_FRAME_BYTES) throw new AMCNativeProtocolError("native request exceeds the frame limit");
    this.child.stdin.write(line);
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    if (this.pending.size >= 32) return Promise.reject(new AMCNativeProtocolError("too many native requests are outstanding"));
    const id = this.nextId++;
    return new Promise((resolve_, reject) => {
      const timer = setTimeout(() => this.fail(new AMCNativeProtocolError(`native request timed out: ${method}`)), this.timeout);
      this.pending.set(id, { resolve: resolve_, reject, timer });
      try { this.write({ jsonrpc: "2.0", id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private ingest(chunk: string): void {
    if (this.fatal) return;
    try {
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        if (!line.trim()) continue;
        if (Buffer.byteLength(line) > MAX_FRAME_BYTES) throw new Error("frame limit");
        const frame: unknown = JSON.parse(line);
        if (!object(frame) || frame.jsonrpc !== "2.0") throw new Error("invalid frame");
        if (frame.method === "session/update" && frame.id === undefined) {
          if (!object(frame.params) || typeof frame.params.sessionId !== "string" || !object(frame.params.update)
            || typeof frame.params.update.sessionUpdate !== "string") throw new Error("invalid update");
          const turn = this.turns.get(frame.params.sessionId);
          const loading = this.loading.get(frame.params.sessionId);
          if (!turn && !loading) throw new Error("unowned update");
          const update = frame.params.update;
          if (!UPDATE_KINDS.has(update.sessionUpdate as string)) throw new Error("unsupported update kind");
          if (["agent_message_chunk", "user_message_chunk"].includes(update.sessionUpdate as string) && (!object(update.content)
            || update.content.type !== "text" || typeof update.content.text !== "string")) throw new Error("invalid text update");
          if (["tool_call", "tool_call_update"].includes(update.sessionUpdate as string)
            && (typeof update.toolCallId !== "string" || !update.toolCallId
              || (update.status !== undefined && !["pending", "in_progress", "completed", "failed"].includes(update.status as string)))) {
            throw new Error("invalid tool update");
          }
          const event = { sessionId: frame.params.sessionId, update: update as AMCNativeUpdate["update"] };
          if (loading) {
            loading.bytes += Buffer.byteLength(JSON.stringify(event));
            if (loading.bytes > MAX_TURN_BYTES) throw new Error("history output limit");
            loading.updates.push(event);
          } else { turn!.receive(event); }
          continue;
        }
        if (typeof frame.id !== "number" || !Number.isSafeInteger(frame.id) || frame.method !== undefined) throw new Error("unsolicited frame");
        const pending = this.pending.get(frame.id);
        if (!pending || (frame.result === undefined) === (frame.error === undefined)) throw new Error("uncorrelated reply");
        if (frame.error !== undefined) {
          if (!object(frame.error) || !Number.isInteger(frame.error.code) || typeof frame.error.message !== "string") throw new Error("invalid error");
          clearTimeout(pending.timer); this.pending.delete(frame.id);
          pending.reject(new AMCNativeRefusedError(frame.error.code as number, frame.error.message, frame.error.data));
        } else {
          if (!object(frame.result)) throw new Error("invalid result");
          clearTimeout(pending.timer); this.pending.delete(frame.id); pending.resolve(frame.result);
        }
      }
      if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES) throw new Error("unterminated frame limit");
    } catch { this.fail(new AMCNativeProtocolError("native agent emitted an invalid or uncorrelated protocol frame")); }
  }

  private fail(error: Error): void {
    if (this.fatal) return;
    this.fatal = error;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    for (const turn of this.turns.values()) turn.fail(error);
    this.child.kill("SIGTERM");
    // A broken peer cannot leave an orphan merely because the consumer has not reached finally yet.
    void this.close();
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = this.closeOwnedChild();
    return this.closePromise;
  }

  private async closeOwnedChild(): Promise<void> {
    if (this.closed) return;
    for (const turn of this.turns.values()) { try { turn.cancel(); } catch { /* failed pipe is already recorded */ } }
    this.closing = true;
    this.child.stdin.end();
    const terminate = setTimeout(() => this.child.kill("SIGTERM"), 5_000);
    const kill = setTimeout(() => this.child.kill("SIGKILL"), 7_000);
    try { await this.childClosed; }
    finally { clearTimeout(terminate); clearTimeout(kill); }
  }

  /** Runs the same installed CLI after shutdown. A live summary is never promoted to verification. */
  async verifySession(sessionId: string): Promise<AMCNativeReceipt> {
    if (!this.closed) throw new Error("Close the native client before cold verification");
    if (!this.sessions.has(sessionId)) throw new Error("Session is not owned by this client");
    const output = await new Promise<string>((resolve_, reject) => {
      const child = spawn(this.command[0], [...this.command.slice(1), "agent-loop", "verify", sessionId, "--json"],
        { cwd: this.workspace, env: this.env, stdio: "pipe", shell: false });
      let stdout = ""; let failure: Error | undefined;
      const timer = setTimeout(() => { failure = new AMCNativeProtocolError("native verifier timed out"); child.kill("SIGKILL"); }, this.timeout);
      child.stdin.end(); child.stderr.resume(); child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk;
        if (Buffer.byteLength(stdout) > MAX_TURN_BYTES) { failure = new AMCNativeProtocolError("native verifier exceeded the output limit"); child.kill("SIGKILL"); }
      });
      child.once("error", () => { failure = new AMCNativeProtocolError("could not start the installed native verifier"); });
      child.once("close", (code) => { clearTimeout(timer);
        if (failure || code !== 0) reject(failure ?? new AMCNativeRefusedError(code ?? -1, "Native evidence verification failed"));
        else resolve_(stdout);
      });
    });
    let report: unknown;
    try { report = JSON.parse(output); } catch { throw new AMCNativeProtocolError("native verifier returned invalid JSON"); }
    const empty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
    if (!object(report) || report.sessionId !== sessionId || report.ok !== true || report.ledgerOk !== true
      || !empty(report.ledgerErrors) || !empty(report.sessionChainErrors) || !empty(report.unsignedRowIds)
      || !Array.isArray(report.requests) || !report.requests.every((r) => object(r) && typeof r.headerEventId === "string" && r.headerEventId.length > 0 && r.status === "reconstructed")
      || new Set(report.requests.map(r => (r as JsonObject).headerEventId)).size !== report.requests.length
      || !object(report.trustRoot) || typeof report.trustRoot.anchored !== "boolean"
      || !(report.trustRoot.monitorFingerprint === null || typeof report.trustRoot.monitorFingerprint === "string")
      || !(report.trustRoot.expectedFingerprint === null || typeof report.trustRoot.expectedFingerprint === "string")) {
      throw new AMCNativeProtocolError("native verifier returned an inconsistent receipt");
    }
    if (report.trustRoot.anchored && (!report.trustRoot.expectedFingerprint
      || report.trustRoot.expectedFingerprint !== report.trustRoot.monitorFingerprint)) {
      throw new AMCNativeProtocolError("native verifier returned an inconsistent trust anchor");
    }
    return { sessionId, state: "verified", scope: report.trustRoot.anchored ? "externally-anchored" : "workspace-key-consistency",
      report: report as unknown as AgentRunVerification };
  }
}
