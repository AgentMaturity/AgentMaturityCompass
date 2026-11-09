import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { NATIVE_BUILTIN_CAPABILITIES, NATIVE_DELEGATION_CAPABILITIES } from "../../agent/nativeToolCapabilities.js";
import { goalTool } from "../../autonomy/goalTool.js";
import { JobRegistry } from "../../jobs/jobRegistry.js";
import { jobTools } from "../../jobs/jobTools.js";
import { skillLoadTool } from "../../skills/skillLoadTool.js";
import { NativeTerminalTools } from "../../terminal/nativeTerminalTools.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { ToolDefinition } from "../toolTypes.js";
import { applyPatchTool } from "./applyPatchTool.js";
import { askUserTool } from "./askUserTool.js";
import { bashTool } from "./bashTool.js";
import { fsTools } from "./fsTools.js";
import { lsTool } from "./lsTool.js";
import type { NativeReceiptRecorder } from "./nativeToolBreadth/nativeReceipt.js";
import { planTool } from "./planTool.js";
import { ReadBeforeEditLedger } from "./readBeforeEdit.js";
import { searchTools } from "./searchTools.js";
import { sessionSpillReadTool } from "./sessionSpillReadTool.js";
import { todoTool } from "./todoTool.js";
import { toolSearchTool } from "./toolSearchTool.js";
import { webFetchTool } from "./webFetchTool.js";
import { webSearchTool } from "./webSearchTool.js";

/**
 * The published parameter schemas of the native built-in tools (SH-TOOLS-06a), for operators and SDK users.
 *
 * Every definition here is built with inert dependencies and no body ever runs: a recorder that throws, an empty
 * ledger, an empty tool catalog, no skill roots, a job registry nothing starts. Tools whose constructor needs a live
 * caller-supplied capability (`delegate`, `workflow`) are named as unavailable rather than left out, so the listing is
 * complete about what it does not show. `schemaDigestSha256` is `sha256(canonicalize(parameters))`, the digest
 * `tool_search` hands the model and `NATIVE_TOOL_ACTIVATED` receipts carry. The aggregate is a document digest over
 * this listing, not any session's catalog identity (that one also covers exposure and the session's signed subset).
 */
interface NativeToolSchema {
  readonly name: string;
  readonly actionClass: ToolDefinition["actionClass"];
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly schemaDigestSha256: string;
}

export interface NativeToolSchemaListing {
  readonly tools: readonly NativeToolSchema[];
  /** Capability names whose schema needs a live composition and is not shown here. */
  readonly unavailable: readonly string[];
  readonly documentDigestSha256: string;
}

export const SCHEMA_UNAVAILABLE: ReadonlySet<string> = new Set(NATIVE_DELEGATION_CAPABILITIES.map((capability) => capability.name));

const never: NativeReceiptRecorder = () => { throw new Error("schema listing never runs a tool body"); };

function inertDefinitions(workspace: string): ToolDefinition[] {
  const ledger = new ReadBeforeEditLedger();
  const sessionId = (): string => "schema-listing";
  return [
    ...fsTools({ ledger }), applyPatchTool({ ledger }), lsTool(), ...searchTools(), bashTool(),
    toolSearchTool({ catalog: () => [] }), sessionSpillReadTool({ workspace, agentId: "schema-listing", sessionId }),
    webFetchTool({ record: never }), webSearchTool({ record: never }), askUserTool({ sessionId, record: never }),
    todoTool({ sessionId, record: never }), planTool({ sessionId, record: never }), skillLoadTool({ roots: [], record: never }), goalTool(),
    ...jobTools({ registry: new JobRegistry(), sessionId, ownerStep: () => undefined, run: () => { throw new Error("never runs"); } }),
    ...new NativeTerminalTools({ workspace, sessionId }).tools()
  ];
}

/** Every listed schema validated as a JSON Schema; an invalid one throws, naming the tool. */
export function nativeToolSchemas(workspace: string): NativeToolSchemaListing {
  const validator = new AjvJsonSchemaValidator();
  const tools = inertDefinitions(workspace).map((tool): NativeToolSchema => {
    const parameters = (tool.parameters ?? { type: "object" }) as Record<string, unknown>;
    try {
      validator.getValidator(parameters as Parameters<AjvJsonSchemaValidator["getValidator"]>[0]);
    } catch (error) {
      throw new Error(`tool "${tool.name}" publishes an invalid JSON Schema: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { name: tool.name, actionClass: tool.actionClass, description: tool.description, parameters, schemaDigestSha256: sha256Hex(canonicalize(parameters)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const listed = new Set(tools.map((tool) => tool.name));
  const missing = NATIVE_BUILTIN_CAPABILITIES.filter((capability) => !listed.has(capability.name) && !SCHEMA_UNAVAILABLE.has(capability.name));
  if (missing.length > 0) throw new Error(`native capabilities without a listed schema: ${missing.map((capability) => capability.name).join(", ")}`);
  return { tools, unavailable: [...SCHEMA_UNAVAILABLE].sort(), documentDigestSha256: sha256Hex(canonicalize(tools)) };
}
