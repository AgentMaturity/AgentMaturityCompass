import { connectFailureCode } from "../utils/connectFailure.js";
import type { UpstreamAuth } from "./upstreamAuth.js";

/** QA M-07: what a person does next when the gateway refuses a request for a missing or invalid lease. */
export function leaseHint(auditType: string, agentId: string, routePrefix: string): { next?: string } {
  return auditType === "LEASE_INVALID_OR_MISSING"
    ? { next: `Send an AMC lease in the x-amc-lease header (or as the Bearer key). Create one with: amc lease issue --agent ${agentId} --routes ${routePrefix}` }
    : {};
}

/** Said when an upstream refused authentication after the gateway dropped the client's own key (it never passes one on). */
export function droppedKeyNote(upstreamId: string, auth: UpstreamAuth): string {
  return auth.type === "none"
    ? `AMC dropped the client's own API key, and upstream ${upstreamId} has no credential configured, so it received none. Configure the upstream's key in .amc/gateway.yaml (auth with an env reference); clients never pass keys through the gateway.`
    : `AMC dropped the client's own API key and sent the key configured for upstream ${upstreamId} (${auth.env}); this refusal is about that key. Fix it where the gateway reads it, not in the client.`;
}

/**
 * The upstream named in a failed request's error body, with the next step, and `connectFailed` only when no upstream
 * response was obtained, every attempt failed before its connection opened and the error that ended the request is
 * itself such a failure: then no byte reached the upstream, so budgets count the request as costing nothing.
 */
export function upstreamFailure(target: { id: string; origin: string } | null,
  outcome: { responded: boolean; failures: readonly unknown[]; thrown: unknown }): { connectFailed?: string; body: Record<string, string> } {
  const { responded, failures, thrown } = outcome;
  const connectFailed = !responded && failures.length > 0 && failures.every(failure => connectFailureCode(failure) !== undefined)
    ? connectFailureCode(thrown) : undefined;
  if (target === null) return { ...(connectFailed === undefined ? {} : { connectFailed }), body: {} };
  return {
    ...(connectFailed === undefined ? {} : { connectFailed }),
    body: { upstream: target.id, address: target.origin, next: connectFailed !== undefined
      ? `Nothing answered at ${target.origin} (${connectFailed}). Start that server, or fix upstream ${target.id} in .amc/gateway.yaml, then retry.`
      : `Check that upstream ${target.id} at ${target.origin} is up and reachable, then retry; amc gateway status shows the routes.` }
  };
}
