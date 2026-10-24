/** Fixed direct notary enablement; raw role-history admission remains its genuine local metadata protocol. */
import { randomBytes } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { addPublicKeyToHistory, getAuthenticatedKeyHistory, getPublicKeyPem } from "../crypto/keys.js";
import { signingKeyId } from "../keys/algorithmPolicy.js";
import { keyHistoryMarkKey, readHighWater } from "../keys/highWater.js";
import { assertKeyNotRevoked } from "../keys/keyRevocations.js";
import { keysetDeclared } from "../keys/keyset.js";
import { assertOrgPairsCurrent, captureOrgFiles, OrgPairsPublicationError } from "../org/preparedOrgPairs.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { captureVaultPurposeContinuity, getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { publishNotaryTrustConfig } from "./trustConfigPublication.js";

interface NotaryInputs {
  workspace: string; baseUrl: string; pinPubkeyPath: string;
  requiredAttestationLevel: "SOFTWARE" | "HARDWARE"; unixSocketPath?: string | null;
}
export interface NotaryEnablementProgress {
  readonly secretSetAttempted: boolean; readonly secretSetReturned: boolean; readonly secretReadBack: boolean;
  readonly pairPublicationAttempted: boolean; readonly pairPublicationReturned: boolean;
  readonly completedPairPaths: readonly string[];
  readonly historyAdmissionAttempted: boolean; readonly historyAdmissionReturned: boolean; readonly historyReadBack: boolean;
  readonly complete: boolean;
}
export class NotaryEnablementIncompleteError extends Error {
  readonly code = "NOTARY_ENABLEMENT_INCOMPLETE";
  constructor(readonly progress: Readonly<NotaryEnablementProgress>, readonly hasFirstRefusal: boolean,
    readonly firstRefusal: unknown, cause: unknown) {
    super("notary enablement did not complete; inspect aggregate attempts and readbacks before retrying", { cause });
    this.name = "NotaryEnablementIncompleteError";
  }
}

