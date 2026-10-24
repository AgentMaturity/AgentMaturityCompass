import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { captureFederationPublisherIdentity, ensureFederationPublisherKey } from "./federationIdentity.js";
import {
  addFederationPeer, addFederationPeerAsync,
  defaultFederationConfig,
  initFederationStore, initFederationStoreAsync, FederationPairPublicationError,
  listFederationPeers,
  loadFederationConfig,
  verifyFederationConfigSignature
} from "./federationStore.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "./federationSync.js";
import type { TrustContext } from "../trust/trustContext.js";

type InitInput = { workspace: string; orgName: string };
export class FederationInitializationError extends Error {
  readonly code = "FEDERATION_INITIALIZATION_INCOMPLETE";
  readonly publisherPreparationMayHaveChanged = true;
  readonly publishedPaths: readonly string[];
  readonly attemptedPath: string | null;
  constructor(readonly phase: "publisher-preparation" | "publisher-selection" | "config-pair", readonly publisherPreparationCompleted: boolean, cause: unknown) {
    super("federation initialization is incomplete; publisher preparation may have persisted before refusal", { cause }); this.name = "FederationInitializationError";
    this.publishedPaths = Object.freeze(cause instanceof FederationPairPublicationError ? [...cause.publishedPaths] : []);
    this.attemptedPath = cause instanceof FederationPairPublicationError ? cause.attemptedPath : null;
  }
}
function initPlan(params: InitInput) {
  const workspace = params.workspace, orgName = params.orgName;
  let publisher: ReturnType<typeof ensureFederationPublisherKey>;
  // Actual ensure may write its two custom secrets sequentially. Failure does not establish absence of an effect.
  try { publisher = ensureFederationPublisherKey(workspace); }
  catch (cause) { throw new FederationInitializationError("publisher-preparation", false, cause); }
  try {
    const beforeSign = captureFederationPublisherIdentity(workspace, publisher);
    const config = defaultFederationConfig({ orgName, publisherKeyFingerprint: publisher.fingerprint });
    return { workspace, config, beforeSign, publisherFingerprint: publisher.fingerprint };
  } catch (cause) { throw new FederationInitializationError("publisher-selection", true, cause); }
}
export function federateInitCli(params: InitInput): { path: string; sigPath: string; publisherFingerprint: string } {
  const plan = initPlan(params);
  try { return { ...initFederationStore(plan.workspace, plan.config, { beforeSign: plan.beforeSign }), publisherFingerprint: plan.publisherFingerprint }; }
  catch (cause) { throw new FederationInitializationError("config-pair", true, cause); }
}
export async function federateInitCliAsync(params: InitInput) {
  const plan = initPlan(params);
  try { return { ...await initFederationStoreAsync(plan.workspace, plan.config, { beforeSign: plan.beforeSign }), publisherFingerprint: plan.publisherFingerprint }; }
  catch (cause) { throw new FederationInitializationError("config-pair", true, cause); }
}

export function federateVerifyCli(workspace: string): ReturnType<typeof verifyFederationConfigSignature> {
  return verifyFederationConfigSignature(workspace);
}

type PeerFileInput = { workspace: string; peerId: string; name: string; pubKeyFile: string };
function peerFilePlan(params: PeerFileInput) {
  const workspace = params.workspace, peerId = params.peerId, name = params.name;
  const path = resolve(workspace, params.pubKeyFile), selected = captureOrgFiles([path]), bytes = orgPairBytes(selected, path);
  if (bytes === null) {
    readFileSync(path, "utf8"); // Preserve the actual native missing/read error; a newly appeared file is not the captured input.
    throw new Error("publisher public key file appeared after selection; retry");
  }
  // Called by the store only after its real safe-id validation, before any purpose await and before publication.
  const beforeSign = () => {
    assertOrgPairsCurrent(selected);
    const target = resolve(workspace, ".amc", "federation", "peers", `${peerId}.json`), destinations = captureOrgPairs([target]);
    const source = selected.members[0]!;
    if (destinations.members.some(row => resolve(row.path) === path || (source.identity !== null && row.identity === source.identity)))
      throw new Error("publisher public key input aliases a federation peer output");
  };
  return { input: { workspace, peerId, name, publisherPublicKeyPem: bytes.toString("utf8") }, beforeSign };
}
export function federatePeerAddCli(params: PeerFileInput): ReturnType<typeof addFederationPeer> {
  const plan = peerFilePlan(params); return addFederationPeer(plan.input, { beforeSign: plan.beforeSign });
}
export async function federatePeerAddCliAsync(params: PeerFileInput) {
  const plan = peerFilePlan(params); return addFederationPeerAsync(plan.input, { beforeSign: plan.beforeSign });
}

export function federatePeerListCli(workspace: string): ReturnType<typeof listFederationPeers> {
  return listFederationPeers(workspace);
}

export function federateExportCli(params: {
  workspace: string;
  outFile: string;
}): ReturnType<typeof exportFederationPackage> {
  return exportFederationPackage(params);
}

export function federateImportCli(params: {
  workspace: string;
  bundleFile: string;
}): ReturnType<typeof importFederationPackage> {
  return importFederationPackage(params);
}

export function federateInspectCli(workspace: string): ReturnType<typeof loadFederationConfig> {
  return loadFederationConfig(workspace);
}

export function federateVerifyBundleCli(bundleFile: string, trust: TrustContext, pubkeyPath?: string): ReturnType<typeof verifyFederationPackage> {
  return verifyFederationPackage(bundleFile, trust, pubkeyPath);
}
