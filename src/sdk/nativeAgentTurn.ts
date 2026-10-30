import type { AMCNativeRunResult, AMCNativeUpdate } from "./nativeAgentClient.js";
import { parseNativeValidationResult } from "../agent/nativeValidationResult.js";
import { parseExecutionStatus } from "../execution/executionContract.js";
import { AMCNativeLimitError, AMCNativeProtocolError, AMCNativeResyncRequiredError } from "./nativeAgentErrors.js";
import { asError, eventLimits, freezeJson, object, STOP_REASONS, type AMCNativeEventBufferOptions, type JsonObject } from "./nativeWire.js";

/** One prompt in flight. Cancelling requests a stop; only the result establishes its outcome. @public */
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
  private resyncError: AMCNativeResyncRequiredError | undefined;
  get resyncRequired(): boolean { return this.resyncError !== undefined; }
  private readonly limits: Required<AMCNativeEventBufferOptions>;
  state: "submitted" | "receiving" | "resync-required" | "cancel-requested" | "completed" | "failed" = "submitted";

  /** @internal */ constructor(readonly sessionId: string, private readonly requestCancel: () => void, options: AMCNativeEventBufferOptions = {}, private readonly allowResync = false) {
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
    if (this.resyncError) return; // The explicit recovery marker replaces an unbounded live backlog.
    const encoded = JSON.stringify(update), bytes = Buffer.byteLength(encoded);
    const overflow = this.updates.length >= this.limits.maxEvents
      ? new AMCNativeLimitError("turn-events", this.limits.maxEvents)
      : this.bytes + bytes > this.limits.maxBytes ? new AMCNativeLimitError("turn-bytes", this.limits.maxBytes) : undefined;
    if (overflow) {
      if (this.allowResync) {
        this.resyncError = new AMCNativeResyncRequiredError(this.sessionId, overflow.resource as "turn-events" | "turn-bytes", overflow.limit);
        if (!this.cancelRequested) this.state = "resync-required";
        this.wake?.(); return;
      }
      this.fail(overflow); throw overflow;
    }
    this.bytes += bytes;
    // Iteration cannot mutate the committed-block view later used to assemble result.text.
    this.updates.push(freezeJson(JSON.parse(encoded) as AMCNativeUpdate));
    if (!this.cancelRequested) this.state = "receiving";
    this.wake?.();
  }

  /** @internal */
  get retainedTextPrefix(): string {
    return this.updates.flatMap(({ update }) => update.sessionUpdate === "agent_message_chunk" && object(update.content)
      && update.content.type === "text" && typeof update.content.text === "string" ? [update.content.text] : []).join("");
  }

  /** @internal */
  finish(value: JsonObject, recovered?: { readonly text: string; readonly cursor: string }): void {
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
    const execution = object(extension) && extension.execution !== undefined ? parseExecutionStatus(extension.execution) : null;
    if (object(extension) && extension.execution !== undefined && (execution === null || execution.sessionId !== this.sessionId)) {
      const error = new AMCNativeProtocolError("native prompt returned invalid execution metadata"); this.fail(error); throw error;
    }
    const validation = rawValidation === undefined
      ? { status: "unavailable" as const, turn: null, configSha256: null, checks: [] }
      : parseNativeValidationResult(rawValidation);
    if (validation === null) {
      const error = new AMCNativeProtocolError("native prompt returned invalid validation metadata"); this.fail(error); throw error;
    }
    const text = recovered?.text ?? this.retainedTextPrefix;
    const result: AMCNativeRunResult = freezeJson({ sessionId: this.sessionId, state: "completed" as const, stopReason: value.stopReason,
      text, updates: [...this.updates], meta: object(value._meta) ? JSON.parse(JSON.stringify(value._meta)) as JsonObject : {},
      verification: "not-verified" as const, execution, validation,
      ...(recovered === undefined ? {} : { resynced: true as const,
        recovery: { cursor: recovered.cursor, updatesComplete: false as const, retainedUpdates: "bounded-prefix" as const } }) });
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
      if (!returned && cursor >= this.updates.length && !this.done && !this.resyncError) return;
      const reader = waiting; waiting = undefined;
      if (this.wake === pump) this.wake = undefined;
      if (returned) reader.resolve({ done: true, value: undefined });
      else if (cursor < this.updates.length) reader.resolve({ done: false, value: this.updates[cursor++]! });
      else if (this.error) reader.reject(this.error);
      else if (this.resyncError) reader.reject(this.resyncError);
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

