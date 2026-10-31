import { randomUUID } from "node:crypto";
import { closeSync, fstatSync, linkSync, lstatSync, openSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { signDigestWithPurpose } from "../crypto/signing/signerPurpose.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { inCheckPass } from "../utils/checkPass.js";
import { isWithin, physicalPathWithMissingSuffix, safeIdSchema } from "../utils/pathSafety.js";
import { vaultStatus } from "../vault/vault.js";
import { approvalConsumptionPaths, approvalConsumedSchema, approvalDecisionSchema, approvalRequestSchema,
  listApprovalDecisions, loadApprovalConsumed, type ApprovalConsumedRecord } from "./approvalChainStore.js";

interface Selection { workspace: string; approvalId: string; expectedAgentId: string; executionId?: string | null }
export interface ApprovalConsumptionOptions { beforePublish?: () => void; assertOutputsSafe?: (paths: readonly string[]) => void }
interface NativeStage {
  temp: string | null; acquiredIdentity: string | null;
  openAttempted: boolean; openReturned: boolean; openAcknowledged: boolean;
  writeAttempted: boolean; writeReturned: boolean; writeAcknowledged: boolean;
  closeAttempted: boolean; closeReturned: boolean;
  linkAttempted: boolean; linkReturned: boolean; linkAcknowledged: boolean; linkExisting: boolean;
  cleanupConsidered: boolean; cleanupAttempted: boolean; cleanupReturned: boolean; cleanupAcknowledged: boolean;
  cleanupDisposition: string; primaryCause: unknown; closeCause: unknown; cleanupCause: unknown;
}
export interface ApprovalConsumptionProgress {
  phase: string; signaturePreparationsAttempted: number; signaturePreparationsReturned: number; signaturePreparationsAcknowledged: number;
  lockAttempted: boolean; lockReturned: boolean; native: Readonly<NativeStage>;
  attemptedMember: string | null; returnedMembers: readonly string[]; acknowledgedMembers: readonly string[];
  replayObserved: boolean; replayRecord: Readonly<ApprovalConsumedRecord> | null; committed: boolean;
}
class ApprovalConsumptionPublicationError extends Error {
  readonly code = "APPROVAL_CONSUMPTION_INCOMPLETE";
  constructor(readonly progress: Readonly<ApprovalConsumptionProgress>, cause: unknown) {
    super("approval consumption did not complete; retain actual member and native uncertainty", { cause });
    this.name = "ApprovalConsumptionPublicationError";
  }
}
const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
const identity = (stat: { dev: number; ino: number }) => `${stat.dev}:${stat.ino}`;

/** Fixed direct-purpose public negative before any caller or private warm. Authenticated reads may advance high-water state. */
function capturePublicArtifactAuthority(workspace: string) {
  enabled();
  const mark = keysetCommittedMark(workspace), selected = assertKeysetComplete(workspace), keyset = canonicalize(selected);
  if (mark === null || selected === null || mark.sequence !== selected.generation || mark.sha256 !== sha256Hex(keyset))
    throw new Error("approval consumption needs an existing complete committed key set");
  const markShape = canonicalize({ sequence: mark.sequence, sha256: mark.sha256 }), bound = boundProviderKey(workspace, "artifact-seal"), binding = canonicalize(bound);
  const holder = bound?.binding.provider ?? "file", originalPublicBytes = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
  const key = canonicalSigningKey(originalPublicBytes), selectedPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  if (key === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original approval signer is unsupported");
  const publicKeyPem = key.pem, algorithm = key.algorithm;
  let observedUnlocked = false, refused = false, refusal: unknown;
  const assertCurrent = inCheckPass(() => {
    if (refused) throw refusal;
    try {
      enabled();
      const currentMark = keysetCommittedMark(workspace);
      if (canonicalize(currentMark === null ? null : { sequence: currentMark.sequence, sha256: currentMark.sha256 }) !== markShape || canonicalize(assertKeysetComplete(workspace)) !== keyset
        || canonicalize(boundProviderKey(workspace, "artifact-seal")) !== binding
        || canonicalize(keyPolicy(loadKeysConfig(workspace))) !== selectedPolicy)
        throw new Error("original approval public signing authority changed");
      const settings = loadKeysConfig(workspace), policy = keyPolicy(settings);
      if (!policy.allowed.includes(algorithm) || (holder === "file" && policy.requireNonExportable))
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original approval signing policy refuses the key");
      assertSigningKeyUsable(workspace, "artifact-seal", publicKeyPem, holder);
      if (holder === "file") {
        const ref = configuredRef(settings, "artifact-seal");
        if (ref !== null) throw new KeyProviderError("KEY_PROVIDER_HELD", ref.provider, "the original approval purpose is configured to an unbound provider");
        assertVaultMaySign(workspace, "artifact-seal");
        if (getSigningPublicKeyPem(workspace, "artifact-seal") !== originalPublicBytes) throw new Error("original approval public key changed");
        const unlocked = vaultStatus(workspace).unlocked;
        if (observedUnlocked && !unlocked) throw new Error("original approval vault was locked; this attempt cannot reopen it");
        observedUnlocked ||= unlocked;
      }
      enabled();
    } catch (cause) { refused = true; refusal = cause; throw cause; }
  });
  assertCurrent();
  const assertPrivateReady = inCheckPass(() => {
    try {
      assertCurrent();
      if (holder === "file" && !vaultStatus(workspace).unlocked) throw new Error("approval consumption vault is locked; unlock before starting a new attempt");
      assertCurrent();
    } catch (cause) { refused = true; refusal = cause; throw cause; }
  });
  return { holder, publicKeyPem, algorithm, assertCurrent, assertPrivateReady };
}
function directory(path: string) {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) throw new Error("approval consumption needs existing regular directories");
  return { path, physical: physicalPathWithMissingSuffix(path), identity: identity(stat), mode: stat.mode & 0o777 };
}
function inventory(path: string) {
  return readdirSync(path).filter(name => name.endsWith(".json") || name.endsWith(".json.sig")).sort();
}
function sameNames(a: readonly string[], b: readonly string[]) { return canonicalize(a) === canonicalize(b); }
function emptyNative(): NativeStage {
  return { temp: null, acquiredIdentity: null, openAttempted: false, openReturned: false, openAcknowledged: false,
    writeAttempted: false, writeReturned: false, writeAcknowledged: false, closeAttempted: false, closeReturned: false,
    linkAttempted: false, linkReturned: false, linkAcknowledged: false, linkExisting: false,
    cleanupConsidered: false, cleanupAttempted: false, cleanupReturned: false, cleanupAcknowledged: false,
    cleanupDisposition: "not-entered", primaryCause: null, closeCause: null, cleanupCause: null };
}

/** Genuine two-stage entry. No external authority DTO, signer override, phase selector or acknowledgment is accepted. */
export function captureApprovalConsumptionEntry(inputWorkspace: string) {
  const workspace = resolve(inputWorkspace), publicAuthority = capturePublicArtifactAuthority(workspace);
  let selected = false;
  return Object.freeze({ workspace, assertPublicCurrent: publicAuthority.assertCurrent,
    selectGrant(input: Selection, verifyOriginalExecution: () => void, options: ApprovalConsumptionOptions = {}) {
      if (selected) throw new Error("approval consumption entry already selected its grant");
      selected = true;
      try {
        const selection = structuredClone(input), caller = { ...options };
        if (resolve(selection.workspace) !== workspace) throw new Error("approval consumption workspace differs from its original entry");
        publicAuthority.assertPrivateReady();
        const approvalId = safeIdSchema.parse(selection.approvalId), paths = approvalConsumptionPaths({ workspace,
          agentId: selection.expectedAgentId, approvalRequestId: approvalId });
        const originalUmask = process.umask(), consumedMode = 0o644 & ~originalUmask;
        const parents = [...new Set([dirname(paths.root), paths.root, paths.requests, paths.decisions, paths.consumed])].map(directory);
        const decisionNames = inventory(paths.decisions), decisionFiles = decisionNames.map(name => join(paths.decisions, name));
        const decisionBefore = captureOrgFiles(decisionFiles);
        const policies = captureOrgPairs(["approval-policy.yaml", "action-policy.yaml", "tools.yaml", "budgets.yaml"].map(name => join(workspace, ".amc", name)));
        const before = captureOrgPairs([paths.request, paths.consumption]);
        const requestBytes = orgPairBytes(before, paths.request);
        if (requestBytes === null || orgPairBytes(before, `${paths.request}.sig`) === null
          || orgPairBytes(before, paths.consumption) !== null || orgPairBytes(before, `${paths.consumption}.sig`) !== null)
          throw new Error("approval consumption needs a signed original request and absent consumed pair");
        const request = approvalRequestSchema.parse(JSON.parse(requestBytes.toString("utf8")) as unknown);
        if (request.approvalRequestId !== approvalId || request.agentId !== paths.agentId) throw new Error("approval consumption request binding differs");
        const rows = decisionNames.filter(name => name.endsWith(".json")).map(name => {
          const bytes = orgPairBytes(decisionBefore, join(paths.decisions, name));
          if (bytes === null) throw new Error("original approval decision disappeared");
          return approvalDecisionSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
        }).filter(row => row.approvalRequestId === approvalId);
        const rowShape = (values: typeof rows) => canonicalize([...values].sort((a, b) => a.approvalDecisionId.localeCompare(b.approvalDecisionId)));
        let expected: OrgPairsSnapshot = before, entered = false, committed = false, failed = false, failure: unknown;
        let phase = "captured", signaturePreparationsAttempted = 0, signaturePreparationsReturned = 0, signaturePreparationsAcknowledged = 0;
        let lockAttempted = false, lockReturned = false, attemptedMember: string | null = null, replayObserved = false;
        let replayRecord: ApprovalConsumedRecord | null = null;
        const native = emptyNative(), returnedMembers: string[] = [], acknowledgedMembers: string[] = [];
        const prepared: { path: string; bytes: Buffer; signatureBytes: Buffer }[] = [];
        const protectedPaths = Object.freeze([...before.members, ...decisionBefore.members, ...policies.members].map(row => row.path));
        const progress = (): Readonly<ApprovalConsumptionProgress> => Object.freeze({ phase, signaturePreparationsAttempted,
          signaturePreparationsReturned, signaturePreparationsAcknowledged, lockAttempted, lockReturned,
          native: Object.freeze({ ...native }), attemptedMember, returnedMembers: Object.freeze([...returnedMembers]),
          acknowledgedMembers: Object.freeze([...acknowledgedMembers]), replayObserved,
          replayRecord: replayRecord === null ? null : Object.freeze({ ...replayRecord }), committed });
        const assertInputs = inCheckPass(() => {
          publicAuthority.assertPrivateReady();
          if (process.umask() !== originalUmask) throw new Error("original approval creation umask changed");
          for (const parent of parents) if (canonicalize(directory(parent.path)) !== canonicalize(parent)) throw new Error("original approval parent changed");
          if (canonicalize(approvalConsumptionPaths({ workspace, agentId: selection.expectedAgentId, approvalRequestId: approvalId })) !== canonicalize(paths))
            throw new Error("original approval agent location changed");
          if (!sameNames(inventory(paths.decisions), decisionNames)) throw new Error("original approval decision inventory changed");
          assertOrgPairsCurrent(decisionBefore); assertOrgPairsCurrent(policies);
        });
        const assertCurrent = inCheckPass(() => {
          if (failed) throw failure;
          assertInputs(); assertOrgPairsCurrent(expected);
          if (!native.linkAcknowledged) {
            verifyOriginalExecution(); assertInputs(); assertOrgPairsCurrent(expected);
            if (rowShape(listApprovalDecisions({ workspace, agentId: paths.agentId, approvalRequestId: approvalId })) !== rowShape(rows))
              throw new Error("original approval decision admission differs from captured bytes");
            assertInputs(); assertOrgPairsCurrent(expected);
          }
          for (const item of prepared) if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", item.bytes, item.signatureBytes).valid)
            throw new Error("prepared approval signature is no longer admitted");
          publicAuthority.assertPrivateReady();
        });
        const assertOutputsSafe = inCheckPass((outputs: readonly string[]) => {
          assertCurrent();
          for (const output of outputs) {
            const physical = physicalPathWithMissingSuffix(output);
            if (parents.some(parent => isWithin(physical, parent.physical))) throw new Error("audit output would replace an original approval parent");
            const candidate = captureOrgFiles([output]).members[0]!;
            for (const old of [...before.members, ...decisionBefore.members, ...policies.members])
              if (physical === physicalPathWithMissingSuffix(old.path) || (candidate.identity !== null && candidate.identity === old.identity))
                throw new Error("audit output aliases an original approval input");
          }
          assertCurrent();
        });
        const stable = inCheckPass(() => { enabled(); publicAuthority.assertCurrent(); caller.beforePublish?.(); enabled(); assertCurrent();
          caller.assertOutputsSafe?.(before.members.map(row => row.path)); enabled(); assertCurrent(); });
        const acknowledge = (path: string, bytes: Buffer, mode: number, acquired?: string) => {
          const own = captureOrgFiles([path]).members[0]!;
          if (own.bytes === null || !own.bytes.equals(bytes) || own.mode !== mode || (acquired !== undefined && own.identity !== acquired))
            throw new Error("approval member differs from the exact returned write");
          const index = expected.members.findIndex(row => row.path === path);
          if (index < 0) throw new Error("approval member was not originally captured");
          expected = { members: expected.members.map((row, at) => at === index ? own : row) };
          acknowledgedMembers.push(relative(workspace, path));
        };
        const stageAndLink = (bytes: Buffer): boolean => {
          const temp = `${paths.consumption}.${randomUUID()}.tmp`;
          native.temp = relative(workspace, temp);
          let fd: number | null = null, acquired: string | null = null, primary = false, cause: unknown;
          const fail = (error: unknown) => { if (!primary) { primary = true; cause = error; native.primaryCause = error; } };
          const stageCurrent = () => {
            if (acquired === null) throw new Error("approval stage acquired identity is unavailable");
            const row = captureOrgFiles([temp]).members[0]!;
            if (row.identity !== acquired || row.mode !== consumedMode || row.bytes === null || !row.bytes.equals(bytes))
              throw new Error("approval temporary name differs from its acquired inode or intended bytes");
          };
          try {
            try {
              native.openAttempted = true;
              fd = openSync(temp, "wx", 0o644);
              native.openReturned = true;
              const opened = fstatSync(fd);
              acquired = identity(opened); native.acquiredIdentity = acquired;
              if (!opened.isFile() || opened.size !== 0 || (opened.mode & 0o777) !== consumedMode) throw new Error("approval stage fd is not the intended new regular file");
              const initial = captureOrgFiles([temp]).members[0]!;
              if (initial.identity !== acquired || initial.mode !== consumedMode || initial.bytes?.length !== 0) throw new Error("approval stage name differs from opened fd");
              native.openAcknowledged = true;
              native.writeAttempted = true;
              writeFileSync(fd, bytes);
              native.writeReturned = true;
              const written = fstatSync(fd);
              if (!written.isFile() || identity(written) !== acquired || written.size !== bytes.length || (written.mode & 0o777) !== consumedMode)
                throw new Error("approval opened fd differs after its write");
              stageCurrent(); native.writeAcknowledged = true;
            } catch (error) { fail(error); }
            finally {
              if (fd !== null) {
                native.closeAttempted = true;
                try {
                  closeSync(fd);
                  native.closeReturned = true;
                }
                catch (error) { native.closeCause = error; fail(error); }
              }
            }
            if (!primary) {
              try {
                stable(); stageCurrent(); assertCurrent(); stageCurrent();
                native.linkAttempted = true;
                try {
                  linkSync(temp, paths.consumption);
                  native.linkReturned = true;
                }
                catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") native.linkExisting = true; else throw error; }
                if (native.linkReturned) {
                  returnedMembers.push(relative(workspace, paths.consumption));
                  acknowledge(paths.consumption, bytes, consumedMode, acquired!); native.linkAcknowledged = true;
                }
              } catch (error) { fail(error); }
            }
          } finally {
            native.cleanupConsidered = true;
            if (!native.openReturned || acquired === null) native.cleanupDisposition = "unowned-stage-retained";
            else if (!native.openAcknowledged || !native.writeAcknowledged) native.cleanupDisposition = "unacknowledged-stage-retained";
            else {
              try {
                stageCurrent();
                native.cleanupAttempted = true;
                unlinkSync(temp);
                native.cleanupReturned = true;
                // oxlint-disable-next-line no-unsafe-finally -- The local cleanup catch handles this throw; it does not leave the finally.
                if (orgPairBytes(captureOrgFiles([temp]), temp) !== null) throw new Error("approval temporary name is not absent after unlink returned");
                native.cleanupAcknowledged = true; native.cleanupDisposition = "returned-and-absent";
              } catch (error) { native.cleanupCause = error; native.cleanupDisposition = native.cleanupAttempted ? "cleanup-uncertain" : "stage-observation-refused-retained"; fail(error); }
            }
          }
          if (primary) throw cause;
          return native.linkAcknowledged;
        };
        stable();
        return Object.freeze({ request: structuredClone(request), decisions: structuredClone(rows), protectedPaths, progress, assertCurrent, assertOutputsSafe,
          assertCommittedCurrent() { if (!committed) throw new Error("this approval attempt has no acknowledged committed consumption"); assertCurrent(); },
          async consume() {
            if (entered) throw new Error("approval consumption attempt already entered");
            entered = true;
            try {
              phase = "prepare-consumed"; stable();
              const consumed = approvalConsumedSchema.parse({ v: 1, approvalRequestId: approvalId, agentId: paths.agentId,
                consumedTs: Date.now(), executionId: selection.executionId ?? null, reason: "approved execution completed" });
              const writes = [{ path: paths.consumption, bytes: Buffer.from(JSON.stringify(consumed, null, 2)) },
                { path: paths.request, bytes: Buffer.from(JSON.stringify(approvalRequestSchema.parse({ ...request, status: "CONSUMED" }), null, 2)) }];
              for (const item of writes) {
                stable(); signaturePreparationsAttempted += 1;
                const signed = await signDigestWithPurpose({ workspace, kind: "BUNDLE", digestHex: sha256Hex(item.bytes), beforeSign: stable });
                signaturePreparationsReturned += 1;
                stable();
                const envelope = signed.envelope;
                if (envelope === undefined || envelope.signer.type !== "VAULT" || envelope.alg !== publicAuthority.algorithm
                  || Buffer.from(envelope.pubkeyB64, "base64").toString("utf8") !== publicAuthority.publicKeyPem || signed.signature !== envelope.sigB64)
                  throw new Error("real approval signature differs from original direct-purpose signer");
                const signatureBytes = Buffer.from(JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
                  signedTs: signed.signedTs, signer: "auditor", envelope }, null, 2));
                if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", item.bytes, signatureBytes).valid) throw new Error("real prepared approval signature is not admitted");
                prepared.push({ ...item, signatureBytes }); signaturePreparationsAcknowledged += 1; stable();
              }
              phase = "publish"; stable(); lockAttempted = true;
              const result = withControlFileLock({ root: paths.root, name: "approval-consumption", operation: () => {
                stable();
                if (!stageAndLink(writes[0]!.bytes)) {
                  assertInputs(); const winner = captureOrgPairs([paths.consumption]);
                  const prior = loadApprovalConsumed({ workspace, agentId: paths.agentId, approvalRequestId: approvalId });
                  if (prior === null) throw new Error("approval replay artifact is missing");
                  assertOrgPairsCurrent(winner); assertInputs();
                  replayObserved = true; replayRecord = structuredClone(prior); failed = true; failure = new Error("another execution owns approval consumption");
                  return { consumed: false, replay: true, reason: "approval already consumed", consumedTs: prior.consumedTs };
                }
                const members = [{ path: `${paths.consumption}.sig`, bytes: prepared[0]!.signatureBytes },
                  { path: paths.request, bytes: writes[1]!.bytes }, { path: `${paths.request}.sig`, bytes: prepared[1]!.signatureBytes }];
                for (const item of members) {
                  attemptedMember = null; stable(); assertCurrent();
                  attemptedMember = relative(workspace, item.path);
                  writeFileAtomic(item.path, item.bytes, 0o644);
                  returnedMembers.push(attemptedMember); acknowledge(item.path, item.bytes, 0o644); attemptedMember = null;
                }
                stable(); assertCurrent();
                committed = true;
                return { consumed: true, replay: false, reason: "ok", consumedTs: consumed.consumedTs };
              } });
              lockReturned = true; phase = result.replay ? "replay" : "complete";
              if (!result.replay) { stable(); assertCurrent(); }
              return result;
            } catch (cause) { failed = true; failure = cause; phase = `incomplete:${phase}`; throw new ApprovalConsumptionPublicationError(progress(), cause); }
          } });
      } catch (cause) {
        if (cause !== null && typeof cause === "object" && "path" in cause && typeof cause.path === "string")
          throw new Error("approval grant local observation refused", { cause });
        throw cause;
      }
    } });
}
