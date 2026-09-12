import { assertNativeImageBytes, MAX_NATIVE_IMAGES, MAX_NATIVE_IMAGE_INPUT_BYTES } from "../../attachments/nativeImageInput.js";
import { readGeminiPart, snapshotRecordedGeminiPart } from "../../session/geminiPartMeta.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { GEMINI_CONTENT_ID, GEMINI_CONTENT_VERSION, geminiFail, geminiKeys, geminiModel, geminiObject, geminiParams, geminiText } from "../providers/geminiContract.js";
import { assertGeminiJsonValue } from "../providers/geminiJson.js";
import { bindProviderToolNames, providerToolWireName } from "./providerToolNames.js";
import type { RequestEncoder } from "./requestEncoder.js";

/** GenerateContent REST, not Chat compatibility, Vertex or the Interactions API.
 * New identity: no previously recorded encoder bytes are changed. Original
 * signed Gemini parts are embedded verbatim rather than normalized through JSON.
 */
export const geminiContentEncoder: RequestEncoder = {
  id: GEMINI_CONTENT_ID,
  version: GEMINI_CONTENT_VERSION,
  encode(request) {
    geminiModel(request.model);
    const params = geminiParams(request.params);
    if (request.system !== null) geminiText(request.system, "system text");
    bindProviderToolNames(request.tools ?? []);
    const offered = new Set(request.tools?.map(tool => tool.name) ?? []);
    const declarations = (request.tools ?? []).map(tool => {
      assertGeminiJsonValue(tool);
      geminiKeys(tool as unknown as Record<string, unknown>, ["name", "description", "parameters"], "tool schema");
      geminiText(tool.description, "tool description");
      if (!geminiObject(tool.parameters)) return geminiFail("a function schema must be an object");
      return { name: providerToolWireName(tool.name), description: tool.description, parametersJsonSchema: tool.parameters };
    });
    if (params.toolConfig !== undefined) {
      if (declarations.length === 0) return geminiFail("toolConfig requires offered functions");
      const tool = params.toolConfig as { functionCallingConfig: Record<string, unknown> };
      const allowed = tool.functionCallingConfig.allowedFunctionNames;
      if (Array.isArray(allowed)) tool.functionCallingConfig.allowedFunctionNames = allowed.map(name => {
        if (!offered.has(name)) return geminiFail("allowedFunctionNames must select currently offered canonical names");
        return providerToolWireName(name as string);
      });
    }
    const contents: { role: "user" | "model"; parts: string[] }[] = [];
    const pending = new Map<string, { name: string; wireId?: string }>();
    const allCalls = new Set<string>(), seenResponses = new Set<string>();
    let activeResponse: string | null = null, nextPart = 0, imageCount = 0, imageBytes = 0;
    for (const message of request.messages) {
      if (!["user", "assistant", "tool"].includes(message.role) || !Array.isArray(message.parts) || message.parts.length === 0) return geminiFail("unsupported or empty history message");
      if (message.role !== "tool" && pending.size > 0) return geminiFail("unanswered function calls cannot be skipped by subsequent history");
      const encoded: string[] = [];
      for (const part of message.parts) {
        if (part === null || typeof part !== "object") return geminiFail("invalid history part");
        const metadata = "gemini" in part ? part.gemini : undefined;
        if (metadata !== undefined) {
          if (message.role !== "assistant" || !["text", "thinking", "tool_use"].includes(part.kind)) return geminiFail("Gemini provenance requires its original assistant part");
          geminiKeys(part as unknown as Record<string, unknown>, part.kind === "tool_use"
            ? ["kind", "toolCallId", "toolName", "argumentsJson", "gemini"] : ["kind", "text", "gemini"], "signed part");
          const scope = `${metadata.headerEventId}\0${metadata.responseId}`;
          if (scope !== activeResponse) {
            if (seenResponses.has(scope)) return geminiFail("a signed Gemini response was reordered or revisited");
            seenResponses.add(scope); activeResponse = scope; nextPart = 0;
          }
          if (metadata.partIndex !== nextPart++) return geminiFail("signed Gemini part order has a gap or duplicate");
          const raw = readGeminiPart(metadata);
          if (part.kind === "tool_use") {
            const wireName = providerToolWireName(part.toolName);
            snapshotRecordedGeminiPart(metadata, part.kind, part.argumentsJson, { id: part.toolCallId, wireName });
            if (allCalls.has(part.toolCallId)) return geminiFail("duplicate historical function-call key");
            allCalls.add(part.toolCallId);
            const wireId = raw.fields!.get("functionCall")!.fields!.get("id")?.value as string | undefined;
            pending.set(part.toolCallId, { name: wireName, ...(wireId === undefined ? {} : { wireId }) });
          } else if (part.kind === "text" || part.kind === "thinking") {
            snapshotRecordedGeminiPart(metadata, part.kind, part.text);
          } else return geminiFail("unsupported Gemini signed part");
          encoded.push(metadata.partJson);
          continue;
        }
        switch (part.kind) {
          case "text":
            geminiKeys(part as unknown as Record<string, unknown>, ["kind", "text"], "text part");
            if (message.role === "tool") return geminiFail("tool output requires its original call key");
            encoded.push(canonicalize({ text: geminiText(part.text, "history text") }));
            break;
          case "image": {
            geminiKeys(part as unknown as Record<string, unknown>, ["kind", "sha256", "mediaType", "bytes"], "image part");
            if (message.role !== "user" || !Buffer.isBuffer(part.bytes)) return geminiFail("images require original signed user payload bytes");
            assertNativeImageBytes(part.bytes, part.mediaType);
            // Intersection of the native signed-image codec and documented Gemini
            // raster MIME types. No GIF conversion or MIME relabelling is invented.
            if (!["image/png", "image/jpeg", "image/webp"].includes(part.mediaType!)) return geminiFail("image MIME is not supported by this Gemini encoder");
            if (sha256Hex(part.bytes) !== part.sha256) return geminiFail("image digest does not match the signed original");
            imageBytes += part.bytes.length;
            if (++imageCount > MAX_NATIVE_IMAGES || imageBytes > MAX_NATIVE_IMAGE_INPUT_BYTES) return geminiFail("image history exceeds native bounds; no truncation was performed");
            encoded.push(canonicalize({ inlineData: { mimeType: part.mediaType, data: part.bytes.toString("base64") } }));
            break;
          }
          case "tool_result": {
            geminiKeys(part as unknown as Record<string, unknown>, ["kind", "toolCallId", "isError", "text"], "function response");
            if (message.role !== "tool" || typeof part.isError !== "boolean") return geminiFail("function responses require the tool role and explicit error state");
            const call = pending.get(part.toolCallId);
            if (!call) return geminiFail("function response has no unanswered original call");
            if (call.wireId === undefined && pending.keys().next().value !== part.toolCallId) return geminiFail("ID-less function responses must preserve original call order");
            pending.delete(part.toolCallId);
            const text = geminiText(part.text, "function response text");
            encoded.push(canonicalize({ functionResponse: { name: call.name,
              ...(call.wireId === undefined ? {} : { id: call.wireId }), response: part.isError ? { error: text } : { output: text } } }));
            break;
          }
          case "thinking": case "tool_use": return geminiFail("reasoning and function-call replay require original signed Gemini part provenance");
          default: return geminiFail("unsupported input modality");
        }
      }
      const role = message.role === "assistant" ? "model" : "user";
      const previous = contents[contents.length - 1];
      if (previous?.role === role) previous.parts.push(...encoded);
      else contents.push({ role, parts: encoded });
    }
    if (pending.size !== 0) return geminiFail("function-call history ends without every keyed result");
    if (contents.length === 0 || contents[0]!.role !== "user" || contents[contents.length - 1]!.role !== "user") return geminiFail("a request requires user input and cannot end with an assistant prefill");
    const fields: Record<string, string> = {
      contents: `[${contents.map(content => `{"parts":[${content.parts.join(",")}],"role":${JSON.stringify(content.role)}}`).join(",")}]`,
      generationConfig: canonicalize(params.generationConfig)
    };
    if (request.system !== null) fields.systemInstruction = canonicalize({ parts: [{ text: request.system }] });
    if (declarations.length > 0) fields.tools = canonicalize([{ functionDeclarations: declarations }]);
    if (params.toolConfig !== undefined) fields.toolConfig = canonicalize(params.toolConfig);
    const bytes = Buffer.from(`{${Object.keys(fields).sort().map(key => `${JSON.stringify(key)}:${fields[key]}`).join(",")}}`, "utf8");
    if (bytes.length > 32 * 1024 * 1024) return geminiFail("request exceeds the native body bound");
    return bytes;
  }
};
