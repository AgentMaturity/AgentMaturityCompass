import YAML from "yaml";
import { readFileSync } from "node:fs";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { boundProviderKey } from "../keys/keyset.js";
import { vaultStatus } from "../vault/vault.js";
import { captureOrgPairs, orgPairBytes, prepareOrgPairsAsync, publishOrgPairsAsync, captureOrgPairsAuthority, type OrgPairsOptions, type OrgPairWrite } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultPromptPolicy, defaultPromptSchedulerState, promptPolicySchema, promptSchedulerStateSchema, type PromptPolicy } from "./promptPolicySchema.js";
import { ensurePromptDirs, promptPolicyPath, promptSchedulerPath, loadPromptPolicyAsync } from "./promptPolicyStore.js";

/** The existing init contract keeps an existing policy; all missing pair signatures precede either body. */
export async function promptInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const path = promptPolicyPath(workspace), scheduler = promptSchedulerPath(workspace);
  if (pathExists(path) && pathExists(scheduler)) { ensurePromptDirs(workspace); return { path, sigPath: `${path}.sig`, policy: promptPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown) }; }
  const previous = captureOrgPairs([path, scheduler]);
  const policyBytes = orgPairBytes(previous, path), schedulerBytes = orgPairBytes(previous, scheduler);
  const policy = policyBytes === null ? defaultPromptPolicy() : promptPolicySchema.parse(YAML.parse(policyBytes.toString("utf8")) as unknown);
  const writes: OrgPairWrite[] = [];
  if (policyBytes === null) writes.push({ path, bytes: Buffer.from(YAML.stringify(policy)) });
  if (schedulerBytes === null) writes.push({ path: scheduler, bytes: Buffer.from(JSON.stringify(defaultPromptSchedulerState(), null, 2)) });
  if (writes.length > 0) await publishOrgPairsAsync(workspace, writes, options, previous);
  ensurePromptDirs(workspace);
  return { path, sigPath: `${path}.sig`, policy };
}
export class PromptPolicyPublicationError extends Error {
  readonly code = "PROMPT_POLICY_LOG_INCOMPLETE";
  readonly committed = true;
  constructor(readonly path: string, readonly sigPath: string, cause: unknown) {
    super("prompt policy was published but its transparency append did not complete", { cause }); this.name = "PromptPolicyPublicationError";
  }
}
export async function promptPolicyApplyForApiAsync(params: { workspace: string; policy: PromptPolicy; reason: string; actor: string }, options: OrgPairsOptions = {}) {
  const input = { workspace: params.workspace, policy: promptPolicySchema.parse(params.policy), reason: params.reason, actor: params.actor };
  const logSigners = [describePolicySigner(input.workspace, "TRANSPARENCY_ROOT"), describePolicySigner(input.workspace, "MERKLE_ROOT")];
  // Both existing log kinds use the same artifact purpose; warm its normal local gate before the FIRST await.
  const logVault = logSigners.some(signer => signer.mode === "VAULT");
  if (logVault) capturePurposePublication(input.workspace, "artifact-seal");
  const logFile = logVault && boundProviderKey(input.workspace, "artifact-seal") === null;
  const assertInputsCurrent = options.assertInputsCurrent, bundleCurrent = captureOrgPairsAuthority(input.workspace, options.beforePublish), path = promptPolicyPath(input.workspace);
  const original = () => { bundleCurrent(); for (const signer of logSigners) assertPolicySignerCurrent(input.workspace, signer);
    if (logFile && !vaultStatus(input.workspace).unlocked) throw new Error("vault locked; unlock required for signing"); };
  original();
  const bytes = Buffer.from(YAML.stringify(input.policy)), previous = captureOrgPairs([path]);
  const plan = await prepareOrgPairsAsync(input.workspace, [{ path, bytes }], { beforePublish: original, assertInputsCurrent }, previous);
  const saved = plan.publish()[0]!;
  try {
    await appendTransparencyEntryAsync({ workspace: input.workspace, type: "PROMPT_POLICY_APPLIED", agentId: input.actor,
      artifact: { kind: "policy", id: "prompt-policy", sha256: sha256Hex(bytes) } }, { beforeCommit: () => { assertInputsCurrent?.(); original(); plan.assertCurrent(); } });
  } catch (cause) { throw new PromptPolicyPublicationError(saved.path, saved.sigPath, cause); }
  return { ...saved, reason: input.reason };
}
export async function promptSchedulerSetEnabledForApiAsync(params: { workspace: string; enabled: boolean }, options: OrgPairsOptions = {}) {
  const workspace = params.workspace, enabled = params.enabled, path = promptSchedulerPath(workspace), previous = captureOrgPairs([path]);
  const bytes = orgPairBytes(previous, path), current = bytes === null ? defaultPromptSchedulerState() : promptSchedulerStateSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const state = promptSchedulerStateSchema.parse({ ...current, enabled });
  const saved = (await publishOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(JSON.stringify(state, null, 2)) }], options, previous))[0]!;
  return { state, ...saved };
}

export async function promptPolicyForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const beforePublish = options.beforePublish;
  await loadPromptPolicyAsync(workspace, options); // Only the missing-body branch signs; existing reads need no unlock.
  beforePublish?.();
  const path = promptPolicyPath(workspace), sigPath = `${path}.sig`, bytes = readFileSync(path), signatureExists = pathExists(sigPath);
  const policy = promptPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  const verdict = signatureExists ? verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, readFileSync(sigPath)) : { valid: false, reason: "signature missing" };
  return { policy, signature: { ...verdict, signatureExists, path, sigPath } };
}
