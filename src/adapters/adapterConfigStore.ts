import { lstatSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../mode/mode.js";
import { prepareFileSignatureWithAuditor, type SignedFileVerification } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import { sha256Hex } from "../utils/hash.js";
import { adapterConfigSchema, defaultAdapterConfig, type AdapterAgentProfile, type AdapterConfig } from "./adapterConfigSchema.js";

export function adaptersConfigPath(workspace: string): string { return join(workspace, ".amc", "adapters.yaml"); }
export function adaptersConfigSigPath(workspace: string): string { return `${adaptersConfigPath(workspace)}.sig`; }
interface FileState { bytes: Buffer; mode: number }
interface Pair { body: FileState | null; sidecar: FileState | null }
type Command = "adapters init" | "adapters configure";
type Result = { configPath: string; sigPath: string };
const BODY = ".amc/adapters.yaml", SIGNATURE = BODY + ".sig";
const equal = (a: FileState | null, b: FileState | null) => a === null ? b === null : b !== null && a.mode === b.mode && a.bytes.equals(b.bytes);
function read(workspace: string, path: string): FileState | null {
  const bytes = readContainedOrNull(workspace, path, Number.MAX_SAFE_INTEGER);
  return bytes === null ? null : { bytes, mode: lstatSync(join(workspace, path)).mode & 0o777 };
}
function pair(workspace: string): Pair { return { body: read(workspace, BODY), sidecar: read(workspace, SIGNATURE) }; }
function parse(bytes: Buffer | null): AdapterConfig { return bytes === null ? defaultAdapterConfig() : adapterConfigSchema.parse(YAML.parse(bytes.toString("utf8"))); }
function withPairLock<T>(workspace: string, operation: () => T): T {
  return withControlFileLock({ root: join(workspace, ".amc"), name: "adapters-config-pair", operation });
}
export class AdaptersConfigPublicationError extends Error {
  readonly code = "ADAPTERS_CONFIG_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], cause: unknown) {
    super("adapters config publication is incomplete; inspect the published pair before retrying", { cause });
    this.name = "AdaptersConfigPublicationError";
  }
}
function plan(workspace: string, command: Command, previous: Pair, bytes: Buffer, replaceBody: boolean) {
  assertOwnerMode(workspace, command);
  return { workspace, command, previous, bytes: Buffer.from(bytes), replaceBody };
}
function publish(input: ReturnType<typeof plan>, signatureBytes: string, assertCurrent: () => void, recheckInputs: () => void = () => {}): Result {
  return withPairLock(input.workspace, () => {
    assertOwnerMode(input.workspace, input.command); assertCurrent(); recheckInputs();
    const current = pair(input.workspace);
    if (!equal(current.body, input.previous.body) || !equal(current.sidecar, input.previous.sidecar)) throw new Error("adapters config pair changed while signing; retry");
    const published: string[] = [];
    try {
      if (input.replaceBody) { writeFileAtomic(adaptersConfigPath(input.workspace), input.bytes, 0o644); published.push(BODY); }
      writeFileAtomic(adaptersConfigSigPath(input.workspace), signatureBytes, 0o644); published.push(SIGNATURE);
    } catch (error) {
      if (published.length > 0) throw new AdaptersConfigPublicationError(Object.freeze([...published]), error);
      throw error;
    }
    return { configPath: adaptersConfigPath(input.workspace), sigPath: adaptersConfigSigPath(input.workspace) };
  });
}
function signSync(input: ReturnType<typeof plan>): Result {
  // Same BUNDLE mapping and five fields as signFileWithAuditor for this literal fixed path.
  const digestSha256 = sha256Hex(input.bytes), signed = signDigestWithPolicy({ workspace: input.workspace, kind: "BUNDLE", digestHex: digestSha256 });
  const signatureBytes = JSON.stringify({ digestSha256, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2);
  return publish(input, signatureBytes, () => {});
}
async function prepareAsync(input: ReturnType<typeof plan>) {
  const prepared = await prepareFileSignatureWithAuditor(input.workspace, adaptersConfigPath(input.workspace), input.bytes, "BUNDLE");
  return Object.freeze({ publish: (recheckInputs?: () => void) => publish(input, prepared.signatureBytes, prepared.assertCurrent, recheckInputs) });
}
export function loadAdaptersConfig(workspace: string): AdapterConfig { return parse(read(workspace, BODY)?.bytes ?? null); }

/** Retained unsigned save-only API; joins the same pair lock without adding a signature or no-sign policy. */
export function saveAdaptersConfig(workspace: string, config: AdapterConfig): string {
  assertOwnerMode(workspace, "adapters configure");
  const bytes = Buffer.from(YAML.stringify(adapterConfigSchema.parse(config)));
  return withPairLock(workspace, () => {
    assertOwnerMode(workspace, "adapters configure");
    // Refuse nonregular pair targets before replacing the existing body.
    pair(workspace); writeFileAtomic(adaptersConfigPath(workspace), bytes, 0o644);
    return adaptersConfigPath(workspace);
  });
}
export function signAdaptersConfig(workspace: string): string {
  assertOwnerMode(workspace, "adapters configure");
  const previous = pair(workspace);
  if (previous.body === null) throw new Error(`File not found: ${adaptersConfigPath(workspace)}`);
  return signSync(plan(workspace, "adapters configure", previous, previous.body.bytes, false)).sigPath;
}
export async function signAdaptersConfigAsync(workspace: string): Promise<string> {
  assertOwnerMode(workspace, "adapters configure");
  const previous = pair(workspace);
  if (previous.body === null) throw new Error(`File not found: ${adaptersConfigPath(workspace)}`);
  return (await prepareAsync(plan(workspace, "adapters configure", previous, previous.body.bytes, false))).publish().sigPath;
}
export function verifyAdaptersConfigSignature(workspace: string): SignedFileVerification {
  const path = adaptersConfigPath(workspace), sigPath = adaptersConfigSigPath(workspace);
  try {
    const current = pair(workspace);
    if (current.body === null) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
    if (current.sidecar === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", current.body.bytes, current.sidecar.bytes), signatureExists: true, path, sigPath };
  } catch { return { valid: false, signatureExists: pathExists(sigPath), reason: "invalid adapters config signature", path, sigPath }; }
}
export function initAdaptersConfig(workspace: string): Result {
  assertOwnerMode(workspace, "adapters init");
  const previous = pair(workspace), bytes = Buffer.from(YAML.stringify(defaultAdapterConfig()));
  return signSync(plan(workspace, "adapters init", previous, bytes, true));
}
export async function initAdaptersConfigAsync(workspace: string): Promise<Result> {
  return (await prepareAdaptersConfigInitializationAsync(workspace)).publish();
}
/** Internal fixed init publisher used by the owned HTTP route; no key, kind or SDK callback override. */
export function prepareAdaptersConfigInitializationAsync(workspace: string) {
  assertOwnerMode(workspace, "adapters init");
  const previous = pair(workspace), bytes = Buffer.from(YAML.stringify(defaultAdapterConfig()));
  return prepareAsync(plan(workspace, "adapters init", previous, bytes, true));
}
function profilePlan(workspace: string, agentId: string, profile: AdapterAgentProfile, requireSigned = false) {
  assertOwnerMode(workspace, "adapters configure");
  const previous = pair(workspace);
  if (requireSigned && (previous.body === null ? previous.sidecar !== null : previous.sidecar === null
    || !verifyAuditorSignatureBytes(workspace, "BUNDLE", previous.body.bytes, previous.sidecar.bytes).valid)) throw new Error("existing adapters config signature is invalid; review and re-sign before updating a profile");
  const current = parse(previous.body?.bytes ?? null);
  current.adapters.perAgent[agentId] = profile;
  return plan(workspace, "adapters configure", previous, Buffer.from(YAML.stringify(adapterConfigSchema.parse(current))), true);
}
export function setAgentAdapterProfile(workspace: string, agentId: string, profile: AdapterAgentProfile): Result {
  return signSync(profilePlan(workspace, agentId, profile));
}
export async function setAgentAdapterProfileAsync(workspace: string, agentId: string, profile: AdapterAgentProfile): Promise<Result> {
  return (await prepareAsync(profilePlan(workspace, agentId, profile, true))).publish();
}
/** Internal actual CLI input boundary; not exported from the SDK or accepted from an HTTP request. */
export function prepareAgentAdapterProfileAsync(workspace: string, agentId: string, profile: AdapterAgentProfile) {
  return prepareAsync(profilePlan(workspace, agentId, profile, true));
}
