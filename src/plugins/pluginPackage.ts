import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { scanDirectoryForSecrets, secretScanSchema } from "../release/releaseSecretScan.js";
import {
  pluginManifestSchema,
  pluginManifestSignatureSchema,
  type PluginManifest,
  type PluginManifestSignature
} from "./pluginManifestSchema.js";
import {
  derivePublisherPublicKeyPem,
  loadPublisherPrivateKey,
  publisherFingerprintFromPublicPem,
  signPluginManifest,
  verifyPluginManifestSignature
} from "./pluginSigner.js";
import type { PluginArtifactKind } from "./pluginTypes.js";
import {
  assertSafeTarMemberPath,
  extractValidatedTarGzipArchive,
  inspectTarGzipArchive,
  type TarArchiveLimits,
} from "../security/safeTarArchive.js";

const PLUGIN_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};

function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function tarCreate(sourceDir: string, outFile: string): void {
  ensureDir(dirname(resolve(outFile)));
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create plugin archive: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

export function assertSafePluginArchiveMember(rawPath: string): string {
  return assertSafeTarMemberPath({
    rawPath,
    label: "plugin archive",
    maxPathBytes: PLUGIN_ARCHIVE_LIMITS.maxPathBytes,
  });
}

function validatePluginArchive(file: string): void {
  inspectTarGzipArchive({ file, label: "plugin archive", limits: PLUGIN_ARCHIVE_LIMITS });
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({
    file: bundleFile,
    destination: outDir,
    label: "plugin archive",
    limits: PLUGIN_ARCHIVE_LIMITS,
  });
}

function resolvePluginRoot(dir: string): string {
  const candidate = join(dir, "amc-plugin");
  if (pathExists(candidate)) {
    return candidate;
  }
  const children = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const child of children) {
    const inner = join(dir, child.name);
    if (pathExists(join(inner, "manifest.json")) && pathExists(join(inner, "content"))) {
      return inner;
    }
  }
  return dir;
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function artifactKindForPath(path: string): PluginArtifactKind {
  if (path.startsWith("content/policy-packs/")) return "policy_pack";
  if (path.startsWith("content/assurance-packs/")) return "assurance_pack";
  if (path.startsWith("content/compliance-maps/")) return "compliance_map";
  if (path.startsWith("content/adapters/")) return "adapter";
  if (path.startsWith("content/outcomes/")) return "outcome_template";
  if (path.startsWith("content/casebooks/")) return "casebook_template";
  if (path.startsWith("content/transform/interventions/")) return "transform_intervention_library";
  if (path.startsWith("content/transform/")) return "transform_overlay";
  if (path.startsWith("content/learn/")) return "learn_md";
  throw new Error(`unsupported plugin artifact path: ${path}`);
}

function computeManifestFromInput(inputDir: string, publisherFingerprint: string): PluginManifest {
  const manifestPath = join(inputDir, "manifest.json");
  const contentDir = join(inputDir, "content");
  if (!pathExists(manifestPath)) {
    throw new Error(`plugin manifest missing: ${manifestPath}`);
  }
  if (!pathExists(contentDir)) {
    throw new Error(`plugin content directory missing: ${contentDir}`);
  }
  const base = pluginManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
  const files = collectFiles(contentDir).map((path) => `content/${path}`);
  const artifacts = files.map((path) => {
    const file = join(inputDir, path);
    return {
      path,
      sha256: sha256Hex(readFileSync(file)),
      bytes: statSync(file).size,
      kind: artifactKindForPath(path)
    };
  });
  return pluginManifestSchema.parse({
    ...base,
    plugin: {
      ...base.plugin,
      publisher: {
        ...base.plugin.publisher,
        pubkeyFingerprint: publisherFingerprint
      }
    },
    artifacts,
    generatedTs: Date.now(),
    signing: {
      algorithm: "ed25519",
      pubkeyFingerprint: publisherFingerprint
    }
  });
}

function verifySecretSafety(rootDir: string): void {
  const scan = secretScanSchema.parse(scanDirectoryForSecrets(rootDir));
  if (scan.status !== "PASS") {
    const top = scan.findings.filter((f) => f.severity === "HIGH").slice(0, 10);
    throw new Error(`plugin secret scan failed: ${top.map((f) => `${f.type}:${f.path}`).join(", ")}`);
  }
}

export function pluginKeygen(params: { outDir: string }): {
  privateKeyPath: string;
  publicKeyPath: string;
  fingerprint: string;
} {
  const outDir = resolve(params.outDir);
  ensureDir(outDir);
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPath = join(outDir, "publisher.key");
  const publicKeyPath = join(outDir, "publisher.pub");
  writeFileAtomic(privateKeyPath, privatePem, 0o600);
  chmodSync(privateKeyPath, 0o600);
  writeFileAtomic(publicKeyPath, publicPem, 0o644);
  return {
    privateKeyPath,
    publicKeyPath,
    fingerprint: publisherFingerprintFromPublicPem(publicPem)
  };
}

export function pluginPack(params: {
  inputDir: string;
  keyPath: string;
  outFile: string;
}): {
  outFile: string;
  manifest: PluginManifest;
  signature: PluginManifestSignature;
} {
  const inputDir = resolve(params.inputDir);
  const outFile = resolve(params.outFile);
  const privateKeyPem = loadPublisherPrivateKey(resolve(params.keyPath));
  const publisherPub = derivePublisherPublicKeyPem(privateKeyPem);
  const publisherFingerprint = publisherFingerprintFromPublicPem(publisherPub);

  verifySecretSafety(inputDir);
  const manifest = computeManifestFromInput(inputDir, publisherFingerprint);
  const signature = pluginManifestSignatureSchema.parse(signPluginManifest(manifest, privateKeyPem));

  const tmp = mkdtempSync(join(tmpdir(), "amc-plugin-pack-"));
  try {
    const root = join(tmp, "amc-plugin");
    ensureDir(root);
    ensureDir(join(root, "content"));
    copyTree(join(inputDir, "content"), join(root, "content"));
    writeFileAtomic(join(root, "manifest.json"), `${canonicalize(manifest)}\n`, 0o644);
    writeFileAtomic(join(root, "manifest.sig"), `${canonicalize(signature)}\n`, 0o644);
    writeFileAtomic(join(root, "publisher.pub"), publisherPub, 0o644);
    tarCreate(tmp, outFile);
  } finally {
    cleanupDir(tmp);
  }

  return {
    outFile,
    manifest,
    signature
  };
}

export function verifyPluginPackage(params: {
  file: string;
  pubkeyPath?: string;
}): {
  ok: boolean;
  errors: string[];
  manifest: PluginManifest | null;
  publisherFingerprint: string | null;
} {
  const file = resolve(params.file);
  const errors: string[] = [];
  const tmp = mkdtempSync(join(tmpdir(), "amc-plugin-verify-"));
  try {
    tarExtract(file, tmp);
    const root = resolvePluginRoot(tmp);
    const manifestPath = join(root, "manifest.json");
    const signaturePath = join(root, "manifest.sig");
    const publisherPubPath = params.pubkeyPath ? resolve(params.pubkeyPath) : join(root, "publisher.pub");
    if (!pathExists(manifestPath) || !pathExists(signaturePath) || !pathExists(publisherPubPath)) {
      return {
        ok: false,
        errors: ["plugin bundle missing manifest/signature/publisher key"],
        manifest: null,
        publisherFingerprint: null
      };
    }
    let manifest: PluginManifest | null = null;
    let signature: PluginManifestSignature | null = null;
    try {
      manifest = pluginManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
    } catch (error) {
      errors.push(`invalid manifest.json: ${String(error)}`);
    }
    try {
      signature = pluginManifestSignatureSchema.parse(JSON.parse(readUtf8(signaturePath)) as unknown);
    } catch (error) {
      errors.push(`invalid manifest.sig: ${String(error)}`);
    }
    const publisherPub = readUtf8(publisherPubPath);
    const publisherFingerprint = publisherFingerprintFromPublicPem(publisherPub);
    if (manifest) {
      if (manifest.plugin.publisher.pubkeyFingerprint !== publisherFingerprint) {
        errors.push("manifest publisher fingerprint does not match publisher.pub");
      }
      if (manifest.signing.pubkeyFingerprint !== publisherFingerprint) {
        errors.push("manifest signing fingerprint does not match publisher.pub");
      }
      for (const artifact of manifest.artifacts) {
        const full = join(root, artifact.path);
        if (!pathExists(full)) {
          errors.push(`missing artifact file: ${artifact.path}`);
          continue;
        }
        const bytes = readFileSync(full);
        const digest = sha256Hex(bytes);
        if (digest !== artifact.sha256) {
          errors.push(`artifact sha mismatch: ${artifact.path}`);
        }
        if (bytes.length !== artifact.bytes) {
          errors.push(`artifact size mismatch: ${artifact.path}`);
        }
      }
    }
    if (manifest && signature) {
      const expectedDigest = sha256Hex(Buffer.from(canonicalize(manifest), "utf8"));
      if (expectedDigest !== signature.digestSha256) {
        errors.push("manifest signature digest mismatch");
      } else if (!verifyPluginManifestSignature(manifest, signature.signature, publisherPub)) {
        errors.push("manifest signature verification failed");
      }
    }
    try {
      verifySecretSafety(root);
    } catch (error) {
      errors.push(String(error));
    }
    return {
      ok: errors.length === 0,
      errors,
      manifest,
      publisherFingerprint
    };
  } finally {
    cleanupDir(tmp);
  }
}

export function printPluginPackage(file: string): {
  file: string;
  pluginId: string | null;
  version: string | null;
  publisherFingerprint: string | null;
  artifactCount: number;
  verification: { ok: boolean; errors: string[] };
} {
  const verified = verifyPluginPackage({ file });
  return {
    file: resolve(file),
    pluginId: verified.manifest?.plugin.id ?? null,
    version: verified.manifest?.plugin.version ?? null,
    publisherFingerprint: verified.publisherFingerprint,
    artifactCount: verified.manifest?.artifacts.length ?? 0,
    verification: {
      ok: verified.ok,
      errors: verified.errors
    }
  };
}

export function extractPluginPackage(file: string, outputDir: string): {
  rootDir: string;
} {
  const outDir = resolve(outputDir);
  ensureDir(outDir);
  tarExtract(resolve(file), outDir);
  return {
    rootDir: resolvePluginRoot(outDir)
  };
}
