/**
 * @typedef {{name: string, text: string, bytes: number}} NativeTextAttachment
 * @typedef {{type: 'image' | 'audio', mimeType: string, name: string, bytes: number, data: string}} NativeMediaAttachment
 * @typedef {NativeTextAttachment | NativeMediaAttachment} NativeTaskAttachment
 * @typedef {{type: 'text', text: string} | {type: 'image' | 'audio', mimeType: string, data: string}} NativeTaskInputPart
 * @typedef {{format: string, parts: NativeTaskInputPart[]}} NativeTaskOrderedInput
 * @typedef {{configSha256: string, checkIds: string[]}} NativeSubmissionValidation
 * @typedef {{clientRequestId: string, prompt?: string, input?: NativeTaskOrderedInput, expectedRevision?: number, agentId?: string,
 *   provider?: string, model?: string, tools?: string, toolsDigest?: string, validation?: NativeSubmissionValidation,
 *   maxSteps?: number, maxTokens?: number}} NativeSubmissionBody The exact start or follow-up request body as P10's schemas admit it.
 */

/**
 * Retain one operator submission in this page only; never persist prompt or credentials.
 * @param {{url: string, body: NativeSubmissionBody, agentId: string, taskId: string | null, workspaceScope: string,
 *   csrfToken: string | null, adminToken: string | null, draftPrompt?: string, attachments?: ReadonlyArray<NativeTaskAttachment>}} submission
 * @returns {{url: string, body: NativeSubmissionBody, id: string, prompt: string | undefined, draftPrompt: string | undefined,
 *   draftAttachments: ReadonlyArray<NativeTaskAttachment>, agentId: string, taskId: string | null, kind: 'turn' | 'create',
 *   workspaceScope: string, csrfToken: string | null, adminToken: string | null}}
 */
export function captureNativeSubmission({ url, body, agentId, taskId, workspaceScope, csrfToken, adminToken,
  draftPrompt = body.prompt, attachments = [] }) {
  const copy = JSON.parse(JSON.stringify(body));
  const freeze = value => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  return Object.freeze({ url, body: freeze(copy), id: copy.clientRequestId, prompt: copy.prompt,
    draftPrompt, draftAttachments: freeze(JSON.parse(JSON.stringify(attachments))),
    agentId, taskId, kind: taskId ? "turn" : "create", workspaceScope, csrfToken, adminToken });
}

/**
 * Clearing an acknowledged submission must not discard a subsequently edited draft.
 * @param {{draftPrompt: string | undefined, draftAttachments: ReadonlyArray<NativeTaskAttachment>}} submission
 * @param {string} prompt
 * @param {ReadonlyArray<NativeTaskAttachment>} [attachments]
 */
export function nativeSubmissionDraftMatches(submission, prompt, attachments = []) {
  return submission.draftPrompt === prompt
    && JSON.stringify(submission.draftAttachments) === JSON.stringify(attachments);
}

export function nativeSubmissionScopeMatches(submission, { agentId, workspaceScope, csrfToken, adminToken }) {
  return submission.agentId === agentId && submission.workspaceScope === workspaceScope
    && submission.csrfToken === csrfToken && submission.adminToken === adminToken;
}

/** Polls only identify the first/last admission. A direct exact replay also acknowledges older turns. */
export function nativeSubmissionAcknowledged(submission, view, directResponse = false) {
  if (view.agentId !== submission.agentId) return false;
  if (submission.kind === "create") return view.clientRequestId === submission.id;
  return view.taskId === submission.taskId && view.revision >= submission.body.expectedRevision + 1
    && (directResponse || view.clientRequestId === submission.id || view.lastClientRequestId === submission.id);
}

export function definiteNativeSubmissionRefusal(error, previouslyUnconfirmed = false) {
  // Refusing a retry says nothing about whether the earlier request was admitted.
  // In particular, auth, rate-limit and ownership checks precede idempotent lookup.
  if (previouslyUnconfirmed) return false;
  // A proxy timeout or malformed response cannot establish whether admission happened.
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.status !== 408
    && error.code !== "INVALID_RESPONSE" && error.data?.ok === false && typeof error.data.error === "string";
}

