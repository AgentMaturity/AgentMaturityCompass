/**
 * How AMC's Pi extension reads its installation and talks to the local Bridge (P1-22). It runs inside Pi's process,
 * so it uses Node built-ins and AMC's dependency-free helpers only. Every failure throws; the extension turns a throw
 * in control mode into a block.
 *
 * The extension does not verify the installation manifest's signature (that needs AMC's key store); `amc connect hooks
 * status --provider pi` does. It refuses a manifest for another provider or mode, a non-loopback Bridge for control,
 * a lease file that is not mode 0600, and a control manifest without the receipt keys AMC pinned at install. Those
 * keys are workspace keys: a verified receipt is a local audit trail, not a portable verdict.
 *
 * Egress: a POST to a remote (HTTPS, observe-mode) Bridge leaves the host, so it meets checkEgress (residency) on the
 * `bridge` channel for the installation's workspace right before it is sent, as AMC's own traffic (agentId "system":
 * a kill switch does not refuse the record of what the agent did). That check loads AMC's runtime (the ledger's native
 * module included) into Pi's process, so it is imported only then; failing to load it refuses the POST. A loopback
 * Bridge is AMC's own local process, which checks its own onward hops: that POST stays dependency-free.
 */
import { verifyWithKey } from "../../keys/algorithmPolicy.js";
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
  /** The AMC workspace the installation belongs to: its residency registry governs a remote Bridge. */
  readonly workspace: string;
  readonly agentId: string;
  readonly bridgeBase: string;
  readonly token: string;
  /** The keys of AMC's `receipt` signing purpose (P1-08) at install; a control answer's receipt must verify under one of them. */
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

/** The installation `.amc/hooks/<provider>.json` names, for a hook installed in `mode` (Pi's extension, or AMC's DSH transport). */
export function readPiHookConfig(workspace: string, mode: "observe" | "control", provider: "pi" | "dsh" = "pi"): PiHookConfig {
  const manifest = JSON.parse(readFileSync(join(workspace, ".amc", "hooks", `${provider}.json`), "utf8")) as Record<string, unknown>;
  if (manifest.provider !== provider || manifest.mode !== mode) throw new Error(`${provider} hook manifest is not a ${mode} installation`);
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
  return { workspace, agentId: text(manifest.agentId, "agentId"), bridgeBase: bridge.origin, token, receiptPublicKeys };
}

/**
 * POST `body` to the Bridge within `timeoutMs`; refuses redirects and throws on any non-2xx answer, with the Bridge's
 * reason (a latched workspace says so). Resolves to the JSON body. A 409 never counts as recorded: the Bridge answers
 * the same observation, bound to the same decision, sent again as recorded (an idempotent replay, 2xx), and keeps,
 * flags and refuses a conflicting one.
 */
export async function postToBridge(config: PiHookConfig, path: string, body: string, timeoutMs: number,
  headers: Record<string, string> = {}): Promise<unknown> {
  const url = `${config.bridgeBase}${path}`;
  const remote = !LOOPBACK_HOSTS.has(new URL(url).hostname);
  return withHookDeadline(timeoutMs, async (signal) => {
    if (remote) {
      const { checkEgress } = await import("../../residency/checkEgress.js");
      checkEgress({ workspace: config.workspace, channel: "bridge", url, agentId: "system", dataClasses: null, purpose: "provider-hook" });
    }
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal,
      headers: { ...headers, authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body,
    });
    if (!response.ok) {
      const reason = await response.json().then((answer) => (answer as { error?: unknown } | null)?.error, () => null);
      throw new Error(`AMC Bridge answered HTTP ${response.status}${typeof reason === "string" ? `: ${reason.slice(0, 512)}` : ""}`);
    }
    return await response.json() as unknown;
  });
}

/** Record one observation at the Bridge's observed ingress; anything but an answer that AMC recorded it throws. */
export async function postObservation(config: PiHookConfig, body: string, timeoutMs: number): Promise<void> {
  const answer = await postToBridge(config, PI_OBSERVE_PATH, body, timeoutMs) as { observed?: unknown } | null;
  if (answer?.observed !== true) throw new Error("AMC's answer does not say it recorded the observation");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The payload of a receipt that verifies under one of the pinned receipt keys, over the received payload bytes, or a throw. */
export function verifiedReceiptPayload(receipt: unknown, publicKeys: readonly string[]): Record<string, unknown> {
  const parts = typeof receipt === "string" ? receipt.split(".") : [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("AMC decision receipt is malformed");
  const payload = Buffer.from(parts[0], "base64url");
  const signature = Buffer.from(parts[1], "base64url");
  if (!publicKeys.some((key) => verifyWithKey(payload, key, signature))) throw new Error("AMC decision receipt signature does not verify");
  return JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
}

/** The registration this extension sent, which AMC's answer must bind. */
export interface ExpectedPiRegistration {
  readonly agentId: string;
  readonly piSessionSha256: string;
  readonly piVersion: string;
  readonly extensionSha256: string;
  readonly requestSha256: string;
}

/**
 * Checks AMC's answer to a session registration: the record names this agent, session digest, Pi version, module
 * digest and request, plus AMC's digests of the Pi install and installation it measured, and its receipt
 * (`work_accepted`) is signed by a pinned `receipt` purpose key over that record.
 * Anything else throws, so the session stays unregistered and its calls are blocked.
 */
export function verifyPiRegistrationAnswer(answer: unknown, expected: ExpectedPiRegistration, publicKeys: readonly string[]): void {
  const value = (answer ?? {}) as Record<string, unknown>;
  const record = (value.record ?? {}) as Record<string, unknown>;
  const bound = value.registered === true && value.provider === "pi" && record.kind === "amc.pi-session-registration/v1"
    && Object.entries(expected).every(([key, field]) => record[key] === field) && typeof record.qualified === "boolean"
    && [record.piInstallSha256, record.manifestSha256].every((digest) => typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest))
    && Object.keys(record).length === 10;
  if (!bound) throw new Error("AMC session registration answer is malformed or not bound to this session");
  const receipt = verifiedReceiptPayload(value.receipt, publicKeys);
  if (receipt.kind !== "work_accepted" || receipt.providerId !== "hook-registration:pi" || receipt.agentId !== expected.agentId
    || receipt.body_sha256 !== sha256Hex(Buffer.from(canonicalize(record), "utf8"))) {
    throw new Error("AMC session registration receipt is not bound to this session");
  }
}

/**
 * What to return to Pi for an AMC control answer. The answer must be a decision for exactly this call: AMC's action id,
 * a Pi response that names the digest of the request sent, that response's digest, and a receipt signed by an AMC
 * `receipt` purpose key pinned at install whose body digest, execution id, idempotency key (Pi's call id), agent and state match.
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
