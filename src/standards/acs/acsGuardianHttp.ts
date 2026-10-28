/**
 * The Bridge's ACS guardian route (P2-19): loopback only, authenticated by an AMC hook lease with the `hook:control`
 * scope whose route allowlist names ACS_GUARDIAN_ROUTE, rate-limited like the other hook routes. ACS v0.1 mandates no
 * authentication mechanism (its section 11), so the lease is the authentication; AMC never opens an unauthenticated
 * listener to match a spec example. The JSON-RPC handling is acsGuardian.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyBridgeLease } from "../../bridge/bridgeAuth.js";
import { MAX_CONTROL_HOOK_BODY_BYTES } from "../../bridge/hookControl.js";
import { consumeObservedHookRateLimit } from "../../bridge/hookIngress.js";
import { writeControlJson } from "../../utils/controlHttpResponses.js";
import { ACS_ERRORS, handleAcsGuardianRequest } from "./acsGuardian.js";

export const ACS_GUARDIAN_ROUTE = "/hooks/acs/v0.1";
export const ACS_GUARDIAN_PATH = `/bridge${ACS_GUARDIAN_ROUTE}`;

function refuse(res: ServerResponse, status: number, code: number, reason: string, message: string): true {
  writeControlJson(res, status, { jsonrpc: "2.0", id: null, error: { code, message, data: { reason, message } } });
  return true;
}

function isLoopback(address: string | undefined): boolean {
  return Boolean(address) && (address === "::1" || address!.startsWith("127.") || address!.startsWith("::ffff:127."));
}

async function readCapped(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.byteLength;
    if (total > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleAcsGuardianHttp(options: { workspace: string; req: IncomingMessage; res: ServerResponse; url: URL }): Promise<true> {
  const { req, res } = options;
  if ((req.method ?? "POST").toUpperCase() !== "POST") return refuse(res, 405, ACS_ERRORS.INVALID_REQUEST, "method_not_allowed", "POST only");
  if (!isLoopback(req.socket.remoteAddress)) return refuse(res, 403, ACS_ERRORS.SESSION_REFUSED, "not_loopback", "the ACS guardian accepts loopback requests only");
  const auth = verifyBridgeLease({ workspace: options.workspace, requestUrl: options.url, headers: req.headers, routePath: ACS_GUARDIAN_ROUTE,
    requiredScope: "hook:control" });
  if (!auth.ok || !auth.payload) return refuse(res, auth.status, ACS_ERRORS.SESSION_REFUSED, "unauthenticated", auth.error ?? "unauthorized");
  try {
    const limit = consumeObservedHookRateLimit({ workspace: options.workspace, leaseId: auth.payload.leaseId, authenticatedAgentId: auth.payload.agentId,
      maxRequestsPerMinute: auth.payload.maxRequestsPerMinute, routePath: ACS_GUARDIAN_ROUTE });
    if (!limit.allowed) {
      res.setHeader("retry-after", String(limit.retryAfterSeconds));
      return refuse(res, 429, ACS_ERRORS.SESSION_REFUSED, "rate_limited", "hook lease rate limit exceeded");
    }
    const rawBody = await readCapped(req, MAX_CONTROL_HOOK_BODY_BYTES);
    if (rawBody === null) return refuse(res, 413, ACS_ERRORS.INVALID_REQUEST, "payload_too_large", "ACS request exceeds 256 KiB");
    writeControlJson(res, 200, handleAcsGuardianRequest({ workspace: options.workspace, authenticatedAgentId: auth.payload.agentId,
      lease: auth.payload, rawBody }));
  } catch (error) {
    return refuse(res, 503, ACS_ERRORS.SESSION_REFUSED, "guardian_unavailable", error instanceof Error ? error.message : "ACS guardian failed");
  }
  return true;
}
