/**
 * A4 Forge evidence-ref resolution (P1-56; design §4.2). Computed at every read, never stored, never trusted from the
 * ref row: the trust tier is recomputed from the referenced ledger row's meta (a stored tier that differs is
 * TRUST_TIER_INFLATED), the lane is re-derived through `laneForClaimKind` and may only go down, and a verified-lane
 * ref is re-admitted against the current trust list on every call. A verified or observed ref whose target is dangling
 * or unsigned falls to implementation/self_reported (REF_DANGLING, REF_UNSIGNED).
 */
import { isAbsolute, relative, resolve } from "node:path";
import { eventMeta, workspaceOwnKeyIds } from "../claims/evidenceProvenance.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import type { Ledger } from "../ledger/ledger.js";
import { verifyEvidenceEventIntegrity } from "../ledger/ledgerVerification.js";
import { readAndVerifyArtifactFileSignature } from "../lifecycle/artifactSignature.js";
import { admitKey } from "../trust/admission.js";
import type { TrustContext } from "../trust/trustContext.js";
import { laneForClaimKind, type A4EvidenceRefRow, type A4Lane } from "./a4Schema.js";

/**
 * An admitted external record (P2-24 review record, P3-21 registry record) behind a verified-lane ref. The loader
 * returns a record only after verifying its signature over the record bytes; this module decides admission.
 */
export interface A4ExternalRecord {
  readonly publicKeyPem: string;
  readonly signedAt: string | null;
  readonly status: string;
  readonly expiresAt: string | null;
  readonly keyHistory?: unknown;
}

export interface A4ResolvedRef {
  readonly refKind: string;
  readonly refId: string;
  readonly sha256: string;
  readonly status: "resolved" | "dangling" | "payload_pruned" | "unsigned";
  readonly trustTier: string | null;
  readonly claimKind: ClaimKind;
  readonly method: string | null;
  readonly lane: A4Lane;
  readonly reasonCodes: string[];
  readonly downgrade: { readonly from: A4Lane; readonly blockerKind: "evidence_untrusted"; readonly reason: string } | null;
}

const LANE_RANK: Record<A4Lane, number> = { recommendation: 0, implementation: 0, observed: 1, verified: 2 };
const FILE_REF_KINDS = new Set(["stage_output", "artifact", "package", "deployment_receipt", "rollback_receipt", "value_claim",
  "outcome_report", "monitor", "manifest", "plan", "control_result", "verification"]);

type Status = A4ResolvedRef["status"];

function resolveLedgerRef(ledger: Ledger, ref: A4EvidenceRefRow, reasons: string[]): { status: Status; tier: string | null } {
  const event = ledger.getEventById(ref.ref_id);
  if (!event) return { status: "dangling", tier: null };
  const meta = eventMeta(event);
  const tier = typeof meta.trustTier === "string" ? meta.trustTier : null;
  if (ref.sha256 !== event.event_hash && ref.sha256 !== event.payload_sha256) {
    reasons.push("REF_DIGEST_MISMATCH");
    return { status: "dangling", tier };
  }
  if (event.writer_sig === "unsigned" || !verifyEvidenceEventIntegrity({ ledger, eventId: event.id }).ok) return { status: "unsigned", tier };
  return { status: event.payload_pruned === 1 ? "payload_pruned" : "resolved", tier };
}

function resolveFileRef(workspace: string, ref: A4EvidenceRefRow, reasons: string[]): Status {
  const path = resolve(workspace, ref.ref_id);
  const inside = relative(workspace, path);
  if (isAbsolute(ref.ref_id) || inside.startsWith("..") || isAbsolute(inside)) {
    reasons.push("PATH_OUTSIDE_WORKSPACE");
    return "dangling";
  }
  const checked = readAndVerifyArtifactFileSignature({ workspace, path });
  if (checked.artifactSha256 === null) return "dangling";
  if (checked.artifactSha256 !== ref.sha256) {
    reasons.push("REF_DIGEST_MISMATCH");
    return "dangling";
  }
  return checked.valid ? "resolved" : "unsigned";
}

