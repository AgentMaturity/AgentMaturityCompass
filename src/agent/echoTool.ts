/**
 * One tool, so the operator surface can demonstrate a multi-step turn.
 *
 * WHAT IT IS FOR. VERIFY-1 of plan P3.2 is "an agent runs a multi-step turn
 * calling (stub) tools". A turn only becomes multi-step when the model asks for
 * a tool and is then asked again with the result in view, so `amc agent-loop
 * run` needs at least one tool to offer. This is that tool, and it is
 * deliberately the smallest one that produces a real second step.
 *
 * WHAT IT IS NOT. It is not the tool registry. P4.1 builds that — a scoped
 * registry, a `defineTool()` DSL, and the guarded execution pipeline every real
 * tool traverses. This seam has no guards, no approval and no sandbox, which is
 * exactly why it does nothing but repeat its input: a demonstration tool with
 * side effects, mounted before the pipeline that governs side effects exists,
 * would be a governance hole shipped as a convenience.
 *
 * The CLI offers it on the stub route by default and NOT on a configured
 * provider, because spending an operator's tokens to exercise an echo is not a
 * default anyone would choose deliberately.
 */
import type { ToolSchema } from "../llm/request/requestSpec.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "./toolSeam.js";

const ECHO_SCHEMA: ToolSchema = Object.freeze({
  name: "echo",
  description: "Repeat the given text back. Has no side effects and touches nothing outside this turn.",
  parameters: {
    type: "object",
    properties: { text: { type: "string", description: "the text to repeat" } },
    required: ["text"]
  }
});

/** Read `text` out of the model's raw arguments without trusting the shape. */
function echoText(rawArguments: string): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly detail: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return { ok: false, detail: "arguments are not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, detail: "arguments are not a JSON object" };
  }
  const text = (parsed as Record<string, unknown>).text;
  if (typeof text !== "string") {
    return { ok: false, detail: 'arguments have no string "text" field' };
  }
  return { ok: true, text };
}

/**
 * A seam offering exactly one side-effect-free tool.
 *
 * A factory rather than a constant so each run gets its own object: a shared
 * frozen singleton would be indistinguishable today and would quietly become
 * shared state the moment anyone gave the tool a counter.
 */
export function echoToolSeam(): AgentToolSeam {
  return {
    schemas: (): readonly ToolSchema[] => [ECHO_SCHEMA],
    // Nothing here contends for anything, so nothing needs to be exclusive.
    executionMode: (): "parallel" | "exclusive" => "parallel",
    execute: (request: ToolCallRequest): Promise<ToolCallOutcome> => {
      if (request.toolName !== ECHO_SCHEMA.name) {
        return Promise.resolve({
          outcome: "ERROR",
          content: `[amc:echo] no tool named "${request.toolName}" is mounted`,
          exitCode: null,
          timedOut: false,
          denied: false
        });
      }
      const read = echoText(request.rawArguments);
      // A malformed call is answered, not dropped. An unanswered `tool/call` row
      // is a dangling call the model never gets a result for, and the seam that
      // could not read the arguments is the one that knows why.
      return Promise.resolve(
        read.ok
          ? { outcome: "OK", content: read.text, exitCode: 0, timedOut: false, denied: false }
          : {
              outcome: "ERROR",
              content: `[amc:echo] ${read.detail}`,
              exitCode: null,
              timedOut: false,
              denied: false
            }
      );
    }
  };
}