/** Only this producer returns completion. Ordinary data/callbacks never supply signer or native acknowledgments. */
export async function publishNotaryEnablement(input: NotaryInputs, beforePublish?: () => void) {
  const params = { ...input }, actor = beforePublish, workspace = params.workspace, root = resolve(workspace);
  let refused = false, firstRefusal: unknown;
  const remember = (cause: unknown) => { if (!refused) { refused = true; firstRefusal = cause; } };
  const guard = (operation: () => void) => {
    if (refused) throw firstRefusal;
    try { operation(); } catch (cause) { remember(cause); throw cause; }
  };
  const progress = { secretSetAttempted: false, secretSetReturned: false, secretReadBack: false,
    pairPublicationAttempted: false, pairPublicationReturned: false, completedPairPaths: [] as readonly string[],
    historyAdmissionAttempted: false, historyAdmissionReturned: false, historyReadBack: false, complete: false };
  const observedProgress = () => Object.freeze({ ...progress, completedPairPaths: Object.freeze([...progress.completedPairPaths]) });
  const fail = (cause: unknown): never => {
    remember(cause);
    if (progress.secretSetAttempted || progress.pairPublicationReturned || progress.historyAdmissionAttempted
      || cause instanceof OrgPairsPublicationError) throw new NotaryEnablementIncompleteError(observedProgress(), refused, firstRefusal, cause);
    throw cause; // Pure pre-member/provider refusals keep their actual typed escaping value.
  };
  try {
    const originalRoot = lstatSync(root), realRoot = realpathSync(root);
    if (!originalRoot.isDirectory()) throw new Error("notary enablement root must be a real directory");
    const pubPath = resolve(params.pinPubkeyPath);
    if (!pathExists(pubPath)) throw new Error(`notary pubkey file missing: ${pubPath}`);
    const pubPem = readUtf8(pubPath), pin = captureOrgFiles([pubPath]);
    if (pin.members[0]?.bytes?.toString("utf8") !== pubPem) throw new Error("notary pin changed during its original read");
    const fingerprint = sha256Hex(Buffer.from(pubPem, "utf8"));
    let secret = getVaultSecret(workspace, "notary/auth");
    if (!secret) {
      secret = randomBytes(32).toString("base64");
      progress.secretSetAttempted = true;
      setVaultSecret(workspace, "notary/auth", secret);
      progress.secretSetReturned = true;
    }
    // Authenticate the owned secret envelope/cache before retaining its original material token.
    if (getVaultSecret(workspace, "notary/auth") !== secret) throw new Error("original notary auth secret did not read back");
    progress.secretReadBack = true;
    const rawCurrent = captureVaultPurposeContinuity(workspace, "artifact-seal");
    const rolePublic = getPublicKeyPem(workspace, "auditor"), roleId = signingKeyId(rolePublic);
    if (roleId === null) throw new Error("original auditor role key is unsupported");
    const historyPath = join(workspace, ".amc", "keys", "auditor_history.json"), historyKey = keyHistoryMarkKey(workspace, "auditor");
    const originalHistory = captureOrgFiles([historyPath]), originalMark = readHighWater(historyKey);
    const prior = getAuthenticatedKeyHistory(workspace, "auditor");
    assertOrgPairsCurrent(originalHistory);
    if (prior !== null && (originalHistory.members[0]?.bytes === null || originalHistory.members[0]?.bytes === undefined
      || canonicalize(JSON.parse(originalHistory.members[0]!.bytes!.toString("utf8")) as unknown) !== canonicalize(prior))) {
      throw new Error("original auditor history observation changed");
    }
    let expectedHistory = originalHistory, expectedMark = canonicalize(originalMark);
    const inputsIntrinsic = () => {
      const now = lstatSync(root);
      if (process.env.AMC_NO_SIGN === "1" || resolve(workspace) !== root || realpathSync(root) !== realRoot
        || !now.isDirectory() || now.dev !== originalRoot.dev || now.ino !== originalRoot.ino) throw new Error("original notary enablement root or no-sign state changed");
      assertOrgPairsCurrent(pin);
      // An authenticated envelope refresh invalidates the retained cache token; never reacquire it here.
      if (getVaultSecret(workspace, "notary/auth") !== secret) throw new Error("original notary auth secret changed");
      rawCurrent();
      if (getPublicKeyPem(workspace, "auditor") !== rolePublic) throw new Error("original auditor role public key changed");
      assertKeyNotRevoked(workspace, keysetDeclared(workspace), roleId, "artifact-seal");
      assertOrgPairsCurrent(expectedHistory);
      if (canonicalize(readHighWater(historyKey)) !== expectedMark) throw new Error("original auditor history mark or validated poststate changed");
    };
    const inputsGate = () => guard(() => { inputsIntrinsic(); actor?.(); inputsIntrinsic(); });
    guard(inputsIntrinsic); // The first actor runs only after the fixed publisher captures its real signer/predecessor.
    progress.pairPublicationAttempted = true;
    const pair = await publishNotaryTrustConfig(workspace, { baseUrl: params.baseUrl, unixSocketPath: params.unixSocketPath ?? null,
      fingerprint, requiredAttestationLevel: params.requiredAttestationLevel }, inputsGate);
    progress.pairPublicationReturned = true;
    progress.completedPairPaths = Object.freeze([pair.path, pair.sigPath]);
    // Input-only publisher callbacks never invoke this genuine pair handle: the graph cannot recurse.
    const assertCompleted = () => guard(() => { pair.assertCurrent(); inputsIntrinsic(); });
    assertCompleted();
    progress.historyAdmissionAttempted = true;
    addPublicKeyToHistory(workspace, "auditor", pubPem, "notary", { logRevision: false });
    progress.historyAdmissionReturned = true; // Aggregate helper return, not a member/mark/warning acknowledgment.
    const observed = captureOrgFiles([historyPath]), admitted = getAuthenticatedKeyHistory(workspace, "auditor");
    assertOrgPairsCurrent(observed);
    if (prior === null || admitted === null || observed.members[0]?.bytes === null || observed.members[0]?.bytes === undefined
      || canonicalize(JSON.parse(observed.members[0]!.bytes!.toString("utf8")) as unknown) !== canonicalize(admitted)) {
      throw new Error("returned auditor history admission did not authenticate on readback");
    }
    const mark = readHighWater(historyKey), duplicate = prior.entries.some(entry => entry.publicKeyPem === pubPem);
    if (duplicate) {
      assertOrgPairsCurrent(originalHistory);
      if (canonicalize(mark) !== canonicalize(originalMark) || canonicalize(admitted) !== canonicalize(prior))
        throw new Error("duplicate auditor admission changed history or its mark");
    } else {
      const last = admitted.entries.at(-1);
      if (admitted.v !== prior.v || admitted.role !== prior.role || admitted.purpose !== prior.purpose
        || admitted.anchorFingerprint !== prior.anchorFingerprint || admitted.revision !== prior.revision + 1
        || admitted.entries.length !== prior.entries.length + 1
        || canonicalize(admitted.entries.slice(0, -1)) !== canonicalize(prior.entries)
        || last?.publicKeyPem !== pubPem || last.fingerprint !== fingerprint || last.source !== "notary"
        || observed.members[0]!.mode !== 0o600 || !observed.members[0]!.bytes!.equals(Buffer.from(JSON.stringify(admitted, null, 2)))) {
        throw new Error("returned auditor admission is not the genuine prior-prefix notary successor");
      }
      const raised = mark !== null && mark.sequence === admitted.revision && mark.sha256 === sha256Hex(canonicalize(admitted));
      if (canonicalize(mark) !== canonicalize(originalMark) && !raised) throw new Error("returned auditor history mark is neither original nor its actual successor");
    }
    // Aggregate returned helper + authenticated readback, not native-member origin or a durable-mark assertion.
    expectedHistory = observed; expectedMark = canonicalize(mark); progress.historyReadBack = true;
    assertCompleted(); progress.complete = true;
    return Object.freeze({ path: pair.path, sigPath: pair.sigPath, fingerprint, progress: observedProgress(), assertCurrent() {
      try { assertCompleted(); } catch (cause) { fail(cause); }
    } });
  } catch (cause) { return fail(cause); }
}
