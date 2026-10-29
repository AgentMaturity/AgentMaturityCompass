import { z } from "zod";
import { buildIndex, searchTools } from "../../product/toolSemanticDocs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { defineTool, ToolLoadoutError, type ToolActivationRequest } from "../toolRegistry.js";
import type { ToolDefinition, ToolExecution } from "../toolTypes.js";

/** Already admitted metadata. Discovery cannot access a body or change a tool's availability. */
export interface ToolSearchSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

const activationArguments = z.object({
  name: z.string().min(1).max(256),
  schemaDigestSha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

const searchArguments = z.union([z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(20).default(5)
}).strict(), z.object({ activate: activationArguments }).strict()]);

function refusal(code: ToolLoadoutError["code"]) {
  const error = new ToolLoadoutError(code);
  return { ok: false, output: JSON.stringify({ error: { code: error.code, message: error.message } }) };
}

export function toolSearchTool(options: {
  readonly catalog: (agentId: string) => readonly ToolSearchSchema[];
  readonly discovered?: (agentId: string, schemas: readonly ToolSearchSchema[]) => void;
  readonly activate?: (execution: ToolExecution, request: ToolActivationRequest) => ToolActivationRequest & { readonly revision: number; readonly evidenceRef: string };
}): ToolDefinition {
  return defineTool({
    name: "tool_search",
    actionClass: "READ_ONLY",
    description: "Search allowed tools and return names, descriptions, argument schemas and digests. Separately activate a discovered deferred schema using activate with its exact name and schemaDigestSha256; activation affects subsequent requests and never grants execution permission.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 1000, pattern: "\\S" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
        activate: {
          type: "object", properties: {
            name: { type: "string", minLength: 1, maxLength: 256 },
            schemaDigestSha256: { type: "string", pattern: "^[a-f0-9]{64}$" }
          }, required: ["name", "schemaDigestSha256"], additionalProperties: false
        }
      },
      oneOf: [{ required: ["query"], not: { required: ["activate"] } },
        { required: ["activate"], not: { anyOf: [{ required: ["query"] }, { required: ["limit"] }] } }],
      additionalProperties: false
    },
    body: execution => {
      const parsed = searchArguments.safeParse(execution.arguments);
      if (!parsed.success) return refusal("INVALID_ARGUMENTS");
      try {
        execution.signal?.throwIfAborted();
        if ("activate" in parsed.data) {
          if (execution.effectiveMode === "SIMULATE") return { ok: true, output: "SIMULATE tool activation: loadout unchanged." };
          if (!options.activate) return refusal("CATALOG_UNAVAILABLE");
          const activation = options.activate(execution, parsed.data.activate);
          return { ok: true, output: JSON.stringify({ activation }) };
        }
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
        execution.signal?.throwIfAborted();
        options.discovered?.(execution.agentId, tools);
        return { ok: true, output: JSON.stringify({ tools }) };
      } catch (error) {
        return refusal(execution.signal?.aborted ? "CANCELLED"
          : error instanceof ToolLoadoutError ? error.code : "CATALOG_UNAVAILABLE");
      }
    }
  });
}