export const NATIVE_TEXT_ATTACHMENT_LIMIT = 4;
const unsafeText = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const textExtension = /\.(?:txt|md|markdown|csv|tsv|json|jsonl|ya?ml|log|xml|html|css|[cm]?js|tsx?|jsx|py|rs|go|java|sh|sql|toml|ini)$/i;

/** Explicit file selection only. No upload, MIME inference, remote URL, or filesystem path grant. */
export async function readNativeTextAttachment(file, maximumBytes) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Refresh setup to obtain the task text limit.");
  if (!file || typeof file.name !== "string" || !file.name || file.name.length > 200
    || /[\x00-\x1f\x7f/\\]/.test(file.name)) throw new Error("Choose a text file with a plain filename of at most 200 characters.");
  if (!textExtension.test(file.name)) throw new Error("Attach a UTF-8 text, source, Markdown, CSV or JSON file here. Images and audio are not accepted by the text picker; use the original-media picker when the provider advertises support. PDFs are unsupported.");
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maximumBytes) {
    throw new Error(`Choose a nonempty text file no larger than ${maximumBytes} bytes. The combined prompt has the same limit.`);
  }
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size || buffer.byteLength > maximumBytes) throw new Error("The selected file changed or exceeded the text limit. Select it again.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { throw new Error("The file is not valid UTF-8 text. Convert it to UTF-8 before attaching; no content was submitted."); }
  if (!text.trim() || unsafeText.test(text)) throw new Error("The file is empty or contains binary/control characters. No content was submitted.");
  // TextDecoder removes an optional UTF-8 BOM. Count the actual text sent, not the original file size.
  return Object.freeze({ name: file.name, bytes: new TextEncoder().encode(text).byteLength, text });
}

/** Preserve the public text prompt contract; text files become visibly delimited prompt context. */
export function composeNativeTaskPrompt(prompt, attachments = [], maximumBytes = 16_384) {
  if (typeof prompt !== "string" || unsafeText.test(prompt)) throw new Error("The task contains unsupported control characters.");
  if (new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(prompt)) !== prompt) throw new Error("The task must be lossless UTF-8 text; remove an incomplete Unicode character before submitting.");
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Refresh setup to obtain the task text limit.");
  if (!Array.isArray(attachments) || attachments.length > NATIVE_TEXT_ATTACHMENT_LIMIT) {
    throw new Error(`Attach at most ${NATIVE_TEXT_ATTACHMENT_LIMIT} text files per submission.`);
  }
  for (const item of attachments) {
    if (!item || typeof item.name !== "string" || !item.name || item.name.length > 200
      || /[\x00-\x1f\x7f/\\]/.test(item.name) || typeof item.text !== "string"
      || !item.text.trim() || unsafeText.test(item.text)
      || item.bytes !== new TextEncoder().encode(item.text).byteLength) throw new Error("A text attachment is invalid. Remove it and select the original file again.");
  }
  const combined = attachments.length === 0 ? prompt : `${prompt}\n\nAttached UTF-8 text (reference data included in this prompt, not separate uploaded objects):\n${JSON.stringify(attachments.map(item => ({ name: item.name, content: item.text })), null, 2)}`;
  if (new TextEncoder().encode(combined).byteLength > maximumBytes) {
    throw new Error(`The task and text attachments exceed ${maximumBytes} UTF-8 bytes, including filenames and context delimiters. Shorten the task or remove an attachment.`);
  }
  return combined;
}

const IMAGE_FORMAT = "amc-image-input@2", AUDIO_FORMAT = "amc-audio-input@1";
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const JSON_BODY_LIMIT = 1024 * 1024;
const byteSize = value => new TextEncoder().encode(value).byteLength;

