import type { LlmAdapter } from "../adapter/adapterTypes.js";
import { GEMINI_AUDIO_CAPABILITIES } from "../adapter/providerCapabilities.js";
import type { HttpResponse } from "../adapter/transport.js";
import type { StreamChunk } from "../streamChunk.js";
import { decodeGeminiWithUsage, geminiAdapter } from "./geminiAdapter.js";
import { geminiAudioUsage } from "./geminiAudioUsage.js";

export const GEMINI_AUDIO_CONTENT_VERSION = 2;
export async function* decodeGeminiAudio(response: HttpResponse): AsyncIterable<StreamChunk> {
  yield* decodeGeminiWithUsage(response, geminiAudioUsage);
}
/** Explicit opt-in: old --provider gemini stays on its historical v1 contract. */
export const geminiAudioAdapter: LlmAdapter = {
  ...geminiAdapter, version: GEMINI_AUDIO_CONTENT_VERSION, encoderVersion: GEMINI_AUDIO_CONTENT_VERSION,
  capabilities: GEMINI_AUDIO_CAPABILITIES, decode: decodeGeminiAudio
};
