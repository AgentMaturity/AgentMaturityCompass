/** Residency and budget refusals in a native task's words (split from nativeTaskService.ts for its line budget). */
import { z } from "zod";
import { nativeFailureGuidance } from "../agent/nativeFailureGuidance.js";
import { residencyRouteWords, ROUTE_REFUSAL_START, storageAdmissionRefusal } from "../residency/admissionWords.js";
import { EGRESS_CHANNELS, type EgressChannel } from "../residency/types.js";
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
const FIXED = /^[a-z_]{1,64}$/;
const fixed = (value: unknown): value is string => typeof value === "string" && FIXED.test(value);
/** AMC's own budget refused the turn's next model request, as the runtime's ACP error data names it (P0-59). */
const BUDGET_GUIDANCE = nativeFailureGuidance("AMC_NATIVE_BUDGET_REFUSED");

/**
 * Why the turn of one task revision failed, as Studio keeps it on the signed task descriptor so the words survive a restart:
 * fixed codes only (re-checked on every read), never a provider message or anything secret.
 */
export const turnFailureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("budget"), revision: z.number().int().min(1).max(32) }).strict(),
  z.object({ kind: z.literal("residency"), revision: z.number().int().min(1).max(32), channel: z.enum(EGRESS_CHANNELS),
    reason: z.string().regex(FIXED), detail: z.string().regex(FIXED) }).strict()
]);
export type TurnFailure = z.infer<typeof turnFailureSchema>;

/** The fixed codes of a turn refused by AMC's budget or a residency check (ACP error data, src/acp/acpAgentServer.ts); null otherwise. */
export function nativeTurnFailure(error: unknown, revision: number): TurnFailure | null {
  if (!(error instanceof AMCNativeRefusedError)) return null;
  const data = error.data as { failureCodes?: unknown; residency?: { code?: unknown; reason?: unknown; detail?: unknown; channel?: unknown } } | undefined;
  if (Array.isArray(data?.failureCodes) && data.failureCodes.includes(BUDGET_GUIDANCE.code)) return { kind: "budget", revision };
  const { code, reason, detail, channel } = data?.residency ?? {};
  if (code !== "AMC_RESIDENCY_EGRESS_BLOCKED" || !fixed(reason) || !fixed(detail) || !(EGRESS_CHANNELS as readonly unknown[]).includes(channel)) return null;
  return { kind: "residency", revision, channel: channel as EgressChannel, reason, detail };
}

/** A kept turn failure in words: which limit or which kind of destination, why and the next step. */
export function turnFailureWords(failure: TurnFailure): string {
  return failure.kind === "budget" ? `${BUDGET_GUIDANCE.summary} No provider request was sent for it. ${BUDGET_GUIDANCE.nextAction}`
    : `${residencyRouteWords(failure.channel, failure.reason, failure.detail)} No automatic retry was sent.`;
}

/**
 * Why a turn did not complete, for a task's error. A residency check that refused one of its requests is said in words
 * (which kind of destination, why and the next step) from the ACP error data's fixed codes only (src/acp/acpAgentServer.ts);
 * any other failure keeps the generic sentence.
 */
export function nativeTurnFailureWords(error: unknown): string {
  const failure = nativeTurnFailure(error, 1);
  return failure?.kind === "residency" ? turnFailureWords(failure) : UNCLEAN;
}

/** Whether a task's error is nativeTurnFailureWords' residency sentence (Studio writes it; A4 shows it on the project page). */
export const isResidencyTurnWords = (error: string | null): error is string => error?.startsWith(ROUTE_REFUSAL_START) === true;
