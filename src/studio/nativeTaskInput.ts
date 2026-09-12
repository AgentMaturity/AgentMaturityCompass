import { z } from "zod";
import { MAX_WIRE_LINE_BYTES } from "../wire/ndjsonFraming.js";
import { materializeAcpImages } from "../acp/acpPromptInput.js";
import { advertisesNativeAudio, materializeAcpAudio } from "../acp/acpAudioInput.js";
import { NativeImageInputError } from "../attachments/nativeImageInput.js";
import { materializeNativeInputParts, snapshotNativeInputParts, NATIVE_ORDERED_INPUT_FORMAT,
  type NativeInputPart, type QueuedNativeInputPart } from "../attachments/nativeOrderedInput.js";
import { materializeNativeAudioParts, snapshotNativeAudioParts, NativeAudioInputError, NATIVE_AUDIO_INPUT_FORMAT,
  type NativeAudioPart, type QueuedNativeAudioPart } from "../attachments/nativeAudioInput.js";
import type { AMCNativeSession, AMCNativeTurn } from "../sdk/nativeAgentClient.js";
import { nativeTaskValidationSelectionSchema } from "./nativeTaskValidation.js";
import { NativeTaskServiceError, type NativeTaskInputCapabilities, type NativeTaskPrompt, type NativeTaskProvider,
  type NativeTaskStartRequest, type NativeTaskTurn } from "./nativeTaskTypes.js";

export const NATIVE_TASK_MAX_TEXT_BYTES = 16_384;
// Reserve more than the worst escaped 200-character descriptor session ID plus RPC metadata.
export const NATIVE_TASK_MAX_PARTS_BYTES = MAX_WIRE_LINE_BYTES - 2048;
const controls = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const text = z.string().max(NATIVE_TASK_MAX_TEXT_BYTES).refine(value => !controls.test(value)
  && Buffer.from(value, "utf8").toString("utf8") === value
  && Buffer.byteLength(value, "utf8") <= NATIVE_TASK_MAX_TEXT_BYTES, "Text must be lossless UTF-8 within the Studio bound.");
const image = z.object({ type: z.literal("image"), mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  data: z.string().min(1).max(NATIVE_TASK_MAX_PARTS_BYTES) }).strict();
const audio = z.object({ type: z.literal("audio"), mimeType: z.literal("audio/wav"),
  data: z.string().min(1).max(NATIVE_TASK_MAX_PARTS_BYTES) }).strict();
export const nativeTaskStructuredInputSchema = z.object({
  format: z.enum([NATIVE_ORDERED_INPUT_FORMAT, NATIVE_AUDIO_INPUT_FORMAT]),
  parts: z.array(z.discriminatedUnion("type", [z.object({ type: z.literal("text"), text }).strict(), image, audio])).min(1).max(256)
}).strict().superRefine((value, context) => {
  const images = value.parts.filter(part => part.type === "image").length;
  const audios = value.parts.filter(part => part.type === "audio").length;
  if (images > 8 || audios > 8 || (value.format === NATIVE_ORDERED_INPUT_FORMAT ? !images || audios > 0 : !audios))
    context.addIssue({ code: "custom", message: "Choose the exact image-bearing or audio-bearing input format, with at most eight of each attachment." });
  if (value.parts.reduce((sum, part) => sum + (part.type === "text" ? Buffer.byteLength(part.text, "utf8") : 0), 0) > NATIVE_TASK_MAX_TEXT_BYTES)
    context.addIssue({ code: "custom", message: "Combined text parts exceed the 16 KiB Studio bound." });
});
const payload = { prompt: text.refine(value => value.trim().length > 0, "Enter a task.").optional(),
  input: nativeTaskStructuredInputSchema.optional() };
