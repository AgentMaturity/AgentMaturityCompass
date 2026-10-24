/** Maintained provider-aware policy-pack driver; all Sign/await stages precede their publication locks. */
import { dirname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import type { TargetProfile } from "../types.js";
import { getPolicyPack } from "./builtInPacks.js";
import { writePolicyPackAudit, type PolicyPackApplyResult } from "./packApply.js";
import { ACTION_POLICY_WRITER_LOCK, actionPolicyPath, assertActionPolicyWriterReady } from "../governor/actionPolicyEngine.js";
import { prepareActionPolicyPair } from "../governor/actionPolicyStore.js";
import { prepareToolsConfigPair } from "../toolhub/toolhubValidators.js";
import { captureBudgetsPublication } from "../budgets/budgets.js";
import { captureApprovalPolicyPublication } from "../approvals/approvalPolicyEngine.js";
import { capturePublicConfigAuthority, captureRawConfigPairForAsync, withConfigSignaturePairLock } from "../config/configSignaturePair.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { getAgentPaths, getCurrentAgent, resolveAgentId } from "../fleet/paths.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { parseGatePolicy, prepareSignedGatePolicy } from "../ci/gate.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { prepareTargetProfileSignatureAsync, TargetProfilePublicationError } from "../targets/targetProfilePublication.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority, type TransparencyAppendAttempt } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
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
  // Preserve the actual normal local warm; a committed provider binding skips its private getter.
  capturePurposePublication(workspace, "config-signature");
  const assertCurrent = capturePublicConfigAuthority(workspace);
  const publicKeyPem = boundProviderKey(workspace, "config-signature")?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  assertCurrent(); return { publicKeyPem, assertCurrent };
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
  const root = resolve(workspace);
  const agentInput = () => params.agentId && params.agentId.trim().length > 0 ? ["explicit", params.agentId]
    : process.env.AMC_AGENT_ID && process.env.AMC_AGENT_ID.trim().length > 0 ? ["environment", process.env.AMC_AGENT_ID]
    : ["current", getCurrentAgent(workspace)];
  const originalAgentInput = canonicalize(agentInput());
  const pack = structuredClone(selected), agentId = resolveAgentId(workspace, params.agentId), layout = getAgentPaths(workspace, agentId);
  const selectionCurrent = () => {
    if (resolve(workspace) !== root || canonicalize(agentInput()) !== originalAgentInput || resolveAgentId(workspace, params.agentId) !== agentId)
      throw new Error("policy-pack original workspace or agent selection changed while signing");
    if (canonicalize(getAgentPaths(workspace, agentId)) !== canonicalize(layout)) throw new Error("policy-pack selected agent paths changed while signing");
  };
  beforePublish?.(); assertActionPolicyWriterReady(workspace); selectionCurrent();
  const config = originalConfigAuthority(workspace), log = captureWorkspaceLogAuthority(workspace);
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
  const fixed = () => { config.assertCurrent(); log.assertCurrent(); };
  // PP-D1: child callbacks never invoke completed handles, so this base is nonrecursive.
  const base = () => {
    beforePublish?.(); assertActionPolicyWriterReady(workspace);
    selectionCurrent(); fixed();
    assertOrgPairsCurrent(contextBefore); if (previousBefore !== null) assertOrgPairsCurrent(previousBefore);
    assertOrgPairsCurrent(expected);
  };
  const observe = (path: string) => {
    // Gate returns an absolute path. Retain the original snapshot's spelling and genuine physical destination.
    const selectedPath = expected.members.find(member => resolve(member.path) === resolve(path))?.path;
    if (selectedPath === undefined) throw new Error("policy-pack publisher returned an uncaptured destination");
    attemptedPath = relative(workspace, selectedPath);
    const captured = captureOrgFiles([selectedPath]), bytes = orgPairBytes(captured, selectedPath), body = bodies.get(selectedPath);
    if (bytes === null || captured.members[0]?.mode !== 0o644) throw new Error("policy-pack published member is missing or not mode0644");
    if (body !== undefined) { if (!bytes.equals(body)) throw new Error("policy-pack published body differs from its prepared bytes"); }
    else if (selectedPath.endsWith(".sig")) {
      const signedBody = bodies.get(selectedPath.slice(0, -4)), signature = JSON.parse(bytes.toString("utf8")) as { digestSha256?: unknown; signature?: unknown };
      if (signedBody === undefined || typeof signature.digestSha256 !== "string" || signature.digestSha256 !== sha256Hex(signedBody) || typeof signature.signature !== "string"
        || !verifyWithKey(Buffer.from(signature.digestSha256, "hex"), config.publicKeyPem, Buffer.from(signature.signature, "base64")))
        throw new Error("policy-pack returned sidecar is not signed by the original config authority");
    } else throw new Error("policy-pack publisher returned an unprepared body");
    expected = { members: expected.members.map(member => member.path === selectedPath ? captured.members[0]! : member) };
    record(relative(workspace, selectedPath)); base();
  };
  const body = (name: string) => bodies.get(join(workspace, ".amc", name))!;
  // The actual budget authority and all original destinations exist before the operation's first await.
  base(); const budgetsFactory = captureBudgetsPublication(workspace, base);
  const approvalFactory = captureApprovalPolicyPublication(workspace, body("approval-policy.yaml"), { previous: expected, beforePublish: base });
  try {
    base(); const action = await prepareActionPolicyPair(workspace, body("action-policy.yaml"), { beforePublish: base }); base();
    const tools = await prepareToolsConfigPair(workspace, body("tools.yaml"), { beforePublish: base }); base();
    const budgets = await budgetsFactory.prepareAsync(body("budgets.yaml"), base); base();
    const alerts = await captureRawConfigPairForAsync(workspace, join(workspace, ".amc", "alerts.yaml"), body("alerts.yaml"), { previous: expected, beforePublish: base }).prepare(); base();
    const approval = await approvalFactory.prepare(); base();
    let actionDone = false, toolsDone = false, budgetsDone = false, alertsDone = false, approvalDone = false;
    let gateCurrent: (() => void) | null = null, targetCurrent: (() => void) | null = null;
    let latestLog: TransparencyAppendAttempt | null = null;
    const current = () => {
      base();
      if (actionDone) action.assertCurrent(); if (toolsDone) tools.assertCurrent();
      if (budgetsDone) budgets.assertCurrent(); if (alertsDone) alerts.assertCurrent(); if (approvalDone) approval.assertCurrent();
      gateCurrent?.(); targetCurrent?.(); base();
    };
    action.assertCurrent(); tools.assertCurrent(); budgets.assertCurrent(); alerts.assertCurrent(); approval.assertCurrent(); base();
    const files: PolicyPackApplyResult["files"] = [];
    withControlFileLock({ root: dirname(actionPolicyPath(workspace)), name: ACTION_POLICY_WRITER_LOCK, timeoutMs: 500, operation: () => {
      phase = "config-pairs"; current();
      const row = (name: string, publish: () => void) => {
        phase = `config-pair:${name}`; attemptedPath = relative(workspace, join(workspace, ".amc", name)); entryHash = null; pendingRecorded = null;
        current(); publish(); current(); files.push({ path: join(workspace, ".amc", name), sha256: sha256Hex(body(name)) });
      };
      row("action-policy.yaml", () => { action.publishWithLockHeld(observe); actionDone = true; });
      row("tools.yaml", () => { tools.publish(observe); toolsDone = true; });
      row("budgets.yaml", () => { budgets.publish({ beforeMember: base, recorded: observe }); budgetsDone = true; });
      row("alerts.yaml", () => { alerts.publish(observe); alertsDone = true; });
      row("approval-policy.yaml", () => { approval.publish(observe); approvalDone = true; });
    } });
    phase = "APPROVAL_POLICY_SIGNED"; attemptedPath = null; current();
    latestLog = await approval.appendSigned(); entryHash = latestLog.entry.hash;
    record("held-log:APPROVAL_POLICY_SIGNED:returned"); current(); latestLog.assertCurrent();
    phase = "gate-policy-sign"; attemptedPath = null; entryHash = null; pendingRecorded = null; current();
    const gate = await prepareSignedGatePolicy({ workspace, policyPath: resolve(gatePath), policy: gatePolicy }, { beforePublish: base });
    gateCurrent = gate.assertCurrent; current(); latestLog.assertCurrent();
    phase = "gate-policy-pair"; const savedGate = gate.publish(observe);
    files.push({ path: savedGate.policyPath, sha256: sha256Hex(Buffer.from(JSON.stringify(pack.gatePolicy, null, 2))) });
    const append = async (type: "GATE_POLICY_SIGNED" | "POLICY_PACK_APPLIED", digest: string, id: string) => {
      phase = type; attemptedPath = null; entryHash = null; pendingRecorded = null;
      const predecessor = latestLog;
      const actual = await appendTransparencyEntryAttemptAsync({ workspace, type, agentId: type === "GATE_POLICY_SIGNED" ? "system" : agentId,
        artifact: { kind: "policy", sha256: digest, id } },
      { beforeCommit() { current(); predecessor?.assertCurrent(); base(); }, beforeMember: current });
      // Retire predecessor CAS only after the genuine returned attempt; stable member gates never replay it.
      latestLog = actual; entryHash = actual.entry.hash; record(`log:${type}:${actual.entry.hash}`);
      current(); actual.assertCurrent(); return actual.entry.hash;
    };
    await append("GATE_POLICY_SIGNED", gate.digestSha256, "gate-policy");
    // The real primitive creates UUID/time/signature only here, after the actual gate log returned.
    phase = "target-profile-sign"; attemptedPath = relative(workspace, targetPath); entryHash = null; pendingRecorded = null; current();
    const target = await prepareTargetProfileSignatureAsync({ workspace, name: "default", contextGraphHash: sha256Hex(Buffer.from(JSON.stringify(context))), mapping },
      () => { current(); latestLog!.assertCurrent(); });
    const targetBytes = target.bytes, profile = JSON.parse(targetBytes.toString("utf8")) as TargetProfile;
    bodies.set(targetPath, targetBytes); current(); target.assertCurrent(); latestLog.assertCurrent();
    const effects = { compatibilityPreSignPassed: false, compatibilityReturned: false, lockAttempted: false, lockEntered: false, lockReturned: false,
      directoryAttempted: false, directoryReturned: false, writeAttempted: false, writeReturned: false, acknowledged: false };
    try {
      phase = "target-profile-lock"; effects.lockAttempted = true;
      withConfigSignaturePairLock(workspace, () => {
        effects.lockEntered = true; current(); target.assertCurrent();
        phase = "target-profile-directory"; effects.directoryAttempted = true; ensureDir(layout.targetsDir); effects.directoryReturned = true;
        current(); target.assertCurrent(); phase = "target-profile-write"; effects.writeAttempted = true;
        writeFileAtomic(targetPath, targetBytes, 0o644); effects.writeReturned = true;
        phase = "target-profile-readback";
        const own = captureOrgFiles([targetPath]), actual = orgPairBytes(own, targetPath);
        if (own.members[0]?.mode !== 0o644 || actual === null || !actual.equals(targetBytes))
          throw new Error("published target differs from its actual prepared bytes or mode");
        expected = { members: expected.members.map(member => member.path === targetPath ? own.members[0]! : member) };
        effects.acknowledged = true; targetCurrent = target.assertCurrent;
        record(relative(workspace, targetPath)); current();
      });
      effects.lockReturned = true;
    } catch (cause) { throw new TargetProfilePublicationError(phase, targetPath, sha256Hex(targetBytes), Object.freeze({ ...effects }), cause); }
    files.push({ path: targetPath, sha256: sha256Hex(Buffer.from(JSON.stringify(profile))) });
    const transparencyHash = await append("POLICY_PACK_APPLIED", sha256Hex(Buffer.from(JSON.stringify(files))), pack.id);
    phase = "ledger-audit"; attemptedPath = null; entryHash = null; pendingRecorded = null; current(); latestLog!.assertCurrent();
    const auditCurrent = () => { current(); latestLog!.assertCurrent(); base(); };
    const auditEventId = writePolicyPackAudit(workspace, agentId, { auditType: "POLICY_PACK_APPLIED", severity: "LOW", packId: pack.id, files }, auditCurrent, record);
    phase = "dashboard"; auditCurrent();
    try { const dashboard = buildDashboard({ workspace, agentId, outDir: `.amc/agents/${agentId}/dashboard` });
      for (const file of dashboard.generatedFiles) record(`dashboard:${file}`);
    } catch (cause) { if (knownSigningRefusal(cause)) throw cause; /* Preserve existing best-effort missing-run/display behavior. */ }
    phase = "return"; auditCurrent();
    return { packId: pack.id, agentId, files, targetProfileId: profile.id, transparencyHash, auditEventId };
  } catch (cause) {
    // An empty observed-effect list does not erase a genuine child's native-return/partial error.
    if (completed.length === 0 && !(cause instanceof TransparencyMerkleLagError)) throw cause;
    throw new PolicyPackPublicationError(Object.freeze([...completed]), phase, attemptedPath,
      cause instanceof TransparencyMerkleLagError ? cause.entryHash : entryHash,
      cause instanceof TransparencyMerkleLagError ? cause.pendingRecorded : pendingRecorded, cause);
  }
}
