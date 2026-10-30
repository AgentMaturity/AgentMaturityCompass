/**
 * Workload identity verification (P2-25). A run's identity is `observed` only after its credential verified against
 * trust pinned in the signed workload trust config AND the config binds the verified subject to the agent id the run
 * claims; anything else is refused, and a run that presents nothing is `amc-lease-only` and `self_reported` (truth
 * rule 3). Identity is not authorization: a verified identity grants no scope; leases and policy still decide.
 */
import { createHash } from "node:crypto";
import { verifyJwtSvid, verifyOidcAgentToken, type TokenCheck } from "./agentTokenVerify.js";
import { verifyX509Svid } from "./spiffe.js";
import type { WorkloadTrustConfig } from "./workloadTrust.js";

type WorkloadAttestor = "spiffe-jwt-svid" | "spiffe-x509-svid" | "oidc-agent-token" | "amc-lease-only";

export interface WorkloadIdentity {
  agentId: string; spiffeId: string | null; trustDomain: string | null;
  attestor: WorkloadAttestor; issuer: string | null; subject: string | null;
  verifiedAt: number; expiresAt: number | null;
  claimKind: "observed" | "self_reported";
  /** sha256 of the presented credential bytes; the credential itself is never stored. */
  evidenceRef: string | null;
}

export type WorkloadCredential =
  | { readonly kind: "none"; readonly agentId: string }
  | { readonly kind: "jwt-svid"; readonly agentId: string; readonly token: string }
  /** Leaf first, then intermediates, as the peer presented them in a TLS session that proved key possession. */
  | { readonly kind: "x509-svid"; readonly agentId: string; readonly certificateChainPem: string }
  | { readonly kind: "oidc-agent-token"; readonly agentId: string; readonly token: string };

export type WorkloadVerification = { ok: true; identity: WorkloadIdentity } | { ok: false; reason: string };

const digestOf = (text: string): string => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

/** The binding that lets a verified subject act as `agentId`, or a refusal naming why not. */
function bound(trust: WorkloadTrustConfig, agentId: string, check: Extract<TokenCheck, { ok: true }>): string | null {
  const binding = trust.bindings.find((entry) => entry.agentId === agentId);
  const allowed = check.spiffeId !== null
    ? binding?.spiffeIds.includes(check.spiffeId.id)
    : binding?.oidcSubjects.some((entry) => entry.issuer === check.issuer && entry.subject === check.subject);
  return allowed === true ? null : `${check.subject} is not bound to agent ${agentId} in the workload trust config`;
}

/**
 * Verify one presented credential. `trust` is the verified config (`loadWorkloadTrustConfig`), or null when the workspace
 * pins none: then every presented credential is refused (an unpinned issuer is never trusted, truth rule 5).
 */
export async function verifyWorkloadIdentity(input: WorkloadCredential, trust: WorkloadTrustConfig | null,
  options: { readonly nowMs?: number } = {}): Promise<WorkloadVerification> {
  const now = options.nowMs ?? Date.now();
  const agentId = input.agentId.trim();
  if (agentId.length === 0) return { ok: false, reason: "a workload identity needs a non-empty agentId" };
  if (input.kind === "none") {
    return { ok: true, identity: { agentId, spiffeId: null, trustDomain: null, attestor: "amc-lease-only", issuer: null, subject: null,
      verifiedAt: now, expiresAt: null, claimKind: "self_reported", evidenceRef: null } };
  }
  if (trust === null) return { ok: false, reason: `${input.kind}: no workload trust config is pinned, so no issuer is trusted` };
  let check: TokenCheck, attestor: WorkloadAttestor, presented: string;
  if (input.kind === "x509-svid") {
    presented = input.certificateChainPem;
    attestor = "spiffe-x509-svid";
    check = x509Check(input.certificateChainPem, trust, now);
  } else {
    presented = input.token;
    attestor = input.kind === "jwt-svid" ? "spiffe-jwt-svid" : "oidc-agent-token";
    check = input.kind === "jwt-svid" ? await verifyJwtSvid(input.token, trust, now) : await verifyOidcAgentToken(input.token, trust, now);
  }
  if (!check.ok) return check;
  const unbound = bound(trust, agentId, check);
  if (unbound !== null) return { ok: false, reason: unbound };
  return { ok: true, identity: { agentId, spiffeId: check.spiffeId?.id ?? null, trustDomain: check.spiffeId?.trustDomain ?? null, attestor,
    issuer: check.issuer, subject: check.subject, verifiedAt: now, expiresAt: check.expiresAt, claimKind: "observed", evidenceRef: digestOf(presented) } };
}

/** Try each pinned trust domain's X.509 authorities; the leaf's own SAN decides which domain must verify it. */
function x509Check(chainPem: string, trust: WorkloadTrustConfig, now: number): TokenCheck {
  let last = "x509-svid: no trust domain pins X.509 authorities";
  for (const domain of trust.spiffe.trustDomains) {
    if (domain.x509Authorities.length === 0) continue;
    const result = verifyX509Svid(chainPem, domain.x509Authorities, domain.trustDomain, now);
    if (result.ok) return { ok: true, subject: result.spiffeId.id, issuer: null, expiresAt: result.notAfter, spiffeId: result.spiffeId };
    last = result.reason;
  }
  return { ok: false, reason: last };
}
