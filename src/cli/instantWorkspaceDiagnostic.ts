/** Fixed maintained instant-scoring driver; unsupported entries keep the existing CLI recipe. */
import { join, resolve } from "node:path";
import { captureMatureWorkspaceInitialization } from "../workspaceMatureInitialization.js";
import { getWorkspacePaths, type InitWorkspaceOptions } from "../workspace.js";
import { getAgentPaths } from "../fleet/paths.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureInitializedInstantDiagnostic } from "../diagnostic/runner.js";
import { assertOrgPairsCurrent, captureOrgFiles } from "../org/preparedOrgPairs.js";
import { canonicalize } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { vaultStatus } from "../vault/vault.js";
import { boundProviderKey } from "../keys/keyset.js";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { RECEIPT_AUTHORITY_CURRENT } from "../keys/receiptAuthority.js";
import { readReceiptAuthorityState } from "../keys/receiptAuthorityState.js";

/** Returned flags describe only actual awaited calls; nested causes retain their own partial prefixes. */
class InstantInitializedDiagnosticError extends Error {
  readonly code = "INSTANT_INITIALIZED_DIAGNOSTIC_INCOMPLETE";
  constructor(cause: unknown, readonly phase: "initialize" | "diagnostic", readonly initializationReturned: boolean, readonly diagnosticReturned: boolean) {
    super("initialized instant scoring did not complete; actual prior effects remain", { cause });
    this.name = "InstantInitializedDiagnosticError";
  }
}

/** No supplied datasets, signer, phase or positive completion; only the actual mature attempt can complete. */
export function captureInstantWorkspaceDiagnostic(workspace: string, agentId: string) {
  const noSign = process.env.AMC_NO_SIGN === "1", passphrase = process.env.AMC_VAULT_PASSPHRASE;
  if (noSign || !passphrase || workspace !== resolve(workspace) || !pathExists(join(workspace, ".amc"))) return null;
  const options: InitWorkspaceOptions = { workspacePath: workspace, agentId: agentId === "default" ? undefined : agentId,
    agentName: agentId === "default" ? "Agent" : agentId, trustBoundaryMode: "isolated" };
  const scorePaths = getAgentPaths(workspace, agentId), initPaths = getWorkspacePaths(workspace, options.agentId);
  if (scorePaths.agentId !== agentId || initPaths.agentId !== agentId || scorePaths.contextGraph !== initPaths.contextGraph
    || scorePaths.targetsDir !== initPaths.targetsDir || pathExists(scorePaths.contextGraph) || pathExists(join(scorePaths.targetsDir, "default.target.json"))) return null;
  if (!vaultStatus(workspace).unlocked || boundProviderKey(workspace, "ledger-row") !== null || boundProviderKey(workspace, "receipt") !== null
    || pathExists(join(workspace, RECEIPT_AUTHORITY_CURRENT))) return null;
  if (readReceiptAuthorityState(workspace) !== null) return null;
  const absence = captureOrgFiles([join(workspace, RECEIPT_AUTHORITY_CURRENT)]), scoreSelection = canonicalize(scorePaths), initSelection = canonicalize(initPaths);
  const assertChoice = () => {
    if (process.env.AMC_NO_SIGN === "1" || process.env.AMC_VAULT_PASSPHRASE !== passphrase)
      throw new Error("original instant signed-mode selection changed");
    if (canonicalize(getAgentPaths(workspace, agentId)) !== scoreSelection || canonicalize(getWorkspacePaths(workspace, options.agentId)) !== initSelection)
      throw new Error("original instant initializer and diagnostic selection changed");
    if (!vaultStatus(workspace).unlocked || boundProviderKey(workspace, "ledger-row") !== null || boundProviderKey(workspace, "receipt") !== null
      || readReceiptAuthorityState(workspace) !== null) throw new Error("original instant local SQL signer selection changed");
    assertOrgPairsCurrent(absence);
  };
  const mature = captureMatureWorkspaceInitialization(workspace, options);
  if (mature === null) return null;
  assertChoice(); mature.assertCurrent();
  const reportCurrent = captureRunHashAuthority(workspace, false);
  mature.assertCurrent(); assertChoice();
  const purposes = ["ledger-row", "receipt"] as const;
  const originals = purposes.map(purpose => {
    const publicKeyPem = getSigningPublicKeyPem(workspace, purpose), algorithm = canonicalSigningKey(publicKeyPem)?.algorithm;
    if (algorithm === undefined) throw new Error("original instant local SQL public key is unsupported");
    return { purpose, publicKeyPem, algorithm };
  });
  const originalPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  const localCurrent = () => {
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!vaultStatus(workspace).unlocked || canonicalize(policy) !== originalPolicy || policy.requireNonExportable)
      throw new Error("original instant local SQL policy is refused");
    for (const original of originals) {
      if (boundProviderKey(workspace, original.purpose) !== null || !policy.allowed.includes(original.algorithm))
        throw new Error("original instant local SQL holder or algorithm is refused");
      assertVaultMaySign(workspace, original.purpose);
      assertSigningKeyUsable(workspace, original.purpose, original.publicKeyPem, "file");
      if (getSigningPublicKeyPem(workspace, original.purpose) !== original.publicKeyPem)
        throw new Error("original instant local SQL public key changed");
    }
  };
  const originalCurrent = () => { assertChoice(); mature.assertCurrent(); reportCurrent(); localCurrent(); assertChoice(); mature.assertCurrent(); };
  const completedCurrent = () => { originalCurrent(); mature.assertCompleted(); originalCurrent(); };
  originalCurrent();
  // Capture the actual mutable default questions before the initializer's first provider await.
  const diagnostic = captureInitializedInstantDiagnostic(workspace, agentId, originalCurrent, completedCurrent);
  let entered = false, diagnosticEntered = false, initializationReturned = false, diagnosticReturned = false;
  return Object.freeze({ async initialize() {
    if (entered) throw new Error("instant initializer continuation has already entered"); entered = true;
    try {
      diagnostic.assertCurrent(); await mature.initialize(); initializationReturned = true;
      completedCurrent(); diagnostic.assertCurrent();
      return Object.freeze({
        state: { createdWorkspace: false, createdAgentContext: true,
          vault: { noSign: false, createdLocalPassphrase: false, localPassphrasePath: null, reason: null } },
        async diagnose() {
          if (diagnosticEntered) throw new Error("instant diagnostic continuation has already entered"); diagnosticEntered = true;
          try {
            completedCurrent(); const report = await diagnostic.diagnose(); diagnosticReturned = true; completedCurrent(); return report;
          } catch (cause) { throw new InstantInitializedDiagnosticError(cause, "diagnostic", initializationReturned, diagnosticReturned); }
        }
      });
    } catch (cause) { throw new InstantInitializedDiagnosticError(cause, "initialize", initializationReturned, diagnosticReturned); }
  } });
}
