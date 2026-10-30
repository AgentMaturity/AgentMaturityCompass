import { z } from "zod";
import { defineTool, type ToolRegistry } from "../tools/toolRegistry.js";
import { RUN_CODE_TOOL, type ToolPipeline } from "../tools/toolPipeline.js";
import type { ToolBodyResult, ToolDefinition, ToolExecution, ToolOutcome } from "../tools/toolTypes.js";
import {
  CodeModeRunner, DEFAULT_CODE_LIMITS, type CodeCallStatus, type CodeModeLimits, type CodeRunOutcome, type CodeToolResult
} from "./codeModeRunner.js";

/**
 * The `run_code` transport (P4.5).
 *
 * The whole governance claim of Code Mode is in one line of this file: a
 * sub-call is dispatched back through the SAME `ToolPipeline`, carrying the
 * enclosing execution's token as its parent. So a code-dispatched call meets
 * the same guards, the same approval seam, the same budgets and the same
 * evidence path as a direct one — and inherits every one of them by
 * construction rather than by a second implementation that has to be kept in
 * step.
 *
 * The parent token is what makes the sub-call legible afterwards as something
 * a program did, rather than as an unexplained top-level call in the middle of
 * a turn.
 */

const runCodeArgs = z.object({
  source: z.string().min(1).max(200_000),
  /** What the program is for, in the model's words; recorded with the call's arguments for approvers and evidence. */
  description: z.string().max(2_000).optional(),
  /** Narrows the composed wall budget; never raises it (DXC-13). */
  timeoutMs: z.number().int().positive().optional()
});

/** How a pipeline outcome reads to a program: the loop's own categories (see `toLoopOutcome`). */
function subCallStatus(outcome: ToolOutcome): CodeCallStatus {
  if (outcome.denied !== null) return "denied";
  const state = outcome.action?.state;
  if (state === "cancelled") return "cancelled";
  if (state === "outcome_unknown" || state === "started" || (state === undefined && outcome.effect === "unknown")) return "unknown";
  return outcome.ok ? "ok" : "failed";
}

/** The model-facing text: value or failure, then every sub-call, then the program's captured console. */
function report(result: CodeRunOutcome, head: string): string {
  const calls = result.calls.map((call) =>
    `  ${call.status === "ok" ? "ok " : call.status} ${call.name}${call.exitCode !== null && call.exitCode !== 0 ? ` (exit ${call.exitCode})` : ""}`);
  return head + (calls.length > 0 ? `\ntool calls made:\n${calls.join("\n")}` : "")
    + (result.console.length > 0 ? `\nconsole:\n${result.console}` : "");
}

export interface RunCodeToolDeps {
  /** The pipeline sub-calls re-enter. The same instance, deliberately. */
  readonly pipeline: () => ToolPipeline;
  /** Whether the host process is OS-confined. Code mode refuses without it. */
  readonly confined: () => boolean;
  readonly limits?: CodeModeLimits;
}

export function runCodeTool(deps: RunCodeToolDeps): ToolDefinition {
  return defineTool({
    name: RUN_CODE_TOOL,
    // The transport is only ever as dangerous as what it dispatches, and what
    // it dispatches is individually classed and individually guarded. Claiming
    // a high class here would double-charge the budget for the wrapper and the
    // work, and would let the transport be denied for a class no call in the
    // program actually used.
    actionClass: "READ_ONLY",
    description: "Run a program that calls tools via `await tools.name(args)`. Return a value to finish.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "the program body; top-level await and return both work" },
        description: { type: "string", description: "what the program does, for the approver and the record" },
        timeoutMs: { type: "integer", minimum: 1, description: "a shorter wall budget than the configured one" }
      },
      required: ["source"]
    },
    body: async (execution: ToolExecution) => {
      const args = runCodeArgs.parse(execution.arguments);

      if (execution.effectiveMode === "SIMULATE") {
        return { ok: true, output: `SIMULATE ${RUN_CODE_TOOL}: ${args.source.length} characters, not executed` };
      }

      const limits = deps.limits ?? DEFAULT_CODE_LIMITS;
      const runner = new CodeModeRunner({
        confined: deps.confined(),
        limits: args.timeoutMs === undefined ? limits : { ...limits, wallMs: Math.min(limits.wallMs, args.timeoutMs) },
        dispatch: async (call, context): Promise<CodeToolResult> => {
          const outcome = await deps.pipeline().execute({
            name: call.name,
            agentId: execution.agentId,
            arguments: call.args,
            requestedMode: execution.requestedMode,
            // The two fields that make this a sub-call rather than a new one.
            rootCallId: execution.rootCallId,
            parentToken: execution.token,
            // The program's signal: aborted by any verdict and by this call's own cancellation (PXA-37).
            signal: context.signal,
            onApprovalWait: context.onApprovalWait
          });
          const status = subCallStatus(outcome);
          const facts = { status, exitCode: outcome.exitCode, timedOut: outcome.timedOut };
          return outcome.ok && status === "ok"
            ? { ok: true, value: outcome.output, ...facts }
            : {
                ok: false,
                value: null,
                ...facts,
                // The denial reason reaches the program verbatim. A program
                // told only "failed" retries the same call; one told which
                // guard refused it, and why, can choose differently.
                error: outcome.denied
                  ? `${outcome.denied.stage} denied: ${outcome.denied.reason}`
                  : outcome.output || "tool call failed"
              };
        }
      });

      const result = await runner.run(args.source, execution.signal);
      // A sub-call nobody heard back from, or a worker whose exit was not observed, may have had an effect.
      const unknown = (result.workerStarted && result.workerExitMs === null) || result.calls.some((call) => call.status === "unknown");

      if (!result.ok) {
        const output = report(result, `${result.failure}: ${result.message ?? "program did not complete"}`);
        if (unknown) return { ok: false, output, effect: "unknown" } satisfies ToolBodyResult;
        // Thrown, so the pipeline records this as a failed call rather than a
        // successful one whose text happens to mention a failure.
        throw new Error(output);
      }

      const value = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
      return { ok: true, output: report(result, value), ...(unknown ? { effect: "unknown" as const } : {}) };
    }
  });
}

/** Register the transport through the one door that accepts the reserved name. */
export function registerCodeTransport(registry: ToolRegistry, deps: RunCodeToolDeps, scope?: string): () => void {
  return registry.defineCodeTransport(runCodeTool(deps), scope);
}
