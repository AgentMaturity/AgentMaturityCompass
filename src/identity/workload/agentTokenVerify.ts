/**
 * JWT workload tokens (P2-25): JWT-SVIDs and cloud agent tokens (Microsoft Entra Agent ID, AWS AgentCore, any OIDC
 * issuer the operator pins). Both go through P2-07's hardened JWT verifier (`verifyWorkloadJwt`) with keys pinned in
 * signed config and an audience check. Vendor support is experimental: the claim names are the pinned versions in
 * docs/AGENT_IDENTITY.md and may change.
 */
import { verifyWorkloadJwt } from "../oidc/jwtVerify.js";
import { parseSpiffeId, type SpiffeId } from "./spiffe.js";
import type { WorkloadTrustConfig } from "./workloadTrust.js";

export type TokenCheck =
  | { readonly ok: true; readonly subject: string; readonly issuer: string | null; readonly expiresAt: number; readonly spiffeId: SpiffeId | null }
  | { readonly ok: false; readonly reason: string };

/**
 * A JWT-SVID (JWT-SVID §3): signed by a JWT authority pinned for the trust domain its `sub` names, for the pinned
 * audience. The trust domain comes from the token's subject and must be pinned; a key from another domain never verifies.
 */
export async function verifyJwtSvid(token: string, trust: WorkloadTrustConfig, nowMs: number): Promise<TokenCheck> {
  const unverified = unverifiedSubject(token);
  const claimed = unverified === null ? null : parseSpiffeId(unverified);
  if (claimed === null) return { ok: false, reason: "jwt-svid: the subject is not a SPIFFE ID" };
  const domain = trust.spiffe.trustDomains.find((entry) => entry.trustDomain === claimed.trustDomain);
  if (domain === undefined || domain.jwtAuthorities.length === 0) {
    return { ok: false, reason: `jwt-svid: trust domain ${claimed.trustDomain} has no pinned JWT authority` };
  }
  const verified = await verifyWorkloadJwt({ token, audience: domain.audience, issuer: null, keys: { inline: domain.jwtAuthorities }, nowMs });
  if (!verified.ok) return { ok: false, reason: `jwt-svid: ${verified.error}` };
  // The verified subject, not the unverified one read above to pick the bundle.
  const spiffeId = parseSpiffeId(String(verified.claims.sub));
  if (spiffeId === null || spiffeId.trustDomain !== domain.trustDomain) return { ok: false, reason: "jwt-svid: the subject left its trust domain" };
  return { ok: true, subject: spiffeId.id, issuer: null, expiresAt: Number(verified.claims.exp) * 1000, spiffeId };
}

/** A cloud agent token from an issuer pinned in signed config; an issuer that is not pinned is refused before any key is read. */
export async function verifyOidcAgentToken(token: string, trust: WorkloadTrustConfig, nowMs: number): Promise<TokenCheck> {
  const claimedIssuer = unverifiedClaim(token, "iss");
  const pinned = trust.oidcAgentIssuers.find((entry) => entry.issuer === claimedIssuer);
  if (pinned === undefined) return { ok: false, reason: "oidc-agent-token: the issuer is not pinned in the workload trust config" };
  const keys = pinned.jwks !== undefined ? { inline: pinned.jwks } : { jwksUri: pinned.jwksUri! };
  const verified = await verifyWorkloadJwt({ token, audience: pinned.audience, issuer: pinned.issuer, keys, nowMs });
  if (!verified.ok) return { ok: false, reason: `oidc-agent-token: ${verified.error}` };
  return { ok: true, subject: String(verified.claims.sub), issuer: pinned.issuer, expiresAt: Number(verified.claims.exp) * 1000, spiffeId: null };
}

/** A claim read BEFORE verification, only to choose which pinned trust applies; never trusted on its own. */
function unverifiedClaim(token: string, claim: "sub" | "iss"): string | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const value = payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>)[claim] : undefined;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

const unverifiedSubject = (token: string): string | null => unverifiedClaim(token, "sub");
