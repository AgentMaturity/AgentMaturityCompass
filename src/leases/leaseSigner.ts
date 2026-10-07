import { randomUUID, sign } from "node:crypto";
import { getPrivateKeyPem } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import type { ActionClass } from "../types.js";
import { leasePayloadSchema, type LeasePayload, type LeaseScope } from "./leaseSchema.js";

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface IssueLeaseInput {
  workspace: string;
  workspaceId?: string;
  agentId: string;
  ttlMs: number;
  scopes: LeaseScope[];
  routeAllowlist: string[];
  modelAllowlist: string[];
  maxTokensPerMinute: number;
  maxRequestsPerMinute: number;
  maxCostUsdPerDay: number | null;
  workOrderId?: string | null;
  /** Narrows toolhub:execute to these classes; omitted, the lease covers every class policy allows. */
  executeActionClasses?: ActionClass[];
}

export function issueLeaseToken(input: IssueLeaseInput): { token: string; payload: LeasePayload } {
  const now = Date.now();
  const payload = leasePayloadSchema.parse({
    v: 1,
    leaseId: `lease_${randomUUID().replace(/-/g, "")}`,
    issuedTs: now,
    expiresTs: now + Math.max(60_000, input.ttlMs),
    workspaceId: input.workspaceId ?? "default",
    agentId: input.agentId,
    workOrderId: input.workOrderId ?? null,
    scopes: input.scopes,
    ...(input.executeActionClasses === undefined ? {} : { executeActionClasses: input.executeActionClasses }),
    routeAllowlist: input.routeAllowlist,
    modelAllowlist: input.modelAllowlist,
    maxTokensPerMinute: input.maxTokensPerMinute,
    maxRequestsPerMinute: input.maxRequestsPerMinute,
    maxCostUsdPerDay: input.maxCostUsdPerDay,
    nonce: randomUUID().replace(/-/g, "")
  });

  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signature = sign(null, payloadBytes, getPrivateKeyPem(input.workspace, "lease"));
  return {
    token: `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`,
    payload
  };
}
