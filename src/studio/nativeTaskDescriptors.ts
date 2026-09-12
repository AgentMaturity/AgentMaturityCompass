import { lstatSync, readFileSync, opendirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { writeFileAtomic } from "../utils/fs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { nativeTaskValidationSelectionSchema } from "./nativeTaskValidation.js";
import { NativeTaskServiceError } from "./nativeTaskTypes.js";

const id = z.string().uuid();
export const taskDescriptorSchema = z.object({
  kind: z.literal("amc/studio-native-task/v1"), taskId: z.string().regex(/^[a-f0-9]{64}$/),
  principalId: z.string().min(1).max(256), agentId: z.string().min(1).max(128), demo: z.boolean(),
  sessionId: z.string().min(1).max(200).nullable(), provider: z.enum(["stub", "openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama"]),
  model: z.string().min(1).max(200).nullable(), tools: z.enum(["none", "workspace"]),
  toolsDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  // Optional without a default: parsing old signed v1 descriptors must preserve their exact body.
  validation: nativeTaskValidationSelectionSchema.optional(),
  maxSteps: z.number().int().min(1).max(8), maxTokens: z.number().int().min(1).max(1024),
  createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
  revision: z.number().int().min(1).max(32), pendingTurn: z.boolean(), closed: z.boolean(),
  // As with validation, omission must preserve the body of existing signed descriptors.
  archivedAt: z.number().int().nonnegative().optional(),
  submissions: z.array(z.object({ clientRequestId: id, bodyHash: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().min(1).max(32) }).strict()).min(1).max(32)
}).strict().superRefine((value, ctx) => {
  if (value.submissions.length !== value.revision || value.submissions.some((s, i) => s.revision !== i + 1)
    || new Set(value.submissions.map(s => s.clientRequestId)).size !== value.submissions.length
    || value.taskId !== nativeTaskId(value.principalId, value.submissions[0]!.clientRequestId)
    || (value.tools === "workspace") !== (value.toolsDigest !== null)
    || (value.validation !== undefined && (value.demo || value.tools !== "workspace"))
    || (value.archivedAt !== undefined && (!value.closed || !value.sessionId || value.pendingTurn
      || value.archivedAt < value.createdAt || value.archivedAt > value.updatedAt))
    || (value.demo && (value.provider !== "stub" || value.tools !== "none"))) ctx.addIssue({ code: "custom", message: "Descriptor identity or revision is inconsistent" });
});
export type NativeTaskDescriptor = z.infer<typeof taskDescriptorSchema>;
export function nativeTaskId(principalId: string, requestId: string): string {
  return sha256Hex(canonicalize(["amc/studio-native-task-id/v1", principalId, requestId]));
}
export function taskBodyHash(value: unknown): string { return sha256Hex(canonicalize(value)); }

/** Signed control metadata only. The native ledger remains the sole transcript/ownership authority. */
export class NativeTaskDescriptors {
  readonly directory: string;
  constructor(private readonly workspace: string) { this.directory = join(workspace, ".amc", "studio-native-tasks"); }
  private assertDirectory(): boolean {
    try { const info = lstatSync(this.directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw new NativeTaskServiceError("TASK_STORE_UNTRUSTED", 409, "The native task descriptor directory is not usable."); }
  }
  private path(taskId: string): string {
    if (!/^[a-f0-9]{64}$/.test(taskId)) throw new NativeTaskServiceError("TASK_NOT_FOUND", 404, "Native task was not found.");
    return join(this.directory, `${taskId}.json`);
  }
  read(taskId: string): NativeTaskDescriptor | null {
    const path = this.path(taskId);
    if (!this.assertDirectory()) return null;
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024) throw new Error();
      const envelope = z.object({ descriptor: taskDescriptorSchema, signature: z.string().max(1024) }).strict().parse(JSON.parse(readFileSync(path, "utf8")));
      if (envelope.descriptor.taskId !== taskId || !verifyHexDigestAny(taskBodyHash(envelope.descriptor), envelope.signature,
        getPublicKeyHistory(this.workspace, "auditor"))) throw new Error();
      return envelope.descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new NativeTaskServiceError("TASK_DESCRIPTOR_UNTRUSTED", 409, "The native task descriptor did not verify; it cannot authorize continuation.");
    }
  }
  /** All retained identities, including archives. Read and authenticate one bounded file at a time. */
  *scan(): Generator<NativeTaskDescriptor> {
    if (!this.assertDirectory()) return;
    const directory = opendirSync(this.directory);
    try {
      for (let file = directory.readSync(); file; file = directory.readSync()) {
        if (!/^[a-f0-9]{64}\.json$/.test(file.name)) continue;
        const descriptor = this.read(file.name.slice(0, -5));
        if (descriptor) yield descriptor;
      }
    } finally { directory.closeSync(); }
  }
  list(includeArchived = false): NativeTaskDescriptor[] {
    const selected: NativeTaskDescriptor[] = [];
    for (const descriptor of this.scan()) if (includeArchived || descriptor.archivedAt === undefined) selected.push(descriptor);
    return selected;
  }
  lock<T>(operation: () => T): T {
    this.assertDirectory();
    return withControlFileLock({ root: this.directory, name: "admission", timeoutMs: 1000, operation });
  }
  /** Call under lock. No caller text or credential value enters this file. */
  write(descriptor: NativeTaskDescriptor): void {
    const checked = taskDescriptorSchema.parse(descriptor);
    const signature = signHexDigest(taskBodyHash(checked), getPrivateKeyPem(this.workspace, "auditor"));
    writeFileAtomic(this.path(checked.taskId), JSON.stringify({ descriptor: checked, signature }), 0o600);
  }
}
