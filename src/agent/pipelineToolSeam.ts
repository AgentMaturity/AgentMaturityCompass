import type { ToolSchema } from "../llm/request/requestSpec.js";
import type { ToolPipeline } from "../tools/toolPipeline.js";
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { ToolOutcome as PipelineOutcome } from "../tools/toolTypes.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "./toolSeam.js";

/**
 * The loop's tool seam, backed by the P4.1 pipeline.
 *
 * This is the wire that makes Phase 4 load-bearing. Until it existed, the
 * pipeline, the process substrate, the built-in tools, the sandbox and Code
 * Mode were all correct, all tested, and all reachable only from tests — the
 * loop still offered `echoTool`, whose own header says it is "a demonstration
 * tool with side effects, mounted before the pipeline that governs side
 * effects exists".
 *
 * The seam was designed for this: `AgentToolSeam` already splits ORDER and
 * EVIDENCE (the loop's job) from EXECUTION (the pipeline's), and
 * `ToolCallRequest` already carries `parentToken` for a Code Mode sub-call. So
 * there is nothing to reshape here, only to connect.
 */

/**
 * Classes whose calls must not overlap.
 *
 * A read can run beside anything. Two writes to the same workspace in the same
 * step cannot: the model does not know they are concurrent, read-before-edit
 * would see one of them land between another's check and its write, and the
 * resulting file is neither of the edits the model asked for.
 */
const EXCLUSIVE_CLASSES = new Set(["WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "IDENTITY"]);

export interface PipelineToolSeamInit {
  readonly registry: ToolRegistry;
  readonly pipeline: ToolPipeline;
  readonly agentId: string;
}

/** Map a pipeline outcome onto the loop's four independent facts. */
function toLoopOutcome(outcome: PipelineOutcome, aborted: boolean): ToolCallOutcome {
  if (aborted) {
    return { outcome: "CANCELLED", content: "", exitCode: null, timedOut: false, denied: false };
  }
  if (outcome.denied !== null) {
    return {
      outcome: "DENIED",
      // The reason reaches the model. A model told only "denied" retries the
      // same call; one told which stage refused it, and why, can change course.
      content: `[amc] ${outcome.denied.stage} denied: ${outcome.denied.reason}`,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      denied: true
    };
  }
  return {
    outcome: outcome.ok ? "OK" : "ERROR",
    content: outcome.output,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    denied: false
  };
}

export function pipelineToolSeam(init: PipelineToolSeamInit): AgentToolSeam {
  return {
    schemas(): readonly ToolSchema[] | null {
      const visible = [...init.registry.visible(init.agentId).values()];
      const offered = visible
        // A tool with no published schema cannot be called correctly, so it is
        // omitted rather than advertised uncallably. Registering without one is
        // how a tool stays available to other code but not to the model.
        .filter((tool) => tool.parameters !== undefined)
        .map((tool): ToolSchema => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as Record<string, unknown>
        }));
      return offered.length > 0 ? offered : null;
    },

    executionMode(request: ToolCallRequest): "parallel" | "exclusive" {
      const tool = init.registry.visible(init.agentId).get(request.toolName);
      // An unknown tool is exclusive: it is about to fail, and letting it
      // overlap buys nothing while making the failure harder to place.
      if (!tool) return "exclusive";
      return EXCLUSIVE_CLASSES.has(tool.actionClass) ? "exclusive" : "parallel";
    },

    async execute(request: ToolCallRequest): Promise<ToolCallOutcome> {
      if (request.signal.aborted) {
        return { outcome: "CANCELLED", content: "", exitCode: null, timedOut: false, denied: false };
      }

      let args: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(request.rawArguments === "" ? "{}" : request.rawArguments);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new TypeError("arguments must be a JSON object");
        }
        args = parsed as Record<string, unknown>;
      } catch (error: unknown) {
        // The model produced something unparseable. That is an ERROR the model
        // can correct, never a DENIED — policy did not refuse this, and saying
        // it did would credit the guards with catching a syntax mistake.
        return {
          outcome: "ERROR",
          content: `[amc] could not parse arguments for "${request.toolName}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          exitCode: null,
          timedOut: false,
          denied: false
        };
      }

      try {
        const outcome = await init.pipeline.execute({
          name: request.toolName,
          agentId: init.agentId,
          arguments: args,
          requestedMode: "EXECUTE",
          callId: request.callId,
          parentToken: request.parentToken
        });
        return toLoopOutcome(outcome, request.signal.aborted);
      } catch (error: unknown) {
        // The pipeline itself threw — a lossy-argument refusal, say. The loop
        // must still be answered: an unanswered call is a dangling row the log
        // cannot close.
        return {
          outcome: "ERROR",
          content: `[amc] ${request.toolName} could not be executed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          exitCode: null,
          timedOut: false,
          denied: false
        };
      }
    }
  };
}