function exactlyOne(value: { prompt?: string; input?: unknown }, context: z.RefinementCtx): void {
  if ((value.prompt !== undefined) === (value.input !== undefined))
    context.addIssue({ code: "custom", message: "Supply exactly one of prompt or input; text is never prepended to an ordered sequence." });
}
export const nativeTaskStartSchema = z.object({ clientRequestId: z.string().uuid(),
  agentId: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/),
  provider: z.enum(["stub", "openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama"]),
  model: z.string().min(1).max(200).refine(value => !/[\x00-\x1f\x7f]/.test(value)).optional(),
  tools: z.enum(["none", "workspace"]), toolsDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  validation: nativeTaskValidationSelectionSchema.optional(), ...payload,
  maxSteps: z.number().int().min(1).max(8).optional(), maxTokens: z.number().int().min(1).max(1024).optional()
}).strict().superRefine((value, context) => {
  exactlyOne(value, context);
  if ((value.tools === "workspace") !== (value.toolsDigest !== undefined))
    context.addIssue({ code: "custom", message: "Workspace tools require the displayed scope digest; no-tools tasks must omit it." });
  if (value.validation && value.tools !== "workspace") context.addIssue({ code: "custom", message: "Public checks require signed workspace tools." });
}).transform(value => value as NativeTaskStartRequest);
export const nativeTaskTurnSchema = z.object({ clientRequestId: z.string().uuid(),
  expectedRevision: z.number().int().min(1).max(32), ...payload
}).strict().superRefine(exactlyOne).transform(value => value as NativeTaskTurn);

/** Inspect data descriptors before a schema can invoke caller accessors or erase unknown authority fields. */
export function assertNativeTaskData(value: unknown): void {
  let nodes = 0, bytes = 0;
  const refuse = (): never => { throw new NativeTaskServiceError("INPUT_INVALID", 400, "Native requests require bounded plain data, without accessors, sparse arrays or hidden fields."); };
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 8) refuse();
    if (typeof item === "string") { bytes += Buffer.byteLength(item, "utf8"); if (bytes > 1024 * 1024) refuse(); return; }
    if (item === null || item === undefined || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) return;
    if (typeof item !== "object") return refuse();
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype || item.length > 256 : prototype !== Object.prototype && prototype !== null) refuse();
    const keys = Reflect.ownKeys(item);
    if (array && keys.length !== item.length + 1) refuse();
    for (const key of keys) {
      if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) refuse();
      if (array && key === "length") continue;
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key as string) || Number(key) >= item.length)) refuse();
      const property = Object.getOwnPropertyDescriptor(item, key)!;
      if (!("value" in property) || !property.enumerable) refuse();
      visit(property.value, depth + 1);
    }
  };
  visit(value, 0);
}

export function nativeTaskInputCapabilities(provider: NativeTaskProvider): NativeTaskInputCapabilities {
  // deepseek-chat@1 refuses signed image input at its encoder; ollama-chat@1 carries images in its separate array.
  const images = provider !== "stub" && provider !== "deepseek", audio = provider === "gemini-audio";
  return { formats: ["text", ...(images ? [NATIVE_ORDERED_INPUT_FORMAT] as const : []), ...(audio ? [NATIVE_AUDIO_INPUT_FORMAT] as const : [])],
    imageMimeTypes: !images ? [] : provider === "gemini" || audio ? ["image/png", "image/jpeg", "image/webp"] : ["image/png", "image/jpeg", "image/gif", "image/webp"],
    audioMimeTypes: audio ? ["audio/wav"] : [], maxParts: 256, maxImages: images ? 8 : 0, maxAudios: audio ? 8 : 0,
    maxTextBytes: NATIVE_TASK_MAX_TEXT_BYTES, maxSerializedPartsBytes: NATIVE_TASK_MAX_PARTS_BYTES,
    maxPromptFrameBytes: MAX_WIRE_LINE_BYTES, modelSupport: "not-probed" };
}
export type PreparedNativeTaskInput =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "image"; readonly parts: readonly QueuedNativeInputPart[] }
  | { readonly kind: "audio"; readonly parts: readonly QueuedNativeAudioPart[] };

