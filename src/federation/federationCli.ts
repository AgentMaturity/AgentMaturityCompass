import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureFederationPublisherKey } from "./federationIdentity.js";
import {
  addFederationPeer,
  defaultFederationConfig,
  initFederationStore,
  listFederationPeers,
  loadFederationConfig,
  verifyFederationConfigSignature
} from "./federationStore.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "./federationSync.js";
import type { TrustContext } from "../trust/trustContext.js";

export function federateInitCli(params: {
  workspace: string;
  orgName: string;
}): {
  path: string;
  sigPath: string;
  publisherFingerprint: string;
} {
  const publisher = ensureFederationPublisherKey(params.workspace);
  const initialized = initFederationStore(params.workspace, defaultFederationConfig({
    orgName: params.orgName,
    publisherKeyFingerprint: publisher.fingerprint
  }));
  return {
    ...initialized,
    publisherFingerprint: publisher.fingerprint
  };
}

export function federateVerifyCli(workspace: string): ReturnType<typeof verifyFederationConfigSignature> {
  return verifyFederationConfigSignature(workspace);
}

export function federatePeerAddCli(params: {
  workspace: string;
  peerId: string;
  name: string;
  pubKeyFile: string;
}): ReturnType<typeof addFederationPeer> {
  const pub = readFileSync(resolve(params.workspace, params.pubKeyFile), "utf8");
  return addFederationPeer({
    workspace: params.workspace,
    peerId: params.peerId,
    name: params.name,
    publisherPublicKeyPem: pub
  });
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
