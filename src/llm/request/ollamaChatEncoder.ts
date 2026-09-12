import { assertNativeImageBytes, MAX_NATIVE_IMAGES, MAX_NATIVE_IMAGE_INPUT_BYTES } from "../../attachments/nativeImageInput.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { OLLAMA_CHAT_ID, OLLAMA_CHAT_VERSION, OLLAMA_WIRE_CONTRACT, ollamaArray, ollamaFail,
  ollamaKeys, ollamaObject, ollamaParams, ollamaText } from "../providers/ollamaContract.js";
import { assertOllamaJsonValue, parseOllamaJson } from "../providers/ollamaJson.js";
import { readOllamaCallKey, type OllamaCallIdentity } from "../providers/ollamaToolIdentity.js";
import { bindProviderToolNames, providerToolWireName } from "./providerToolNames.js";
import type { RequestEncoder } from "./requestEncoder.js";
import type { EncodablePart, EncodableRequest } from "./requestSpec.js";
import { toolResultTextEnvelope } from "./toolResultTextEnvelope.js";

/** Values already serialized to JSON, including untouched argument substrings. */
function object(fields: Record<string, string>): string {
  return `{${Object.keys(fields).sort().map(key => `${JSON.stringify(key)}:${fields[key]}`).join(",")}}`;
}
const PART_KEYS: Readonly<Record<EncodablePart["kind"], readonly string[]>> = {
  text: ["kind", "text"], thinking: ["kind", "text"],
  tool_use: ["kind", "toolCallId", "toolName", "argumentsJson"],
  tool_result: ["kind", "toolCallId", "isError", "text"],
  image: ["kind", "sha256", "mediaType", "bytes"], audio: ["kind"]
};

/** Native /api/chat, never /v1/chat/completions. Ollama has scalar content and
 * a separate images array, not an ordered content-part array. Encode each signed
 * USER part as its own user message, in original order, including empty text.
 * Image-only messages carry required content:"" as wire framing, not an invented
 * signed text row. This explicit v1 projection does not hoist images, concatenate
 * adjacent text parts or pretend to offer a native mixed-part content array.
 */
