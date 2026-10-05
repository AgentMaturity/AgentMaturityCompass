import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { federationConfigSchema, federationPeerSchema, type FederationConfigFile, type FederationPeer } from "./federationSchema.js";

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function federationRoot(workspace: string): string {
  return join(workspace, ".amc", "federation");
}

export function federationConfigPath(workspace: string): string {
  return join(federationRoot(workspace), "federation.yaml");
}

export function federationConfigSigPath(workspace: string): string {
  return `${federationConfigPath(workspace)}.sig`;
}

export function federationPeersDir(workspace: string): string {
  return join(federationRoot(workspace), "peers");
}

export function federationInboxDir(workspace: string): string {
  return join(federationRoot(workspace), "inbox");
}

export function federationOutboxDir(workspace: string): string {
  return join(federationRoot(workspace), "outbox");
}

export function federationPeerPath(workspace: string, peerId: string): string {
  return join(federationPeersDir(workspace), `${peerId}.json`);
}

function signFileWithAuditor(workspace: string, filePath: string): string {
  const digest = sha256Hex(readFileSync(filePath));
  const payload: SignedDigest = {
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = `${filePath}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function verifySignedFileWithAuditor(workspace: string, filePath: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  sigPath: string;
} {
  const sigPath = `${filePath}.sig`;
  if (!pathExists(filePath)) {
    return { valid: false, signatureExists: false, reason: "file missing", sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "signature missing", sigPath };
  }
  try {
    const sig = z
      .object({
        digestSha256: z.string().length(64),
        signature: z.string().min(1),
        signedTs: z.number().int(),
        signer: z.literal("auditor")
      })
      .parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(filePath));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", sigPath };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      sigPath
    };
  }
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

export function initFederationStore(workspace: string, config: FederationConfigFile): {
  path: string;
  sigPath: string;
} {
  ensureDir(federationRoot(workspace));
  ensureDir(federationPeersDir(workspace));
  ensureDir(federationInboxDir(workspace));
  ensureDir(federationOutboxDir(workspace));
  const path = federationConfigPath(workspace);
  writeFileAtomic(path, YAML.stringify(federationConfigSchema.parse(config)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
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

export function addFederationPeer(params: {
  workspace: string;
  peerId: string;
  name: string;
  publisherPublicKeyPem: string;
}): {
  path: string;
  sigPath: string;
  peer: FederationPeer;
} {
  ensureDir(federationPeersDir(params.workspace));
  const peer = federationPeerSchema.parse({
    v: 1,
    peerId: params.peerId,
    name: params.name,
    publisherPublicKeyPem: params.publisherPublicKeyPem,
    addedTs: Date.now()
  });
  const path = federationPeerPath(params.workspace, params.peerId);
  writeFileAtomic(path, JSON.stringify(peer, null, 2), 0o644);
  return {
    path,
    sigPath: signFileWithAuditor(params.workspace, path),
    peer
  };
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
      const peer = federationPeerSchema.parse(JSON.parse(readUtf8(file)) as unknown);
      const verify = verifySignedFileWithAuditor(workspace, file);
      return {
        peer,
        valid: verify.valid,
        reason: verify.reason
      };
    });
}