/** Synchronous pre-admission snapshot. Never persist the browser's bytes in the task descriptor. */
export function prepareNativeTaskInput(request: NativeTaskPrompt, provider: NativeTaskProvider): PreparedNativeTaskInput {
  assertNativeTaskData(request);
  if (request.input === undefined) {
    const prompt = payload.prompt.safeParse(request.prompt);
    if (!prompt.success || prompt.data === undefined) throw new NativeTaskServiceError("PROMPT_INVALID", 400, "Enter a task of at most 16 KiB without control characters.");
    return Object.freeze({ kind: "text", text: prompt.data });
  }
  if (request.prompt !== undefined) throw new NativeTaskServiceError("INPUT_INVALID", 400, "Prompt and ordered input are mutually exclusive.");
  const parsed = nativeTaskStructuredInputSchema.safeParse(request.input);
  if (!parsed.success) throw new NativeTaskServiceError("INPUT_INVALID", 400, "Invalid ordered native task input.");
  const input = parsed.data, supported = nativeTaskInputCapabilities(provider);
  if (!supported.formats.includes(input.format) || input.parts.some(part => part.type === "image" && !supported.imageMimeTypes.includes(part.mimeType)))
    throw new NativeTaskServiceError("INPUT_UNSUPPORTED", 400, "The pinned provider does not support this original input format or MIME. No conversion or fallback was used.");
  // Include JSON escaping, base64 and a worst-case RPC envelope BEFORE any signed admission or child startup.
  const params = { sessionId: "\u0000".repeat(200), prompt: input.parts,
    _meta: { "dev.agentmaturity.amc": { inputFormat: input.format } } };
  if (Buffer.byteLength(JSON.stringify(input.parts), "utf8") > NATIVE_TASK_MAX_PARTS_BYTES
    || Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id: Number.MAX_SAFE_INTEGER, method: "session/prompt", params }), "utf8") > MAX_WIRE_LINE_BYTES)
    throw new NativeTaskServiceError("INPUT_TOO_LARGE", 413, "Original input exceeds the Studio ACP frame bound, including base64 and metadata. No partial input was admitted.");
  try {
    const images = materializeAcpImages(input.parts.filter(part => part.type === "image"));
    let imageIndex = 0, audioIndex = 0;
    if (input.format === NATIVE_ORDERED_INPUT_FORMAT) {
      const parts: NativeInputPart[] = input.parts.map(part => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image") return { type: "image", image: images[imageIndex++]! };
        throw new NativeImageInputError("Audio is not an ordered image part.");
      });
      return Object.freeze({ kind: "image", parts: snapshotNativeInputParts(parts) });
    }
    const parts: NativeAudioPart[] = input.parts.map(part => part.type === "text" ? { type: "text", text: part.text }
      : part.type === "image" ? { type: "image", image: images[imageIndex++]! }
        : { type: "audio", audio: materializeAcpAudio(part, audioIndex++) });
    return Object.freeze({ kind: "audio", parts: snapshotNativeAudioParts(parts) });
  } catch (error) {
    if (error instanceof NativeAudioInputError || error instanceof NativeImageInputError)
      throw new NativeTaskServiceError("INPUT_INVALID", 400, "Original attachment bytes, canonical base64, MIME, headers or native admission policy were refused. No attachment was converted or discarded.");
    throw error;
  }
}

/** Discovery is not negotiation: require the running native client's exact version before dispatch. */
export function assertNativeTaskInputCapability(capabilities: Readonly<Record<string, unknown>>, input: PreparedNativeTaskInput): void {
  if (input.kind === "text") return;
  const prompt = capabilities.promptCapabilities as { image?: unknown } | undefined;
  const meta = capabilities._meta as Record<string, unknown> | undefined;
  const extension = meta?.["dev.agentmaturity.amc"] as { orderedImageInput?: unknown } | undefined;
  const supported = input.kind === "audio" ? advertisesNativeAudio(capabilities)
    : prompt?.image === true && extension?.orderedImageInput === NATIVE_ORDERED_INPUT_FORMAT;
  if (!supported || (input.parts.some(part => part.type === "image") && prompt?.image !== true))
    throw new NativeTaskServiceError("INPUT_NOT_NEGOTIATED", 409, "The native runtime did not negotiate the exact requested input contract. No fallback or prompt was submitted.");
}

export function dispatchNativeTaskInput(session: Pick<AMCNativeSession, "prompt" | "promptParts" | "promptAudioParts">,
  input: PreparedNativeTaskInput): AMCNativeTurn {
  return input.kind === "text" ? session.prompt(input.text)
    : input.kind === "image" ? session.promptParts(materializeNativeInputParts(input.parts))
      : session.promptAudioParts(materializeNativeAudioParts(input.parts));
}
