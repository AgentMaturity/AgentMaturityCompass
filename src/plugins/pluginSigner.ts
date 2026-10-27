import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { verifyCanonical } from "../keys/algorithmPolicy.js";
import { readFileSync } from "node:fs";
import { sha256Hex } from "../utils/hash.js";
import type { PluginManifest } from "./pluginManifestSchema.js";
import { canonicalize } from "../utils/json.js";

export function loadPublisherPrivateKey(path: string): string {
  return readFileSync(path, "utf8");
}

export function derivePublisherPublicKeyPem(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ format: "pem", type: "spki" })
    .toString();
}

export function publisherFingerprintFromPublicPem(publicPem: string): string {
  return sha256Hex(Buffer.from(publicPem, "utf8"));
}

export function signPluginManifest(manifest: PluginManifest, privateKeyPem: string): {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "publisher";
} {
  const payload = Buffer.from(canonicalize(manifest), "utf8");
  const digestSha256 = sha256Hex(payload);
  const signature = sign(null, payload, createPrivateKey(privateKeyPem)).toString("base64");
  return {
    digestSha256,
    signature,
    signedTs: Date.now(),
    signer: "publisher"
  };
}

export function verifyPluginManifestSignature(
  manifest: PluginManifest,
  signatureB64: string,
  publicKeyPem: string
): boolean {
  const payload = Buffer.from(canonicalize(manifest), "utf8");
  try {
    return verifyCanonical(manifest.signing.algorithm, payload, publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

