/**
 * How AMC's Pi extension reads its installation and talks to the local Bridge (P1-22). It runs inside Pi's process,
 * so it uses Node built-ins and AMC's dependency-free helpers only. Every failure throws; the extension turns a throw
 * in control mode into a block.
 *
 * The extension does not verify the installation manifest's signature (that needs AMC's key store); `amc connect hooks
 * status --provider pi` does. It refuses a manifest for another provider or mode, a non-loopback Bridge for control,
 * a lease file that is not mode 0600, and a control manifest without the receipt keys AMC pinned at install. Those
 * keys are workspace keys: a verified receipt is a local audit trail, not a portable verdict.
 */
import { verify } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { withHookDeadline } from "../hookDeadline.js";

/** The Bridge's control and observation routes: CONTROL_HOOK_PATH and OBSERVED_AEP_HOOK_PATH, pinned by a test. */
export const PI_CONTROL_PATH = "/bridge/hooks/control/v1";
export const PI_OBSERVE_PATH = "/bridge/hooks/aep/0.1/events";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export interface PiHookConfig {
  readonly agentId: string;
  readonly bridgeBase: string;
  readonly token: string;
  /** AMC's monitor public keys at install time; a control answer's receipt must verify under one of them. */
  readonly receiptPublicKeys: readonly string[];
}

/** What the extension returns to Pi. */
export type PiToolCallResult = { block: false } | { block: true; reason: string };

/** The call a control answer must be for. */
export interface ExpectedPiDecision {
  readonly agentId: string;
  readonly actionId: string;
  readonly toolCallId: string;
  /** SHA-256 of the exact request body the extension sent. */
  readonly requestSha256: string;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Pi hook manifest ${label} is missing`);
  return value;
}

/** The installation `.amc/hooks/pi.json` names, for an extension installed in `mode`. */
export function readPiHookConfig(workspace: string, mode: "observe" | "control"): PiHookConfig {
  const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", "pi.json"), "utf8")) as Record<string, unknown>;
  if (manifest.provider !== "pi" || manifest.mode !== mode) throw new Error(`Pi hook manifest is not a ${mode} installation`);
  const bridge = new URL(text(manifest.bridgeBase, "bridgeBase"));
  const loopback = LOOPBACK_HOSTS.has(bridge.hostname);
  if (!["http:", "https:"].includes(bridge.protocol) || bridge.origin !== text(manifest.bridgeBase, "bridgeBase")
    || ((mode === "control" || bridge.protocol === "http:") && !loopback)) {
    throw new Error("Pi hook manifest names a Bridge this mode may not use");
  }
  const hooksDir = join(workspace, ".amc", "hooks");
  const tokenPath = resolve(workspace, text(manifest.tokenPath, "tokenPath"));
  const inside = relative(hooksDir, tokenPath);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) throw new Error("Pi hook lease path escapes .amc/hooks");
  if ((statSync(tokenPath).mode & 0o777) !== 0o600) throw new Error("lease token permissions must be 0600");
  const token = readFileSync(tokenPath, "utf8").trim();
  if (!token) throw new Error("Pi hook lease is empty");
  const keys = manifest.receiptPublicKeys;
  const receiptPublicKeys = Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string" && key.includes("PUBLIC KEY")) : [];
  if (mode === "control" && receiptPublicKeys.length === 0) throw new Error("Pi hook manifest pins no AMC receipt keys");
  return { agentId: text(manifest.agentId, "agentId"), bridgeBase: bridge.origin, token, receiptPublicKeys };
}

/**
 * POST `body` to the Bridge within `timeoutMs`; refuses redirects and any non-2xx answer. Resolves to the JSON body.
 * An observation's id is fixed per action, so for observations a 409 means AMC already recorded that event (a restarted
 * Pi re-sends it with a new time) and resolves to null. A control 409 is a conflict and throws.
 */
export async function postToBridge(config: PiHookConfig, path: string, body: string, timeoutMs: number,
  headers: Record<string, string> = {}): Promise<unknown> {
  return withHookDeadline(timeoutMs, async (signal) => {
    const response = await fetch(`${config.bridgeBase}${path}`, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { ...headers, authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body,
    });
    if (response.status === 409 && path === PI_OBSERVE_PATH) return null;
    if (!response.ok) throw new Error(`AMC Bridge answered HTTP ${response.status}`);
    return await response.json() as unknown;
  });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The payload of a receipt that verifies under one of `publicKeys` (Ed25519 over the payload bytes), or a throw. */
function verifiedReceiptPayload(receipt: unknown, publicKeys: readonly string[]): Record<string, unknown> {
  const parts = typeof receipt === "string" ? receipt.split(".") : [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("AMC decision receipt is malformed");
  const payload = Buffer.from(parts[0], "base64url");
  const signature = Buffer.from(parts[1], "base64url");
  if (!publicKeys.some((key) => verify(null, payload, key, signature))) throw new Error("AMC decision receipt signature does not verify");
  return JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
}

/**
 * What to return to Pi for an AMC control answer. The answer must be a decision for exactly this call: AMC's action id,
 * a Pi response that names the digest of the request sent, that response's digest, and a receipt signed by an AMC
 * monitor key pinned at install whose body digest, execution id, idempotency key (Pi's call id), agent and state match.
 * Anything else throws, which blocks the call.
 */
export function piControlAnswer(answer: unknown, expected: ExpectedPiDecision, publicKeys: readonly string[]): PiToolCallResult {
  const value = (answer ?? {}) as Record<string, unknown>;
  const response = (value.providerResponse ?? {}) as Record<string, unknown>;
  const keys = Object.keys(response).sort().join(",");
  const allow = value.decision === "allow";
  const shaped = allow ? keys === "block,requestSha256" && response.block === false
    : value.decision === "deny" && keys === "block,reason,requestSha256" && response.block === true && nonEmpty(response.reason);
  const responseSha256 = sha256Hex(Buffer.from(canonicalize(response), "utf8"));
  if (value.controlled !== true || value.provider !== "pi" || value.actionId !== expected.actionId || !shaped
    || response.requestSha256 !== expected.requestSha256 || value.providerResponseSha256 !== responseSha256) {
    throw new Error("AMC control answer is malformed or not bound to this request");
  }
  const receipt = verifiedReceiptPayload(value.receipt, publicKeys);
  if (receipt.v !== 2 || receipt.kind !== "action_state" || receipt.providerId !== "hook-control:pi" || receipt.agentId !== expected.agentId
    || receipt.executionId !== expected.actionId || receipt.idempotencyKey !== expected.toolCallId || receipt.body_sha256 !== responseSha256
    || receipt.state !== (allow ? "authorized" : "denied")) {
    throw new Error("AMC decision receipt is not bound to this request");
  }
  return allow ? { block: false } : { block: true, reason: response.reason as string };
}
