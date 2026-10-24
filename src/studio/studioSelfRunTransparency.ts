import { resolve } from "node:path";
import type { AutoAnswerOutput } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { describePolicySigner, signDigestWithPolicyAsync } from "../crypto/signing/signer.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { writeFileAtomic } from "../utils/fs.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { currentTreeAlgorithm } from "../transparency/merkleIndexStore.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { transparencySealSchema, transparencySealSignatureSchema } from "../transparency/logSchema.js";
import { captureTransparencyAppendPublication, stateBytes, withTransparencyPublicationLock,
  workspaceLogPath, workspaceSealPath, workspaceSealSigPath } from "../transparency/workspacePublication.js";

interface CaptureProgress {
  phase: string;
  generationReadAttempted: boolean;
  generationReadReturned: boolean;
  signerCaptureAttempted: boolean;
  signerCaptureReturned: boolean;
  originalGenerationConfirmed: boolean;
}
interface InitializationProgress {
  phase: string;
  signingCallAttempted: boolean;
  signingCallReturned: boolean;
  lockSetupAttempted: boolean;
  lockEntered: boolean;
  lockReturned: boolean;
  attemptedPath: string | null;
  returnedMembers: string[];
  acknowledgedMembers: string[];
  completed: boolean;
}
const captureSnapshot = (state: CaptureProgress): Readonly<CaptureProgress> => Object.freeze({ ...state });
const initializationSnapshot = (state: InitializationProgress) => Object.freeze({ ...state,
  returnedMembers: Object.freeze([...state.returnedMembers]), acknowledgedMembers: Object.freeze([...state.acknowledgedMembers]) });

/** The primary run/plan and forecast stages have already returned when the route enters this mandatory suffix.
 * Cause retains actual append subclasses/progress. A candidate entry is never projected as a committed hash. */
export class DiagnosticSelfRunTransparencyError extends Error {
  readonly code = "DIAGNOSTIC_SELF_RUN_TRANSPARENCY_PARTIAL";
  constructor(readonly agentId: string, readonly runId: string, readonly primaryResult: AutoAnswerOutput,
    readonly phase: string, readonly captureProgress: Readonly<CaptureProgress>,
    readonly initializationProgress: ReturnType<typeof initializationSnapshot> | null,
    readonly entryHash: string | null, cause: unknown) {
    super("diagnostic self-run transparency follow-up is incomplete; earlier primary and forecast effects remain", { cause });
    this.name = "DiagnosticSelfRunTransparencyError";
  }
}
function enabled(): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
}
function captureOriginal(workspace: string, actor: () => void, progress: CaptureProgress) {
  enabled(); actor(); enabled();
  progress.phase = "original-generation-read"; progress.generationReadAttempted = true;
  const mark = canonicalize(keysetCommittedMark(workspace)), keyset = canonicalize(assertKeysetComplete(workspace));
  progress.generationReadReturned = true;
  const generation = () => {
    if (canonicalize(keysetCommittedMark(workspace)) !== mark || canonicalize(assertKeysetComplete(workspace)) !== keyset)
      throw new Error("original self-run transparency generation changed; capture or migration effects, if any, remain");
  };
  const beforeOriginal = () => { enabled(); actor(); enabled(); generation(); };
  beforeOriginal();
  progress.phase = "original-file-session-gate";
  const selected = (["TRANSPARENCY_ROOT", "MERKLE_ROOT"] as const).map(kind => describePolicySigner(workspace, kind));
  if (selected.some(row => row.mode === "VAULT") && boundProviderKey(workspace, "artifact-seal") === null && !vaultStatus(workspace).unlocked)
    throw new Error("original self-run transparency file vault was locked before the body wait");
  beforeOriginal();
  // A marked/unlocked vault is not proof of a migration-free read. Pin generation BEFORE the actual helper.
  // getSigningKey/authenticated readers may still migrate, update high-water state or fail after local effects.
  progress.phase = "original-signer-capture"; progress.signerCaptureAttempted = true;
  const log = captureWorkspaceLogAuthority(workspace, beforeOriginal);
  progress.signerCaptureReturned = true;
  generation();
  if (canonicalize([log.sealSigner.descriptor, log.rootSigner.descriptor]) !== canonicalize(selected))
    throw new Error("original self-run transparency signer changed during genuine capture");
  progress.originalGenerationConfirmed = true;
  const assertCurrent = () => { beforeOriginal(); log.assertCurrent(); generation(); };
  assertCurrent(); progress.phase = "original-capture-complete";
  return { log, assertCurrent };
}
type Original = ReturnType<typeof captureOriginal>;

/** Real old initialization phase at its late position: optional seal Sign, log/body/signature order, lock even on no-op.
 * Atomic helper internals and replace acknowledgments retain their inherited point-in-time attribution limits. */
