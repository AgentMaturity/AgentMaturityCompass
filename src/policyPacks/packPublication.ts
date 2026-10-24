/** Maintained policy-pack driver. Local compatibility config writers stay synchronous; actual async log suffixes run outside their lock. */
import { dirname, join, relative } from "node:path";
import YAML from "yaml";
import { getPolicyPack } from "./builtInPacks.js";
import { preflightPolicyPackCompatibility, publishPolicyPackCompatibility, writePolicyPackAudit, type PolicyPackApplyResult } from "./packApply.js";
import { ACTION_POLICY_WRITER_LOCK, actionPolicyPath, assertActionPolicyWriterReady } from "../governor/actionPolicyEngine.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { parseGatePolicy, prepareSignedGatePolicy } from "../ci/gate.js";
import { createSignedTargetProfile, loadTargetProfile, saveTargetProfile } from "../targets/targetProfile.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { canonicalSigningKey, verifyWithKey } from "../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningKey, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { vaultStatus } from "../vault/vault.js";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { buildDashboard } from "../dashboard/build.js";

interface Options { beforePublish?: () => void; recordEffect?: (effect: string) => void }
class PolicyPackPublicationError extends Error {
  readonly code = "POLICY_PACK_PARTIAL";
  constructor(readonly completed: readonly string[], readonly phase: string, readonly attemptedPath: string | null,
    readonly entryHash: string | null, readonly pendingRecorded: boolean | null, cause: unknown) {
    super("policy-pack application is incomplete; earlier effects remain committed", { cause }); this.name = "PolicyPackPublicationError";
  }
}
function originalConfigAuthority(workspace: string) {
  const captured = capturePurposePublication(workspace, "config-signature"), publicKeyPem = getSigningPublicKeyPem(workspace, "config-signature");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm;
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original policy-pack config signer is unsupported");
  return { publicKeyPem, assertCurrent() {
    assertVaultMaySign(workspace, "config-signature");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset || !policy.allowed.includes(algorithm) || policy.requireNonExportable)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original policy-pack config authority changed or is refused");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, "file");
    if (!vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
    if (publicKeyFromPrivate(getSigningKey(workspace, "config-signature")) !== publicKeyPem)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original policy-pack config key changed");
  } };
}
function knownSigningRefusal(error: unknown, seen = new Set<unknown>()): boolean {
  if (seen.has(error)) return false; seen.add(error);
  if (error instanceof KeyProviderError || error instanceof KeyRevokedError) return true;
  return error instanceof Error && (/^(notary |policy sign|original |🔐 Vault locked)/i.test(error.message)
    || (error.cause !== undefined && knownSigningRefusal(error.cause, seen)));
}

