/**
 * The Bridge's Codex observation route (P2-17): loopback only, authenticated by the Codex installation's hook lease
 * (`hook:observe`), rate-limited like the other hook routes, through the workspace's hook audit latch. AMC's Codex
 * forwarder (src/adapters/codex/codexObserveForwarder.ts) posts each PostToolUse payload here; codexObservations.ts
 * records it. Nothing here can block a Codex call: it is observe-only.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { isLoopback, readCapped } from "../standards/acs/acsGuardianHttp.js";
import { writeControlJson } from "../utils/controlHttpResponses.js";
import { verifyBridgeLease } from "./bridgeAuth.js";
import { recordCodexPostToolUse } from "./codexObservations.js";
import { guardHookAudit } from "./hookAuditLatch.js";
import { MAX_CONTROL_HOOK_BODY_BYTES } from "./hookControl.js";
import { consumeObservedHookRateLimit } from "./hookIngress.js";
import { HookControlError } from "./hookProviders.js";

const CODEX_OBSERVE_ROUTE = "/hooks/codex/v1";
export const CODEX_OBSERVE_PATH = `/bridge${CODEX_OBSERVE_ROUTE}`;

const refuse = (res: ServerResponse, status: number, error: string): true => {
  writeControlJson(res, status, { ok: false, error });
  return true;
};

export async function handleCodexObserveHttp(options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL }): Promise<true> {
  const { req, res, workspace } = options;
  if ((req.method ?? "POST").toUpperCase() !== "POST") return refuse(res, 405, "method not allowed");
  if (!isLoopback(req.socket.remoteAddress)) return refuse(res, 403, "the Codex observation route accepts loopback requests only");
  const auth = verifyBridgeLease({ workspace, requestUrl: options.url, headers: req.headers, routePath: CODEX_OBSERVE_ROUTE, requiredScope: "hook:observe" });
  if (!auth.ok || !auth.payload) return refuse(res, auth.status, auth.error ?? "unauthorized");
  try {
    const limit = consumeObservedHookRateLimit({ workspace, leaseId: auth.payload.leaseId, authenticatedAgentId: auth.payload.agentId,
      maxRequestsPerMinute: auth.payload.maxRequestsPerMinute, routePath: CODEX_OBSERVE_ROUTE });
    if (!limit.allowed) {
      res.setHeader("retry-after", String(limit.retryAfterSeconds));
      return refuse(res, 429, "hook lease rate limit exceeded");
    }
    const rawInput = await readCapped(req, MAX_CONTROL_HOOK_BODY_BYTES);
    if (rawInput === null) return refuse(res, 413, "Codex observation exceeds 256 KiB");
    const lease = auth.payload;
    const recorded = guardHookAudit(workspace, (message) => new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, message),
      () => recordCodexPostToolUse({ workspace, authenticatedAgentId: lease.agentId, rawInput, lease }));
    writeControlJson(res, recorded.idempotentReplay ? 200 : 201, { ok: true, observed: true, claim: "observed", ...recorded });
  } catch (error) {
    if (error instanceof HookControlError) return refuse(res, error.statusCode, error.message);
    process.stderr.write(`[amc] Codex observation route: ${error instanceof Error ? error.message : String(error)}\n`);
    return refuse(res, 503, "Codex observation could not be recorded");
  }
  return true;
}
