import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureOrgPairs, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { captureRawConfigPair, captureRawConfigPairForAsync, ConfigSignaturePublicationError, verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { safeIdSchema } from "../utils/pathSafety.js";
import { federationConfigSchema, federationPeerSchema, type FederationConfigFile, type FederationPeer } from "./federationSchema.js";

function federationRoot(workspace: string): string {
  return join(workspace, ".amc", "federation");
}

function federationConfigPath(workspace: string): string {
  return join(federationRoot(workspace), "federation.yaml");
}

export function federationConfigSigPath(workspace: string): string {
  return `${federationConfigPath(workspace)}.sig`;
}

function federationPeersDir(workspace: string): string {
  return join(federationRoot(workspace), "peers");
}

export function federationInboxDir(workspace: string): string {
  return join(federationRoot(workspace), "inbox");
}

export function federationOutboxDir(workspace: string): string {
  return join(federationRoot(workspace), "outbox");
}

function federationPeerPath(workspace: string, peerId: string): string {
  return join(federationPeersDir(workspace), `${peerId}.json`);
}

/** Repeated negative continuation only; returning normally never grants signer authority. */
export interface FederationPublicationOptions { beforeSign?: () => void }
interface PairPlan { workspace: string; path: string; bytes: Buffer; previous: OrgPairsSnapshot; directories: readonly string[]; beforeSign?: () => void }
export class FederationPairPublicationError extends Error {
  readonly code = "FEDERATION_PAIR_PARTIAL";
  constructor(readonly publishedPaths: readonly string[], readonly attemptedPath: string | null, cause: unknown) {
    super("federation signed pair publication is incomplete; inspect known members and the attempted path before retrying", { cause }); this.name = "FederationPairPublicationError";
  }
}
function pairPlan(workspace: string, path: string, bytes: Uint8Array, directories: readonly string[], options: FederationPublicationOptions): PairPlan {
  return { workspace, path, bytes: Buffer.from(bytes), previous: captureOrgPairs([path]), directories: [...directories], beforeSign: options.beforeSign };
}
function capturePair(plan: PairPlan) {
  return captureRawConfigPair(plan.workspace, plan.path, plan.bytes, { previous: plan.previous, beforePublish: plan.beforeSign });
}
function publishPair(plan: PairPlan, prepared: ReturnType<ReturnType<typeof capturePair>["prepareSync"]>) {
  prepared.assertCurrent();
  // Existing auxiliary directories are setup effects after signing, outside the pair lock and provider waits.
  for (const directory of plan.directories) ensureDir(directory);
  try { return prepared.publish(); }
  catch (cause) {
    if (cause instanceof ConfigSignaturePublicationError) throw new FederationPairPublicationError(
      Object.freeze(cause.publishedPaths.map(path => relative(plan.workspace, path))),
      cause.attemptedPath === null ? null : relative(plan.workspace, cause.attemptedPath), cause);
    throw cause;
  }
}
function publishPairSync(plan: PairPlan) { return publishPair(plan, capturePair(plan).prepareSync()); }
async function publishPairAsync(plan: PairPlan) {
  const captured = captureRawConfigPairForAsync(plan.workspace, plan.path, plan.bytes, { previous: plan.previous, beforePublish: plan.beforeSign });
  return publishPair(plan, await captured.prepare());
}
const signedDigestSchema = z.object({ digestSha256: z.string().length(64), signature: z.string().min(1), signedTs: z.number().int(), signer: z.literal("auditor") });
function verifyCaptured(workspace: string, bytes: Uint8Array, signatureBytes: Uint8Array) {
  const value: unknown = JSON.parse(Buffer.from(signatureBytes).toString("utf8"));
  if (value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "envelope"))
    throw new Error("raw federation signature does not carry an envelope");
  const sig = signedDigestSchema.parse(value), digest = sha256Hex(Buffer.from(bytes));
  if (digest !== sig.digestSha256) return { valid: false, reason: "digest mismatch" };
  const valid = verifyRawConfigSignature(workspace, digest, sig.signature);
  return { valid, reason: valid ? null : "signature verification failed" };
}

