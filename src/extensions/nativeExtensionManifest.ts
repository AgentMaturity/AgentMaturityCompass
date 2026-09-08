import { z } from "zod";

export const NATIVE_EXTENSION_LIMITS = Object.freeze({
  manifestBytes: 65_536, fileBytes: 262_144, totalBytes: 1_048_576,
  contexts: 16, commands: 32, loaded: 16, argumentBytes: 16_384
});
export const NATIVE_EXTENSION_RESERVED_COMMANDS = Object.freeze([
  "help", "inspect", "verify", "compact", "fork", "exit", "extension", "extensions", "load", "unload"
]);
const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const relativePath = z.string().min(1).max(512).refine(value =>
  !value.startsWith("/") && !/[\\:\x00-\x1f\x7f]/.test(value)
  && value.split("/").every(part => part !== "" && part !== "." && part !== ".."),
"Use a relative path with no traversal, empty segments or control characters");
const content = z.object({ path: relativePath, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const nativeExtensionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: name,
  contexts: z.array(content.extend({ name })).max(NATIVE_EXTENSION_LIMITS.contexts),
  commands: z.record(name, content).refine(value => Object.keys(value).length <= NATIVE_EXTENSION_LIMITS.commands)
}).strict().superRefine((value, ctx) => {
  if (value.contexts.length === 0 && Object.keys(value.commands).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An extension must contribute context or a command" });
  }
  const names = new Set<string>();
  for (const entry of value.contexts) {
    if (names.has(entry.name)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Context names must be unique" });
    names.add(entry.name);
  }
  for (const command of Object.keys(value.commands)) {
    if (NATIVE_EXTENSION_RESERVED_COMMANDS.includes(command)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A command name is reserved by native chat" });
    }
  }
});
export type NativeExtensionManifest = z.infer<typeof nativeExtensionManifestSchema>;

export class NativeExtensionError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "NativeExtensionError"; }
}

export function parseNativeExtensionManifest(bytes: Buffer): NativeExtensionManifest {
  if (bytes.length > NATIVE_EXTENSION_LIMITS.manifestBytes) {
    throw new NativeExtensionError("MANIFEST_LIMIT", "Extension manifest exceeds the size limit.");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return nativeExtensionManifestSchema.parse(JSON.parse(text));
  } catch {
    throw new NativeExtensionError("MANIFEST_INVALID", "Extension manifest is not a supported strict v1 declaration. Review its fields, relative paths, names and content hashes; source text is withheld.");
  }
}
