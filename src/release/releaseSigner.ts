import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { verifyCanonical } from "../keys/algorithmPolicy.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureReleaseDirs, releasePaths } from "./releasePaths.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import type { ReleaseManifest } from "./releaseSchema.js";

export interface ReleaseInitResult {
  publicKeyPath: string;
  privateKeyPath: string | null;
  fingerprint: string;
  created: boolean;
}

function fingerprint(pubPem: string): string {
  return sha256Hex(Buffer.from(pubPem, "utf8"));
}

export function initReleaseSigningKey(workspace: string, writePrivateTo?: string): ReleaseInitResult {
  const paths = ensureReleaseDirs(workspace);
  const pubPath = paths.publicKeyPath;
  const defaultPrivPath = paths.defaultPrivateKeyPath;
  const existingPub = pathExists(pubPath) ? readFileSync(pubPath, "utf8") : null;
  const created = !existingPub;
  let pubPem = existingPub;
  let privatePath: string | null = null;

  if (!pubPem) {
    const pair = generateKeyPairSync("ed25519");
    pubPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const privPem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    writeFileAtomic(pubPath, pubPem, 0o644);
    if (writePrivateTo) {
      const target = resolve(writePrivateTo);
      writeFileAtomic(target, privPem, 0o600);
      privatePath = target;
    } else {
      privatePath = null;
    }
    return {
      publicKeyPath: pubPath,
      privateKeyPath: privatePath,
      fingerprint: fingerprint(pubPem),
      created
    };
  }

  if (writePrivateTo && pathExists(defaultPrivPath)) {
    const target = resolve(writePrivateTo);
    writeFileAtomic(target, readFileSync(defaultPrivPath), 0o600);
    privatePath = target;
  }

  return {
    publicKeyPath: pubPath,
    privateKeyPath: privatePath,
    fingerprint: fingerprint(pubPem),
    created
  };
}

export function loadReleasePrivateKey(explicitPath?: string): string {
  if (explicitPath) {
    return readFileSync(resolve(explicitPath), "utf8");
  }
  const keyFile = process.env.AMC_RELEASE_SIGNING_KEY_FILE;
  if (keyFile && keyFile.trim().length > 0) {
    return readFileSync(resolve(keyFile.trim()), "utf8");
  }
  const keyB64 = process.env.AMC_RELEASE_SIGNING_KEY;
  if (keyB64 && keyB64.trim().length > 0) {
    return Buffer.from(keyB64.trim(), "base64").toString("utf8");
  }
  throw new Error("Missing release signing private key. Set AMC_RELEASE_SIGNING_KEY_FILE or AMC_RELEASE_SIGNING_KEY.");
}

export function loadReleasePublicKey(workspace: string): string {
  const path = releasePaths(workspace).publicKeyPath;
  if (!pathExists(path)) {
    throw new Error(`Missing release public key at ${path}. Run \`amc release init\`.`);
  }
  return readFileSync(path, "utf8");
}

export function signReleaseManifest(manifest: ReleaseManifest, privateKeyPem: string): string {
  const payload = Buffer.from(canonicalize(manifest), "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  return sign(null, payload, privateKey).toString("base64");
}

export function verifyReleaseManifest(manifest: ReleaseManifest, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const payload = Buffer.from(canonicalize(manifest), "utf8");
    return verifyCanonical(manifest.signing.algorithm, payload, publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function releasePublicKeyFingerprint(publicKeyPem: string): string {
  return fingerprint(publicKeyPem);
}
