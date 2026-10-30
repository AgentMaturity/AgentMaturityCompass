import { z } from "zod";

export const nativeExtensionHookKindSchema = z.enum([
  "turn-start", "turn-end", "step-start", "step-end", "tool-start", "tool-end", "pre-tool"
]);
export type NativeExtensionHookKind = z.infer<typeof nativeExtensionHookKindSchema>;

const metadataText = (bytes: number) => z.string().min(1).max(bytes)
  .regex(/^[^\x00-\x1f\x7f]*$/).refine(value => Buffer.byteLength(value) <= bytes);

/** A closed scalar view: no prompts, arguments, results, credentials or authority objects. */
export const nativeExtensionHookEventSchema = z.object({
  kind: nativeExtensionHookKindSchema,
  turn: z.number().int().positive().safe().optional(),
  step: z.number().int().positive().safe().optional(),
  toolName: metadataText(256).optional(),
  actionClass: metadataText(64).optional(),
  requestedMode: z.enum(["EXECUTE", "SIMULATE"]).optional()
}).strict();
export type NativeExtensionHookEvent = Readonly<z.infer<typeof nativeExtensionHookEventSchema>>;
