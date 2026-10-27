/**
 * A synchronous door to a key provider (P2-08) for signers that cannot await, such as the notary's signing path: each
 * call runs this file in a child Node process, which describes or signs through the provider (credentials from the
 * environment) and answers with one JSON line on stdout. Failures cross the boundary as a code only; the child's
 * stderr and any provider text are never read back, since they can carry endpoints, paths or PINs.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkedDescription, KEY_PROVIDER_ERRORS, KeyProviderError, providerFailure, signChecked, type KeyDescription, type KeyProvider, type KeyProviderErrorCode, type KeyRef } from "./provider.js";

export type BridgeRequest = { op: "describe"; ref: KeyRef } | { op: "sign"; ref: KeyRef; messageB64: string };
export type BridgeResponse = { ok: true; description: KeyDescription; signatureB64?: string } | { ok: false; code: KeyProviderErrorCode; detail: string };

/** The child's work: describe, and for "sign" also sign, the ref's key (no algorithm policy here: the caller applies its own). */
export async function answerBridgeRequest(request: BridgeRequest, provider: KeyProvider): Promise<BridgeResponse> {
  try {
    const description = checkedDescription(await provider.describe(request.ref), { allowed: ["ed25519", "ecdsa-p256-sha256"], requireNonExportable: false });
    if (request.op === "describe") return { ok: true, description };
    const signature = await signChecked(provider, description, Buffer.from(request.messageB64, "base64"));
    return { ok: true, description, signatureB64: signature.toString("base64") };
  } catch (error) {
    const failure = providerFailure(request.ref.provider, error, request.op);
    return { ok: false, code: failure.code, detail: failure.message };
  }
}

const SCRIPT = fileURLToPath(new URL("./providerBridge.js", import.meta.url));

/** In the parent: one child process per call; anything but a well-formed answer is KEY_PROVIDER_UNAVAILABLE. */
export function callProviderSync(request: BridgeRequest, opts: { script?: string; timeoutMs?: number } = {}): { description: KeyDescription; signatureB64?: string } {
  const out = spawnSync(process.execPath, [opts.script ?? SCRIPT], { input: JSON.stringify(request), encoding: "utf8", timeout: opts.timeoutMs ?? 30_000, maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] });
  if (out.status !== 0 || out.error || out.signal) {
    throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", request.ref.provider, `${request.op}: the provider bridge did not complete successfully`);
  }
  let answer: BridgeResponse | null = null;
  try { answer = JSON.parse(String(out.stdout ?? "").trim().split("\n").at(-1) ?? "") as BridgeResponse; } catch { /* reported below */ }
  if (answer?.ok === true && typeof answer.description === "object") return answer;
  if (answer?.ok === false && Object.hasOwn(KEY_PROVIDER_ERRORS, answer.code) && typeof answer.detail === "string") {
    // The child only ever reports a KeyProviderError's own message: AMC's fixed text, never provider output.
    throw new KeyProviderError(answer.code, request.ref.provider, answer.detail.replace(/^[A-Z_]+: [a-z0-9-]+: /, "").slice(0, 300));
  }
  throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", request.ref.provider, `${request.op}: the provider bridge did not answer`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const request = JSON.parse(readFileSync(0, "utf8")) as BridgeRequest;
  const { loadKeyProvider } = await import("./purposeProviders.js");
  const answer = request.ref.provider === "file"
    ? { ok: false as const, code: "KEY_PROVIDER_KEY_REFUSED" as const, detail: "the provider bridge never serves the vault" }
    : await answerBridgeRequest(request, loadKeyProvider("", request.ref.provider));
  process.stdout.write(`${JSON.stringify(answer)}\n`);
}
