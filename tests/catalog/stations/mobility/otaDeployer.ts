import type { IssuerAdmission } from "../../../../src/trust/admission.js";
import { checkDigestSignature } from "../../../../src/trust/signatureCheck.js";
import { verifySignedTrustList } from "../../../../src/trust/trustList.js";
import { canonicalize } from "../../../../src/utils/json.js";
import { sha256Hex } from "../../../../src/utils/hash.js";
import { z } from "zod";
import { completeText, otaSchema, sameBinding, unique, utcTime, type LocalOutcome } from "./protocol.js";

export interface OtaFixtureAuthority { signedTrustList: unknown; pinnedRootKeyIds: readonly string[] }
interface OtaOutcome extends LocalOutcome {
  installedPackages: Array<{ vehicleId: string; fleetId: string; packageId: string; targetVersion: string; payloadSha256: string; verifiedMetadataDigest: string }>;
  integrity: boolean | null;
  admission: IssuerAdmission | null;
}
const authoritySchema = z.object({ signedTrustList: z.unknown(),
  pinnedRootKeyIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(64) }).strict();

/** Native pinned-purpose verification over the same captured metadata/payload that the local install log names. */
export function runOtaDeployer(value: unknown, authority: OtaFixtureAuthority | null): OtaOutcome {
  const outcome: OtaOutcome = { result: "not_evaluated", reasonCode: "invalid_input", claimKind: "synthetic_example", installedPackages: [], integrity: null, admission: null };
  const stop = (result: LocalOutcome["result"], reasonCode: string): OtaOutcome => ({ ...outcome, result, reasonCode });
  const parsed = otaSchema.safeParse(value);
  if (!parsed.success) return outcome;
  const input = parsed.data;
  if (authority === null) return stop("not_evaluated", "trust_unavailable");
  if (input.fleet === null) return stop("not_evaluated", "fleet_unavailable");
  const fleet = input.fleet, packet = input.package, metadata = packet.metadata;
  if (!sameBinding(input.context, fleet.binding) || !sameBinding(input.context, metadata.binding)
    || metadata.fleetId !== fleet.fleetId || !unique(fleet.vehicleIds)) return stop("deny", "package_binding_mismatch");
  if (Date.parse(metadata.createdAt) > Date.parse(input.at)) return stop("deny", "package_time_invalid");
  const records = metadata.r156;
  if (records === null || !completeText(records.updateId, records.softwareVersion, records.changeSummary, records.validationRecordId, records.rollbackPlanId)
    || !records.vehicleModelIds?.length) return stop("deny", "update_records_incomplete");
  if (records.softwareVersion !== metadata.targetVersion || !unique(records.vehicleModelIds)
    || !records.vehicleModelIds.includes(fleet.vehicleModelId)) return stop("deny", "update_record_binding_mismatch");
  const payload = Buffer.from(packet.payloadBase64, "base64");
  if (payload.length === 0 || payload.toString("base64") !== packet.payloadBase64) return stop("deny", "payload_invalid");
  const payloadSha256 = sha256Hex(payload);
  if (payloadSha256 !== metadata.payloadSha256) return stop("deny", "payload_digest_mismatch");
  const digestHex = sha256Hex(canonicalize(metadata));
  try {
    const captured = authoritySchema.parse(structuredClone(authority));
    if (!unique(captured.pinnedRootKeyIds)) return stop("deny", "trust_verification_failed");
    const list = verifySignedTrustList(captured.signedTrustList, { pinnedRootKeyIds: captured.pinnedRootKeyIds, now: new Date(input.at) });
    const trustTimes = [list.issuedAt, list.expiresAt, ...list.entries.flatMap(entry => [entry.validFrom, ...(entry.validTo === null ? [] : [entry.validTo]), ...(entry.revokedAt ? [entry.revokedAt] : [])]),
      ...list.distrust.flatMap(entry => entry.distrustedFrom === null ? [] : [entry.distrustedFrom])];
    if (trustTimes.some(time => !utcTime.safeParse(time).success) || Date.parse(list.issuedAt) > Date.parse(input.at)
      || Date.parse(list.issuedAt) >= Date.parse(list.expiresAt)) return stop("deny", "trust_verification_failed");
    const checked = checkDigestSignature({ signature: "mobility-ota.sig", purpose: "release", digestHex, signatureB64: packet.signatureB64,
      candidates: [packet.signerPublicKeyPem], claimedSignedAt: metadata.createdAt,
      context: { mode: "pinned", asOf: new Date(input.at), lists: [list], explicitPins: [], distrust: list.distrust, allowUnpinned: false, allowUnanchored: false } });
    outcome.integrity = checked.verified; outcome.admission = checked.admission;
    // Admission can be admitted for the candidate even when that candidate did not verify the signature.
    if (!checked.verified) return stop("deny", "signature_invalid");
    if (checked.admission.status !== "admitted") return stop("deny", "signer_not_admitted");
  } catch {
    return stop("deny", "trust_verification_failed");
  }
  outcome.installedPackages = fleet.vehicleIds.map(vehicleId => ({ vehicleId, fleetId: fleet.fleetId, packageId: metadata.packageId,
    targetVersion: metadata.targetVersion, payloadSha256, verifiedMetadataDigest: "sha256:" + digestHex }));
  return stop("allow", "pinned_release_verified");
}
