import { z } from "zod";
import { defineTool } from "../tools/toolRegistry.js";
import { DefiniteFailureError, type ToolBodyResult, type ToolDefinition, type ToolExecution } from "../tools/toolTypes.js";
import type { JobRegistry } from "./jobRegistry.js";
import type { JobOwnerStep, JobResult, JobSnapshot } from "./jobTypes.js";

const startArgs = z.object({ command: z.string().min(1).max(64_000), workdir: z.string().min(1).max(4_096).optional(),
  description: z.string().min(1).max(200).optional(), timeoutMs: z.number().int().positive().max(600_000).default(120_000) }).strict();
const outputArgs = z.object({ job_id: z.string().min(1).max(256), cursor: z.number().int().nonnegative().default(0),
  max_bytes: z.number().int().min(4).max(64_000).default(8_192), wait: z.boolean().default(false),
  timeout_ms: z.number().int().nonnegative().max(30_000).default(1_000) }).strict();
const killArgs = z.object({ job_id: z.string().min(1).max(256), reason: z.string().min(1).max(200).default("killed by owner") }).strict();
const emptyArgs = z.object({}).strict();

export interface JobToolsOptions {
  readonly registry: JobRegistry;
  readonly sessionId: () => string;
  readonly ownerStep: (execution: ToolExecution) => JobOwnerStep | undefined;
  /** The owning composition dispatches the existing confined bash through the same ToolPipeline. No shell fallback. */
  readonly run: (execution: ToolExecution, signal: AbortSignal, output: (text: string) => void) => Promise<JobResult>;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DefiniteFailureError(parsed.error.message);
  return parsed.data;
}
function result(snapshot: JobSnapshot): ToolBodyResult {
  const unknown = snapshot.cleanup !== "confirmed";
  return { ok: !unknown, output: JSON.stringify(snapshot), effect: unknown ? "unknown" : "applied" };
}

/** Model-facing lifecycle controls. Every operation derives its owner from trusted composition, never arguments. */
export function jobTools(options: JobToolsOptions): readonly ToolDefinition[] {
  const { registry } = options;
  return [
    defineTool({ name: "job_start", actionClass: "WRITE_HIGH", description: "Start an owned background shell job through the governed confined bash tool. Returns a job handle; completion is separate.",
      parameters: { type: "object", properties: { command: { type: "string", minLength: 1, maxLength: 64_000 },
        workdir: { type: "string", minLength: 1, maxLength: 4_096 }, description: { type: "string", minLength: 1, maxLength: 200 },
        timeoutMs: { type: "integer", minimum: 1, maximum: 600_000 } }, required: ["command"], additionalProperties: false },
      body: execution => {
        const args = parse(startArgs, execution.arguments);
        const owner = options.sessionId();
        const ownerStep = options.ownerStep(execution);
        if (!ownerStep || ownerStep.sessionId !== owner) throw new DefiniteFailureError("Background jobs require the starting session step's trusted ownership.");
        if (execution.effectiveMode === "SIMULATE") return { ok: true, output: "SIMULATE job_start", effect: "not_applied" };
        if (execution.signal?.aborted) return { ok: false, output: "Background job cancelled before admission.", effect: "not_applied" };
        let id: string;
        try {
          id = registry.start({ kind: "bash", owner, ownerStep, label: args.description ?? "background shell", timeoutMs: args.timeoutMs,
            // Let job_start release its journal and exclusive-write lock before the nested bash enters that pipeline.
            run: (signal, emit) => new Promise<JobResult>((resolve, reject) => setImmediate(() => {
              if (signal.aborted) { resolve({ ok: false, summary: "cancelled before dispatch", cleanupConfirmed: true, effect: "not_applied" }); return; }
              void options.run(execution, signal, emit).then(resolve, reject);
            })) });
        } catch (error) {
          throw new DefiniteFailureError(error instanceof Error ? error.message : "Job admission refused", { cause: error });
        }
        return { ok: true, output: JSON.stringify(registry.get(id, owner)), effect: "applied" };
      } }),
    defineTool({ name: "job_list", actionClass: "READ_ONLY", description: "List this session's background jobs, including stop requests and observed cleanup state.",
      parameters: { type: "object", properties: {}, additionalProperties: false }, body: execution => {
        parse(emptyArgs, execution.arguments);
        return { ok: true, output: JSON.stringify(registry.list(options.sessionId())) };
      } }),
    defineTool({ name: "job_output", actionClass: "READ_ONLY", description: "Read bounded job output by absolute byte cursor. Optional finite wait returns partial output without killing the job; missing ranges are explicit.",
      parameters: { type: "object", properties: { job_id: { type: "string", minLength: 1, maxLength: 256 }, cursor: { type: "integer", minimum: 0 },
        max_bytes: { type: "integer", minimum: 4, maximum: 64_000 }, wait: { type: "boolean" }, timeout_ms: { type: "integer", minimum: 0, maximum: 30_000 } },
        required: ["job_id"], additionalProperties: false }, body: async execution => {
        const args = parse(outputArgs, execution.arguments);
        const owner = options.sessionId();
        // Fence before deciding whether a cursor needs a wait.
        const first = registry.readOutput(args.job_id, owner, { cursor: args.cursor, maxBytes: args.max_bytes });
        if (args.wait && first.nextCursor === args.cursor && first.snapshot.outcome === null) {
          await registry.waitFor(args.job_id, owner, args.timeout_ms, execution.signal);
        }
        return { ok: true, output: JSON.stringify(registry.readOutput(args.job_id, owner, { cursor: args.cursor, maxBytes: args.max_bytes })) };
      } }),
    // READ_ONLY is deliberate: this control can only abort an already-owned producer, never launch a command.
    // It must remain callable while that producer holds the pipeline's exclusive-write lock.
    defineTool({ name: "job_kill", actionClass: "READ_ONLY", description: "Request cancellation of an owned job, then report observed cleanup or TOOL_OUTCOME_UNKNOWN after bounded grace.",
      parameters: { type: "object", properties: { job_id: { type: "string", minLength: 1, maxLength: 256 }, reason: { type: "string", minLength: 1, maxLength: 200 } },
        required: ["job_id"], additionalProperties: false }, body: async execution => {
        const args = parse(killArgs, execution.arguments);
        const owner = options.sessionId();
        registry.get(args.job_id, owner);
        if (execution.effectiveMode === "SIMULATE") return { ok: true, output: "SIMULATE job_kill", effect: "not_applied" };
        registry.kill(args.job_id, owner, args.reason);
        return result(await registry.waitForCleanup(args.job_id, owner, undefined, execution.signal));
      } })
  ];
}
