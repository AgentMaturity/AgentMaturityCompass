import { z } from "zod";
import { defineTool } from "../tools/toolRegistry.js";
import type { ToolDefinition } from "../tools/toolTypes.js";

const argsSchema = z.object({}).strict();

/** Read the owning scheduled run's current progress without changing its authority. */
export function goalTool(getGoal?: () => unknown): ToolDefinition {
  return defineTool({
    name: "get_goal",
    actionClass: "READ_ONLY",
    description: "Read this scheduled run's current goal round, ceiling, status and stop reason. No arguments or state changes.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    body: (execution) => {
      argsSchema.parse(execution.arguments);
      const goal = getGoal?.();
      if (goal === undefined || goal === null) {
        return { ok: false, output: JSON.stringify({ status: "unavailable", reason: "No current goal is bound to this run." }) };
      }
      return { ok: true, output: JSON.stringify(goal) };
    }
  });
}
