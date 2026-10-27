import { lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BootstrapResult } from "./bootstrap.js";
import { usersConfigPath, verifyUsersConfigSignature } from "../auth/authApi.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, captureOrgPairsAuthority,
  type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { initTransparencyLogAttemptAsync } from "../transparency/logChain.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { rebuildTransparencyMerkleAttemptAsync } from "../transparency/merkleProducerPublication.js";
import { loadTrustConfig, resolveNotaryAuthSecret } from "../trust/trustConfig.js";
import { captureVaultPurposeContinuity, vaultStatus } from "../vault/vault.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

function enabled(): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
}
/** A refusal latch, including throw undefined. It neither supplies authority nor retries a failed observation. */
function refusalLatch() {
  let refused = false, first: unknown;
  return { check(action: () => void) {
    if (refused) throw first;
    try { action(); } catch (cause) { refused = true; first = cause; throw cause; }
  }, snapshot() { return Object.freeze({ observed: refused, cause: first }); } };
}

/** Actual suffix-entry inputs only. Earlier owner/config/LAN/notary intervals are not retrospectively authenticated. */
export function captureBootstrapSuffixInputs(workspace: string, expectedVaultEnv: string | undefined): () => void {
  const refusal = refusalLatch(), root = resolve(workspace);
  const scalar = () => {
    enabled();
    if (process.env.AMC_VAULT_PASSPHRASE !== expectedVaultEnv) throw new Error("original bootstrap vault environment changed");
  };
  scalar();
  const physical = realpathSync(root), original = lstatSync(physical);
  if (!original.isDirectory()) throw new Error("bootstrap workspace root must be a directory");
  const users = captureOrgPairs([usersConfigPath(root)]);
  if (users.members.some(row => row.bytes === null)) throw new Error("bootstrap users pair is missing at suffix entry");
  const assertCurrent = () => refusal.check(() => {
    scalar();
    const current = lstatSync(physical);
    if (realpathSync(root) !== physical || !current.isDirectory() || current.dev !== original.dev || current.ino !== original.ino)
      throw new Error("original bootstrap workspace root changed");
    assertOrgPairsCurrent(users);
    const verified = verifyUsersConfigSignature(root);
    if (!verified.valid) throw new Error(`users config signature invalid: ${verified.reason ?? "unknown"}`);
    assertOrgPairsCurrent(users); scalar();
  });
  assertCurrent(); return assertCurrent;
}

interface ReportInputs {
  vaultCreated: boolean;
  ownerCreated: boolean;
  createdConfigs: Record<string, boolean>;
  notaryEnabled: boolean;
}
interface SuffixProgress {
  phase: string;
  authorityCaptureAttempted: boolean;
  authorityCaptureReturned: boolean;
  secretResolutionAttempted: boolean;
  secretResolutionReturned: boolean;
  fileContinuityCaptured: boolean;
  initialization: Awaited<ReturnType<typeof initTransparencyLogAttemptAsync>>["progress"] | null;
  reportDirectoryAttempted: boolean;
  reportDirectoryReturned: boolean;
  attemptedPath: string | null;
  returnedMembers: string[];
  acknowledgedMembers: string[];
  completedStages: string[];
  completedTransparencyHash: string | null;
}
const progressSnapshot = (progress: SuffixProgress) => Object.freeze({ ...progress,
  returnedMembers: Object.freeze([...progress.returnedMembers]), acknowledgedMembers: Object.freeze([...progress.acknowledgedMembers]),
  completedStages: Object.freeze([...progress.completedStages]) });

/** Genuine child errors remain the cause, including append lag/root-covered diagnostics and native cleanup failures. */
export class BootstrapProviderSuffixError extends Error {
  readonly code = "BOOTSTRAP_PROVIDER_SUFFIX_INCOMPLETE";
  constructor(readonly progress: ReturnType<typeof progressSnapshot>, readonly firstRefusal: ReturnType<ReturnType<typeof refusalLatch>["snapshot"]>,
    cause: unknown) {
    super("bootstrap provider suffix did not complete; earlier setup and any acknowledged suffix effects remain", { cause });
    this.name = "BootstrapProviderSuffixError";
  }
}

