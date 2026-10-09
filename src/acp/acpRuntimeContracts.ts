import type { AgentSession } from "../agent/agentSession.js";
import { MAX_WIRE_LINE_BYTES } from "../wire/ndjsonFraming.js";
import { NATIVE_ORDERED_INPUT_FORMAT } from "../attachments/nativeOrderedInput.js";
import { NATIVE_AUDIO_INPUT_FORMAT } from "../attachments/nativeAudioInput.js";
import { ACP_MAX_SESSION_ROWS, ACP_MAX_TURN_UPDATE_BYTES } from "./acpCommittedUpdates.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import { acpSupportsImageInput, type AcpPromptBlock, type AcpPromptRoute } from "./acpPromptInput.js";
import { ACP_NATIVE_AUDIO_CONTRACT, acpSupportsAudioInput } from "./acpAudioInput.js";

/** Shared wire contract for SDKs. None of these declarations is a cold-verifier verdict. */
export const ACP_RUNTIME_META_KEY = "dev.agentmaturity.amc";
export const ACP_RUNTIME_FORMAT = "amc-acp-runtime@1";
export const ACP_MAX_UPDATE_PARAMS_BYTES = 900_000;
/** Where a spawning composer (Studio native tasks, P1-67) hands `amc acp` the lease it minted for that process. */
export const NATIVE_TASK_LEASE_ENV = "AMC_NATIVE_TASK_LEASE";
export const ACP_RUNTIME_LIMITS = Object.freeze({
  inputFrameBytes: MAX_WIRE_LINE_BYTES,
  updateParamsBytes: ACP_MAX_UPDATE_PARAMS_BYTES,
  turnUpdateBytes: ACP_MAX_TURN_UPDATE_BYTES,
  historyRows: ACP_MAX_SESSION_ROWS
});

/** A fork factory must inherit authenticated model context, not just mint a lineage pointer.
 * The server authenticates the returned child's signed parent head before exposing its ID.
 * Factories must clean up partial construction on rejection, just like the native new/load seams.
 */
export interface AcpForkSessionParams {
  readonly parentSessionId: string;
  readonly workspace: string;
  readonly agentId: string;
  readonly signal: AbortSignal;
}
export type AcpForkSessionFactory = (params: AcpForkSessionParams) => AgentSession | Promise<AgentSession>;

export function nativeAcpCapabilities(options: {
  readonly route?: AcpPromptRoute;
  readonly orderedImageInput?: boolean;
  readonly audioInput?: boolean;
  readonly loadSession: boolean;
  readonly forkSession: boolean;
  readonly nativeExecution?: { readonly tools: "none" | "workspace"; readonly signedApprovalGate: boolean;
    readonly reviewedMcpConfigured: boolean; readonly taskValidation?: boolean };
}) {
  const image = acpSupportsImageInput(options.route);
  const audio = acpSupportsAudioInput(options.route) && options.audioInput === true;
  return Object.freeze({
    loadSession: options.loadSession,
    ...(options.forkSession ? { sessionCapabilities: Object.freeze({ fork: Object.freeze({}) }) } : {}),
    promptCapabilities: Object.freeze({ image, audio, embeddedContext: false }),
    _meta: Object.freeze({ [ACP_RUNTIME_META_KEY]: Object.freeze({
      ...(options.nativeExecution ?? {}),
      runtimeFormat: ACP_RUNTIME_FORMAT,
      committedUpdates: "live-completed-blocks" as const,
      verification: "not-verified" as const,
      cancellation: "prompt-scoped" as const,
      limits: ACP_RUNTIME_LIMITS,
      ...(options.loadSession ? { releaseSession: true } : {}),
      ...(options.forkSession ? { forkContext: "authenticated-parent-history" as const } : {}),
      ...(image && options.orderedImageInput === true ? { orderedImageInput: NATIVE_ORDERED_INPUT_FORMAT } : {}),
      ...(audio ? { audioInput: ACP_NATIVE_AUDIO_CONTRACT } : {})
    }) })
  });
}

/** Unknown third-party metadata stays opaque. Our own namespace must never silently
 * downgrade a misspelled or malformed input contract into a flattened legacy prompt.
 */
export function acpPromptInputFormat(meta: unknown): typeof NATIVE_ORDERED_INPUT_FORMAT | typeof NATIVE_AUDIO_INPUT_FORMAT | undefined {
  if (meta === undefined || meta === null) return undefined;
  if (!isRecord(meta)) throw new AcpFailure(ACP_ERROR.invalidParams, "ACP prompt metadata must be an object or null.");
  if (!Object.hasOwn(meta, ACP_RUNTIME_META_KEY)) return undefined;
  const extension = meta[ACP_RUNTIME_META_KEY];
  if (!isRecord(extension) || Object.keys(extension).some(key => key !== "inputFormat")) {
    throw new AcpFailure(ACP_ERROR.invalidParams, "Malformed or unsupported native prompt extension; no downgrade was used.");
  }
  if (!Object.hasOwn(extension, "inputFormat")) return undefined;
  if (extension.inputFormat !== NATIVE_ORDERED_INPUT_FORMAT && extension.inputFormat !== NATIVE_AUDIO_INPUT_FORMAT) {
    throw new AcpFailure(ACP_ERROR.invalidParams, "Unsupported native ordered input format; no downgrade was used.");
  }
  return extension.inputFormat;
}

/** The vendored schema permits extra properties. Native codecs cannot silently lose
 * substantive content hidden in those properties. Standard metadata remains annotation
 * only here; the stricter audio codec separately refuses unsupported provenance fields.
 */
export function assertAcpPromptFields(blocks: readonly AcpPromptBlock[]): void {
  for (const block of blocks) {
    const allowed = block.type === "text" ? ["type", "text", "annotations", "_meta"]
      : block.type === "image" || block.type === "audio" ? ["type", "data", "mimeType", "uri", "annotations", "_meta"]
        : block.type === "resource_link" ? ["type", "uri", "name", "title", "description", "mimeType", "size", "annotations", "_meta"] : [];
    if (!allowed.length || Object.keys(block).some(key => !allowed.includes(key))) {
      throw new AcpFailure(ACP_ERROR.invalidParams, "Unsupported prompt content or fields cannot be silently discarded.");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
