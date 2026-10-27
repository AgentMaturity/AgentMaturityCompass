import { resolve } from "node:path";
import { ensureSigningKeys } from "../crypto/keys.js";
import { assertOwnerMode } from "../mode/mode.js";
import { captureSignedControlJournalAppend, ControlMutationAuthorityError, retryOnControlJournalConflict } from "../lifecycle/signedControlJournalAsync.js";
import { captureControlMirror, captureControlMirrorPair } from "../lifecycle/controlJournalMirror.js";
import { artifactSigPath, readAndVerifyArtifactFileSignature } from "../lifecycle/artifactSignature.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  defaultRuntimeFirewallPolicy, inspectRuntimeFirewallPolicy, migrationReceiptFromMetadata,
  readRuntimeFirewallPolicyJournal, runtimeFirewallPolicyJournalDir, runtimeFirewallPolicyPath,
  validateRuntimeFirewallPolicy, withRuntimeFirewallPolicyLock,
  type RuntimeFirewallPolicy, type RuntimeFirewallMode, type RuntimeFirewallMigrationReceipt
} from "./firewall.js";
import type { SignedControlJournalSnapshot } from "../lifecycle/signedControlJournal.js";

type WriteInput = { workspace: string; mode?: RuntimeFirewallMode; enabled?: boolean; failClosedOnMissingPolicy?: boolean };
type MigrateInput = { workspace: string; approveLegacyArtifactKind: boolean; beforeLegacyCommit?: () => void;
  afterPendingCommit?: () => void; beforeCheckpointCommit?: () => void;
  afterTrustPinCommit?: () => void; afterCheckpointCommit?: () => void };
