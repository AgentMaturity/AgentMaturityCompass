import { listContainedDir, readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceRecordHead, withWorkspaceRecordPublicationLock } from "../storage/workspaceRecordStore.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { assertOverridePublicationCurrent, BreakGlassSigningError, verifyOverrideDigest } from "./overrideSignature.js";
import type { EmergencyOverride } from "./policyCanary.js";

type PreparedOverride = Awaited<ReturnType<typeof import("./overrideSignature.js").prepareOverrideDigestSignature>>;
const REL = ".amc/governor/emergency-overrides", AT = { area: ["governor"], kind: "emergency-overrides" };

/** The existing canary activation hash, shared by its actual writer and reader. */
export function canaryOverrideDigest(o: Pick<EmergencyOverride, "overrideId" | "agentId" | "reason" | "actionDescription" | "ttlMs" | "startedTs" | "expiresTs">): string {
  const { overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs } = o;
  return sha256Hex(canonicalize({ overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs }));
}

export function withCanaryOverridePublicationLock<T>(workspace: string, operation: () => T): T {
  return withWorkspaceRecordPublicationLock(workspace, AT, operation);
}

/** Exact current bytes, not a claim that legacy overwritten record preimages can be independently reconstructed. */
function inventory(workspace: string): string {
  return canonicalize(listContainedDir(workspace, REL).filter(name => name.endsWith(".json")).sort().map(name => {
    const bytes = readContainedOrNull(workspace, `${REL}/${name}`, Number.MAX_SAFE_INTEGER);
    if (bytes === null) throw new Error("canary override register changed while it was read; retry");
    return { name, sha256: sha256Hex(bytes) };
  }));
}

function fileRefusal(error: unknown): never {
  if (error instanceof KeyProviderError || error instanceof KeyRevokedError) throw error;
  throw new BreakGlassSigningError();
}

/** Only the actual new canary-activation caller uses this strict two-purpose publisher. */
export async function publishCanaryOverride(workspace: string, override: EmergencyOverride, prepared: PreparedOverride): Promise<EmergencyOverride> {
  const own = structuredClone(override), body = { ...own, override_signature: own.signature }, rel = `${REL}/${own.overrideId}.json`;
  if (body.override_signature !== prepared.signed.signature.toString("base64") || !verifyOverrideDigest(workspace, canaryOverrideDigest(own), own.signature).valid) throw new BreakGlassSigningError();
  let artifact: ReturnType<typeof capturePurposePublication>;
  try { artifact = capturePurposePublication(workspace, "artifact-seal"); } catch (error) { fileRefusal(error); }
  const predecessor = withCanaryOverridePublicationLock(workspace, () => {
    if (readContainedOrNull(workspace, rel, Number.MAX_SAFE_INTEGER) !== null) throw new Error("canary override destination already exists");
    return { inventory: inventory(workspace), head: workspaceRecordHead(workspace, AT) };
  });
  const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: predecessor.head }));
  let signed: Awaited<ReturnType<typeof signWithPurposeKey>>;
  try { signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(hash, "hex")); } catch (error) { fileRefusal(error); }
  return withCanaryOverridePublicationLock(workspace, () => {
    assertOverridePublicationCurrent(workspace, prepared.captured, prepared.signed);
    try { assertPurposePublicationCurrent(workspace, artifact, signed); } catch (error) { fileRefusal(error); }
    if (inventory(workspace) !== predecessor.inventory || workspaceRecordHead(workspace, AT) !== predecessor.head) throw new Error("canary override register changed while signing was prepared; retry");
    const publishedAt = Date.now();
    if (!Number.isFinite(own.expiresTs) || publishedAt >= own.expiresTs) throw new Error("canary override expired while signing was prepared");
    if (readContainedOrNull(workspace, rel, Number.MAX_SAFE_INTEGER) !== null) throw new Error("canary override destination changed while signing was prepared; retry");
    // Byte-for-byte legacy record construction, including the inner signature's existing field position.
    const record = { ...body, prev_record_hash: predecessor.head, record_hash: hash, signature: signed.signature.toString("base64"), storedTs: publishedAt };
    writeContained(workspace, rel, JSON.stringify(record, null, 2), 0o644);
    return own;
  });
}
