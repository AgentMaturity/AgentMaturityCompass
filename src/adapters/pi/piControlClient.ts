/**
 * How AMC's Pi extension reads its installation and talks to the local Bridge (P1-22). It runs inside Pi's process,
 * so it uses Node built-ins and AMC's dependency-free helpers only. Every failure throws; the extension turns a throw
 * in control mode into a block.
 *
 * The extension does not verify the installation manifest's signature (that needs AMC's key store); `amc connect hooks
 * status --provider pi` does. It refuses a manifest for another provider or mode, a non-loopback Bridge for control,
 * and a lease file that is not mode 0600.
 */
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
}

/** Pi's ToolCallEventResult as AMC renders it, plus AMC's `ask` instruction to the extension. */
export type PiControlResponse = { block: false } | { block: true; reason: string; ask?: true };

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
  return { agentId: text(manifest.agentId, "agentId"), bridgeBase: bridge.origin, token };
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

/**
 * The provider response of an AMC control answer, if the answer is for `actionId`, its decision matches its Pi
 * response, and the response hashes to the digest AMC signed. Anything else throws.
 */
export function piControlAnswer(answer: unknown, actionId: string): PiControlResponse {
  const value = (answer ?? {}) as Record<string, unknown>;
  const response = (value.providerResponse ?? {}) as Record<string, unknown>;
  const keys = Object.keys(response).sort().join(",");
  const shaped = value.decision === "allow" ? keys === "block" && response.block === false
    : value.decision === "deny" ? keys === "block,reason" && response.block === true && nonEmpty(response.reason)
      : value.decision === "ask" ? keys === "ask,block,reason" && response.block === true && response.ask === true && nonEmpty(response.reason)
        : false;
  if (value.controlled !== true || value.provider !== "pi" || value.actionId !== actionId || !shaped
    || value.providerResponseSha256 !== sha256Hex(Buffer.from(canonicalize(response), "utf8"))) {
    throw new Error("AMC control answer is malformed or not bound to this call");
  }
  return response as PiControlResponse;
}