async function initialize(workspace: string, progress: InitializationProgress, assertCurrent: () => void) {
  progress.phase = "initialization-capture"; assertCurrent();
  const publication = captureTransparencyAppendPublication(workspace), logPath = workspaceLogPath(workspace);
  const log = stateBytes(publication.state, logPath), bodyPath = workspaceSealPath(workspace), sigPath = workspaceSealSigPath(workspace);
  const needsSeal = !publication.present(bodyPath) || !publication.present(sigPath);
  const beforePrepared = () => { assertCurrent(); publication.assertCurrent(); };
  let preparedSeal: { body: Buffer; signature: Buffer } | null = null;
  if (needsSeal) {
    progress.phase = "initialization-seal-prepare"; beforePrepared();
    const algorithm = currentTreeAlgorithm(workspace); beforePrepared();
    const body = Buffer.from(JSON.stringify(transparencySealSchema.parse({ v: 1, ts: Date.now(), lastHash: "",
      signerFingerprint: original.log.sealSigner.descriptor.fingerprint, merkleAlgorithm: algorithm }), null, 2));
    progress.phase = "initialization-seal-sign"; progress.signingCallAttempted = true;
    const signed = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(body),
      expectedSigner: original.log.sealSigner.descriptor, beforeSign: beforePrepared });
    progress.signingCallReturned = true; beforePrepared();
    const signature = Buffer.from(JSON.stringify(transparencySealSignatureSchema.parse({ digestSha256: sha256Hex(body),
      signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }), null, 2));
    preparedSeal = { body, signature };
  }
  const seal = preparedSeal;
  const member = (path: string, bytes: Buffer) => {
    progress.attemptedPath = null; progress.phase = `initialization-before:${path}`; beforePrepared();
    progress.phase = `initialization-write:${path}`; progress.attemptedPath = path;
    // This API hides internal mkdir/temp/rename/cleanup. A throw is not proof of no native effects or a known stage inode.
    writeFileAtomic(path, bytes, 0o644); progress.returnedMembers.push(path);
    progress.phase = `initialization-acknowledge:${path}`;
    publication.acknowledge(path, bytes, 0o644, "replace"); progress.acknowledgedMembers.push(path);
    progress.attemptedPath = null;
  };
  progress.phase = "initialization-lock-setup"; progress.lockSetupAttempted = true;
  withTransparencyPublicationLock(workspace, () => {
    progress.lockEntered = true; progress.phase = "initialization-first-gate"; beforePrepared();
    if (log === null) member(logPath, Buffer.alloc(0));
    if (seal !== null) { member(bodyPath, seal.body); member(sigPath, seal.signature); }
    progress.phase = "initialization-final-gate"; beforePrepared();
  });
  progress.lockReturned = true; progress.phase = "initialization-after-lock"; beforePrepared();
  progress.completed = true; progress.phase = "initialization-complete";
  // Preparation-only: the actual append retires this old expected-family gate at its genuine pre-line boundary.
  return { assertCurrent: beforePrepared };
}

/** One fixed maintained Studio caller. Capture refusal is sticky and silent until the original mandatory late slot.
 * No predecessor is pinned here: primary/forecast publication legitimately advances the workspace log first. */
export function captureStudioSelfRunTransparency(workspace: string, agentId: string, actor: () => void) {
  workspace = resolve(workspace);
  const capture: CaptureProgress = { phase: "original-actor", generationReadAttempted: false, generationReadReturned: false,
    signerCaptureAttempted: false, signerCaptureReturned: false, originalGenerationConfirmed: false };
  let original: Original | null = null, captureFailure: unknown, started = false;
  try { original = captureOriginal(workspace, actor, capture); } catch (cause) { captureFailure = cause; }
  let assertCompletedCurrent: (() => void) | null = null;
  return { assertCurrent() {
    if (assertCompletedCurrent === null) throw new Error("the self-run transparency suffix has not completed");
    assertCompletedCurrent();
  }, async append(out: AutoAnswerOutput) {
    if (started) throw new Error("the self-run transparency suffix cannot be retried or reused");
    started = true;
    // Match the old late argument evaluation: actual runId and exact JSON.stringify(out) before any suffix Sign/wait.
    const runId = out.runId, bytes = Buffer.from(JSON.stringify(out), "utf8"), primaryResult = JSON.parse(bytes.toString("utf8")) as AutoAnswerOutput;
    const input = { workspace, type: "DIAGNOSTIC_SELF_RUN", agentId,
      artifact: { kind: "policy" as const, id: `diagnostic-self-run-${runId}`, sha256: sha256Hex(bytes) } };
    const assertWireCurrent = () => {
      if (out.runId !== runId || !Buffer.from(JSON.stringify(out), "utf8").equals(bytes))
        throw new Error("original self-run output changed while preparing transparency");
    };
    let phase = "original-authority", initialization: InitializationProgress | null = null, completedEntryHash: string | null = null;
    try {
      if (original === null) throw captureFailure;
      const fixed = original, assertCurrent = () => { assertWireCurrent(); fixed.assertCurrent(); assertWireCurrent(); };
      assertCurrent();
      phase = "initialization";
      initialization = { phase: "initialization-start", signingCallAttempted: false, signingCallReturned: false,
        lockSetupAttempted: false, lockEntered: false, lockReturned: false, attemptedPath: null,
        returnedMembers: [], acknowledgedMembers: [], completed: false };
      const initialized = await initialize(workspace, initialization, assertCurrent);
      phase = "append";
      const attempt = await appendTransparencyEntryAttemptAsync(input, {
        beforeCommit() { assertCurrent(); initialized.assertCurrent(); },
        beforeMember: assertCurrent
      });
      completedEntryHash = attempt.entry.hash; phase = "final-continuation";
      const assertAttemptCurrent = () => { assertCurrent(); attempt.assertCurrent(); assertWireCurrent(); };
      assertAttemptCurrent();
      // Retain only the actual completed attempt and its original negatives across the route's await boundary.
      assertCompletedCurrent = () => {
        try { assertAttemptCurrent(); }
        catch (cause) {
          throw new DiagnosticSelfRunTransparencyError(agentId, runId, primaryResult, "caller-final-continuation", captureSnapshot(capture),
            initialization === null ? null : initializationSnapshot(initialization), completedEntryHash, cause);
        }
      };
      return attempt.entry;
    } catch (cause) {
      throw new DiagnosticSelfRunTransparencyError(agentId, runId, primaryResult, phase, captureSnapshot(capture),
        initialization === null ? null : initializationSnapshot(initialization),
        cause instanceof TransparencyMerkleLagError ? cause.entryHash : completedEntryHash, cause);
    }
  } };
}