/** Options are actual trusted negative callbacks, never request-derived positive authority or signer choices. */
export async function applyPolicyPackAsync(input: { workspace: string; agentId?: string; packId: string }, options: Options = {}): Promise<PolicyPackApplyResult> {
  const params = { ...input }, beforePublish = options.beforePublish, recordEffect = options.recordEffect;
  const workspace = params.workspace, selected = getPolicyPack(params.packId);
  if (!selected) throw new Error(`unknown policy pack: ${params.packId}`);
  const pack = structuredClone(selected), agentId = resolveAgentId(workspace, params.agentId), layout = getAgentPaths(workspace, agentId);
  beforePublish?.(); preflightPolicyPackCompatibility(workspace);
  const config = originalConfigAuthority(workspace), raw = captureRunHashAuthority(workspace, false), log = captureWorkspaceLogAuthority(workspace);
  const gatePath = join(workspace, ".amc", "agents", agentId, "gatePolicy.json"), targetPath = join(layout.targetsDir, "default.target.json");
  const rows = [
    { name: "action-policy.yaml", value: pack.actionPolicy }, { name: "tools.yaml", value: pack.tools },
    { name: "budgets.yaml", value: pack.budgets }, { name: "alerts.yaml", value: pack.alerts },
    { name: "approval-policy.yaml", value: pack.approvalPolicy }
  ];
  const bodies = new Map(rows.map(row => [join(workspace, ".amc", row.name), Buffer.from(YAML.stringify(row.value))] as const));
  const gatePolicy = parseGatePolicy(structuredClone(pack.gatePolicy)); bodies.set(gatePath, Buffer.from(JSON.stringify(gatePolicy, null, 2)));
  let expected = captureOrgFiles([...bodies.keys()].flatMap(path => [path, `${path}.sig`]).concat(targetPath));
  const contextBefore = captureOrgFiles([layout.contextGraph]), context = loadContextGraph(workspace, agentId);
  assertOrgPairsCurrent(contextBefore);
  // Preserve the original primary/legacy fallback, including the existing parse-error-to-null mapping behavior.
  const legacyTarget = join(workspace, ".amc", "targets", "default.target.json");
  const usesLegacy = orgPairBytes(expected, targetPath) === null && legacyTarget !== targetPath;
  const previousBefore = usesLegacy ? captureOrgFiles([legacyTarget]) : null;
  const previous = (() => { try { return loadTargetProfile(workspace, "default", agentId); } catch { return null; } })();
  if (previousBefore !== null) assertOrgPairsCurrent(previousBefore); assertOrgPairsCurrent(expected);
  const mapping = { ...(previous?.mapping ?? {}), ...pack.targetAdjustments };
  const completed: string[] = []; let phase = "prepare", attemptedPath: string | null = null, entryHash: string | null = null, pendingRecorded: boolean | null = null;
  const record = (effect: string) => { completed.push(effect); recordEffect?.(effect); };
  const fixed = () => { config.assertCurrent(); raw(); log.assertCurrent(); };
  const assertCurrent = () => {
    beforePublish?.();
    if (canonicalize(getAgentPaths(workspace, agentId)) !== canonicalize(layout)) throw new Error("policy-pack selected agent paths changed while signing");
    assertOrgPairsCurrent(contextBefore); if (previousBefore !== null) assertOrgPairsCurrent(previousBefore);
    fixed(); assertOrgPairsCurrent(expected);
  };
  const observe = (path: string) => {
    record(relative(workspace, path));
    const captured = captureOrgFiles([path]), bytes = orgPairBytes(captured, path), body = bodies.get(path);
    if (bytes === null || captured.members[0]?.mode !== 0o644) throw new Error("policy-pack published member is missing or not mode0644");
    if (body !== undefined) { if (!bytes.equals(body)) throw new Error("policy-pack published body differs from its prepared bytes"); }
    else if (path.endsWith(".sig")) {
      const signedBody = bodies.get(path.slice(0, -4)), signature = JSON.parse(bytes.toString("utf8")) as { digestSha256?: unknown; signature?: unknown };
      if (signedBody === undefined || typeof signature.digestSha256 !== "string" || signature.digestSha256 !== sha256Hex(signedBody) || typeof signature.signature !== "string"
        || !verifyWithKey(Buffer.from(signature.digestSha256, "hex"), config.publicKeyPem, Buffer.from(signature.signature, "base64")))
        throw new Error("policy-pack returned sidecar is not signed by the original config authority");
    }
    expected = { members: expected.members.map(member => member.path === path ? captured.members[0]! : member) };
  };
  const append = async (type: "GATE_POLICY_SIGNED" | "POLICY_PACK_APPLIED", digest: string, id: string, current: () => void = () => {}) => {
    phase = type; attemptedPath = null; entryHash = null; pendingRecorded = null;
    const entry = await appendTransparencyEntryAsync({ workspace, type, agentId: type === "GATE_POLICY_SIGNED" ? "system" : agentId,
      artifact: { kind: "policy", sha256: digest, id } }, { beforeCommit() { assertCurrent(); current(); fixed(); assertOrgPairsCurrent(expected); } });
    entryHash = entry.hash; record(`log:${type}:${entry.hash}`); return entry.hash;
  };
  try {
    assertCurrent();
    const files = withControlFileLock({ root: dirname(actionPolicyPath(workspace)), name: ACTION_POLICY_WRITER_LOCK, timeoutMs: 500, operation: () => {
      assertActionPolicyWriterReady(workspace); assertCurrent();
      return publishPolicyPackCompatibility(workspace, pack, {
        beforeMember(path) { phase = "config-compatibility"; attemptedPath = relative(workspace, path); entryHash = null; pendingRecorded = null; assertCurrent(); },
        recorded: observe, approvalLogReturned() { record("held-log:APPROVAL_POLICY_SIGNED:returned"); }
      });
    } });
    phase = "gate-policy-sign"; attemptedPath = null; entryHash = null; pendingRecorded = null; assertCurrent();
    const gate = await prepareSignedGatePolicy({ workspace, policyPath: gatePath, policy: gatePolicy }, { beforePublish: assertCurrent });
    phase = "gate-policy-pair"; const savedGate = gate.publish(observe);
    files.push({ path: savedGate.policyPath, sha256: sha256Hex(Buffer.from(JSON.stringify(pack.gatePolicy, null, 2))) });
    await append("GATE_POLICY_SIGNED", gate.digestSha256, "gate-policy", gate.assertCurrent);
    // Preserve target construction after the actual gate log; its selected mapping/context were frozen before the first await.
    phase = "target-profile"; attemptedPath = relative(workspace, targetPath); entryHash = null; pendingRecorded = null; assertCurrent();
    const profile = createSignedTargetProfile({ workspace, name: "default", contextGraphHash: sha256Hex(Buffer.from(JSON.stringify(context))), mapping });
    bodies.set(targetPath, Buffer.from(JSON.stringify(profile, null, 2)));
    assertCurrent(); const savedTarget = saveTargetProfile(workspace, profile, agentId); observe(savedTarget);
    files.push({ path: savedTarget, sha256: sha256Hex(Buffer.from(JSON.stringify(profile))) });
    const transparencyHash = await append("POLICY_PACK_APPLIED", sha256Hex(Buffer.from(JSON.stringify(files))), pack.id, gate.assertCurrent);
    phase = "ledger-audit"; attemptedPath = null; entryHash = null; pendingRecorded = null; assertCurrent();
    const auditEventId = writePolicyPackAudit(workspace, agentId, { auditType: "POLICY_PACK_APPLIED", severity: "LOW", packId: pack.id, files }, assertCurrent, record);
    phase = "dashboard"; assertCurrent();
    try { const dashboard = buildDashboard({ workspace, agentId, outDir: `.amc/agents/${agentId}/dashboard` });
      for (const file of dashboard.generatedFiles) record(`dashboard:${file}`);
    } catch (cause) { if (knownSigningRefusal(cause)) throw cause; /* Preserve existing best-effort missing-run/display behavior. */ }
    phase = "return"; assertCurrent(); gate.assertCurrent(); fixed(); assertOrgPairsCurrent(expected);
    return { packId: pack.id, agentId, files, targetProfileId: profile.id, transparencyHash, auditEventId };
  } catch (cause) {
    if (completed.length === 0 && !(cause instanceof TransparencyMerkleLagError)) throw cause;
    throw new PolicyPackPublicationError(Object.freeze([...completed]), phase, attemptedPath,
      cause instanceof TransparencyMerkleLagError ? cause.entryHash : entryHash,
      cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : pendingRecorded, cause);
  }
}
