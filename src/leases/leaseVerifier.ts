import { verify } from "node:crypto";
import { getPublicKeyHistory } from "../crypto/keys.js";
import type { ActionClass } from "../types.js";
import { leasePayloadSchema, type LeasePayload, type LeaseScope } from "./leaseSchema.js";

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
}

export interface VerifyLeaseResult {
  ok: boolean;
  payload: LeasePayload | null;
  error?: string;
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
    const validSig = publicKeys.some((pub) => verify(null, payloadBytes, pub, signature));
    if (!validSig) {
      return { ok: false, payload, error: "signature verification failed" };
    }
    if (Date.now() > payload.expiresTs) {
      return { ok: false, payload, error: "lease expired" };
    }
    if (input.revokedLeaseIds?.has(payload.leaseId)) {
      return { ok: false, payload, error: "lease revoked" };
    }
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
