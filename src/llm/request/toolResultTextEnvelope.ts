import { canonicalize } from "../../utils/json.js";
import { RequestEncodingError, type EncodablePart } from "./requestSpec.js";

/** AMC text representation; this is not an OpenAI wire-level error field. */
export function toolResultTextEnvelope(part: Extract<EncodablePart, { kind: "tool_result" }>): string {
  if (typeof part.isError !== "boolean" || typeof part.text !== "string" || typeof part.toolCallId !== "string" || !part.toolCallId) {
    throw new RequestEncodingError("Tool result requires an explicit boolean error state, original text and provider call ID");
  }
  // Both states are wrapped. A successful tool printing envelope-looking text
  // therefore remains nested data, never indistinguishable from a failed call.
  return canonicalize({ type: "amc.tool-result", version: 1, isError: part.isError, output: part.text });
}