/** Optional options.providers[].input contract: absent or malformed discovery never enables media. */
export function nativeTaskMediaCapabilities(value) {
  if (!value || value.modelSupport !== "not-probed"
    || ![value.formats, value.imageMimeTypes, value.audioMimeTypes].every(items => Array.isArray(items) && items.every(item => typeof item === "string"))
    || !["maxParts", "maxImages", "maxAudios", "maxTextBytes", "maxSerializedPartsBytes", "maxPromptFrameBytes"].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
    || value.maxParts < 1 || value.maxTextBytes < 1 || value.maxSerializedPartsBytes < 1 || value.maxPromptFrameBytes < 1) return null;
  return {
    formats: value.formats.filter(format => ["text", IMAGE_FORMAT, AUDIO_FORMAT].includes(format)),
    imageMimeTypes: value.formats.includes(IMAGE_FORMAT) && value.maxImages > 0 ? value.imageMimeTypes.filter(mime => IMAGE_MIMES.includes(mime)) : [],
    audioMimeTypes: value.formats.includes(AUDIO_FORMAT) && value.maxAudios > 0 ? value.audioMimeTypes.filter(mime => mime === "audio/wav") : [],
    maxParts: Math.min(value.maxParts, 256), maxImages: Math.min(value.maxImages, 8), maxAudios: Math.min(value.maxAudios, 8),
    maxTextBytes: Math.min(value.maxTextBytes, 16_384), maxSerializedPartsBytes: Math.min(value.maxSerializedPartsBytes, JSON_BODY_LIMIT),
    maxPromptFrameBytes: Math.min(value.maxPromptFrameBytes, JSON_BODY_LIMIT), modelSupport: "not-probed"
  };
}

