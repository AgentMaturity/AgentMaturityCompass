import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import type { AgentRunVerification } from "../agent/runReport.js";
import type { NativeValidationResult } from "../agent/nativeValidation.js";
import { parseNativeValidationResult } from "../agent/nativeValidationResult.js";
import { deepseekParams } from "../llm/providers/deepseekContract.js";
import { materializeAcpImages, nativeImagesToAcp, nativePartsToAcp, type AcpPromptBlock } from "../acp/acpPromptInput.js";
import { NATIVE_ORDERED_INPUT_FORMAT, type NativeInputPart } from "../attachments/nativeOrderedInput.js";
import type { NativeImageInput } from "../attachments/nativeImageInput.js";
import { NATIVE_AUDIO_INPUT_FORMAT, type NativeAudioPart } from "../attachments/nativeAudioInput.js";
import { advertisesNativeAudio, materializeAcpAudio, nativeAudioPartsToAcp } from "../acp/acpAudioInput.js";
import { MAX_WIRE_LINE_BYTES } from "../wire/ndjsonFraming.js";
export * as llm from "../llm/index.js";
/** Native in-process and capability-negotiated subprocess image input. */
export { openAgentSession, resumeAgentSession, type AgentSession, type OrderedAgentSession, type AgentSessionInit } from "../agent/agentSession.js";
export { NATIVE_ORDERED_INPUT_FORMAT, snapshotNativeInputParts, type NativeInputPart } from "../attachments/nativeOrderedInput.js";
export { snapshotNativeImages, type NativeImageInput, type NativeImageMediaType } from "../attachments/nativeImageInput.js";
export { NATIVE_AUDIO_INPUT_FORMAT, snapshotNativeAudioParts, type NativeAudioInput, type NativeAudioPart, type NativeAudioMediaType } from "../attachments/nativeAudioInput.js";
export { loadNativeAudioManifest, NATIVE_AUDIO_FILE_MANIFEST_FORMAT } from "../attachments/nativeAudioFiles.js";
export { loadSessionEventHistory, SessionHistoryRefused, type SessionHistoryRefusal, type SessionEventHistory, type SessionEventHistoryOptions } from "../session/sessionEventHistory.js";
export { inspectJsonlSessionRecovery, type JsonlSessionRecoveryReadiness } from "../session/jsonlContinuation.js";
export type { NativeValidationResult, NativeValidationCheckResult, NativeValidationStatus } from "../agent/nativeValidation.js";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const STOP_REASONS = new Set(["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled"]);
const UPDATE_KINDS = new Set(["agent_message_chunk", "user_message_chunk", "tool_call", "tool_call_update"]);
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_TURN_BYTES = 8 * 1024 * 1024;
/** Hard retention ceilings, independently applied to each turn and each history replay. */
export const AMC_NATIVE_EVENT_LIMITS = Object.freeze({ maxEvents: 8192, maxBytes: MAX_TURN_BYTES });
const MAX_WRITE_QUEUE_BYTES = 8 * 1024 * 1024;
const MAX_WRITE_QUEUE_FRAMES = 64;

/** Lower the retention ceilings; no event is silently dropped when a ceiling is reached. */
export interface AMCNativeEventBufferOptions {
  readonly maxEvents?: number;
  readonly maxBytes?: number;
}

function eventLimits(options: AMCNativeEventBufferOptions = {}): Required<AMCNativeEventBufferOptions> {
  if (!object(options)) throw new AMCNativeInputError("eventBuffer must be an object");
  // Read each ceiling as unknown: the caller's object is untrusted input, so a
  // non-integer is refused here rather than narrowed away by the declared type.
  const supplied: Readonly<Record<keyof Required<AMCNativeEventBufferOptions>, unknown>> =
    { maxEvents: options.maxEvents, maxBytes: options.maxBytes };
  const limits: { maxEvents: number; maxBytes: number } = { maxEvents: AMC_NATIVE_EVENT_LIMITS.maxEvents, maxBytes: AMC_NATIVE_EVENT_LIMITS.maxBytes };
  for (const key of ["maxEvents", "maxBytes"] as const) {
    const value = supplied[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > AMC_NATIVE_EVENT_LIMITS[key]) {
      throw new AMCNativeInputError(`${key} must be an integer between 1 and ${AMC_NATIVE_EVENT_LIMITS[key]}`);
    }
    limits[key] = value;
  }
  return Object.freeze(limits);
}

/** Only called on JSON data, never media Buffers or caller-owned capability objects. */
function freezeJson<T>(value: T): T {
  const stack: unknown[] = [value];
  while (stack.length) {
    const item = stack.pop();
    if (item === null || typeof item !== "object" || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) if (child !== null && typeof child === "object") stack.push(child);
  }
  return value;
}

const asError = (error: unknown): Error => error instanceof Error ? error : new AMCNativeProtocolError("native client operation failed");

