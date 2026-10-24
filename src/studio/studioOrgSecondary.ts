import { resolve } from "node:path";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable } from "../keys/signingKeys.js";
import { recomputeAndPersistOrgScorecard } from "../org/orgEngine.js";
import { recomputeOrgScorecardsApiAsync } from "../org/orgApi.js";
import type { OrgSseEvent } from "../org/orgSse.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";

type EmitOrgEvent = (type: OrgSseEvent["type"], nodeIds?: string[]) => void;

/** The twelve unconverted callers retain their synchronous, best-effort recipe and event order. */
export function recomputeStudioOrgLegacy(workspace: string, type: OrgSseEvent["type"], nodeIds: string[] | undefined,
  emitOrgEvent: EmitOrgEvent): void {
  try {
    recomputeAndPersistOrgScorecard({
      workspace,
      window: "14d"
    });
  } catch {
    // Do not fail primary workflow if org scorecard recompute fails.
  }
  emitOrgEvent(type, nodeIds);
  if (type !== "ORG_SCORECARD_UPDATED") {
    emitOrgEvent("ORG_SCORECARD_UPDATED", nodeIds);
  }
}

/** Public metadata only: no private-key warming, vault reopening, provider Describe or Sign here.
 * Existing authenticated readers may advance their high-water state; this is not a pure snapshot.
 * The later genuine org producer still supplies all signing authority and checked signatures.
 * Public metadata cannot attest original private-vault/session eligibility across an earlier primary wait;
 * later genuine producer capture cannot establish that retrospectively. */
function captureSecondaryAuthority(workspace: string, actor: () => void) {
  workspace = resolve(workspace);
  const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  enabled(); actor(); enabled();
  const descriptors = (["ORG_SCORECARD", "TRANSPARENCY_ROOT", "MERKLE_ROOT"] as const)
    .map(kind => describePolicySigner(workspace, kind));
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  // These three existing kinds use artifact-seal. A NOTARY-only route acquires no local-purpose requirements.
  const vault = descriptors.find(row => row.mode === "VAULT"), bound = vault === undefined ? null : boundProviderKey(workspace, "artifact-seal");
  const selectedPolicy = vault === undefined ? null : canonicalize(keyPolicy(loadKeysConfig(workspace)));
  const holder = bound?.binding.provider ?? "file";
  const assertCurrent = () => {
    enabled(); actor(); enabled();
    for (const descriptor of descriptors) assertPolicySignerCurrent(workspace, descriptor);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original optional org signing authority changed while primary work was running");
    if (vault !== undefined) {
      const config = loadKeysConfig(workspace), policy = keyPolicy(config);
      if (canonicalize(policy) !== selectedPolicy || !policy.allowed.includes(vault.algorithm)
        || (holder === "file" && policy.requireNonExportable))
        throw new Error("original optional org signing policy changed or refuses the selected key");
      // Full original keyset equality includes the committed provider/ref/public binding. An editable ref can only refuse.
      if (holder === "file" && (configuredRef(config, "artifact-seal") !== null || !vaultStatus(workspace).unlocked))
        throw new Error("original optional org vault authority is unavailable");
      assertSigningKeyUsable(workspace, "artifact-seal", vault.publicKeyPem, holder);
    }
  };
  assertCurrent();
  return { workspace, assertCurrent };
}

/** The five converted routes consume this optional secondary attempt.
 * Capture refusal stays private and best-effort; it cannot send a response or authorize the primary operation. */
export function captureStudioOrgSecondary(workspace: string, actor: () => void, emitOrgEvent: EmitOrgEvent) {
  let original: ReturnType<typeof captureSecondaryAuthority> | null = null, captureFailure: unknown;
  try { original = captureSecondaryAuthority(workspace, actor); }
  catch (error) { captureFailure = error; }
  return { async run(type: "AGENT_RUN_COMPLETED" | "ASSURANCE_RUN_COMPLETED" | "FEDERATION_IMPORTED" | "BENCHMARK_INGESTED", nodeIds?: string[]): Promise<void> {
    const ids = nodeIds === undefined ? undefined : [...nodeIds];
    try {
      if (original === null) throw captureFailure;
      original.assertCurrent();
      await recomputeOrgScorecardsApiAsync({ workspace: original.workspace, window: "14d" }, { beforePublish: original.assertCurrent });
    } catch {
      // Primary effects already completed. Secondary capture, signing or partial publication failure stays best-effort.
    }
    // Preserve the old notifications even on recompute failure; emission errors keep their original outer behavior.
    emitOrgEvent(type, ids);
    emitOrgEvent("ORG_SCORECARD_UPDATED", ids);
  } };
}
