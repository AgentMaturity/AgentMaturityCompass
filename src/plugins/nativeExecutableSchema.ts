import { z } from "zod";
import { pluginArtifactPathSchema, pluginIdSchema, pluginVersionSchema } from "./pluginIdentifiers.js";

export const NATIVE_EXECUTABLE_LIMITS = Object.freeze({
  packageBytes: 8 * 1024 * 1024,
  moduleBytes: 262_144,
  policyBytes: 262_144,
  inputBytes: 32_768,
  outputBytes: 24_000,
  timeoutMs: 30_000,
  lifetimeMs: 3_600_000,
  calls: 1_000,
  revocationPollMs: 250
});

export const nativeExecutableDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const nativeExecutableCapabilitySchema = z.enum(["context.generate", "command.invoke"]);
export type NativeExecutableCapability = z.infer<typeof nativeExecutableCapabilitySchema>;
const contributionName = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const exportName = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/)
  .refine(value => !["onLoad", "onUnload", "then", "__proto__", "constructor", "prototype"].includes(value));

/** One bundled ESM module. No dependency installation, host APIs, shell or network grants. */
export const nativeExecutableReferenceSchema = z.object({
  pluginId: pluginIdSchema,
  version: pluginVersionSchema,
  packageSha256: nativeExecutableDigestSchema,
  publisherFingerprint: nativeExecutableDigestSchema,
  entrypoint: pluginArtifactPathSchema.refine(path =>
    path.startsWith("content/extensions/") && path.endsWith(".mjs") && !/[\x00-\x1f\x7f:]/.test(path))
}).strict();
export type NativeExecutableReference = z.infer<typeof nativeExecutableReferenceSchema>;

export function nativeExecutableReference(value: NativeExecutableReference): NativeExecutableReference {
  return nativeExecutableReferenceSchema.parse({ pluginId: value.pluginId, version: value.version,
    packageSha256: value.packageSha256, publisherFingerprint: value.publisherFingerprint, entrypoint: value.entrypoint });
}

export const nativeExecutableDeclarationSchema = nativeExecutableReferenceSchema.extend({
  apiVersion: z.literal(1),
  capabilities: z.array(nativeExecutableCapabilitySchema).min(1).max(2),
  contexts: z.array(z.object({ name: contributionName, export: exportName }).strict()).max(16),
  commands: z.record(contributionName, z.object({ export: exportName }).strict())
    .refine(value => Object.keys(value).length <= 32),
  limits: z.object({
    timeoutMs: z.number().int().min(100).max(NATIVE_EXECUTABLE_LIMITS.timeoutMs),
    maxOutputBytes: z.number().int().min(1).max(NATIVE_EXECUTABLE_LIMITS.outputBytes),
    maxCalls: z.number().int().min(1).max(NATIVE_EXECUTABLE_LIMITS.calls),
    maxLifetimeMs: z.number().int().min(100).max(NATIVE_EXECUTABLE_LIMITS.lifetimeMs)
  }).strict()
}).strict().superRefine((value, ctx) => {
  const capabilities = new Set(value.capabilities);
  if (capabilities.size !== value.capabilities.length
    || capabilities.has("context.generate") !== (value.contexts.length > 0)
    || capabilities.has("command.invoke") !== (Object.keys(value.commands).length > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Capabilities must exactly describe the declared executable contributions." });
  }
  if (new Set(value.contexts.map(entry => entry.name)).size !== value.contexts.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Executable context names must be unique." });
  }
});
export type NativeExecutableDeclaration = z.infer<typeof nativeExecutableDeclarationSchema>;

export class NativeExecutableError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "NativeExecutableError"; }
}
