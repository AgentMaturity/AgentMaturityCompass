import { z } from "zod";
import type { NativeValidationResult } from "./nativeValidation.js";

export const nativeValidationCheckIdentitySchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  title: z.string().min(1).max(160).refine(value => value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value))
});
export const nativeValidationCheckResultSchema = nativeValidationCheckIdentitySchema.extend({
  status: z.enum(["pending", "passed", "failed", "unavailable"]),
  callId: z.string().min(1).max(128).nullable(), exitCode: z.number().int().nullable(), timedOut: z.boolean(),
  reason: z.string().min(1).max(128).nullable(), outputEventId: z.string().min(1).max(128).nullable()
}).strict();
const resultSchema = z.object({ status: z.enum(["not-requested", "pending", "passed", "failed", "unavailable"]),
  turn: z.number().int().min(1).nullable(), configSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  checks: z.array(nativeValidationCheckResultSchema).max(8)
}).strict();

/** Wire-shape validation only; this cannot authenticate an arbitrary remote peer's evidence. */
export function parseNativeValidationResult(value: unknown): NativeValidationResult | null {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) return null;
  const item = parsed.data;
  if (new Set(item.checks.map(check => check.id)).size !== item.checks.length) return null;
  if (item.status === "not-requested") return item.configSha256 === null && item.checks.length === 0 ? item : null;
  // An unavailable older peer or corrupt history can have no reconstructable identity.
  if (item.status === "unavailable" && item.checks.length === 0) return item;
  if (item.turn === null || item.configSha256 === null || item.checks.length === 0) return null;
  for (const check of item.checks) {
    if (check.status === "passed" && (check.exitCode !== 0 || check.timedOut || check.reason !== null || check.callId === null || check.outputEventId === null)) return null;
    if (check.status === "failed" && (check.exitCode === null || check.exitCode === 0 || check.timedOut || check.reason !== "nonzero-exit" || check.callId === null || check.outputEventId === null)) return null;
    if (check.status === "pending" && (check.exitCode !== null || check.timedOut || check.reason !== null || check.outputEventId !== null)) return null;
    if (check.status === "unavailable" && check.reason === null) return null;
  }
  const aggregate = item.checks.some(check => check.status === "failed") ? "failed"
    : item.checks.some(check => check.status === "pending") ? "pending"
      : item.checks.some(check => check.status === "unavailable") ? "unavailable" : "passed";
  // The ongoing turn deliberately remains pending until its signed finished row exists.
  if (item.status !== aggregate && item.status !== "pending") return null;
  return item;
}