export const ollamaChatEncoder: RequestEncoder = Object.freeze({
  id: OLLAMA_CHAT_ID,
  version: OLLAMA_CHAT_VERSION,
  encode(request: EncodableRequest): Buffer {
    ollamaKeys(request, ["model", "params", "system", "tools", "messages"], "request");
    const model = ollamaText(request.model, "model", true), params = ollamaParams(request.params);
    if (request.system !== null) ollamaText(request.system, "system text");
    ollamaArray(request.messages, "messages", 16384);
    if (!request.messages.length) ollamaFail("a nonempty user history is required");
    if (request.tools !== null) {
      ollamaArray(request.tools, "tools", 128);
      for (const tool of request.tools) {
        ollamaKeys(tool, ["name", "description", "parameters"], "tool schema");
        try { assertOllamaJsonValue(tool); } catch { ollamaFail("tool schema is not passive lossless JSON"); }
        ollamaText(tool.description, "tool description");
        if (!ollamaObject(tool.parameters)) ollamaFail("tool parameters require a JSON Schema object");
      }
    }
    bindProviderToolNames(request.tools ?? []);
    const messages: string[] = [], allCalls = new Set<string>(), streams = new Set<string>();
    const pending = new Map<string, { name: string; identity: OllamaCallIdentity }>();
    let imageCount = 0, imageBytes = 0, partCount = 0;
    if (request.system !== null) messages.push(canonicalize({ role: "system", content: request.system }));
    for (const message of request.messages) {
      ollamaKeys(message, ["role", "parts"], "message");
      if (!["user", "assistant", "tool"].includes(message.role)) ollamaFail("system history has its own signed source; unsupported role");
      ollamaArray(message.parts, "parts", 8192);
      partCount += message.parts.length;
      if (!message.parts.length || partCount > 16384) ollamaFail("history part count is empty or exceeds its bound");
      if (message.role !== "tool" && pending.size) ollamaFail("unanswered tool calls cannot be skipped");
      let content = "", thinking = "", hasThinking = false, phase = 0, stream: string | null = null;
      const calls: string[] = [];
      for (const part of message.parts) {
        ollamaKeys(part, ["kind", "text", "toolCallId", "toolName", "argumentsJson", "isError", "sha256", "mediaType", "bytes"], "part");
        if (typeof part.kind !== "string" || !Object.hasOwn(PART_KEYS, part.kind)) ollamaFail("unsupported input modality");
        if (part.kind === "audio") ollamaFail("audio input is unsupported by ollama-chat@1; it will not become a transcript");
        ollamaKeys(part, PART_KEYS[part.kind], "part");
        if (message.role === "user") {
          if (part.kind === "text") messages.push(canonicalize({ role: "user", content: ollamaText(part.text, "user text") }));
          else if (part.kind === "image") {
            if (!Buffer.isBuffer(part.bytes)) ollamaFail("image input requires its original signed binary, not a URL, path or digest alone");
            try { assertNativeImageBytes(part.bytes, part.mediaType); } catch { ollamaFail("image bytes and MIME do not match a supported native raster"); }
            if (!OLLAMA_WIRE_CONTRACT.imageMimeTypes.some(type => type === part.mediaType)) ollamaFail("this Ollama version supports original PNG/JPEG/WebP only");
            if (sha256Hex(part.bytes) !== part.sha256) ollamaFail("image bytes disagree with their signed digest");
            imageBytes += part.bytes.length;
            if (++imageCount > MAX_NATIVE_IMAGES || imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) ollamaFail("image history exceeds native bounds; no truncation was performed");
            messages.push(canonicalize({ role: "user", content: "", images: [part.bytes.toString("base64")] }));
          } else ollamaFail("user input requires text or original images");
          continue;
        }
        if (message.role === "tool") {
          if (part.kind !== "tool_result") ollamaFail("tool history needs a keyed result");
          const call = pending.get(part.toolCallId);
          if (!call || pending.keys().next().value !== part.toolCallId) ollamaFail("tool results must match original call order exactly once");
          ollamaText(part.text, "tool result text");
          messages.push(canonicalize({ role: "tool", tool_name: call.name, content: toolResultTextEnvelope(part),
            ...(call.identity.wireId === null ? {} : { tool_call_id: call.identity.wireId }) }));
          pending.delete(part.toolCallId);
          continue;
        }
        if (part.kind === "thinking") {
          if (phase > 0) ollamaFail("thinking after content/tools cannot be replayed without reordering");
          hasThinking = true; thinking += ollamaText(part.text, "thinking");
        } else if (part.kind === "text") {
          if (phase > 1) ollamaFail("content after tool calls cannot be replayed without reordering");
          phase = 1; content += ollamaText(part.text, "assistant content");
        } else if (part.kind === "tool_use") {
          phase = 2;
          const identity = readOllamaCallKey(part.toolCallId), name = providerToolWireName(part.toolName);
          if (stream === null) {
            if (streams.has(identity.stream)) ollamaFail("an original Ollama response was revisited or split");
            stream = identity.stream; streams.add(stream);
          }
          if (identity.stream !== stream || identity.ordinal !== calls.length || allCalls.has(part.toolCallId)) ollamaFail("historical call identity/order changed");
          ollamaText(part.argumentsJson, "tool arguments");
          try { if (!parseOllamaJson(part.argumentsJson).fields) ollamaFail("tool arguments require an object"); }
          catch { ollamaFail("tool arguments must be a lossless JSON object without duplicate keys"); }
          const fn: Record<string, string> = { name: JSON.stringify(name), arguments: part.argumentsJson };
          if (identity.wireIndex !== null) fn.index = String(identity.wireIndex);
          const call: Record<string, string> = { function: object(fn) };
          if (identity.wireId !== null) call.id = JSON.stringify(identity.wireId);
          if (identity.wireType !== null) call.type = JSON.stringify(identity.wireType);
          calls.push(object(call)); allCalls.add(part.toolCallId); pending.set(part.toolCallId, { name, identity });
        } else ollamaFail("assistant history supports thinking, content and native tool calls only");
      }
      if (message.role === "assistant") {
        const fields: Record<string, string> = { role: '"assistant"', content: JSON.stringify(content) };
        if (hasThinking) fields.thinking = JSON.stringify(thinking);
        if (calls.length) fields.tool_calls = `[${calls.join(",")}]`;
        messages.push(object(fields));
      }
    }
    if (pending.size) ollamaFail("history ends with unanswered tool calls");
    if (request.messages[0]!.role !== "user" || request.messages.at(-1)!.role === "assistant") ollamaFail("a generation needs user input or keyed results, not an assistant prefill");
    const fields: Record<string, string> = { model: JSON.stringify(model), messages: `[${messages.join(",")}]` };
    for (const [key, value] of Object.entries(params)) fields[key] = canonicalize(value);
    if (request.tools !== null) fields.tools = canonicalize(request.tools.map(tool => ({ type: "function",
      function: { name: providerToolWireName(tool.name), description: tool.description, parameters: tool.parameters } })));
    const bytes = Buffer.from(object(fields), "utf8");
    if (bytes.length > 32 * 1024 * 1024) ollamaFail("request exceeds the native body bound");
    return bytes;
  }
});
