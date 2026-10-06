import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createReleaseBundle } from "../../src/release/releaseBundle.js";
import { ed25519KeyId } from "../../src/trust/index.js";

export interface TinyReleaseBundle {
  /** The signed .amcrelease. */
  file: string;
  /** The signer's public half: what an operator would pin for the release purpose. */
  publicKeyPem: string;
  publicKeyPath: string;
  keyId: string;
}

/**
 * A real signed .amcrelease of a one-file package, written under `root` (an empty directory the caller owns), in
 * the format `amc release pack` writes. A tiny package keeps it fast; it is not the repository's own bundle.
 */
export function tinyReleaseBundle(root: string): TinyReleaseBundle {
  const source = join(root, "source");
  mkdirSync(join(source, "dist"), { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "agent-maturity-compass", version: "1.0.0", license: "MIT", files: ["dist"], scripts: {} }));
  writeFileSync(join(source, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  writeFileSync(join(source, "dist", "index.js"), "export const clean = true;\n");
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPath = join(root, "signing.pem");
  const publicKeyPath = join(root, "signing.pub");
  writeFileSync(privateKeyPath, pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), { mode: 0o600 });
  writeFileSync(publicKeyPath, publicKeyPem);
  const file = join(root, "release.amcrelease");
  createReleaseBundle({ workspace: source, outFile: file, privateKeyPath, skipInstallBuild: true });
  return { file, publicKeyPem, publicKeyPath, keyId: ed25519KeyId(publicKeyPem)! };
}
