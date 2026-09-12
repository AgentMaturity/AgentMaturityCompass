/** deepseek-chat@1: first-party reasoning/text/function encoding from signed
 * EncodableRequest parts. No OpenAI encoder, remote state, SDK or Pi dependency.
 * Registered by exact identity in the shared live/cold request registry.
 */
import { canonicalize } from "../../utils/json.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError, type EncodablePart, type EncodableRequest } from "./requestSpec.js";
import { encodeProviderToolNames } from "./providerToolNames.js";
import { toolResultTextEnvelope } from "./toolResultTextEnvelope.js";
import { assertDeepseekJson, assertDeepseekKeys, deepseekObject, deepseekParams,
  DEEPSEEK_CHAT_ID, DEEPSEEK_CHAT_VERSION } from "../providers/deepseekContract.js";

function fail(detail: string): never { throw new RequestEncodingError(`DeepSeek request: ${detail}`); }
function string(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && (value.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(value)))) {
    return fail(`invalid ${label}`);
  }
  return value;
}
const PART_KEYS: Readonly<Record<EncodablePart["kind"], readonly string[]>> = {
  text: ["kind", "text"], thinking: ["kind", "text"],
  tool_use: ["kind", "toolCallId", "toolName", "argumentsJson"],
  tool_result: ["kind", "toolCallId", "isError", "text"], image: ["kind", "sha256"], audio: ["kind"]
};

function validateChoice(choice: unknown, hasTools: boolean): void {
  if (choice === undefined) return;
  if (typeof choice === "string" && ["auto", "none", "required"].includes(choice)) {
    if (!hasTools && choice !== "none") fail("tool_choice requires nonempty offered tools");
    return;
  }
  if (!hasTools || !deepseekObject(choice) || choice.type !== "function" || !deepseekObject(choice.function)) {
    return fail("tool_choice must select an offered function");
  }
  assertDeepseekKeys(choice, ["type", "function"], "tool_choice");
  assertDeepseekKeys(choice.function, ["name"], "tool_choice.function");
  string(choice.function.name, "tool_choice function name", true);
}

function validateRequest(request: EncodableRequest): void {
  assertDeepseekJson(request);
  if (!deepseekObject(request)) fail("expected an object");
  assertDeepseekKeys(request, ["model", "params", "system", "tools", "messages"], "request");
  string(request.model, "model", true);
  if (request.system !== null) string(request.system, "system");
  if (!Array.isArray(request.messages) || request.messages.length === 0) fail("nonempty history is required");
  if (request.tools !== null) {
    if (!Array.isArray(request.tools) || request.tools.length === 0 || request.tools.length > 128) {
      fail("tools must be null or a nonempty list of at most 128 functions; empty tools have ambiguous replay semantics");
    }
    for (const tool of request.tools) {
      if (!deepseekObject(tool)) fail("invalid function schema");
      assertDeepseekKeys(tool, ["name", "description", "parameters"], "tool");
      string(tool.name, "tool name", true); string(tool.description, "tool description");
      if (!deepseekObject(tool.parameters)) fail("function parameters require a JSON Schema object");
    }
  }
  for (const message of request.messages) {
    if (!deepseekObject(message)) fail("invalid history message");
    assertDeepseekKeys(message, ["role", "parts"], "message");
    if (typeof message.role !== "string" || !["user", "assistant", "tool"].includes(message.role)) fail("history role must be user/assistant/tool; system text has its own signed source");
    if (!Array.isArray(message.parts) || message.parts.length === 0) fail("empty or malformed history parts");
    for (const part of message.parts) {
      if (!deepseekObject(part) || typeof part.kind !== "string" || !Object.hasOwn(PART_KEYS, part.kind)) fail("unknown input modality");
      if (part.kind === "audio") fail("native audio input is unsupported by deepseek-chat@1");
      assertDeepseekKeys(part, PART_KEYS[part.kind as EncodablePart["kind"]], "part");
      if (part.kind === "image") fail("signed image input is not implemented by deepseek-chat@1");
    }
  }
}

