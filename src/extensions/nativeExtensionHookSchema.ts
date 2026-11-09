import { z } from "zod";

export const nativeExtensionHookKindSchema = z.enum([
  "turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end", "pre-tool"
]);
export type NativeExtensionHookKind = z.infer<typeof nativeExtensionHookKindSchema>;

const metadataText = (bytes: number) => z.string().min(1).max(bytes)
  .regex(/^[^\x00-\x1f\x7f]*$/).refine(value => Buffer.byteLength(value) <= bytes);

/**
 * A closed scalar view: no prompts, arguments, results, credentials or authority objects.
 *
 * `callId`, `ok`, `outputSha256` and `outputBytes` are set by the driver on `tool-end` only. They name a result without
 * carrying it: a command hook (SH-EXT-01 PostToolUse) sees that a call settled and the digest of what it produced.
 */
export const nativeExtensionHookEventSchema = z.object({
  kind: nativeExtensionHookKindSchema,
  turn: z.number().int().positive().safe().optional(),
  step: z.number().int().positive().safe().optional(),
  toolName: metadataText(256).optional(),
  actionClass: metadataText(64).optional(),
  requestedMode: z.enum(["EXECUTE", "SIMULATE"]).optional(),
  callId: metadataText(128).optional(),
  ok: z.boolean().optional(),
  outputSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  outputBytes: z.number().int().nonnegative().safe().optional()
}).strict();
export type NativeExtensionHookEvent = Readonly<z.infer<typeof nativeExtensionHookEventSchema>>;
