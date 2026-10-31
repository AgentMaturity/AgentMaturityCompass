/**
 * Synchronous unwrap of a ledger data key held by a remote KeyProvider (P2-09): one child process runs the P2-08
 * provider bridge (`src/keys/providerBridge.ts`, op "unwrap") and answers one JSON line. Only a fixed-code error crosses
 * back; the child's stderr is never read. This module does not import the bridge, so code that replaces the bridge
 * module (tests, embedders) is unaffected.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KEY_PROVIDER_ERRORS, KeyProviderError, type KeyProviderErrorCode, type KeyRef } from "../../keys/provider.js";

const BRIDGE = fileURLToPath(new URL("../../keys/providerBridge.js", import.meta.url));

export function unwrapKeySync(ref: KeyRef, wrapped: Uint8Array, opts: { script?: string; timeoutMs?: number } = {}): Buffer {
  const out = spawnSync(process.execPath, [opts.script ?? BRIDGE], { input: JSON.stringify({ op: "unwrap", ref, wrappedB64: Buffer.from(wrapped).toString("base64") }),
    encoding: "utf8", timeout: opts.timeoutMs ?? 30_000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] });
  let answer: { ok?: unknown; keyB64?: unknown; code?: unknown; detail?: unknown } | null = null;
  try { answer = JSON.parse(String(out.stdout ?? "").trim().split("\n").at(-1) ?? ""); } catch { /* reported below */ }
  if (out.status === 0 && answer?.ok === true && typeof answer.keyB64 === "string") return Buffer.from(answer.keyB64, "base64");
  if (answer?.ok === false && typeof answer.code === "string" && Object.hasOwn(KEY_PROVIDER_ERRORS, answer.code)) {
    throw new KeyProviderError(answer.code as KeyProviderErrorCode, ref.provider, "unwrap: the provider refused or could not be reached");
  }
  throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", ref.provider, "unwrap: the provider bridge did not complete successfully");
}