export const deepseekChatEncoder: RequestEncoder = {
  id: DEEPSEEK_CHAT_ID,
  version: DEEPSEEK_CHAT_VERSION,
  encode(request: EncodableRequest): Buffer {
    validateRequest(request);
    const params = deepseekParams(request.params);
    const hasTools = request.tools !== null;
    validateChoice(params.tool_choice, hasTools);
    // Reuse AMC's deterministic function-name grammar only. This is not an
    // OpenAI wire adapter or a claim of general endpoint compatibility.
    const mapped = encodeProviderToolNames({ ...request, params }, "deepseek-chat");
    const messages: Record<string, unknown>[] = [];
    const callIds = new Set<string>(), pending = new Set<string>();
    if (request.system !== null) messages.push({ role: "system", content: request.system });
    for (const message of mapped.messages) {
      if (message.role !== "tool" && pending.size) fail("all preceding function calls need exactly one result before another user/assistant message");
      if (message.role === "tool") {
        for (const part of message.parts) {
          if (part.kind !== "tool_result") fail("tool history requires keyed tool_result parts only");
          const id = string(part.toolCallId, "tool result ID", true);
          if (!pending.delete(id)) fail("tool result has no unmatched preceding call (or is duplicated)");
          messages.push({ role: "tool", tool_call_id: id, content: toolResultTextEnvelope(part) });
        }
        continue;
      }
      if (message.role === "user") {
        let content = "";
        for (const part of message.parts) {
          if (part.kind !== "text") fail("user history supports text only");
          content += string(part.text, "user text");
        }
        messages.push({ role: "user", content });
        continue;
      }
      let content = "", reasoning = "", hasReasoning = false, phase = 0;
      const calls: Record<string, unknown>[] = [];
      for (const part of message.parts) {
        if (part.kind === "thinking") {
          if (phase > 0) fail("thinking after text/tools cannot be replayed without reordering signed content");
          hasReasoning = true; reasoning += string(part.text, "thinking text");
        } else if (part.kind === "text") {
          if (phase > 1) fail("text after tool calls cannot be replayed without reordering signed content");
          phase = 1; content += string(part.text, "assistant text");
        } else if (part.kind === "tool_use") {
          phase = 2;
          const id = string(part.toolCallId, "tool call ID", true);
          if (callIds.has(id)) fail("duplicate historical tool call ID");
          const name = string(part.toolName, "wire tool name", true);
          const argumentsJson = string(part.argumentsJson, "tool arguments");
          let parsed: unknown;
          try { parsed = JSON.parse(argumentsJson); } catch { fail("tool arguments must be a JSON object"); }
          if (!deepseekObject(parsed)) fail("tool arguments must be a JSON object");
          assertDeepseekJson(parsed, "tool arguments");
          callIds.add(id); pending.add(id);
          calls.push({ id, type: "function", function: { name, arguments: argumentsJson } });
        } else fail("assistant history supports thinking, text and function calls only");
      }
      if (hasReasoning && !hasTools) {
        fail("DeepSeek ignores reasoning history without tools; full replay requires explicitly offered functions, not silent omission");
      }
      if (hasTools && deepseekObject(params.thinking) && params.thinking.type === "enabled" && !hasReasoning) {
        fail("enabled thinking with tools requires recorded reasoning for each assistant message; missing history cannot be invented");
      }
      messages.push({ role: "assistant", content: content.length ? content : null,
        ...(hasReasoning ? { reasoning_content: reasoning } : {}),
        ...(calls.length ? { tool_calls: calls } : {}) });
    }
    if (pending.size) fail("history ends with unanswered function calls");
    const body = { ...mapped.params, model: mapped.model, messages, stream: true,
      stream_options: { include_usage: true },
      ...(mapped.tools === null ? {} : { tools: mapped.tools.map(tool => ({ type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) }) };
    return Buffer.from(canonicalize(body), "utf8");
  }
};
