import { randomUUID, sign } from "node:crypto";
import { getSigningKey } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import type { ActionClass } from "../types.js";
import { leasePayloadSchema, type LeasePayload, type LeaseScope } from "./leaseSchema.js";
import { leaseLifetimeRefusal, regulatedLeaseProfile } from "./regulatedProfile.js";

import { resolve } from "node:path";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey, type PurposeSignature } from "../keys/purposeProviders.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { captureVaultPurposeContinuity, vaultStatus } from "../vault/vault.js";

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface IssueLeaseInput {
  workspace: string;
  workspaceId?: string;
  agentId: string;
  claimKind?: "synthetic_example";
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
  /** The users.yaml user the lease is issued for (P1-78); see `LeasePayload.principal`. */
  principal?: LeasePayload["principal"];
  /**
   * Lease v2 (P2-25): the signed delegation chain (stored with `saveDelegationChain`) and the SPIFFE ID the issuer verified
   * for its leaf delegate. The verifier refuses the lease when that chain is missing, does not verify, is revoked or does
   * not end at this agent.
   */
  delegation?: { readonly chainDigest: string; readonly spiffeId: string | null };
}

function createLeasePayload(input: IssueLeaseInput): LeasePayload {
  const now = Date.now();
  const lifetime = leaseLifetimeRefusal(regulatedLeaseProfile(input.workspace), Math.max(60_000, input.ttlMs));
  if (lifetime !== null) throw new Error(`lease refused: ${lifetime}`);
  const payload = leasePayloadSchema.parse({
    v: input.delegation === undefined ? 1 : 2,
    leaseId: `lease_${randomUUID().replace(/-/g, "")}`,
    issuedTs: now,
    expiresTs: now + Math.max(60_000, input.ttlMs),
    workspaceId: input.workspaceId ?? "default",
    agentId: input.agentId,
    ...(input.claimKind === undefined ? {} : { claimKind: input.claimKind }),
    workOrderId: input.workOrderId ?? null,
    scopes: input.scopes,
    ...(input.executeActionClasses === undefined ? {} : { executeActionClasses: input.executeActionClasses }),
    routeAllowlist: input.routeAllowlist,
    modelAllowlist: input.modelAllowlist,
    maxTokensPerMinute: input.maxTokensPerMinute,
    maxRequestsPerMinute: input.maxRequestsPerMinute,
    maxCostUsdPerDay: input.maxCostUsdPerDay,
    nonce: randomUUID().replace(/-/g, ""),
    ...(input.principal === undefined ? {} : { principal: input.principal }),
    ...(input.delegation === undefined ? {} : { delegationChainDigest: input.delegation.chainDigest, spiffeId: input.delegation.spiffeId })
  });

  return payload;
}

export function issueLeaseToken(input: IssueLeaseInput): { token: string; payload: LeasePayload } {
  const payload = createLeasePayload(input);
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signature = sign(null, payloadBytes, getSigningKey(input.workspace, "lease"));
  return {
    token: `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`,
    payload
  };
}

/** Only the first real negative and the error that actually escaped native cleanup are known. */
class LeaseContinuationRefused extends Error {
  readonly code = "LEASE_CONTINUATION_REFUSED";
  constructor(readonly refusal: unknown, readonly escaped: unknown) {
    super("lease issuance or launch refused; inspect the original refusal and escaped error", { cause: refusal });
    this.name = "LeaseContinuationRefused";
  }
}

/** Internal fixed lease attempt, directly consumed by the maintained adapter. Never an SDK or JSON proof. */
export function captureLeaseTokenIssuance(input: IssueLeaseInput, options: { beforeSign?: () => void } = {}) {
  const fixed = structuredClone(input), workspace = fixed.workspace, root = resolve(workspace);
  const noSignAtEntry = process.env.AMC_NO_SIGN === "1", caller = options.beforeSign;
  if (noSignAtEntry) throw new Error("no-sign mode does not authorize lease issuance");
  const payload = createLeasePayload(fixed), payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const captured = capturePurposePublication(workspace, "lease");
  const originalBound = boundProviderKey(workspace, "lease");
  const boundIdentity = canonicalize(originalBound), holder = originalBound?.binding.provider ?? "file";
  const publicKeyPem = originalBound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "lease");
  const keysConfig = canonicalize(loadKeysConfig(workspace));
  let fileContinuity: (() => void) | null = null;
  if (holder === "file") {
    if (!vaultStatus(workspace).unlocked) throw new Error("original lease vault is locked; unlock before issuance");
    if (publicKeyFromPrivate(getSigningKey(workspace, "lease")) !== publicKeyPem) throw new Error("original lease vault key changed");
    fileContinuity = captureVaultPurposeContinuity(workspace, "lease");
  }
  let started = false, completed = false, failed = false, refused = false;
  let failure: unknown, signed: PurposeSignature | null = null;
  const checked = <T>(operation: () => T): T => {
    if (failed) throw failure;
    try {
      const value = operation();
      if (failed) throw failure;
      return value;
    } catch (error) {
      if (!failed) { failed = true; refused = true; failure = error; }
      throw failure;
    }
  };
  const intrinsic = (): void => {
    if (noSignAtEntry || process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize lease issuance");
    if (resolve(workspace) !== root) throw new Error("original lease workspace changed while issuing");
    if (Date.now() > payload.expiresTs) throw new Error("lease expired before launch");
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset
      || canonicalize(boundProviderKey(workspace, "lease")) !== boundIdentity
      || canonicalize(loadKeysConfig(workspace)) !== keysConfig) throw new Error("original lease authority or keys configuration changed");
    assertSigningKeyUsable(workspace, "lease", publicKeyPem, holder);
    if (holder === "file") {
      fileContinuity!();
      if (!vaultStatus(workspace).unlocked) throw new Error("original lease vault is locked; unlock before issuance");
      if (publicKeyFromPrivate(getSigningKey(workspace, "lease")) !== publicKeyPem) throw new Error("original lease vault key changed");
    }
    if (signed !== null) assertPurposePublicationCurrent(workspace, captured, signed);
    fileContinuity?.();
  };
  const actor = (): void => checked(() => { intrinsic(); caller?.(); intrinsic(); });
  actor();
  return Object.freeze({
    async issue(): Promise<{ token: string; payload: LeasePayload }> {
      checked(() => { if (started) throw new Error("lease issuance already attempted; inspect the original attempt"); started = true; });
      try {
        actor();
        signed = await signWithPurposeKey(workspace, "lease", payloadBytes, { beforeSign: actor });
        actor();
        const result = { token: `${toBase64Url(payloadBytes)}.${toBase64Url(signed.signature)}`, payload: structuredClone(payload) };
        actor(); completed = true; return result;
      } catch (error) {
        // A provider/native failure stays sticky, but is not relabelled an observed actor refusal.
        if (!failed) { failed = true; failure = error; }
        throw failure;
      }
    },
    assertCurrent(): void {
      checked(() => {
        if (!completed) throw new Error("lease issuance has not completed");
        intrinsic(); caller?.(); intrinsic(); caller?.(); intrinsic();
      });
    },
    rethrow(escaped: unknown): never {
      // Error observation only. Never sample actor, authority or TTL after launch.
      if (!refused) throw escaped;
      throw new LeaseContinuationRefused(failure, escaped);
    }
  });
}