function assertSignal(signal: AbortSignal | undefined): void {
  if (signal !== undefined && (!signal || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")) {
    throw new AMCNativeInputError("Cancellation requires an AbortSignal");
  }
}

import {
  AMCNativeCancelledError, AMCNativeInputError, AMCNativeLimitError, AMCNativeProcessError, AMCNativeProtocolError, AMCNativeRefusedError
} from "./nativeAgentErrors.js";
export {
  AMCNativeCancelledError, AMCNativeInputError, AMCNativeLimitError, AMCNativeProcessError, AMCNativeProtocolError, AMCNativeRefusedError
} from "./nativeAgentErrors.js";

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
  /** Operator-owned file and explicit check IDs; ACP prompts cannot supply commands. */
  readonly validationConfig?: string;
  readonly validationConfigSha256?: string;
  readonly validate?: readonly string[];
  readonly approveTools?: string;
  readonly approveRisk?: "low" | "medium" | "high" | "critical";
  readonly mcpConfig?: string;
  readonly mcpConfigSha256?: string;
  readonly credentialsHome?: string;
  readonly credentialsFile?: string;
  /** Exclude project and user dotenv fallback in operator-owned server integrations. */
  readonly credentialsMode?: "layered" | "operator-only";
  readonly maxTokens?: number;
  /** DeepSeek-only explicit wire options; omitted thinking defaults to enabled. */
  readonly thinking?: "enabled" | "disabled";
  readonly reasoningEffort?: "low" | "high" | "max";
  readonly maxSteps?: number;
  /** Defaults to the CLI shipped in this same installed package. Never resolves another AMC from PATH. */
  readonly command?: readonly [string, ...string[]];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** Cancel process initialization before it has returned a usable client. */
  readonly startupSignal?: AbortSignal;
  /** Bounded, lossless retained updates. Overflow fails the connection, never pauses replies behind a slow iterator. */
  readonly eventBuffer?: AMCNativeEventBufferOptions;
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
  /** Public operator checks only; independent from turn completion and evidence verification. */
  readonly validation: NativeValidationResult;
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
  private cancelRequested = false;
  private readonly limits: Required<AMCNativeEventBufferOptions>;
  state: "submitted" | "receiving" | "cancel-requested" | "completed" | "failed" = "submitted";

  constructor(readonly sessionId: string, private readonly requestCancel: () => void, options: AMCNativeEventBufferOptions = {}) {
    this.limits = eventLimits(options);
    this.result = new Promise((resolve_, reject) => { this.resolveResult = resolve_; this.rejectResult = reject; });
    // Consumers may read the stream before awaiting result. Keep rejection handled until then.
    void this.result.catch(() => {});
  }

  cancel(): void {
    if (this.done || this.cancelRequested) return;
    this.cancelRequested = true;
    this.state = "cancel-requested";
    // AbortSignal listeners and iterator cleanup must not throw outside turn.result.
    try { this.requestCancel(); } catch (error) { this.fail(asError(error)); }
  }

  /** @internal */
  receive(update: AMCNativeUpdate): void {
    if (this.done) throw new AMCNativeProtocolError("received an update after the prompt result");
    const encoded = JSON.stringify(update), bytes = Buffer.byteLength(encoded);
    const overflow = this.updates.length >= this.limits.maxEvents
      ? new AMCNativeLimitError("turn-events", this.limits.maxEvents)
      : this.bytes + bytes > this.limits.maxBytes ? new AMCNativeLimitError("turn-bytes", this.limits.maxBytes) : undefined;
    if (overflow) { this.fail(overflow); throw overflow; }
    this.bytes += bytes;
    // Iteration cannot mutate the committed-block view later used to assemble result.text.
    this.updates.push(freezeJson(JSON.parse(encoded) as AMCNativeUpdate));
    if (!this.cancelRequested) this.state = "receiving";
    this.wake?.();
  }

  /** @internal */
  finish(value: JsonObject): void {
    if (this.done) return;
    if (typeof value.stopReason !== "string" || !STOP_REASONS.has(value.stopReason)) {
      const error = new AMCNativeProtocolError("native prompt returned an invalid stop reason"); this.fail(error); throw error;
    }
    if (value._meta !== undefined && !object(value._meta)) {
      const error = new AMCNativeProtocolError("native prompt returned invalid metadata"); this.fail(error); throw error;
    }
    const extension = object(value._meta) ? value._meta["dev.agentmaturity.amc"] : undefined;
    if (extension !== undefined && !object(extension)) {
      const error = new AMCNativeProtocolError("native prompt returned invalid AMC metadata"); this.fail(error); throw error;
    }
    const rawValidation = object(extension) ? extension.validation : undefined;
    const validation = rawValidation === undefined
      ? { status: "unavailable" as const, turn: null, configSha256: null, checks: [] }
      : parseNativeValidationResult(rawValidation);
    if (validation === null) {
      const error = new AMCNativeProtocolError("native prompt returned invalid validation metadata"); this.fail(error); throw error;
    }
    const text = this.updates.flatMap(({ update }) => {
      if (update.sessionUpdate !== "agent_message_chunk" || !object(update.content)) return [];
      return update.content.type === "text" && typeof update.content.text === "string" ? [update.content.text] : [];
    }).join("");
    const result: AMCNativeRunResult = freezeJson({ sessionId: this.sessionId, state: "completed" as const, stopReason: value.stopReason,
      text, updates: [...this.updates], meta: object(value._meta) ? JSON.parse(JSON.stringify(value._meta)) as JsonObject : {},
      verification: "not-verified" as const, validation });
    this.done = true; this.state = "completed";
    this.resolveResult(result);
    this.wake?.();
  }

  /** @internal */
  fail(error: Error): void {
    if (this.done) return;
    this.done = true; this.error = error; this.state = "failed"; this.rejectResult(error); this.wake?.();
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<AMCNativeUpdate> {
    if (this.iterated) throw new Error("A native turn supports one update iterator; its result retains every update.");
    this.iterated = true;
    let cursor = 0, returned = false;
    let waiting: { resolve: (value: IteratorResult<AMCNativeUpdate>) => void; reject: (error: Error) => void } | undefined;
    const pump = (): void => {
      if (!waiting) return;
      if (!returned && cursor >= this.updates.length && !this.done) return;
      const reader = waiting; waiting = undefined;
      if (this.wake === pump) this.wake = undefined;
      if (returned) reader.resolve({ done: true, value: undefined });
      else if (cursor < this.updates.length) reader.resolve({ done: false, value: this.updates[cursor++]! });
      else if (this.error) reader.reject(this.error);
      else reader.resolve({ done: true, value: undefined });
    };
    const stop = (): void => {
      if (returned) return;
      returned = true; pump();
      if (this.wake === pump) this.wake = undefined;
      if (!this.done) this.cancel();
    };
    // Unlike an async generator, return() can interrupt a pending next() even
    // when the peer is silent. At most one outstanding read retains a waiter.
    return {
      [Symbol.asyncIterator]() { return this; },
      next: () => {
        if (waiting) return Promise.reject(new AMCNativeProtocolError("Only one native update read may be pending"));
        return new Promise<IteratorResult<AMCNativeUpdate>>((resolve_, reject) => {
          waiting = { resolve: resolve_, reject }; this.wake = pump; pump();
        });
      },
      return: async () => { stop(); return { done: true, value: undefined }; },
      throw: async (error?: unknown) => { stop(); throw error; }
    };
  }
}

export class AMCNativeSession {
  readonly state = "accepted" as const;
  private released = false;
  private releasePromise: Promise<void> | undefined;
  constructor(private readonly client: AMCNativeClient, readonly sessionId: string,
    readonly history: readonly AMCNativeUpdate[] = []) {}
  /** Local handle lifecycle only, not a signed writer or evidence verdict. */
  get lifecycle(): "accepted" | "releasing" | "released" | "closed" {
    return this.released ? "released" : this.client.processClosed ? "closed" : this.releasePromise ? "releasing" : "accepted";
  }
  private assertUsable(): void {
    if (this.released) throw new AMCNativeInputError("This session handle has been released; use the handle returned by resumeSession");
    if (this.releasePromise) throw new AMCNativeInputError("Wait for writer release before starting another operation");
  }
  prompt(text: string, options: { readonly signal?: AbortSignal; readonly images?: readonly NativeImageInput[] } = {}): AMCNativeTurn {
    this.assertUsable();
    return this.client.promptSession(this.sessionId, text, options.signal, options.images);
  }
  promptParts(parts: readonly NativeInputPart[], options: { readonly signal?: AbortSignal } = {}): AMCNativeTurn {
    this.assertUsable();
    return this.client.promptSessionParts(this.sessionId, parts, options.signal);
  }
  promptAudioParts(parts: readonly NativeAudioPart[], options: { readonly signal?: AbortSignal } = {}): AMCNativeTurn {
    this.assertUsable();
    return this.client.promptSessionAudioParts(this.sessionId, parts, options.signal);
  }
  /** Closing the owned agent seals all its sessions before a fresh verifier reads the ledger. */
  async closeAndVerify(): Promise<AMCNativeReceipt> {
    this.assertUsable();
    await this.client.close();
    return this.client.verifySession(this.sessionId);
  }
  /** Relinquish the signed writer without sealing, for a later verified session load. */
  release(): Promise<void> {
    if (this.released) return Promise.resolve();
    if (this.releasePromise) return this.releasePromise;
    this.releasePromise = this.client.releaseSession(this.sessionId).then(() => { this.released = true; }, error => {
      this.releasePromise = undefined; throw error;
    });
    return this.releasePromise;
  }
}

interface PendingRequest {
  readonly loadingSessionId?: string;
  readonly promptSessionId?: string;
  readonly resolve: (value: JsonObject) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Local operator client. This spawns the governed ACP runtime; it does not turn a bridge lease into execution authority. */
export class AMCNativeClient {
  readonly workspace: string;
  readonly protocolVersion = 1;
  agentInfo: Readonly<Record<string, unknown>> = {};
  capabilities: Readonly<Record<string, unknown>> = {};
  private negotiatedCapabilities: Readonly<JsonObject> = Object.freeze({});
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly command: readonly [string, ...string[]];
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeout: number;
  private readonly limits: Required<AMCNativeEventBufferOptions>;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly sessions = new Set<string>();
  private readonly turns = new Map<string, AMCNativeTurn>();
  private readonly loading = new Map<string, { updates: AMCNativeUpdate[]; bytes: number }>();
  private readonly releasing = new Set<string>();
  private nextId = 1;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly outbound: { readonly line: string; readonly bytes: number }[] = [];
  private outboundBytes = 0;
  private writeBlocked = false;
  private fatal: Error | undefined;
  private closing = false;
  private closed = false;
  private exitDetails: Readonly<{ exitCode: number | null; signal: NodeJS.Signals | null }> | undefined;
  private closePromise: Promise<void> | undefined;
  private readonly childClosed: Promise<void>;

  /**
   * True only after Node observed the owned ACP child's actual close event.
   * A timeout, requested cancellation or a broken pipe is not process closure.
   * This says nothing about a signed release, task success, or tool side effects.
   */
  get processClosed(): boolean { return this.closed; }
  /** Actual close-event details, also available when an earlier pipe error caused failure. */
  get processExit(): Readonly<{ exitCode: number | null; signal: NodeJS.Signals | null }> | undefined { return this.exitDetails; }
  get state(): "open" | "closing" | "closed" | "failed" {
    return this.fatal ? "failed" : this.closed ? "closed" : this.closing ? "closing" : "open";
  }

  private constructor(options: AMCNativeClientOptions) {
    if (typeof options.workspace !== "string" || !options.workspace.trim() || options.workspace.includes("\0")) {
      throw new AMCNativeInputError("Choose an explicit native workspace directory");
    }
    if (typeof options.provider !== "string" || !options.provider.trim() || options.provider.includes("\0")
      || (options.model !== undefined && (typeof options.model !== "string" || !options.model.trim() || options.model.includes("\0")))
      || (options.provider !== "stub" && !options.model)) {
      throw new AMCNativeInputError("Choose an explicit provider and an accessible model; stub is a local demonstration.");
    }
    if (options.provider === "deepseek") {
      deepseekParams({ max_tokens: options.maxTokens ?? 512,
        ...(options.thinking === undefined ? {} : { thinking: { type: options.thinking } }),
        ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }) });
    } else if (options.thinking !== undefined || options.reasoningEffort !== undefined) {
      throw new Error("Native thinking/reasoningEffort options require provider deepseek; unused options are not ignored.");
    }
    // The child reports its physical process.cwd(). Pin that same directory,
    // so an authorized symlink alias is not mistaken for a second root.
    this.workspace = realpathSync(resolve(options.workspace));
    this.timeout = options.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(this.timeout) || this.timeout <= 0 || this.timeout > 2_147_483_647) {
      throw new AMCNativeInputError("timeoutMs must be a positive integer no greater than 2147483647");
    }
    this.limits = eventLimits(options.eventBuffer);
    for (const bound of [options.maxTokens, options.maxSteps]) {
      if (bound !== undefined && (!Number.isSafeInteger(bound) || bound <= 0)) throw new Error("Native token/step bounds must be positive integers");
    }
    const command = options.command ?? [process.execPath, fileURLToPath(new URL("../cli.js", import.meta.url))];
    if (!Array.isArray(command) || command.length === 0 || typeof command[0] !== "string" || !command[0].trim()
      || Array.from(command).some(value => typeof value !== "string" || value.includes("\0"))) {
      throw new AMCNativeInputError("command must contain an executable followed by string arguments, without a shell");
    }
    // The cold verifier must use the very same pinned executable, even if the caller edits its options array.
    this.command = Object.freeze([...command]) as readonly [string, ...string[]];
    this.env = { ...process.env, ...options.env };
    const args = [...this.command.slice(1), "acp", "--provider", options.provider];
    for (const [flag, value] of [["--model", options.model], ["--credential", options.credential],
      ["--base-url", options.baseUrl], ["--agent-id", options.agentId], ["--tools", options.tools],
      ["--expected-tools-digest", options.expectedToolsDigest],
      ["--validation-config", options.validationConfig], ["--validation-config-sha256", options.validationConfigSha256],
      ["--approve-tools", options.approveTools], ["--approve-risk", options.approveRisk],
      ["--mcp-config", options.mcpConfig], ["--mcp-config-sha256", options.mcpConfigSha256],
      ["--credentials-home", options.credentialsHome], ["--credentials-file", options.credentialsFile],
      ["--credentials-mode", options.credentialsMode],
      ["--thinking", options.thinking], ["--reasoning-effort", options.reasoningEffort],
      ["--max-tokens", options.maxTokens], ["--max-steps", options.maxSteps]] as const) {
      if (value !== undefined) args.push(flag, String(value));
    }
    if (options.validate !== undefined) {
      if (!Array.isArray(options.validate) || options.validate.length < 1 || options.validate.length > 8
        || new Set(options.validate).size !== options.validate.length
        || options.validate.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))) throw new AMCNativeInputError("Select one through eight distinct public validation check IDs.");
      for (const id of options.validate) args.push("--validate", id);
    }
    if ((options.validate !== undefined || options.validationConfigSha256 !== undefined) && !options.validationConfig)
      throw new Error("Public validation requires an explicit operator config file.");
    this.child = spawn(this.command[0], args, { cwd: this.workspace, env: this.env, stdio: "pipe", shell: false });
    this.childClosed = new Promise((resolve_) => {
      this.child.once("close", (code, signal) => { this.closed = true; resolve_();
        this.exitDetails = Object.freeze({ exitCode: code, signal });
        if (this.buffer.length) this.fail(new AMCNativeProtocolError("native agent closed with an incomplete protocol frame"));
        else if (!this.closing || this.pending.size > 0 || code !== 0 || signal !== null) {
          this.fail(new AMCNativeProcessError("native agent closed unexpectedly or before all requests completed", code, signal));
        }
      });
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.ingest(chunk));
    this.child.stdout.on("error", () => this.fail(new AMCNativeProtocolError("native agent output failed")));
    this.child.stdout.once("end", () => {
      if (!this.closing && !this.closed) this.fail(new AMCNativeProtocolError("native agent output closed before client shutdown"));
    });
    // Drain diagnostics without copying potentially sensitive provider output into errors or receipts.
    this.child.stderr.resume();
    this.child.stderr.on("error", () => { /* Diagnostics are not execution or evidence authority. */ });
    this.child.on("error", () => this.fail(new AMCNativeProtocolError("could not start the installed AMC runtime")));
    this.child.stdin.on("error", () => this.fail(new AMCNativeProtocolError("native agent input closed")));
    this.child.stdin.on("drain", () => { this.writeBlocked = false; this.flushWrites(); });
  }

  static async start(options: AMCNativeClientOptions): Promise<AMCNativeClient> {
    if (!object(options)) throw new AMCNativeInputError("Native client options must be an object");
    const signal = options.startupSignal;
    assertSignal(signal);
    if (signal?.aborted) throw new AMCNativeCancelledError("native client startup was cancelled");
    const client = new AMCNativeClient(options);
    const abort = () => client.fail(new AMCNativeCancelledError("native client startup was cancelled"));
    try {
      signal?.addEventListener("abort", abort, { once: true });
      const result = await client.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
      if (result.protocolVersion !== 1 || !object(result.agentInfo) || result.agentInfo.name !== "agent-maturity-compass"
        || !object(result.agentCapabilities)) throw new AMCNativeProtocolError("unsupported native agent identity or protocol");
      if (signal?.aborted) throw new AMCNativeCancelledError("native client startup was cancelled");
      client.assertAvailable();
      client.agentInfo = freezeJson(result.agentInfo);
      client.negotiatedCapabilities = freezeJson(result.agentCapabilities);
      client.capabilities = client.negotiatedCapabilities;
      return client;
    } catch (error) { await client.close(); throw error; }
    finally { signal?.removeEventListener("abort", abort); }
  }

  async newSession(): Promise<AMCNativeSession> {
    const result = await this.request("session/new", { cwd: this.workspace, mcpServers: [] });
    this.assertAvailable();
    if (typeof result.sessionId !== "string" || !result.sessionId.trim() || this.sessions.has(result.sessionId)
      || this.loading.has(result.sessionId)) {
      const error = new AMCNativeProtocolError("native agent returned an invalid or repeated session identity");
      this.fail(error); throw error;
    }
    this.sessions.add(result.sessionId);
    return new AMCNativeSession(this, result.sessionId);
  }

  /** A peer must advertise verified loading. Never substitute a new session for a failed resume. */
  async resumeSession(sessionId: string): Promise<AMCNativeSession> {
    this.assertAvailable();
    if (this.negotiatedCapabilities.loadSession !== true) throw new AMCNativeRefusedError(-32601,
      "This installed ACP runtime does not support session loading. Use the native CLI resume workflow.");
    if (typeof sessionId !== "string" || !sessionId.trim() || this.sessions.has(sessionId)) {
      throw new AMCNativeInputError("Choose an existing session not already open in this client");
    }
    if (this.loading.has(sessionId)) throw new Error("Session loading is already in progress");
    const history = { updates: [] as AMCNativeUpdate[], bytes: 0 };
    this.loading.set(sessionId, history);
    try {
      await this.request("session/load", { sessionId, cwd: this.workspace, mcpServers: [] });
      this.assertAvailable();
      this.sessions.add(sessionId);
      return new AMCNativeSession(this, sessionId, Object.freeze([...history.updates]));
    } finally { this.loading.delete(sessionId); }
  }

  /** @internal */
  async releaseSession(sessionId: string): Promise<void> {
    this.assertAvailable();
    if (!this.sessions.has(sessionId)) throw new Error("Session is not owned by this client");
    if (this.turns.has(sessionId)) throw new Error("Wait for the active prompt before releasing its writer");
    if (this.releasing.has(sessionId)) throw new Error("Writer release is already in progress");
    const meta = this.negotiatedCapabilities._meta;
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
  promptSession(sessionId: string, text: string, signal?: AbortSignal, images?: readonly NativeImageInput[]): AMCNativeTurn {
    this.assertPromptSlot(sessionId, signal);
    if (typeof text !== "string" || Buffer.from(text, "utf8").toString("utf8") !== text) {
      throw new AMCNativeInputError("Prompt text must be a losslessly representable UTF-8 string");
    }
    const imageBlocks = nativeImagesToAcp(images);
    if (!text.trim() && !imageBlocks.length) throw new Error("A prompt must contain text or a supported image");
    const capabilities = this.negotiatedCapabilities.promptCapabilities;
    if (imageBlocks.length && (!object(capabilities) || capabilities.image !== true)) {
      throw new AMCNativeRefusedError(-32602, "The selected ACP runtime does not advertise image input; choose a supported route or remove the images. No fallback was used.");
    }
    return this.submitPrompt(sessionId, [{ type: "text", text }, ...imageBlocks], signal);
  }

  /** @internal */
  promptSessionParts(sessionId: string, parts: readonly NativeInputPart[], signal?: AbortSignal): AMCNativeTurn {
    this.assertPromptSlot(sessionId, signal);
    const blocks = nativePartsToAcp(parts); // Synchronous original-byte snapshot.
    const meta = this.negotiatedCapabilities._meta;
    const extension = object(meta) ? meta["dev.agentmaturity.amc"] : undefined;
    const capabilities = this.negotiatedCapabilities.promptCapabilities;
    if (!object(extension) || extension.orderedImageInput !== NATIVE_ORDERED_INPUT_FORMAT
        || !object(capabilities) || capabilities.image !== true) {
      throw new AMCNativeRefusedError(-32602, "The selected ACP runtime does not advertise amc-image-input@2; ordered content was not submitted or flattened.");
    }
    return this.submitPrompt(sessionId, blocks, signal, NATIVE_ORDERED_INPUT_FORMAT);
  }

  private assertPromptSlot(sessionId: string, signal?: AbortSignal): void {
    this.assertAvailable();
    assertSignal(signal);
    if (!this.sessions.has(sessionId)) throw new Error("Session is not owned by this client");
    if (this.releasing.has(sessionId)) throw new Error("Wait for writer release before starting another operation");
    if (this.turns.has(sessionId)) throw new Error("A prompt is already active in this session");
    if (signal?.aborted) throw new AMCNativeCancelledError("Prompt was cancelled before submission");
  }

  /** @internal Exact version negotiation precedes submission; snapshot precedes async work. */
  promptSessionAudioParts(sessionId: string, parts: readonly NativeAudioPart[], signal?: AbortSignal): AMCNativeTurn {
    this.assertPromptSlot(sessionId, signal);
    const blocks = nativeAudioPartsToAcp(parts);
    const capabilities = this.negotiatedCapabilities.promptCapabilities;
    if (!advertisesNativeAudio(this.negotiatedCapabilities) || (blocks.some(block => block.type === "image")
        && (!object(capabilities) || capabilities.image !== true))) {
      throw new AMCNativeRefusedError(-32602, "The selected ACP runtime does not advertise the exact amc-audio-input@1 Gemini v2/WAV contract; original content was not submitted, flattened or converted.");
    }
    return this.submitPrompt(sessionId, blocks, signal, NATIVE_AUDIO_INPUT_FORMAT);
  }

  private submitPrompt(sessionId: string, prompt: readonly AcpPromptBlock[], signal?: AbortSignal, inputFormat?: typeof NATIVE_ORDERED_INPUT_FORMAT | typeof NATIVE_AUDIO_INPUT_FORMAT): AMCNativeTurn {
    if (signal?.aborted) throw new AMCNativeCancelledError("Prompt was cancelled before submission");
    const turn: AMCNativeTurn = new AMCNativeTurn(sessionId, () => {
      // A reply may already have retired this turn while the caller is waking
      // from its final update. Do not cancel a subsequent turn with the same ID.
      if (this.turns.get(sessionId) !== turn) return;
      try { this.notify("session/cancel", { sessionId }); }
      catch (error) { this.fail(asError(error)); throw error; }
    }, this.limits);
    this.turns.set(sessionId, turn);
    const abort = () => turn.cancel();
    try { signal?.addEventListener("abort", abort, { once: true }); }
    catch (error) { this.turns.delete(sessionId); turn.fail(asError(error)); throw error; }
    const settle = () => {
      if (this.turns.get(sessionId) === turn) this.turns.delete(sessionId);
      signal?.removeEventListener("abort", abort);
    };
    void this.request("session/prompt", { sessionId, prompt,
      ...(inputFormat === undefined ? {} : { _meta: { "dev.agentmaturity.amc": { inputFormat } } }) })
      .then((result) => {
        settle();
        if (this.fatal) { turn.fail(this.fatal); return; }
        try { turn.finish(result); }
        catch (error) { const failure = asError(error); turn.fail(failure); this.fail(failure); }
      }, (error: Error) => { settle(); turn.fail(error); });
    return turn;
  }

  private assertAvailable(): void {
    if (this.fatal) throw this.fatal;
    if (this.closing || this.closed) throw new AMCNativeProtocolError("native client is closed");
  }

  private write(frame: JsonObject): void {
    this.assertAvailable();
    const line = JSON.stringify(frame) + "\n";
    const bytes = Buffer.byteLength(line);
    if (bytes - 1 > MAX_WIRE_LINE_BYTES) throw new AMCNativeProtocolError("native request exceeds the ACP ingress frame limit (256 KiB including JSON/base64 overhead)");
    if (this.outbound.length >= MAX_WRITE_QUEUE_FRAMES) throw new AMCNativeLimitError("write-queue", MAX_WRITE_QUEUE_FRAMES);
    if (this.outboundBytes + this.child.stdin.writableLength + bytes > MAX_WRITE_QUEUE_BYTES) {
      throw new AMCNativeLimitError("write-queue", MAX_WRITE_QUEUE_BYTES);
    }
    this.outbound.push({ line, bytes }); this.outboundBytes += bytes;
    this.flushWrites();
  }

  private flushWrites(): void {
    if (this.fatal || this.closed) return;
    try {
      while (!this.writeBlocked && this.outbound.length) {
        const frame = this.outbound.shift()!; this.outboundBytes -= frame.bytes;
        this.writeBlocked = !this.child.stdin.write(frame.line, (error?: Error | null) => {
          if (error) this.fail(new AMCNativeProtocolError("native agent input write failed"));
        });
        if (this.fatal) return;
      }
      if (this.closing && !this.outbound.length && !this.child.stdin.writableEnded) this.child.stdin.end();
    } catch { this.fail(new AMCNativeProtocolError("native agent input write failed")); }
  }

  private request(method: string, params: JsonObject): Promise<JsonObject> {
    if (this.pending.size >= 32) return Promise.reject(new AMCNativeProtocolError("too many native requests are outstanding"));
    const id = this.nextId++;
    return new Promise((resolve_, reject) => {
      const timer = setTimeout(() => this.fail(new AMCNativeProtocolError(`native request timed out: ${method}`)), this.timeout);
      this.pending.set(id, { resolve: resolve_, reject, timer,
        ...(method === "session/load" && typeof params.sessionId === "string" ? { loadingSessionId: params.sessionId } : {}),
        ...(method === "session/prompt" && typeof params.sessionId === "string" ? { promptSessionId: params.sessionId } : {}) });
      try { this.write({ jsonrpc: "2.0", id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private ingest(chunk: Buffer): void {
    if (this.fatal) return;
    try {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf(10)) !== -1) {
        const bytes = this.buffer.subarray(0, newline); this.buffer = this.buffer.subarray(newline + 1);
        if (bytes.length > MAX_FRAME_BYTES) throw new Error("frame limit");
        const line = this.decoder.decode(bytes);
        if (!line.trim()) continue;
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
          if (["agent_message_chunk", "user_message_chunk"].includes(update.sessionUpdate as string)) {
            if (!object(update.content)) throw new Error("invalid message update");
            if (loading && update.sessionUpdate === "user_message_chunk" && update.content.type === "image") {
              const capabilities = this.negotiatedCapabilities.promptCapabilities;
              if (!object(capabilities) || capabilities.image !== true) throw new Error("unnegotiated image history");
              materializeAcpImages([update.content as unknown as AcpPromptBlock]);
            } else if (loading && update.sessionUpdate === "user_message_chunk" && update.content.type === "audio") {
              if (!advertisesNativeAudio(this.negotiatedCapabilities)) throw new Error("unnegotiated audio history");
              materializeAcpAudio(update.content as unknown as AcpPromptBlock);
            } else if (update.content.type !== "text" || typeof update.content.text !== "string") throw new Error("invalid text update");
            if (!loading && update.sessionUpdate === "user_message_chunk") throw new Error("unsolicited user update");
          }
          if (["tool_call", "tool_call_update"].includes(update.sessionUpdate as string)
            && (typeof update.toolCallId !== "string" || !update.toolCallId
              || (update.status !== undefined && !["pending", "in_progress", "completed", "failed"].includes(update.status as string)))) {
            throw new Error("invalid tool update");
          }
          const event = { sessionId: frame.params.sessionId, update: update as AMCNativeUpdate["update"] };
          if (loading) {
            if (loading.updates.length >= this.limits.maxEvents) throw new AMCNativeLimitError("history-events", this.limits.maxEvents);
            const bytes = Buffer.byteLength(JSON.stringify(event));
            if (loading.bytes + bytes > this.limits.maxBytes) throw new AMCNativeLimitError("history-bytes", this.limits.maxBytes);
            loading.bytes += bytes;
            loading.updates.push(freezeJson(event));
          } else { turn!.receive(event); }
          continue;
        }
        if (typeof frame.id !== "number" || !Number.isSafeInteger(frame.id) || frame.method !== undefined) throw new Error("unsolicited frame");
        const pending = this.pending.get(frame.id);
        if (!pending || (frame.result === undefined) === (frame.error === undefined)) throw new Error("uncorrelated reply");
        // End the replay window on the reader, not a later promise continuation:
        // a late image in the same pipe chunk must not become accepted history.
        if (pending.loadingSessionId !== undefined) this.loading.delete(pending.loadingSessionId);
        // Likewise retire a prompt on the reader, on success AND refusal. A
        // same-chunk late update must never become output of this or a later turn.
        if (pending.promptSessionId !== undefined) this.turns.delete(pending.promptSessionId);
        if (frame.error !== undefined) {
          if (!object(frame.error) || !Number.isInteger(frame.error.code) || typeof frame.error.message !== "string") throw new Error("invalid error");
          clearTimeout(pending.timer); this.pending.delete(frame.id);
          pending.reject(new AMCNativeRefusedError(frame.error.code as number, frame.error.message, frame.error.data));
        } else {
          if (!object(frame.result)) throw new Error("invalid result");
          clearTimeout(pending.timer); this.pending.delete(frame.id); pending.resolve(frame.result);
        }
      }
      if (this.buffer.length > MAX_FRAME_BYTES) throw new Error("unterminated frame limit");
    } catch (error) {
      this.fail(error instanceof AMCNativeProtocolError ? error : new AMCNativeProtocolError("native agent emitted an invalid or uncorrelated protocol frame"));
    }
  }

  private fail(error: Error): void {
    if (this.fatal) return;
    this.fatal = error;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    for (const turn of this.turns.values()) turn.fail(error);
    this.turns.clear(); this.loading.clear();
    this.outbound.length = 0; this.outboundBytes = 0; this.buffer = Buffer.alloc(0);
    this.child.stdin.destroy();
    if (!this.closed) this.child.kill("SIGTERM");
    // A broken peer cannot leave an orphan merely because the consumer has not reached finally yet.
    void this.close();
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    // Publish the promise before cancellation callbacks can re-enter close().
    let resolveClose!: () => void, rejectClose!: (error: unknown) => void;
    this.closePromise = new Promise<void>((resolve_, reject) => { resolveClose = resolve_; rejectClose = reject; });
    void this.closeOwnedChild().then(resolveClose, rejectClose);
    return this.closePromise;
  }

  private async closeOwnedChild(): Promise<void> {
    if (this.closed) return;
    for (const turn of this.turns.values()) { try { turn.cancel(); } catch { /* failed pipe is already recorded */ } }
    this.closing = true;
    // Drain only already accepted frames, in order, including cancellation. Never
    // call end() ahead of an application-queued prompt when stdin is backpressured.
    this.flushWrites();
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
      child.stdin.on("error", () => { failure ??= new AMCNativeProtocolError("native verifier input failed"); child.kill("SIGKILL"); });
      child.stdout.on("error", () => { failure ??= new AMCNativeProtocolError("native verifier output failed"); child.kill("SIGKILL"); });
      child.stderr.on("error", () => { /* Do not publish verifier diagnostics. */ });
      child.stdin.end(); child.stderr.resume(); child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (failure) return;
        if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > MAX_TURN_BYTES) {
          failure = new AMCNativeProtocolError("native verifier exceeded the output limit"); child.kill("SIGKILL"); return;
        }
        stdout += chunk;
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