type Command = "firewall enable" | "firewall disable" | "firewall migrate-signature";
const actorCurrent = (check?: () => boolean) => { if (check?.() === false) throw new ControlMutationAuthorityError(); };
function refresh(workspace: string, command: Command, policy: RuntimeFirewallPolicy,
  committed: SignedControlJournalSnapshot<RuntimeFirewallPolicy>, mirror: ReturnType<typeof captureControlMirror> | undefined,
  mirrorFailure: unknown, currentActor?: () => boolean) {
  const path = runtimeFirewallPolicyPath(workspace);
  try {
    if (!mirror) throw mirrorFailure;
    actorCurrent(currentActor); assertOwnerMode(workspace, command);
    const prepared = mirror.prepare(); // Retained synchronous BUNDLE preparation; never under the policy lock.
    withRuntimeFirewallPolicyLock(workspace, () => {
      actorCurrent(currentActor); assertOwnerMode(workspace, command);
      prepared.publish(() => {
        const latest = readRuntimeFirewallPolicyJournal(workspace);
        if (latest.revision !== committed.revision || latest.entrySha256 !== committed.entrySha256
          || latest.checkpointSha256 !== committed.checkpointSha256) throw new Error("Runtime Firewall mirror canonical head changed.");
      });
    });
    return { policy, path, signaturePath: artifactSigPath(path), revision: committed.revision,
      checkpointPath: committed.checkpointPath!, mirrorTrusted: true, mirrorWarning: null as string | null };
  } catch (error) {
    const warning = "Runtime Firewall policy committed, but compatibility mirror refresh failed: "
      + (error instanceof Error ? error.message : String(error));
    process.emitWarning(warning);
    return { policy, path, signaturePath: artifactSigPath(path), revision: committed.revision,
      checkpointPath: committed.checkpointPath!, mirrorTrusted: false, mirrorWarning: warning };
  }
}
function mirrorFor(workspace: string, policy: RuntimeFirewallPolicy, beforeSign: () => void) {
  try { return { mirror: captureControlMirror(workspace, runtimeFirewallPolicyPath(workspace), "runtime-firewall-policy",
    Buffer.from(JSON.stringify(policy, null, 2) + "\n"), beforeSign), failure: undefined as unknown }; }
  catch (failure) { return { mirror: undefined, failure }; }
}
function write(input: WriteInput, currentActor?: () => boolean) {
  return retryOnControlJournalConflict(() => writeOnce(input, currentActor));
}
async function writeOnce(input: WriteInput, currentActor?: () => boolean) {
  const fixed = { ...input, workspace: resolve(input.workspace) }, command = fixed.enabled === false ? "firewall disable" : "firewall enable";
  const assertCurrent = () => { actorCurrent(currentActor); assertOwnerMode(fixed.workspace, command); };
  assertCurrent(); ensureSigningKeys(fixed.workspace);
  const captured = withRuntimeFirewallPolicyLock(fixed.workspace, () => {
    assertCurrent();
    const previous = readRuntimeFirewallPolicyJournal(fixed.workspace, true), path = runtimeFirewallPolicyPath(fixed.workspace);
    if (previous.integrity === "uninitialized" && (pathExists(path) || pathExists(artifactSigPath(path)))) {
      const inspected = inspectRuntimeFirewallPolicy(fixed.workspace);
      if (inspected.integrity === "invalid") throw new Error(inspected.reason
        + " Run 'amc firewall migrate-signature --approve-legacy-kind' for a verified legacy policy.");
    }
    const policy = validateRuntimeFirewallPolicy({ ...defaultRuntimeFirewallPolicy(fixed.mode ?? "warn"), enabled: fixed.enabled ?? true,
      failClosedOnMissingPolicy: fixed.failClosedOnMissingPolicy ?? true, updatedAt: new Date().toISOString() });
    return { policy, plan: captureSignedControlJournalAppend({ workspace: fixed.workspace, controlKind: "runtime-firewall-policy",
      journalDir: runtimeFirewallPolicyJournalDir(fixed.workspace), previous, payload: policy, parsePayload: validateRuntimeFirewallPolicy }) };
  });
  const mirror = mirrorFor(fixed.workspace, captured.policy, assertCurrent), prepared = await captured.plan.prepare(assertCurrent);
  const committed = withRuntimeFirewallPolicyLock(fixed.workspace, () => {
    assertCurrent(); return prepared.publish();
  });
  return refresh(fixed.workspace, command, captured.policy, committed, mirror.mirror, mirror.failure, currentActor);
}
async function migrate(input: MigrateInput, currentActor?: () => boolean) {
  const fixed = { ...input, workspace: resolve(input.workspace) }, command = "firewall migrate-signature" as const;
  const assertCurrent = () => { actorCurrent(currentActor); assertOwnerMode(fixed.workspace, command); };
  assertCurrent(); ensureSigningKeys(fixed.workspace);
  const captured = withRuntimeFirewallPolicyLock(fixed.workspace, () => {
    assertCurrent();
    const previous = readRuntimeFirewallPolicyJournal(fixed.workspace, true);
    if (previous.integrity === "trusted") {
      const policy = previous.payload!, receipt = migrationReceiptFromMetadata(previous.metadata);
      return { previous, policy, receipt, migratedFrom: receipt?.sourceSignatureSchemaVersion ?? "already-journaled",
        plan: null, assertPair: undefined as (() => void) | undefined };
    }
    const path = runtimeFirewallPolicyPath(fixed.workspace), assertPair = captureControlMirrorPair(path);
    const verification = readAndVerifyArtifactFileSignature({ workspace: fixed.workspace, path, artifactKind: "runtime-firewall-policy" });
    assertPair();
    if (!verification.valid) throw new Error("Legacy Runtime Firewall policy verification failed: " + (verification.reason ?? "unknown") + ".");
    const schemaVersion = verification.signature?.schemaVersion ?? "unknown";
    if (schemaVersion === "2026-05-22" && !fixed.approveLegacyArtifactKind) throw new Error(
      "Legacy artifact kind was not cryptographically bound. Re-run with --approve-legacy-kind after reviewing the exact policy bytes.");
    const policy = validateRuntimeFirewallPolicy(JSON.parse(verification.artifactBytes!.toString("utf8")) as unknown);
    const receipt: RuntimeFirewallMigrationReceipt = { schemaVersion: "2026-07-10", preservation: "semantic",
      sourceSignatureSchemaVersion: schemaVersion, sourceArtifactSha256: verification.artifactSha256!,
      sourceSignatureRecordSha256: sha256Hex(canonicalize(verification.signature)), committedPolicySha256: sha256Hex(canonicalize(policy)) };
    const plan = captureSignedControlJournalAppend({ ...fixed, controlKind: "runtime-firewall-policy",
      journalDir: runtimeFirewallPolicyJournalDir(fixed.workspace), previous, payload: policy, parsePayload: validateRuntimeFirewallPolicy,
      metadata: { type: "legacy-runtime-firewall-migration", receipt } });
    fixed.beforeLegacyCommit?.();
    return { previous, policy, receipt, migratedFrom: schemaVersion, plan, assertPair };
  });
  const mirror = mirrorFor(fixed.workspace, captured.policy, assertCurrent);
  const prepared = captured.plan === null ? null : await captured.plan.prepare(assertCurrent);
  const committed = withRuntimeFirewallPolicyLock(fixed.workspace, () => {
    assertCurrent(); captured.assertPair?.();
    if (prepared !== null) return prepared.publish();
    const latest = readRuntimeFirewallPolicyJournal(fixed.workspace);
    if (latest.revision !== captured.previous.revision || latest.entrySha256 !== captured.previous.entrySha256
      || latest.checkpointSha256 !== captured.previous.checkpointSha256) throw new Error("Runtime Firewall policy predecessor changed.");
    return latest;
  });
  return { ...refresh(fixed.workspace, command, captured.policy, committed, mirror.mirror, mirror.failure, currentActor),
    migratedFrom: captured.migratedFrom, migrationReceipt: captured.receipt };
}
export const writeRuntimeFirewallPolicyAsync = (input: WriteInput) => write(input);
export const migrateRuntimeFirewallPolicySignatureAsync = (input: MigrateInput) => migrate(input);
/** Fixed internal handler entrypoints; no new root SDK auth callback. */
export const writeRuntimeFirewallPolicyForHandler = (input: WriteInput, currentActor: () => boolean) => write(input, currentActor);
export const migrateRuntimeFirewallPolicyForHandler = (input: MigrateInput, currentActor: () => boolean) => migrate(input, currentActor);
