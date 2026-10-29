import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OutputCollector } from "../exec/outputCollector.js";
import { defineTool } from "../tools/toolRegistry.js";
import type { ToolBodyResult, ToolDefinition, ToolExecution } from "../tools/toolTypes.js";
import { NativeTerminalHost, type NativeTerminalHostOptions } from "./nativeTerminal.js";
import type { TerminalSession } from "./terminalSession.js";
import type { TerminalExit } from "./terminalTypes.js";

type OwnerStep = NonNullable<ToolExecution["ownerStep"]>;
interface TerminalRecord {
  readonly id: string;
  readonly owner: string;
  readonly ownerStep?: OwnerStep;
  readonly label: string;
  readonly session: TerminalSession;
  readonly output: OutputCollector;
  cols: number;
  rows: number;
  revision: number;
  exit: TerminalExit | null;
}

export interface NativeTerminalToolsOptions {
  readonly workspace: string;
  readonly sessionId: () => string;
  /** Explicit host interactive authority; an argv-bound bash approval is never substituted. */
  readonly native?: NativeTerminalHostOptions;
  readonly maxActive?: number;
  readonly maxRetained?: number;
  readonly maxOutputBytes?: number;
  readonly cleanupGraceMs?: number;
}

class TerminalAdmissionError extends Error {}

class TerminalAccessError extends Error {
  constructor() { super("No terminal is available to this session for that handle."); }
}

const handle = z.string().min(1).max(200);
const dimensions = { cols: z.number().int().min(1).max(1000).default(80), rows: z.number().int().min(1).max(1000).default(24) };
const openArgs = z.strictObject({ label: z.string().min(1).max(200).default("interactive terminal"), ...dimensions,
  timeoutMs: z.number().int().positive().max(600_000).default(300_000) });
const idArgs = z.strictObject({ terminal_id: handle });
const readArgs = z.strictObject({ terminal_id: handle, offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  count: z.number().int().positive().max(65_536).default(8192), revision: z.number().int().nonnegative().optional() });
const sendArgs = z.strictObject({ terminal_id: handle, text: z.string().min(1).max(16_384), submit: z.boolean().default(true) });
const resizeArgs = z.strictObject({ terminal_id: handle, ...dimensions });
const signalArgs = z.strictObject({ terminal_id: handle, signal: z.enum(["SIGINT", "SIGTERM"]) });
const unknown = "TOOL_OUTCOME_UNKNOWN";

/** Session-owned native PTYs, composed by both the kernel facade and native toolset. */
export class NativeTerminalTools {
  private readonly host: NativeTerminalHost;
  private readonly records = new Map<string, TerminalRecord>();
  private readonly activeLimit: number;
  private readonly retainedLimit: number;
  private readonly outputLimit: number;
  private readonly graceMs: number;
  private opening = 0;
  private readonly pendingOpen = new Set<Promise<void>>();
  private disposed = false;
  private disposal: Promise<boolean> | undefined;

  constructor(private readonly options: NativeTerminalToolsOptions) {
    this.activeLimit = options.maxActive ?? 4;
    this.retainedLimit = options.maxRetained ?? 8;
    this.outputLimit = options.maxOutputBytes ?? 262_144;
    this.graceMs = options.cleanupGraceMs ?? 3000;
    for (const [name, value, limit] of [["maxActive", this.activeLimit, 32], ["maxRetained", this.retainedLimit, 128],
      ["maxOutputBytes", this.outputLimit, 1_048_576], ["cleanupGraceMs", this.graceMs, 10_000]] as const) {
      if (!Number.isSafeInteger(value) || value < 1 || value > limit) throw new RangeError(`Invalid terminal ${name}.`);
    }
    this.host = new NativeTerminalHost(options.native);
  }

  support(): ReturnType<NativeTerminalHost["support"]> { return this.host.support(); }
  get openCount(): number { return this.host.openCount; }
  hasOwnedWork(): boolean { return this.opening > 0 || [...this.records.values()].some(record => !record.exit?.treeExitProven); }

  private own(id: string): TerminalRecord {
    const record = this.records.get(id);
    if (!record || record.owner !== this.options.sessionId()) throw new TerminalAccessError();
    return record;
  }

  private view(record: TerminalRecord): Record<string, unknown> {
    return { terminal_id: record.id, label: record.label, ownerSession: record.owner,
      ownerStep: record.ownerStep ?? null, state: record.session.state, cols: record.cols, rows: record.rows,
      cleanupConfirmed: record.exit?.treeExitProven ?? false, exit: record.exit,
      outcome: record.exit?.treeExitProven ? "exited" : unknown };
  }

  private trim(): void {
    const settled = [...this.records.values()].filter(record => record.exit?.treeExitProven);
    for (const record of settled.slice(0, Math.max(0, settled.length - this.retainedLimit))) this.records.delete(record.id);
  }

