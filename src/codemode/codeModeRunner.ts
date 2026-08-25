import { Worker } from "node:worker_threads";
import { WORKER_BOOTSTRAP } from "./workerBootstrap.js";

/**
 * The Code Mode runtime (P4.5).
 *
 * One model-written program per run, in a fresh worker, with every
 * `tools.name(args)` call dispatched back to the host so it re-enters the P4.1
 * pipeline as a sub-call. Guards, approval, budgets and evidence therefore
 * apply to a code-dispatched call exactly as they do to a direct one — which
 * is the only reason Code Mode is allowed to exist in a governance product.
 *
 * THE BOUNDARY, STATED PLAINLY. The worker is a FAULT boundary. Measured: a
 * Node worker can require `node:fs` and write anywhere, spawn processes and
 * open sockets, so a program that ignores `tools` and calls the filesystem
 * directly is not governed by anything here. Also measured: the P4.4 Seatbelt
 * profile DOES cover worker threads — a worker's write outside the workspace
 * is refused with EPERM while one inside succeeds. So the security boundary is
 * the sandbox, and this runner treats confinement as a precondition rather
 * than a nice-to-have.
 */

/** One tool call from inside the program, to be run through the pipeline. */
export interface CodeToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

export interface CodeToolResult {
  readonly ok: boolean;
  /** The tool's output, or the denial/failure reason. */
  readonly value: unknown;
  readonly error?: string;
}

export interface CodeModeLimits {
  /**
   * Wall-clock limit for the whole program.
   *
   * Wall rather than CPU, and enforced on the HOST thread. A spinning program
   * never yields, so nothing inside the worker can time itself out — the timer
   * has to live somewhere the program cannot starve.
   */
  readonly wallMs: number;
  /** Total bytes the program may return. */
  readonly maxResultBytes: number;
  /** How many tool calls one program may make. */
  readonly maxToolCalls: number;
}

export const DEFAULT_CODE_LIMITS: CodeModeLimits = {
  wallMs: 30_000,
  maxResultBytes: 256_000,
  maxToolCalls: 200
};

export type CodeRunFailure =
  | "timeout"
  | "call-budget"
  | "result-too-large"
  | "program-error"
  | "unconfined";

export interface CodeRunOutcome {
  readonly ok: boolean;
  readonly value: unknown;
  readonly failure: CodeRunFailure | null;
  readonly message: string | null;
  /** Every sub-call the program made, in order, whether allowed or denied. */
  readonly calls: readonly { name: string; ok: boolean }[];
}

export interface CodeModeRunnerInit {
  /** Runs one sub-call through the pipeline. Denials come back as ok:false. */
  readonly dispatch: (call: CodeToolCall) => Promise<CodeToolResult>;
  readonly limits?: CodeModeLimits;
  /**
   * Whether the host process is OS-confined.
   *
   * Required. A program that bypasses the `tools` binding is stopped by the
   * sandbox and by nothing else, so running one unconfined means running
   * ungoverned code with a governance story attached to it.
   */
  readonly confined: boolean;
}

export class CodeModeRunner {
  private readonly limits: CodeModeLimits;

  constructor(private readonly init: CodeModeRunnerInit) {
    this.limits = init.limits ?? DEFAULT_CODE_LIMITS;
  }

  async run(source: string): Promise<CodeRunOutcome> {
    if (!this.init.confined) {
      return {
        ok: false,
        value: null,
        failure: "unconfined",
        message:
          "code mode requires OS confinement: a program can bypass the tools binding entirely, " +
          "and the sandbox is the only thing that stops it",
        calls: []
      };
    }

    const calls: { name: string; ok: boolean }[] = [];
    // A program can reach `parentPort` itself and post forged traffic, so the
    // compile-time message type is worthless at this boundary. Every id is
    // answered at most once: a forged duplicate would otherwise let a program
    // have one call's result delivered as another's.
    const answered = new Set<number>();
    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: { source },
      // Empty. A program that can read the host's environment can read every
      // credential the host holds, and it has no legitimate need for any of it.
      env: {},
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    });

    return new Promise<CodeRunOutcome>((resolve) => {
      let settled = false;
      const finish = (outcome: CodeRunOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(outcome);
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          value: null,
          failure: "timeout",
          message: `program exceeded its ${this.limits.wallMs}ms budget`,
          calls
        });
      }, this.limits.wallMs);

      worker.on("message", (message: unknown) => {
        void this.onMessage(message, worker, calls, answered, finish);
      });

      worker.on("error", (error: Error) => {
        finish({ ok: false, value: null, failure: "program-error", message: error.message, calls });
      });

      worker.on("exit", () => {
        // A worker that exits without a verdict produced nothing. Reporting
        // success here would credit a program that died with whatever the
        // caller's default was.
        finish({
          ok: false,
          value: null,
          failure: "program-error",
          message: "the program ended without returning a result",
          calls
        });
      });
    });
  }

  private async onMessage(
    message: unknown,
    worker: Worker,
    calls: { name: string; ok: boolean }[],
    answered: Set<number>,
    finish: (outcome: CodeRunOutcome) => void
  ): Promise<void> {
    // A program can post ANY value on the port, including null and primitives.
    // Reading a field off one of those throws inside the host's listener --
    // which takes down the HOST, not the worker that sent it. This guard is
    // the first thing, deliberately, and a test posts null to prove it.
    if (typeof message !== "object" || message === null) return;
    const envelope = message as { kind?: string; id?: number; name?: string; args?: unknown; value?: unknown; message?: string };
    if (envelope.kind === "done") {
      const size = Buffer.byteLength(JSON.stringify(envelope.value ?? null), "utf8");
      if (size > this.limits.maxResultBytes) {
        finish({
          ok: false,
          value: null,
          failure: "result-too-large",
          message: `result was ${size} bytes; the limit is ${this.limits.maxResultBytes}`,
          calls
        });
        return;
      }
      finish({ ok: true, value: envelope.value ?? null, failure: null, message: null, calls });
      return;
    }

    if (envelope.kind === "failed") {
      finish({ ok: false, value: null, failure: "program-error", message: envelope.message ?? "program failed", calls });
      return;
    }

    // Shape-gated field by field, and anything that fails is DROPPED rather
    // than thrown: a throw in this listener would crash the host process, not
    // the worker that sent the junk.
    if (envelope.kind !== "call" || typeof envelope.id !== "number" || typeof envelope.name !== "string") return;
    if (answered.has(envelope.id)) return;
    answered.add(envelope.id);

    if (calls.length >= this.limits.maxToolCalls) {
      finish({
        ok: false,
        value: null,
        failure: "call-budget",
        message: `program exceeded ${this.limits.maxToolCalls} tool calls`,
        calls
      });
      return;
    }

    const args = (envelope.args ?? {}) as Record<string, unknown>;
    let result: CodeToolResult;
    try {
      result = await this.init.dispatch({ name: envelope.name, args });
    } catch (error: unknown) {
      result = { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
    }
    calls.push({ name: envelope.name, ok: result.ok });

    // A denial goes BACK to the program as a rejected call rather than killing
    // the run. A program that is told "no" can choose something else, which is
    // the behaviour that makes a denial useful rather than merely fatal.
    worker.postMessage({
      kind: "call-result",
      id: envelope.id,
      ok: result.ok,
      value: result.value ?? null,
      error: result.error ?? null
    });
  }
}
