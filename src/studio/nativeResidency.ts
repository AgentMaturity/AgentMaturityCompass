/** Residency in a native task's words (split from nativeTaskService.ts for its line budget). */
import { residencyRouteWords, ROUTE_REFUSAL_START, storageAdmissionRefusal } from "../residency/admissionWords.js";
import { EGRESS_CHANNELS } from "../residency/types.js";
import { AMCNativeRefusedError } from "../sdk/nativeAgentErrors.js";
import { NativeTaskServiceError } from "./nativeTaskTypes.js";

/**
 * The check SessionService.open runs, asked first, so a refused start uses no task slot and names its reason in words
 * (409 NATIVE_RESIDENCY_REFUSED, with the decision's reason and detail codes). It refuses exactly what session open would.
 */
export function assertNativeStorageAdmission(workspace: string): void {
  const refusal = storageAdmissionRefusal(workspace);
  if (refusal !== null) throw new NativeTaskServiceError("RESIDENCY_REFUSED", 409, refusal.message, { reason: refusal.reason, detail: refusal.detail });
}

const UNCLEAN = "The native turn did not complete cleanly. Inspect committed evidence; no automatic retry was sent.";
/**
 * Why a turn did not complete, for a task's error. A residency check that refused one of its requests is said in words
 * (which kind of destination, why and the next step) from the ACP error data's fixed codes only (src/acp/acpAgentServer.ts);
 * any other failure keeps the generic sentence.
 */
export function nativeTurnFailureWords(error: unknown): string {
  if (!(error instanceof AMCNativeRefusedError)) return UNCLEAN;
  const data = error.data as { residency?: { code?: unknown; reason?: unknown; detail?: unknown; channel?: unknown } } | undefined;
  const { code, reason, detail, channel } = data?.residency ?? {};
  const fixed = (value: unknown): value is string => typeof value === "string" && /^[a-z_]{1,64}$/.test(value);
  if (code !== "AMC_RESIDENCY_EGRESS_BLOCKED" || !fixed(reason) || !fixed(detail) || !(EGRESS_CHANNELS as readonly unknown[]).includes(channel)) return UNCLEAN;
  return `${residencyRouteWords(channel as string, reason, detail)} No automatic retry was sent.`;
}

/** Whether a task's error is nativeTurnFailureWords' residency sentence (Studio writes it; A4 shows it on the project page). */
export const isResidencyTurnWords = (error: string | null): error is string => error?.startsWith(ROUTE_REFUSAL_START) === true;