  private async launch(options: Parameters<NativeTerminalHost["open"]>[0], label: string, ownerStep?: OwnerStep): Promise<TerminalRecord> {
    if (this.disposed) throw new TerminalAdmissionError("The terminal service is disposed.");
    if (options.workspace !== this.options.workspace) throw new TerminalAdmissionError("The terminal workspace does not match its composed scope.");
    if (options.signal?.aborted) throw new TerminalAdmissionError("The terminal launch was cancelled before admission.");
    const support = this.support();
    if (!support.prerequisitesAvailable) throw new TerminalAdmissionError(support.reason);
    if (!this.options.native?.authorize) throw new TerminalAdmissionError("Interactive PTY access requires an explicit host authorizer; a bash approval is not an interactive grant.");
    const owner = this.options.sessionId();
    if (!owner || ownerStep && ownerStep.sessionId !== owner) throw new TerminalAdmissionError("The terminal call does not belong to the composed session.");
    // A stop request does not free this reservation. Unknown cleanup blocks a successor.
    // The shared runtime can follow a fork to another session id. Old unresolved owners still consume capacity.
    if (this.opening + [...this.records.values()].filter(record => !record.exit?.treeExitProven).length >= this.activeLimit) {
      throw new TerminalAdmissionError("The shared session runtime's active terminal quota is exhausted; observed cleanup is required before another launch.");
    }
    this.opening++;
    let finishOpen!: () => void;
    const pending = new Promise<void>(resolve => { finishOpen = resolve; });
    this.pendingOpen.add(pending);
    try {
      const session = await this.host.open(options);
      const record: TerminalRecord = { id: `terminal-${randomUUID()}`, owner, ...(ownerStep ? { ownerStep: Object.freeze({ ...ownerStep }) } : {}), label,
        session, output: new OutputCollector(this.outputLimit, []), cols: options.cols ?? 80, rows: options.rows ?? 24, revision: 0, exit: null };
      this.records.set(record.id, record);
      session.onData(text => { record.output.push(Buffer.from(text, "utf8")); record.revision++; });
      void session.done.then(exit => { record.output.end(); record.exit = exit; record.revision++; this.trim(); });
      // Disposal or a fork changing session identity while authorization was pending cannot transfer the PTY.
      if (this.disposed || this.options.sessionId() !== owner || options.signal?.aborted) {
        session.dispose();
        throw new Error("The terminal owner ended while launch was pending.");
      }
      try { await session.ready; } catch (error) { session.dispose(); throw error; }
      if (this.disposed || this.options.sessionId() !== owner || options.signal?.aborted) {
        session.dispose();
        throw new Error("The terminal owner ended before readiness.");
      }
      return record;
    } finally { this.opening--; this.pendingOpen.delete(pending); finishOpen(); }
  }

  /** Trusted kernel caller; model tools additionally bind the originating session step. */
  async openInteractive(options: Parameters<NativeTerminalHost["open"]>[0]): Promise<TerminalSession> {
    return (await this.launch(options, "interactive terminal")).session;
  }

  closeSession(session: TerminalSession): void {
    if ([...this.records.values()].some(record => record.session === session)) this.host.close(session);
  }