function originalMediaType(bytes) {
  const match = (at, values) => values.every((value, index) => bytes[at + index] === value);
  if (match(0, [137, 80, 78, 71, 13, 10, 26, 10])) return { type: "image", mimeType: "image/png" };
  if (match(0, [255, 216, 255])) return { type: "image", mimeType: "image/jpeg" };
  if (match(0, [71, 73, 70, 56]) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return { type: "image", mimeType: "image/gif" };
  if (match(0, [82, 73, 70, 70]) && match(8, [87, 69, 66, 80])) return { type: "image", mimeType: "image/webp" };
  if (match(0, [82, 73, 70, 70]) && match(8, [87, 65, 86, 69])) return { type: "audio", mimeType: "audio/wav" };
  throw new Error("This file has no supported original image or WAV header. No conversion, OCR or transcription was attempted.");
}

/**
 * Read the explicitly selected bytes without conversion. Full media validation remains server-owned.
 * @param {{name: string, size: number, type?: string, arrayBuffer(): Promise<ArrayBuffer>}} file A browser File or an equivalent; the declared MIME type is never trusted over the bytes.
 * @param {unknown} discovery The provider's advertised input contract; absent or malformed discovery never enables media.
 * @returns {Promise<NativeMediaAttachment>}
 */
export async function readNativeMediaAttachment(file, discovery) {
  const capability = nativeTaskMediaCapabilities(discovery);
  if (!capability || !capability.imageMimeTypes.length && !capability.audioMimeTypes.length) throw new Error("The selected provider has not advertised a supported original-media input contract. Refresh setup or select a supported provider.");
  if (!file || typeof file.name !== "string" || !file.name || file.name.length > 200
    || /[\x00-\x1f\x7f/\\]/.test(file.name)) throw new Error("Choose an original media file with a plain filename of at most 200 characters.");
  // Base64 alone must fit before allocating the selected file; the combined envelope is checked below.
  if (!Number.isSafeInteger(file.size) || file.size < 1 || Math.ceil(file.size / 3) * 4 > capability.maxSerializedPartsBytes) {
    throw new Error("Original media exceeds the advertised serialized input limit after base64 encoding. No file bytes were loaded or sent.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) throw new Error("The selected original media changed. Select it again; nothing was submitted.");
  const kind = originalMediaType(bytes);
  if (!(kind.type === "image" ? capability.imageMimeTypes : capability.audioMimeTypes).includes(kind.mimeType)) {
    throw new Error(`The pinned provider does not advertise ${kind.mimeType}. This file was not converted or silently dropped.`);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return Object.freeze({ ...kind, name: file.name, bytes: bytes.byteLength, data: btoa(binary) });
}

/**
 * P10 exact input union. Text first, then original media in the displayed order; never prompt plus input.
 * @param {string} prompt
 * @param {ReadonlyArray<NativeTaskAttachment>} [attachments]
 * @param {unknown} [discovery] The provider's advertised input contract, or null for text-only.
 * @param {number} [maximumTextBytes]
 * @returns {{prompt: string, input?: undefined} | {input: NativeTaskOrderedInput, prompt?: undefined}}
 */
export function composeNativeTaskInput(prompt, attachments = [], discovery = null, maximumTextBytes = 16_384) {
  if (!Array.isArray(attachments)) throw new Error("The attachment selection is invalid.");
  const media = attachments.filter(item => item?.type === "image" || item?.type === "audio");
  const text = attachments.filter(item => item?.type === undefined);
  if (text.length + media.length !== attachments.length) throw new Error("Unsupported attachment type. Remove the original selection before submitting.");
  const capability = nativeTaskMediaCapabilities(discovery);
  const combined = composeNativeTaskPrompt(prompt, text, Math.min(maximumTextBytes, capability?.maxTextBytes || maximumTextBytes));
  if (!media.length) return { prompt: combined };
  if (!capability) throw new Error("Original media requires the selected provider's explicit input capabilities. No text-only fallback was sent.");
  const images = media.filter(item => item.type === "image").length, audios = media.length - images;
  const format = audios ? AUDIO_FORMAT : IMAGE_FORMAT;
  if (!capability.formats.includes(format) || images > capability.maxImages || audios > capability.maxAudios || media.length + 1 > capability.maxParts) {
    throw new Error("This media format or part count exceeds the pinned provider's advertised input contract. Remove a file or select a compatible provider; nothing is silently converted.");
  }
  /** @type {Array<{type: "text", text: string} | {type: "image" | "audio", mimeType: string, data: string}>} */
  const parts = [{ type: "text", text: combined }];
  for (const item of media) {
    if (!(item.type === "image" ? capability.imageMimeTypes : capability.audioMimeTypes).includes(item.mimeType)
      || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || typeof item.data !== "string"
      || item.data.length > capability.maxSerializedPartsBytes || item.data.length !== Math.ceil(item.bytes / 3) * 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)) {
      throw new Error("An original media selection is invalid or unsupported by the current provider. Select the original file again.");
    }
    let original;
    try { original = atob(item.data); } catch { throw new Error("Original media requires canonical base64 and an exact byte count."); }
    if (original.length !== item.bytes || btoa(original) !== item.data) throw new Error("Original media requires canonical base64 and an exact byte count.");
    parts.push({ type: item.type, mimeType: item.mimeType, data: item.data });
  }
  // Same conservative RPC framing contract used by nativeTaskInput.ts; no remote dispatch occurs here.
  const params = { sessionId: "\u0000".repeat(200), prompt: parts, _meta: { "dev.agentmaturity.amc": { inputFormat: format } } };
  const frame = { jsonrpc: "2.0", id: Number.MAX_SAFE_INTEGER, method: "session/prompt", params };
  if (byteSize(JSON.stringify(parts)) > capability.maxSerializedPartsBytes || byteSize(JSON.stringify(frame)) > capability.maxPromptFrameBytes) {
    throw new Error("The original files and text exceed the advertised input frame bound, including base64 and metadata. No partial selection was submitted.");
  }
  return { input: { format, parts } };
}

export function assertNativeTaskRequestSize(body) {
  if (byteSize(JSON.stringify(body)) > JSON_BODY_LIMIT) throw new Error("The complete native task JSON request exceeds the 1 MiB HTTP body limit. Remove an attachment or shorten the task.");
}