function captureOriginal(workspace: string, inputs: () => void, progress: SuffixProgress, refusal: ReturnType<typeof refusalLatch>) {
  const entry = () => refusal.check(() => { enabled(); inputs(); enabled(); });
  entry(); progress.authorityCaptureAttempted = true;
  const selected = (["BUNDLE", "TRANSPARENCY_ROOT", "MERKLE_ROOT"] as const).map(kind => describePolicySigner(workspace, kind));
  // Entry warming/migration is admitted. Every retained later observation remains subordinate to these genuine captures.
  const bundle = captureOrgPairsAuthority(workspace, entry), log = captureWorkspaceLogAuthority(workspace, entry);
  const trust = loadTrustConfig(workspace), usesNotary = selected.some(row => row.mode === "NOTARY");
  let originalSecret: string | null = null;
  if (usesNotary) {
    progress.secretResolutionAttempted = true;
    originalSecret = resolveNotaryAuthSecret(workspace, trust.trust.notary.auth.secretRef);
    progress.secretResolutionReturned = true;
  }
  // Authenticate/stabilize any real secret before retaining a managed local artifact material token.
  const fileSelected = selected.some(row => row.mode === "VAULT")
    && (boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file") === "file";
  const continuity = fileSelected ? captureVaultPurposeContinuity(workspace, "artifact-seal") : null;
  progress.fileContinuityCaptured = continuity !== null;
  const mark = canonicalize(keysetCommittedMark(workspace)), keyset = canonicalize(assertKeysetComplete(workspace));
  const assertCurrent = () => refusal.check(() => {
    entry(); continuity?.();
    if (usesNotary) {
      if (!vaultStatus(workspace).unlocked) throw new Error("original bootstrap notary credential vault is locked");
      if (resolveNotaryAuthSecret(workspace, trust.trust.notary.auth.secretRef) !== originalSecret)
        throw new Error("original bootstrap notary credential changed");
    }
    continuity?.();
    if (canonicalize(keysetCommittedMark(workspace)) !== mark || canonicalize(assertKeysetComplete(workspace)) !== keyset)
      throw new Error("original bootstrap signing generation changed");
    // These real fixed helpers retain full applicable policy/ref/public authority, not an unused local NOTARY policy.
    bundle(); log.assertIntrinsicCurrent();
    for (const descriptor of selected) assertPolicySignerCurrent(workspace, descriptor);
    continuity?.(); entry();
  });
  assertCurrent(); progress.authorityCaptureReturned = true;
  return assertCurrent;
}

/** Only this producer can advance a report expectation, after a real return and exact bytes/mode readback. */
function reportPublication(paths: readonly string[], progress: SuffixProgress) {
  let expected: OrgPairsSnapshot = captureOrgFiles(paths);
  const assertCurrent = () => assertOrgPairsCurrent(expected);
  return { assertCurrent, write(path: string, bytes: Buffer, beforeWrite: () => void) {
    progress.attemptedPath = null; beforeWrite(); assertCurrent();
    progress.phase = `report-write:${path}`; progress.attemptedPath = path;
    writeFileAtomic(path, bytes, 0o644); progress.returnedMembers.push(path);
    progress.phase = `report-readback:${path}`;
    const own = captureOrgFiles([path]).members[0];
    if (own === undefined || own.bytes === null || own.mode !== 0o644 || !own.bytes.equals(bytes))
      throw new Error("bootstrap returned report member differs from its exact expected bytes or mode");
    const index = expected.members.findIndex(row => row.path === path);
    if (index < 0) throw new Error("bootstrap report destination was not captured");
    const members = [...expected.members]; members[index] = own; expected = { members };
    progress.acknowledgedMembers.push(path); progress.attemptedPath = null;
    assertCurrent();
  } };
}

/** Fixed internal suffix. Caller data are ordinary report fields; the callback only refuses actual original inputs. */
export async function publishBootstrapProviderSuffix(workspace: string, input: ReportInputs, assertInputsCurrent: () => void) {
  const data = { ...input, createdConfigs: { ...input.createdConfigs } }, refusal = refusalLatch();
  const progress: SuffixProgress = { phase: "authority-capture", authorityCaptureAttempted: false, authorityCaptureReturned: false,
    secretResolutionAttempted: false, secretResolutionReturned: false, fileContinuityCaptured: false,
    initialization: null, reportDirectoryAttempted: false, reportDirectoryReturned: false, attemptedPath: null,
    returnedMembers: [], acknowledgedMembers: [], completedStages: [], completedTransparencyHash: null };
  const failure = (cause: unknown) => new BootstrapProviderSuffixError(progressSnapshot(progress), refusal.snapshot(), cause);
  try {
    const original = captureOriginal(workspace, assertInputsCurrent, progress, refusal);
    const stable = () => refusal.check(original);
    progress.phase = "initialization";
    const initialized = await initTransparencyLogAttemptAsync(workspace, stable);
    progress.initialization = initialized.progress;
    progress.completedStages.push("initialization"); stable(); refusal.check(initialized.assertCurrent);
    progress.phase = "initial-merkle";
    const initialMerkle = await rebuildTransparencyMerkleAttemptAsync(workspace, {
      beforePublish: stable, assertInputsCurrent: () => refusal.check(() => { stable(); initialized.assertCurrent(); })
    });
    progress.completedStages.push("initial-merkle");
    // Init's full-family predecessor retires only through the genuine initial rebuild. No old CAS follows its own writes.
    const initialFamily = () => refusal.check(() => { stable(); initialMerkle.assertCurrent(); });
    initialFamily();
    const bootstrapDir = join(workspace, ".amc", "bootstrap");
    progress.phase = "report-directory"; progress.reportDirectoryAttempted = true;
    ensureDir(bootstrapDir); progress.reportDirectoryReturned = true;
    const ts = Date.now();
    const reportPath = join(bootstrapDir, `bootstrap_${ts}.json`), reportSigPath = `${reportPath}.sig`;
    const report = {
      v: 1,
      ts,
      workspace,
      vaultCreated: data.vaultCreated,
      ownerCreated: data.ownerCreated,
      vaultUnlocked: vaultStatus(workspace).unlocked,
      createdConfigs: data.createdConfigs,
      requirements: {
        passphraseFromFileRequired: true,
        ownerCredentialsFromFileRequiredOnFirstRun: true,
        notaryEnabled: data.notaryEnabled
      }
    };
    const bytes = Buffer.from(JSON.stringify(report, null, 2), "utf8");
    const ownedReport = reportPublication([reportPath, reportSigPath], progress);
    const preparingReport = () => refusal.check(() => { initialFamily(); ownedReport.assertCurrent(); });
    ownedReport.write(reportPath, bytes, preparingReport);
    progress.phase = "report-sign";
    const preparedReport = await prepareFileSignatureWithAuditor(workspace, reportPath, bytes, "BUNDLE", preparingReport);
    preparingReport(); refusal.check(preparedReport.assertCurrent);
    ownedReport.write(reportSigPath, Buffer.from(preparedReport.signatureBytes, "utf8"), () => { preparingReport(); refusal.check(preparedReport.assertCurrent); });
    progress.completedStages.push("report");
    const stableReport = () => refusal.check(() => { stable(); preparedReport.assertCurrent(); ownedReport.assertCurrent(); });
    const reportDigest = sha256Hex(Buffer.from(JSON.stringify(report), "utf8"));
    progress.phase = "append";
    const append = await appendTransparencyEntryAttemptAsync({ workspace, type: "BOOTSTRAP_COMPLETED", agentId: "system",
      artifact: { kind: "policy", id: `bootstrap_${ts}`, sha256: reportDigest } }, {
      beforeCommit() { stableReport(); initialFamily(); },
      // Stable original inputs/report only: initialMerkle must not be replayed against append's acknowledged own writes.
      beforeMember: stableReport
    });
    progress.completedTransparencyHash = append.entry.hash; progress.completedStages.push("append");
    progress.phase = "final-merkle";
    const finalMerkle = await rebuildTransparencyMerkleAttemptAsync(workspace, {
      beforePublish: stableReport, assertInputsCurrent: () => refusal.check(() => { stableReport(); append.assertCurrent(); })
    });
    progress.completedStages.push("final-merkle");
    const assertCompleted = () => refusal.check(() => { stableReport(); finalMerkle.assertCurrent(); });
    assertCompleted(); progress.phase = "complete";
    const result: BootstrapResult = { workspace, reportPath, reportSigPath, transparencyHash: append.entry.hash };
    return Object.freeze({ result, assertCurrent() {
      try { assertCompleted(); } catch (cause) { throw failure(cause); }
    } });
  } catch (cause) { throw failure(cause); }
}