function verifySelectedBody(workspace: string, filePath: string, bytes: Uint8Array) {
  const sigPath = `${filePath}.sig`;
  if (!pathExists(sigPath)) return { valid: false, signatureExists: false, reason: "signature missing", sigPath };
  try { return { ...verifyCaptured(workspace, bytes, readFileSync(sigPath)), signatureExists: true, sigPath }; }
  catch (error) { return { valid: false, signatureExists: true, reason: String(error), sigPath }; }
}
export function verifySignedFileWithAuditor(workspace: string, filePath: string): {
  valid: boolean; signatureExists: boolean; reason: string | null; sigPath: string;
} {
  const sigPath = `${filePath}.sig`;
  if (!pathExists(filePath)) return { valid: false, signatureExists: false, reason: "file missing", sigPath };
  if (!pathExists(sigPath)) return { valid: false, signatureExists: false, reason: "signature missing", sigPath };
  try { return verifySelectedBody(workspace, filePath, readFileSync(filePath)); }
  catch (error) { return { valid: false, signatureExists: true, reason: String(error), sigPath }; }
}

export function defaultFederationConfig(params: {
  orgName: string;
  publisherKeyFingerprint: string;
}): FederationConfigFile {
  return federationConfigSchema.parse({
    federation: {
      version: 1,
      orgName: params.orgName,
      orgId: randomUUID(),
      publisherKeyFingerprint: params.publisherKeyFingerprint,
      sharePolicy: {
        allowBenchmarks: true,
        allowCerts: true,
        allowBom: true,
        allowTransparencyRoots: true,
        allowPlugins: false,
        denyEvidenceDb: true
      }
    }
  });
}

function configPlan(workspace: string, config: FederationConfigFile, options: FederationPublicationOptions) {
  const bytes = Buffer.from(YAML.stringify(federationConfigSchema.parse(config)));
  return pairPlan(workspace, federationConfigPath(workspace), bytes, [federationRoot(workspace), federationPeersDir(workspace), federationInboxDir(workspace), federationOutboxDir(workspace)], options);
}
export function initFederationStore(workspace: string, config: FederationConfigFile, options: FederationPublicationOptions = {}): { path: string; sigPath: string } {
  return publishPairSync(configPlan(workspace, config, options));
}
export function initFederationStoreAsync(workspace: string, config: FederationConfigFile, options: FederationPublicationOptions = {}) {
  return publishPairAsync(configPlan(workspace, config, options));
}

export function loadFederationConfig(workspace: string, explicitPath?: string): FederationConfigFile {
  const file = explicitPath ? resolve(workspace, explicitPath) : federationConfigPath(workspace);
  if (!pathExists(file)) {
    throw new Error(`Federation config missing: ${file}`);
  }
  return federationConfigSchema.parse(YAML.parse(readUtf8(file)) as unknown);
}

export function verifyFederationConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = federationConfigPath(workspace);
  const result = verifySignedFileWithAuditor(workspace, path);
  return {
    ...result,
    path
  };
}

type PeerInput = { workspace: string; peerId: string; name: string; publisherPublicKeyPem: string };
function peerPlan(params: PeerInput, options: FederationPublicationOptions) {
  const input = { ...params }, peerIdCheck = safeIdSchema.safeParse(input.peerId);
  if (!peerIdCheck.success) throw new Error(`invalid peer id '${input.peerId}': ${peerIdCheck.error.issues[0]?.message ?? "not a safe id"}`);
  const peer = federationPeerSchema.parse({ v: 1, peerId: input.peerId, name: input.name, publisherPublicKeyPem: input.publisherPublicKeyPem, addedTs: Date.now() });
  const plan = pairPlan(input.workspace, federationPeerPath(input.workspace, input.peerId), Buffer.from(JSON.stringify(peer, null, 2)), [federationPeersDir(input.workspace)], options);
  return { peer, plan };
}
export function addFederationPeer(params: PeerInput, options: FederationPublicationOptions = {}): { path: string; sigPath: string; peer: FederationPeer } {
  const { peer, plan } = peerPlan(params, options); return { ...publishPairSync(plan), peer };
}
export async function addFederationPeerAsync(params: PeerInput, options: FederationPublicationOptions = {}) {
  const { peer, plan } = peerPlan(params, options); return { ...await publishPairAsync(plan), peer };
}

export function listFederationPeers(workspace: string): Array<{
  peer: FederationPeer;
  valid: boolean;
  reason: string | null;
}> {
  if (!pathExists(federationPeersDir(workspace))) {
    return [];
  }
  return readdirSync(federationPeersDir(workspace), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(federationPeersDir(workspace), entry.name))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const bytes = readFileSync(file), peer = federationPeerSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
      const verify = verifySelectedBody(workspace, file, bytes);
      return {
        peer,
        valid: verify.valid,
        reason: verify.reason
      };
    });
}