/** Why a verified-lane record is not admitted now, or null when it is. Own workspace keys never count as independent. */
function verifiedDowngradeReason(workspace: string, record: A4ExternalRecord | null, trust: TrustContext, now: number): string | null {
  if (record === null) return "ISSUER_NOT_PINNED";
  const admission = admitKey({ publicKeyPem: record.publicKeyPem, purpose: "independent-attestation", signature: "a4 external record",
    context: trust, claimedSignedAt: record.signedAt, keyHistory: record.keyHistory });
  if (admission.keyId !== null && workspaceOwnKeyIds(workspace).includes(admission.keyId)) return "ISSUER_NOT_PINNED";
  if (["expired", "revoked", "distrusted", "not-yet-valid"].includes(admission.status)) return "KEY_ROTATED_OUT";
  if (admission.status !== "admitted" || admission.source === "workspace-self") return "ISSUER_NOT_PINNED";
  const expiresAt = record.expiresAt === null ? Number.NaN : Date.parse(record.expiresAt);
  if (record.status !== "active" || !(expiresAt > now)) return "ATTESTATION_EXPIRED";
  return null;
}

/**
 * Resolves each ref against the ledger, the signed artifact files and the trust list as of `now`. Kinds without a
 * resolver yet (receipt, session, approval, and an external link no admitted record backs) report `unsigned` with
 * RESOLVER_NOT_AVAILABLE: unverified, never resolved.
 */
export function resolveRefs(ledger: Ledger, refs: readonly A4EvidenceRefRow[], trust: TrustContext, now: number,
  externalRecord: (ref: A4EvidenceRefRow) => A4ExternalRecord | null = () => null): A4ResolvedRef[] {
  return refs.map((ref) => {
    const reasons: string[] = [];
    let status: Status;
    let tier: string | null = null;
    if (ref.ref_kind === "ledger_event") {
      ({ status, tier } = resolveLedgerRef(ledger, ref, reasons));
      if (ref.trust_tier !== tier) reasons.push("TRUST_TIER_INFLATED");
    } else if (FILE_REF_KINDS.has(ref.ref_kind)) {
      status = resolveFileRef(ledger.workspace, ref, reasons);
    } else {
      // A verified external link is judged by its admitted record below; anything else has no resolver yet.
      if (ref.ref_kind !== "external" || ref.lane !== "verified") reasons.push("RESOLVER_NOT_AVAILABLE");
      status = "unsigned";
    }
    const fallback = ref.lane === "recommendation" ? "recommendation" : "implementation";
    let derived = laneForClaimKind(ref.claim_kind, tier, ref.method, fallback);
    let downgradeReason: string | null = null;
    if (ref.lane === "verified") {
      // A review over bytes that are gone, changed or unsigned reviews nothing that is here now; the record is not consulted.
      downgradeReason = ref.ref_kind !== "external" && (status === "dangling" || status === "unsigned") ? `REF_${status.toUpperCase()}`
        : verifiedDowngradeReason(ledger.workspace, externalRecord(ref), trust, now);
      if (downgradeReason !== null) derived = { lane: "implementation", claimKind: "self_reported" };
      else if (ref.ref_kind === "external") status = "resolved";
    } else if (ref.lane === "observed" && (status === "dangling" || status === "unsigned")) {
      derived = { lane: "implementation", claimKind: "self_reported" };
    }
    if (LANE_RANK[derived.lane] > LANE_RANK[ref.lane]) derived = { lane: ref.lane, claimKind: ref.claim_kind };
    const downgraded = derived.lane !== ref.lane;
    if (downgraded && downgradeReason === null) downgradeReason = reasons.includes("TRUST_TIER_INFLATED") ? "TRUST_TIER_INFLATED" : `REF_${status.toUpperCase()}`;
    if (downgradeReason !== null) reasons.push(downgradeReason);
    return {
      refKind: ref.ref_kind, refId: ref.ref_id, sha256: ref.sha256, status, trustTier: tier, claimKind: derived.claimKind, method: ref.method,
      lane: derived.lane, reasonCodes: [...new Set(reasons)],
      downgrade: downgraded ? { from: ref.lane, blockerKind: "evidence_untrusted" as const, reason: downgradeReason! } : null
    };
  });
}
