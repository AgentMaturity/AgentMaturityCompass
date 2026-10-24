import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { type SignedFileVerification, prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { captureOrgPairs, captureOrgFiles, orgPairBytes, assertOrgPairsCurrent, publishOrgPairs, prepareOrgPairsAsync,
  captureOrgPairsAuthority, OrgPairsPublicationError, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { sha256Hex } from "../utils/hash.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import {
  noCodeAdapterTypeSchema,
  noCodeGovernanceConfigSchema,
  defaultNoCodeGovernanceConfig,
  type NoCodeAdapterRecord,
  type NoCodeAdapterType,
  type NoCodeGovernanceConfig
} from "./noCodeGovernanceSchema.js";

export function noCodeGovernanceConfigPath(workspace: string): string {
  return join(workspace, ".amc", "no-code-governance.yaml");
}

export function noCodeGovernanceConfigSigPath(workspace: string): string {
  return `${noCodeGovernanceConfigPath(workspace)}.sig`;
}

function normalizeWebhookUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.hash = "";
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  }
  return parsed.toString();
}

function defaultAdapterId(type: NoCodeAdapterType): string {
  return `${type}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function loadNoCodeGovernanceConfig(workspace: string): NoCodeGovernanceConfig {
  const path = noCodeGovernanceConfigPath(workspace);
  if (!pathExists(path)) {
    return defaultNoCodeGovernanceConfig();
  }
  const parsed = YAML.parse(readUtf8(path));
  return noCodeGovernanceConfigSchema.parse(parsed);
}

/** Repeated negative continuation only; returning does not grant signer authority. */
export interface NoCodeGovernancePublicationOptions { beforePublish?: () => void }
interface ConfigSelection { path: string; before: OrgPairsSnapshot; bytes: Buffer | null }
function selectConfig(workspace: string): ConfigSelection {
  const path = noCodeGovernanceConfigPath(workspace), before = captureOrgPairs([path]);
  return { path, before, bytes: orgPairBytes(before, path) };
}
function pairOptions(selected: ConfigSelection, options: NoCodeGovernancePublicationOptions) {
  const beforePublish = options.beforePublish;
  return { beforePublish, assertInputsCurrent: () => assertOrgPairsCurrent(selected.before) };
}
function serializedConfig(config: NoCodeGovernanceConfig): Buffer {
  return Buffer.from(YAML.stringify(noCodeGovernanceConfigSchema.parse(config)));
}
function publishConfig(workspace: string, selected: ConfigSelection, bytes: Buffer, options: NoCodeGovernancePublicationOptions) {
  const inputs = pairOptions(selected, options), beforePublish = captureOrgPairsAuthority(workspace, inputs.beforePublish);
  return publishOrgPairs(workspace, [{ path: selected.path, bytes }], { ...inputs, beforePublish }, selected.before)[0]!;
}
async function publishConfigAsync(workspace: string, selected: ConfigSelection, bytes: Buffer, options: NoCodeGovernancePublicationOptions) {
  // The actual helper captures fixed original BUNDLE authority and reaches real beforeSign before its first await.
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: selected.path, bytes }], pairOptions(selected, options), selected.before);
  prepared.assertCurrent(); return prepared.publish()[0]!;
}
function selectSignInput(workspace: string): ConfigSelection & { bytes: Buffer } {
  const path = noCodeGovernanceConfigPath(workspace);
  if (!pathExists(path)) throw new Error(`File not found: ${path}`);
  const selected = selectConfig(workspace);
  if (selected.bytes === null) throw new Error(`File not found: ${path}`);
  return { ...selected, bytes: selected.bytes };
}
function publishSignature(workspace: string, selected: ConfigSelection, signatureBytes: string, assertAuthorityCurrent: () => void,
  beforePublish: (() => void) | undefined): string {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "org-auditor-pairs", operation() {
    beforePublish?.(); assertAuthorityCurrent(); assertOrgPairsCurrent(selected.before); // Last CAS; no callback follows.
    const sigPath = `${selected.path}.sig`, published: string[] = [];
    try {
      writeFileAtomic(sigPath, signatureBytes, 0o644); published.push(relative(workspace, sigPath));
      // The body is consumed external input for this sidecar-only operation; never compare the old sidecar after our write.
      assertOrgPairsCurrent({ members: selected.before.members.filter(row => row.path === selected.path) });
      const acknowledged = captureOrgFiles([sigPath]), member = acknowledged.members[0]!;
      if (member.mode !== 0o644 || member.bytes === null || !member.bytes.equals(Buffer.from(signatureBytes)))
        throw new Error("published no-code sidecar differs from the exact prepared bytes or mode");
    } catch (cause) { throw new OrgPairsPublicationError(Object.freeze([...published]), relative(workspace, sigPath), cause); }
    return sigPath;
  } });
}
export function signNoCodeGovernanceConfig(workspace: string, options: NoCodeGovernancePublicationOptions = {}): string {
  const beforePublish = options.beforePublish; beforePublish?.();
  const selected = selectSignInput(workspace), original = captureOrgPairsAuthority(workspace, beforePublish), digestSha256 = sha256Hex(selected.bytes);
  // Preserve the original fixed BUNDLE policy recipe, over exact existing bytes, before any durable sidecar write.
  const signed = signDigestWithPolicy({ workspace, kind: "BUNDLE", digestHex: digestSha256 });
  const signatureBytes = JSON.stringify({ digestSha256, signature: signed.signature, signedTs: signed.signedTs,
    signer: "auditor", envelope: signed.envelope }, null, 2);
  return publishSignature(workspace, selected, signatureBytes, () => {
    original();
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", selected.bytes, Buffer.from(signatureBytes)).valid)
      throw new Error("prepared synchronous no-code signature is not admitted by current BUNDLE authority");
  }, beforePublish);
}
export async function signNoCodeGovernanceConfigAsync(workspace: string, options: NoCodeGovernancePublicationOptions = {}): Promise<string> {
  const beforePublish = options.beforePublish; beforePublish?.();
  const selected = selectSignInput(workspace), original = captureOrgPairsAuthority(workspace, beforePublish);
  const beforeSign = () => { beforePublish?.(); assertOrgPairsCurrent(selected.before); original(); };
  const signed = await prepareFileSignatureWithAuditor(workspace, selected.path, selected.bytes, "BUNDLE", beforeSign);
  return publishSignature(workspace, selected, signed.signatureBytes, () => { original(); signed.assertCurrent(); }, beforePublish);
}

export function verifyNoCodeGovernanceConfigSignature(workspace: string): SignedFileVerification {
  const path = noCodeGovernanceConfigPath(workspace), sigPath = `${path}.sig`;
  if (!pathExists(path)) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
  if (!pathExists(sigPath)) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
  try {
    const bytes = readFileSync(path), sidecar = readFileSync(sigPath);
    const result = verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, sidecar);
    return { ...result, reason: result.reason === "signature verification failed" ? "signature verify failed" : result.reason,
      signatureExists: true, path, sigPath };
  } catch (error) { return { valid: false, signatureExists: true, reason: String(error), path, sigPath }; }
}

export function initNoCodeGovernanceConfig(workspace: string, options: NoCodeGovernancePublicationOptions = {}): { path: string; sigPath: string } {
  const selected = selectConfig(workspace);
  return publishConfig(workspace, selected, serializedConfig(defaultNoCodeGovernanceConfig()), options);
}
export async function initNoCodeGovernanceConfigAsync(workspace: string, options: NoCodeGovernancePublicationOptions = {}) {
  const selected = selectConfig(workspace);
  return publishConfigAsync(workspace, selected, serializedConfig(defaultNoCodeGovernanceConfig()), options);
}

type AdapterInput = { workspace: string; type: NoCodeAdapterType; webhookUrl: string };
function adapterPlan(params: AdapterInput) {
  const workspace = params.workspace, type = noCodeAdapterTypeSchema.parse(params.type), webhookUrl = normalizeWebhookUrl(params.webhookUrl);
  const selected = selectConfig(workspace);
  // Mutate the actual consumed captured body once; missing remains the existing unsigned/default contract.
  const config = selected.bytes === null ? defaultNoCodeGovernanceConfig()
    : noCodeGovernanceConfigSchema.parse(YAML.parse(selected.bytes.toString("utf8")));
  const existing = config.noCodeAdapters.adapters.find(row => row.type === type && row.webhookUrl === webhookUrl);
  let adapter: NoCodeAdapterRecord, created = false;
  if (existing) { existing.enabled = true; adapter = existing; }
  else {
    adapter = { id: defaultAdapterId(type), type, webhookUrl, enabled: true, addedTs: Date.now() };
    config.noCodeAdapters.adapters.push(adapter); created = true;
  }
  config.noCodeAdapters.adapters.sort((a, b) => a.id.localeCompare(b.id));
  return { workspace, selected, bytes: serializedConfig(config), adapter, created };
}
export function addNoCodeAdapter(params: AdapterInput, options: NoCodeGovernancePublicationOptions = {}): {
  configPath: string; sigPath: string; adapter: NoCodeAdapterRecord; created: boolean;
} {
  const plan = adapterPlan(params), output = publishConfig(plan.workspace, plan.selected, plan.bytes, options);
  return { configPath: output.path, sigPath: output.sigPath, adapter: plan.adapter, created: plan.created };
}
export async function addNoCodeAdapterAsync(params: AdapterInput, options: NoCodeGovernancePublicationOptions = {}) {
  const plan = adapterPlan(params), output = await publishConfigAsync(plan.workspace, plan.selected, plan.bytes, options);
  return { configPath: output.path, sigPath: output.sigPath, adapter: plan.adapter, created: plan.created };
}
