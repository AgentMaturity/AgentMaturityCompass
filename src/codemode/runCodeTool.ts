import { z } from "zod";
import { defineTool, type ToolRegistry } from "../tools/toolRegistry.js";
import { RUN_CODE_TOOL, type ToolPipeline } from "../tools/toolPipeline.js";
import type { ToolDefinition, ToolExecution } from "../tools/toolTypes.js";
import { CodeModeRunner, type CodeModeLimits, type CodeToolResult } from "./codeModeRunner.js";

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
  source: z.string().min(1).max(200_000)
});

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
    description: "Run a TypeScript-like program that calls tools via `await tools.name(args)`.",
    body: async (execution: ToolExecution) => {
      const args = runCodeArgs.parse(execution.arguments);

      if (execution.effectiveMode === "SIMULATE") {
        return { output: `SIMULATE ${RUN_CODE_TOOL}: ${args.source.length} characters, not executed` };
      }

      const runner = new CodeModeRunner({
        confined: deps.confined(),
        ...(deps.limits ? { limits: deps.limits } : {}),
        dispatch: async (call): Promise<CodeToolResult> => {
          const outcome = await deps.pipeline().execute({
            name: call.name,
            agentId: execution.agentId,
            arguments: call.args,
            requestedMode: execution.requestedMode,
            // The two fields that make this a sub-call rather than a new one.
            rootCallId: execution.rootCallId,
            parentToken: execution.token
          });
          return outcome.ok
            ? { ok: true, value: outcome.output }
            : {
                ok: false,
                value: null,
                // The denial reason reaches the program verbatim. A program
                // told only "failed" retries the same call; one told which
                // guard refused it, and why, can choose differently.
                error: outcome.denied
                  ? `${outcome.denied.stage} denied: ${outcome.denied.reason}`
                  : outcome.output || "tool call failed"
              };
        }
      });

      const result = await runner.run(args.source);
      const dispatched = result.calls
        .map((call) => `  ${call.ok ? "ok " : "denied"} ${call.name}`)
        .join("\n");

      if (!result.ok) {
        // Thrown, so the pipeline records this as a failed call rather than a
        // successful one whose text happens to mention a failure.
        throw new Error(
          `${result.failure}: ${result.message ?? "program did not complete"}` +
          (dispatched.length > 0 ? `\ntool calls made:\n${dispatched}` : "")
        );
      }

      const value = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
      return {
        output: dispatched.length > 0 ? `${value}\ntool calls made:\n${dispatched}` : value
      };
    }
  });
}

/** Register the transport through the one door that accepts the reserved name. */
export function registerCodeTransport(registry: ToolRegistry, deps: RunCodeToolDeps, scope?: string): () => void {
  return registry.defineCodeTransport(runCodeTool(deps), scope);
}
