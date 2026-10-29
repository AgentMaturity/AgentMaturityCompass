import type { ToolSchema } from "../llm/request/requestSpec.js";
import { EXCLUSIVE_CLASSES, type ToolPipeline } from "../tools/toolPipeline.js";
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

export interface PipelineToolSeamInit {
  readonly registry: ToolRegistry;
  readonly pipeline: ToolPipeline;
  readonly agentId: string;
}

/**
 * What an unknown outcome's content starts with, before the tool's output: said to the model, so it does not retry on its
 * own an effect that may already have happened. The redacting session sets exactly these aside (P2-02).
 */
export const OUTCOME_UNKNOWN_NOTICES = Object.freeze([
  "[amc] outcome unknown: the action may have taken effect. It is not retried automatically. ",
  "[amc] outcome unknown: the action may have taken effect. It is not retried automatically; it stays unreconciled. "
] as const);

/**
 * Map a pipeline outcome onto the loop's four independent facts.
 *
 * A journaled call (P1-03) reports its receipt, not the signal: CANCELLED only for a `cancelled` receipt, so a call
 * aborted after `started` is OK, ERROR or TOOL_OUTCOME_UNKNOWN. Its effect may have happened.
 */
function toLoopOutcome(outcome: PipelineOutcome, aborted: boolean): ToolCallOutcome {
  const state = outcome.action?.state;
  if (state === undefined ? aborted : state === "cancelled") {
    return { outcome: "CANCELLED", content: "", exitCode: null, timedOut: false, denied: false };
  }
  if (outcome.denied === null && (state === "outcome_unknown" || state === "started"
    || (state === undefined && outcome.effect === "unknown"))) {
    return {
      outcome: "TOOL_OUTCOME_UNKNOWN",
      content: `${OUTCOME_UNKNOWN_NOTICES[state === undefined ? 0 : 1]}${outcome.output}`,
      exitCode: outcome.exitCode,
      timedOut: outcome.timedOut,
      denied: false
    };
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

/** The model's arguments as a JSON object, or the reason they are not one. */
function parseArguments(rawArguments: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawArguments === "" ? "{}" : rawArguments);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("arguments must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function pipelineToolSeam(init: PipelineToolSeamInit): AgentToolSeam {
  return {
    supportsEffectGuard: true,
    authorizationIntent(request: ToolCallRequest) {
      let args: Record<string, unknown>;
      try {
        args = parseArguments(request.rawArguments);
      } catch {
        return null; // `execute` answers unparseable arguments with an ERROR; there is nothing to approve.
      }
      return init.pipeline.authorizationIntent({ name: request.toolName, agentId: init.agentId, arguments: args, requestedMode: "EXECUTE" });
    },

    bindApprovalGate(gate) {
      init.pipeline.bindApprovalGate(gate);
    },

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
        args = parseArguments(request.rawArguments);
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
          parentToken: request.parentToken,
          signal: request.signal,
          ...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
          ...(request.authority === undefined ? {} : { authority: request.authority })
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