  private async observeClose(record: TerminalRecord): Promise<boolean> {
    this.host.close(record.session);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([record.session.done, new Promise<void>(resolve => { timer = setTimeout(resolve, this.graceMs); })]);
      return record.exit?.treeExitProven ?? false;
    } finally { if (timer) clearTimeout(timer); }
  }

  /** Finite pre-seal cleanup. False is explicit unknown, never clean disposal. */
  dispose(): Promise<boolean> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.host.dispose();
    this.disposal = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Pending authorizers are cancelled by host.dispose. Include their finalizers before taking the record snapshot.
        const cleanup = Promise.all([...this.pendingOpen]).then(() => Promise.all([...this.records.values()].map(record => this.observeClose(record))));
        await Promise.race([cleanup, new Promise<void>(resolve => { timer = setTimeout(resolve, this.graceMs); })]);
        return this.opening === 0 && [...this.records.values()].every(record => record.exit?.treeExitProven);
      } finally { if (timer) clearTimeout(timer); }
    })();
    return this.disposal;
  }

  tools(): readonly ToolDefinition[] {
    const tool = <T extends z.ZodType>(name: string, description: string, schema: T,
      run: (execution: ToolExecution, args: z.infer<T>) => ToolBodyResult | Promise<ToolBodyResult>, readOnly = false): ToolDefinition => defineTool({
      name, description, actionClass: readOnly ? "READ_ONLY" : "WRITE_HIGH", parameters: z.toJSONSchema(schema, { io: "input" }),
      body: async execution => {
        const args = schema.parse(execution.arguments);
        if (execution.workspace !== this.options.workspace) return { ok: false, output: "Terminal execution does not match its composed workspace.", effect: "not_applied" };
        if (execution.ownerStep?.sessionId !== this.options.sessionId()) return { ok: false, output: "Terminal execution has no matching trusted session step.", effect: "not_applied" };
        if (execution.effectiveMode === "SIMULATE") return { ok: true, output: `[amc: simulated ${name}; no terminal effect]`, effect: "not_applied" };
        try { return await run(execution, args); }
        catch (error) { return { ok: false, output: error instanceof Error ? error.message : "Terminal operation failed.",
          effect: error instanceof TerminalAccessError || error instanceof TerminalAdmissionError || readOnly ? "not_applied" : "unknown" }; }
      }
    });
    return [
      tool("terminal_open", "Open an explicitly host-authorized, network-denied native PTY in this workspace. No bash-approval or pipe fallback.", openArgs, async (execution, args) => {
        const record = await this.launch({ workspace: this.options.workspace, cols: args.cols, rows: args.rows, timeoutMs: args.timeoutMs,
          ...(execution.signal ? { signal: execution.signal } : {}) }, args.label, execution.ownerStep);
        return { ok: true, output: JSON.stringify(this.view(record)), effect: "applied" };
      }),
      tool("terminal_list", "List only this session's retained native terminals and their observed cleanup status.", z.strictObject({}), () => ({
        ok: true, output: JSON.stringify([...this.records.values()].filter(record => record.owner === this.options.sessionId()).map(record => this.view(record)))
      }), true),
      tool("terminal_read", "Read a bounded byte page from this terminal's head/tail output snapshot. Revision binds pages; retry offset 0 after output changes. Dropped middle bytes are explicit.", readArgs, (_execution, args) => {
        const record = this.own(args.terminal_id);
        if (args.revision !== undefined && args.revision !== record.revision) return { ok: false, output: "Terminal output changed; restart paging at offset 0.", effect: "not_applied" };
        const snapshot = record.output.snapshot();
        const bytes = Buffer.from(snapshot.text, "utf8");
        if (args.offset > bytes.length) return { ok: false, output: "Terminal output offset is outside the retained snapshot.", effect: "not_applied" };
        const page = bytes.subarray(args.offset, Math.min(bytes.length, args.offset + args.count));
        // Byte pages can split UTF-8 characters; base64 retains the exact bounded bytes.
        return { ok: true, output: JSON.stringify({ ...this.view(record), revision: record.revision, offset: args.offset,
          nextOffset: args.offset + page.length, retainedBytes: bytes.length, totalBytes: snapshot.totalBytes,
          droppedBytes: snapshot.droppedBytes, contentBase64: page.toString("base64") }) };
      }, true),
      tool("terminal_send", "Send a command to the same persistent shell (submit=true), or raw interactive input. Inferred/unknown command completion is never success.", sendArgs, async (execution, args) => {
        const record = this.own(args.terminal_id);
        if (Buffer.byteLength(args.text, "utf8") > 16_384) return { ok: false, output: "Terminal input exceeds 16384 UTF-8 bytes.", effect: "not_applied" };
        if (!args.submit) {
          await record.session.write(args.text);
          return { ok: true, output: JSON.stringify({ terminal_id: record.id, inputAcknowledged: true, commandOutcome: unknown }), effect: "applied" };
        }
        const result = await record.session.send(args.text, execution.signal ? { signal: execution.signal } : {});
        const proven = result.readiness.rung === "marker" && result.exitCode !== null;
        return { ok: proven && result.exitCode === 0, output: JSON.stringify({ terminal_id: record.id, ...result,
          outcome: proven ? "completed" : unknown }), exitCode: result.exitCode, timedOut: result.readiness.rung === "timeout", effect: proven ? "applied" : "unknown" };
      }),
      tool("terminal_resize", "Resize this session's native PTY after a synchronous host-authority recheck.", resizeArgs, async (_execution, args) => {
        const record = this.own(args.terminal_id);
        await record.session.resize(args.cols, args.rows);
        record.cols = args.cols; record.rows = args.rows;
        return { ok: true, output: JSON.stringify(this.view(record)), effect: "applied" };
      }),
      tool("terminal_signal", "Send SIGINT as guarded PTY input, or request SIGTERM of the owned terminal process tree. A stop request does not prove exit.", signalArgs, async (_execution, args) => {
        const record = this.own(args.terminal_id);
        if (args.signal === "SIGINT") {
          await record.session.write("\u0003");
          return { ok: true, output: JSON.stringify({ terminal_id: record.id, requestedSignal: "SIGINT", inputAcknowledged: true, outcome: unknown }), effect: "applied" };
        }
        record.session.cancel();
        return { ok: false, output: JSON.stringify({ terminal_id: record.id, stopRequested: true, cleanupConfirmed: record.exit?.treeExitProven ?? false, outcome: unknown }), effect: "unknown" };
      }),
      tool("terminal_close", "Request owned-terminal shutdown and wait a finite grace for observed process-tree exit; unresolved cleanup is TOOL_OUTCOME_UNKNOWN.", idArgs, async (_execution, args) => {
        const record = this.own(args.terminal_id);
        const confirmed = await this.observeClose(record);
        return { ok: confirmed, output: JSON.stringify({ ...this.view(record), stopRequested: true,
          cleanupConfirmed: confirmed, outcome: confirmed ? "exited" : unknown }), effect: confirmed ? "applied" : "unknown" };
      })
    ];
  }
}
