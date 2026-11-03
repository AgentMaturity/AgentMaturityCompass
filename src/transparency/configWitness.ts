/**
 * Configuration witnesses for `amc verify all`. A signed file and its .sig can both be deleted, so their absence cannot
 * show a part was never set up. When the passport policy or the prompt scheduler state is saved, one entry of its type is
 * appended to the hash-chained, sealed transparency log (once: a later save finds it); verify all reads such a part as
 * NOT_CONFIGURED only when the verified log holds no witness of it, and fails it when the log does and the files are gone.
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry, transparencyLogPath } from "./logChain.js";

export const PASSPORT_POLICY_CONFIGURED = "PASSPORT_POLICY_CONFIGURED";
export const PROMPT_SCHEDULER_CONFIGURED = "PROMPT_SCHEDULER_CONFIGURED";
/** Entry types that show the passport policy was configured: the witness, or an applied policy (which already logs). */
export const PASSPORT_POLICY_WITNESSES = [PASSPORT_POLICY_CONFIGURED, "PASSPORT_POLICY_APPLIED"] as const;

/**
 * Appends a `type` witness for the saved file at `path` unless the log already holds one. Called after the save, outside
 * any flow that holds the transparency state fixed (a lazily created default passport policy is not witnessed).
 */
export function witnessConfiguration(workspace: string, type: string, path: string, bytes: Uint8Array): void {
  let log = "";
  try {
    log = readFileSync(transparencyLogPath(workspace), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // ponytail: one raw read of the log per save (the scheduler saves often); index it if the log grows large.
  if (log.includes(`"type":"${type}"`)) return;
  const id = relative(resolve(workspace), resolve(path)).split(sep).join("/");
  appendTransparencyEntry({ workspace, type, agentId: "workspace", artifact: { kind: "policy", id, sha256: sha256Hex(Buffer.from(bytes)) } });
}
