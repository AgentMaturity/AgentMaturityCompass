/** Actual mechanic budget action. Raw config-purpose wire; no BUNDLE envelope or caller-supplied authority. */
import { join, relative } from "node:path";
import YAML from "yaml";
import { budgetsPath, budgetsSigPath, budgetsSchema } from "../budgets/budgets.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertSigningKeyUsable, getSigningKey, getSigningPublicKeyPem } from "../keys/signingKeys.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { loadMechanicTuning, mechanicTuningPath } from "./tuningStore.js";
import { mechanicTuningSchema } from "./tuningSchema.js";

class MechanicBudgetPublicationError extends Error {
  readonly code = "MECHANIC_BUDGET_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string, cause: unknown) {
    super("mechanic budget publication is incomplete; inspect committed members before retrying", { cause });
    this.name = "MechanicBudgetPublicationError";
  }
}

/** Capture the real config-purpose holder before the action's first await, without a fabricated checked signature. */
function authority(workspace: string) {
  const captured = capturePurposePublication(workspace, "config-signature");
  const bound = boundProviderKey(workspace, "config-signature"), holder = bound?.binding.provider ?? "file";
  const publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const identity = canonicalSigningKey(publicKeyPem);
  if (identity === null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original budget signing key is unsupported");
  const assertCurrent = () => {
    const current = assertKeysetComplete(workspace), policy = keyPolicy(loadKeysConfig(workspace));
    if (current === null || canonicalize(current) !== captured.keyset || !policy.allowed.includes(identity.algorithm)
      || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the original budget purpose authority changed or is refused");
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file") {
      if (!vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
      if (publicKeyFromPrivate(getSigningKey(workspace, "config-signature")) !== publicKeyPem)
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the original budget purpose key changed");
    }
  };
  assertCurrent(); return { captured, assertCurrent };
}

export async function updateMechanicBudgets(params: {
  workspace: string; agentId: string; beforeEffect: () => void; recordEffect: (effect: string) => void;
}): Promise<string> {
  const { workspace, agentId, beforeEffect, recordEffect } = params;
  beforeEffect(); const original = authority(workspace), tuningPath = mechanicTuningPath(workspace);
  // Preserve the existing synchronous cold default before the first await; its real successful pair is an earlier effect.
  const wasMissing = orgPairBytes(captureOrgPairs([tuningPath]), tuningPath) === null;
  loadMechanicTuning(workspace);
  if (wasMissing) { recordEffect(relative(workspace, tuningPath)); recordEffect(relative(workspace, `${tuningPath}.sig`)); }
  const tuningBefore = captureOrgPairs([tuningPath]), tuningBytes = orgPairBytes(tuningBefore, tuningPath);
  if (tuningBytes === null) throw new Error("mechanic tuning disappeared before budget preparation");
  const tuning = mechanicTuningSchema.parse(YAML.parse(tuningBytes.toString("utf8")) as unknown).mechanicTuning.knobs;
  const path = budgetsPath(workspace), sigPath = budgetsSigPath(workspace), before = captureOrgPairs([path]);
  const currentBytes = orgPairBytes(before, path);
  if (currentBytes === null) throw new Error(`Budgets config not found: ${path}`);
  const budgets = budgetsSchema.parse(YAML.parse(currentBytes.toString("utf8")) as unknown);
  const existing = budgets.budgets.perAgent[agentId] ?? budgets.budgets.perAgent.default;
  if (!existing) throw new Error(`budgets profile missing for agent ${agentId}`);
  budgets.budgets.perAgent[agentId] = {
    ...existing,
    daily: {
      ...existing.daily,
      maxLlmRequests: Math.max(1, tuning.maxToolCallsPerRun),
      maxLlmTokens: Math.max(1000, tuning.maxTokensPerRun),
      maxCostUsd: Math.max(0.01, tuning.maxCostPerDayUsd),
      maxToolExecutes: Object.fromEntries(Object.entries(existing.daily.maxToolExecutes).map(([actionClass]) => [
        actionClass, Math.max(0, tuning.maxToolCallsPerRun)
      ])) as typeof existing.daily.maxToolExecutes
    },
    perMinute: { maxLlmRequests: Math.max(1, Math.ceil(tuning.maxToolCallsPerRun / 2)),
      maxLlmTokens: Math.max(1000, Math.ceil(tuning.maxTokensPerRun / 12)) }
  };
  const bytes = Buffer.from(YAML.stringify(budgets)), digestSha256 = sha256Hex(bytes);
  const beforeSign = () => { beforeEffect(); assertOrgPairsCurrent(tuningBefore); original.assertCurrent(); assertOrgPairsCurrent(before); };
  beforeSign();
  const signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digestSha256, "hex"), { beforeSign });
  beforeEffect(); assertOrgPairsCurrent(tuningBefore); original.assertCurrent();
  assertPurposePublicationCurrent(workspace, original.captured, signed);
  const signature = Buffer.from(JSON.stringify({ digestSha256, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" }, null, 2));
  return withControlFileLock({ root: join(workspace, ".amc"), name: "budgets-writer", operation: () => {
    // The callback may only add refusal. Check all used inputs, then fixed authority, then exact destination CAS last.
    beforeEffect(); assertOrgPairsCurrent(tuningBefore); original.assertCurrent();
    assertPurposePublicationCurrent(workspace, original.captured, signed); assertOrgPairsCurrent(before);
    const published: string[] = []; let attemptedPath = relative(workspace, path);
    try {
      writeFileAtomic(path, bytes, 0o644); published.push(attemptedPath); recordEffect(attemptedPath);
      attemptedPath = relative(workspace, sigPath); writeFileAtomic(sigPath, signature, 0o644); published.push(attemptedPath); recordEffect(attemptedPath);
    } catch (cause) { throw new MechanicBudgetPublicationError(Object.freeze([...published]), attemptedPath, cause); }
    return path;
  } });
}
