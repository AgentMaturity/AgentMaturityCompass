/**
 * AMC's transport for its DSH plugin (P2-17): what `dsh-amc-plugin` imports, by the absolute path the installer printed,
 * to ask AMC about each DSH tool call. It reads the signed installation (.amc/hooks/dsh.json, through piControlClient's
 * reader: loopback Bridge, 0600 lease, pinned receipt keys), registers the plugin instance as one DSH session before
 * its first call, then posts each call to the Bridge control route with provider `dsh`.
 *
 * An answer counts only when it is a decision for exactly this request: AMC's action id, a DSH response naming the
 * digest of the request sent, that response's digest, and a receipt signed by a pinned `receipt` key whose execution
 * id, idempotency key (DSH's call id), agent, body digest and state match. Anything else throws, which the plugin turns
 * into a denial. It runs inside DSH's process and imports only Node built-ins and AMC's dependency-free helpers.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { postToBridge, readPiHookConfig, verifiedReceiptPayload, PI_CONTROL_PATH } from "../pi/piControlClient.js";
import { dshActionId, dshSessionSha256 } from "./dshIdentity.js";

const DSH_HEADERS = { "x-amc-hook-provider": "dsh" };
const DEFAULT_TIMEOUT_MS = 5_000;

/** One call as the plugin hands it over (packages/dsh-amc-plugin AmcDshRequest). */
export interface DshCallRequest {
  tool: string;
  arguments: unknown;
  callId: string;
  rootCallId: string;
  nested: boolean;
  dshVersion: string;
}

export type DshAnswer = { decision: "allow" } | { decision: "deny"; reason: string };

/** What the plugin receives for an AMC answer bound to exactly this request, or a throw. */
export function dshControlAnswer(answer: unknown, expected: { agentId: string; actionId: string; callId: string; requestSha256: string },
  publicKeys: readonly string[]): DshAnswer {
  const value = (answer ?? {}) as Record<string, unknown>;
  const response = (value.providerResponse ?? {}) as Record<string, unknown>;
  const keys = Object.keys(response).sort().join(",");
  const allow = value.decision === "allow";
  const shaped = allow ? keys === "decision,requestSha256" && response.decision === "allow"
    : value.decision === "deny" && keys === "decision,reason,requestSha256" && response.decision === "deny"
      && typeof response.reason === "string" && response.reason.length > 0;
  const responseSha256 = sha256Hex(Buffer.from(canonicalize(response), "utf8"));
  if (value.controlled !== true || value.provider !== "dsh" || value.actionId !== expected.actionId || !shaped
    || response.requestSha256 !== expected.requestSha256 || value.providerResponseSha256 !== responseSha256) {
    throw new Error("AMC control answer is malformed or not bound to this request");
  }
  const receipt = verifiedReceiptPayload(value.receipt, publicKeys);
  if (receipt.v !== 2 || receipt.kind !== "action_state" || receipt.providerId !== "hook-control:dsh" || receipt.agentId !== expected.agentId
    || receipt.executionId !== expected.actionId || receipt.idempotencyKey !== expected.callId || receipt.body_sha256 !== responseSha256
    || receipt.state !== (allow ? "authorized" : "denied")) {
    throw new Error("AMC decision receipt is not bound to this request");
  }
  return allow ? { decision: "allow" } : { decision: "deny", reason: response.reason as string };
}

/** Checks AMC's answer to this session's registration: bound to this session, plugin and request, signed by a pinned key. */
function verifyRegistrationAnswer(answer: unknown, expected: { agentId: string; dshSessionSha256: string; pluginSha256: string; requestSha256: string },
  publicKeys: readonly string[]): void {
  const value = (answer ?? {}) as Record<string, unknown>;
  const record = (value.record ?? {}) as Record<string, unknown>;
  const bound = value.registered === true && value.provider === "dsh" && record.kind === "amc.dsh-session-registration/v1"
    && Object.entries(expected).every(([key, field]) => record[key] === field);
  if (!bound) throw new Error("AMC session registration answer is malformed or not bound to this session");
  const receipt = verifiedReceiptPayload(value.receipt, publicKeys);
  if (receipt.kind !== "work_accepted" || receipt.providerId !== "hook-registration:dsh" || receipt.agentId !== expected.agentId
    || receipt.body_sha256 !== sha256Hex(Buffer.from(canonicalize(record), "utf8"))) {
    throw new Error("AMC session registration receipt is not bound to this session");
  }
}

/**
 * The plugin's `decide` for one DSH process: `pluginPath` is the plugin module DSH loaded (its digest is registered).
 * The session registers once, before the first call; a failed registration fails every call of this instance.
 */
export function createAmcDshTransport(options: { workspace: string; pluginPath: string; timeoutMs?: number }):
  { sessionId: string; decide(request: DshCallRequest): Promise<DshAnswer> } {
  const config = readPiHookConfig(options.workspace, "control", "dsh");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sessionId = randomUUID();
  const pluginSha256 = sha256Hex(readFileSync(options.pluginPath));
  let registered: Promise<void> | null = null;
  const register = (dshVersion: string): Promise<void> => {
    registered ??= (async () => {
      const body = JSON.stringify({ hook_event_name: "session_start", dsh: { version: dshVersion, sessionId, pluginSha256 } });
      const answer = await postToBridge(config, PI_CONTROL_PATH, body, timeoutMs, DSH_HEADERS);
      verifyRegistrationAnswer(answer, { agentId: config.agentId, dshSessionSha256: dshSessionSha256(sessionId), pluginSha256,
        requestSha256: sha256Hex(Buffer.from(body, "utf8")) }, config.receiptPublicKeys);
    })();
    return registered;
  };
  return {
    sessionId,
    async decide(request) {
      await register(request.dshVersion);
      const body = JSON.stringify({ hook_event_name: "tools/pre-execute", tool_name: request.tool, tool_input: request.arguments,
        dsh: { version: request.dshVersion, sessionId, callId: request.callId, rootCallId: request.rootCallId, nested: request.nested, nonce: randomUUID() } });
      const answer = await postToBridge(config, PI_CONTROL_PATH, body, timeoutMs, DSH_HEADERS);
      return dshControlAnswer(answer, { agentId: config.agentId, actionId: dshActionId(sessionId, request.callId), callId: request.callId,
        requestSha256: sha256Hex(Buffer.from(body, "utf8")) }, config.receiptPublicKeys);
    },
  };
}
