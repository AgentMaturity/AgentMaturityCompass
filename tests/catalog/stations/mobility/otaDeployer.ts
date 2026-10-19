import type { IssuerAdmission } from "../../../../src/trust/admission.js";
import type { LocalOutcome } from "./protocol.js";

export interface OtaFixtureAuthority { signedTrustList: unknown; pinnedRootKeyIds: readonly string[] }
interface OtaOutcome extends LocalOutcome {
  installedPackages: Array<{ vehicleId: string; fleetId: string; packageId: string; targetVersion: string; payloadSha256: string; verifiedMetadataDigest: string }>;
  integrity: boolean | null;
  admission: IssuerAdmission | null;
}
/** Stage1 stub. Authority is separate from input; no install effect or trust verdict is fabricated. */
export function runOtaDeployer(_input: unknown, _authority: OtaFixtureAuthority | null): OtaOutcome {
  return { result: "not_evaluated", reasonCode: "not_implemented", claimKind: "synthetic_example", installedPackages: [], integrity: null, admission: null };
}
