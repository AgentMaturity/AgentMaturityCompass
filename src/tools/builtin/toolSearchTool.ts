import { z } from "zod";
import { buildIndex, searchTools } from "../../product/toolSemanticDocs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";

/** Already admitted metadata. Discovery cannot access a body or change a tool's availability. */
export interface ToolSearchSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

const searchArguments = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(20).default(5)
}).strict();

export function toolSearchTool(options: {
  readonly catalog: (agentId: string) => readonly ToolSearchSchema[];
}): ToolDefinition {
  return defineTool({
    name: "tool_search",
    actionClass: "READ_ONLY",
    description: "Search tools allowed for this session and return their names, descriptions, and argument schemas. Discovery does not activate or execute tools.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 5 }
      },
      required: ["query"],
      additionalProperties: false
    },
    body: execution => {
      const parsed = searchArguments.safeParse(execution.arguments);
      if (!parsed.success) return { ok: false, output: "Invalid tool search arguments." };
      try {
        execution.signal?.throwIfAborted();
        // Read current policy and scope per call. An earlier discovery result never grants later authority.
        const schemas = options.catalog(execution.agentId);
        execution.signal?.throwIfAborted();
        const metadata = new Map(schemas.map(({ name, description, parameters }) => [name, { name, description, parameters }]));
        const specs = [...metadata.values()].sort((a, b) => a.name.localeCompare(b.name))
          .map(({ name, description }) => ({ id: name, name, description }));
        const tools = searchTools(parsed.data.query, specs, buildIndex(specs)).slice(0, parsed.data.limit)
          .map(({ tool }) => {
            const schema = metadata.get(tool.id)!;
            return { ...schema, schemaDigestSha256: sha256Hex(canonicalize(schema.parameters)) };
          });
        return { ok: true, output: JSON.stringify({ tools }) };
      } catch {
        return { ok: false, output: execution.signal?.aborted ? "Tool discovery cancelled." : "Tool discovery is unavailable for this session." };
      }
    }
  });
}
