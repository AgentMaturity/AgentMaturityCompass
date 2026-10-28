import { verify } from "node:crypto";
import { getPublicKeyHistory } from "../crypto/keys.js";
import type { ActionClass } from "../types.js";
import { agentLeaseRevocationId, leasePayloadSchema, type LeasePayload, type LeaseScope } from "./leaseSchema.js";

import { verifyCurrentPurposeCredentialSignature } from "../keys/purposeCredentialSignature.js";
import { chainLeaf, loadDelegationChain, verifyChain } from "../agent/delegationChain.js";
import { loadWorkloadTrustConfig } from "../identity/workload/workloadTrust.js";
import { revokedLeaseIdSet } from "./leaseStore.js";
import { regulatedLeaseProfile } from "./regulatedProfile.js";

function fromBase64Url(encoded: string): Buffer {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function hasScope(payload: LeasePayload, scope: LeaseScope): boolean {
  return payload.scopes.includes(scope);
}

export { agentLeaseRevocationId };

export interface VerifyLeaseOptions {
  workspace: string;
  token: string;
  expectedWorkspaceId?: string;
  expectedAgentId?: string;
  requiredScope?: LeaseScope;
  routePath?: string;
  model?: string | null;
  revokedLeaseIds?: Set<string>;
  /** The class about to execute; a lease that names `executeActionClasses` must include it (AMC-1546). */
  actionClass?: ActionClass;
  /**
   * The maximum lease lifetime. Absent (every production caller), it is the active plan's cap read here
   * (`regulatedLeaseProfile`, P2-25), and a plan that cannot be verified refuses every lease. Tests pass it explicitly.
   */
  maxLifetimeMs?: number | null;
}

export interface VerifyLeaseResult {
  ok: boolean;
  payload: LeasePayload | null;
  error?: string;
}

/**
 * Lease v2 (P2-25): the chain the lease binds, loaded by its digest and verified now (signatures, root, narrowing, depth,
 * validity and revocation), must end at this lease's agent and SPIFFE ID and outlive the lease. Any read that fails
 * refuses: a missing chain store, an unverifiable workload trust config or revocation list is never "no chain".
 */
function delegationChainRefusal(workspace: string, payload: LeasePayload, revoked: Set<string> | undefined): string | null {
  const chain = loadDelegationChain(workspace, payload.delegationChainDigest ?? "");
  if (chain === null || chain.digest !== payload.delegationChainDigest) return "delegation chain unavailable for this lease";
  const trust = loadWorkloadTrustConfig(workspace);
  const verified = verifyChain(chain, { workspace, declaredServices: trust?.services ?? [], revokedIds: revoked ?? revokedLeaseIdSet(workspace) });
  if (!verified.ok) return verified.reason.endsWith(" is revoked") ? "lease revoked" : `delegation chain refused: ${verified.reason}`;
  const leaf = chainLeaf(chain);
  if (leaf.delegate.agentId !== payload.agentId) return "delegation chain refused: its delegate is not this lease's agent";
  if (leaf.delegate.spiffeId !== payload.spiffeId) return "delegation chain refused: its delegate's SPIFFE ID is not this lease's";
  if (payload.expiresTs > leaf.notAfter) return "delegation chain refused: the lease outlives its delegation";
  return null;
}

export function verifyLeaseToken(input: VerifyLeaseOptions): VerifyLeaseResult {
  try {
    const [payloadB64, signatureB64, ...extra] = input.token.split(".");
    if (!payloadB64 || !signatureB64 || extra.length > 0) {
      return { ok: false, payload: null, error: "invalid lease format" };
    }
    const payloadBytes = fromBase64Url(payloadB64);
    const signature = fromBase64Url(signatureB64);
    const payload = leasePayloadSchema.parse(JSON.parse(payloadBytes.toString("utf8")) as unknown);

    const publicKeys = getPublicKeyHistory(input.workspace, "lease");
    // Preserve the legacy observation and its native throw boundary; neither mathematical verdict bypasses purpose admission.
    publicKeys.some((pub) => verify(null, payloadBytes, pub, signature));
    const validSig = verifyCurrentPurposeCredentialSignature(input.workspace, "lease", payloadBytes, signature);
    if (!validSig) {
      return { ok: false, payload, error: "signature verification failed" };
    }
    if (Date.now() > payload.expiresTs) {
      return { ok: false, payload, error: "lease expired" };
    }
    if (input.revokedLeaseIds?.has(payload.leaseId) || input.revokedLeaseIds?.has(agentLeaseRevocationId(payload.agentId))) {
      return { ok: false, payload, error: "lease revoked" };
    }
    const profile = input.maxLifetimeMs === undefined ? regulatedLeaseProfile(input.workspace) : null;
    if (profile !== null && !profile.verified) {
      return { ok: false, payload, error: "lease refused: the active compiled plan cannot be verified, so its lease lifetime cap is unknown" };
    }
    const maxLifetimeMs = profile === null ? input.maxLifetimeMs : profile.maxLeaseTtlMs;
    if (maxLifetimeMs != null && payload.expiresTs - payload.issuedTs > maxLifetimeMs) {
      return { ok: false, payload, error: "lease lifetime exceeds the regulated plan's maximum" };
    }
    const chain = payload.v === 2 ? delegationChainRefusal(input.workspace, payload, input.revokedLeaseIds) : null;
    if (chain !== null) return { ok: false, payload, error: chain };
    if (input.expectedAgentId && payload.agentId !== input.expectedAgentId) {
      return { ok: false, payload, error: "lease agent mismatch" };
    }
    if (input.expectedWorkspaceId && payload.workspaceId !== input.expectedWorkspaceId) {
      return { ok: false, payload, error: "lease workspace mismatch" };
    }
    if (input.requiredScope && !hasScope(payload, input.requiredScope)) {
      return { ok: false, payload, error: `lease scope denied: ${input.requiredScope}` };
    }
    if (input.actionClass !== undefined && payload.executeActionClasses !== undefined && !payload.executeActionClasses.includes(input.actionClass)) {
      return { ok: false, payload, error: `lease scope denied: toolhub:execute does not cover ${input.actionClass}` };
    }
    if (input.routePath) {
      // A route entry covers its own path and paths below it, on a segment boundary: `/dsh` never covers `/dsh2`.
      const path = input.routePath;
      const allowed = payload.routeAllowlist.some((prefix) =>
        path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
      if (!allowed) {
        return { ok: false, payload, error: "lease route denied" };
      }
    }
    if (input.model !== undefined) {
      const model = input.model ?? "";
      if (model.length === 0) {
        if (!payload.modelAllowlist.some((item) => item === "*")) {
          return { ok: false, payload, error: "lease model denied" };
        }
      } else {
        const allowed = payload.modelAllowlist.some((pattern) => wildcardMatch(pattern, model));
        if (!allowed) {
          return { ok: false, payload, error: "lease model denied" };
        }
      }
    }
    return {
      ok: true,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      payload: null,
      error: String(error)
    };
  }
}
