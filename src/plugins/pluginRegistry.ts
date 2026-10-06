import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { verifyPluginPackage } from "./pluginPackage.js";
import { checkSignature, loadTrustContext, untrustedReasons, verdictExitCode, buildVerifierReport, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import {
  pluginRegistryIndexSchema,
  pluginRegistryIndexSignatureSchema,
  type PluginRegistryIndex
} from "./pluginRegistrySchema.js";
import { publisherFingerprintFromPublicPem } from "./pluginSigner.js";

function registryIndexPath(dir: string): string {
  return join(dir, "index.json");
}

function registryIndexSigPath(dir: string): string {
  return join(dir, "index.sig");
}

function registryPubPath(dir: string): string {
  return join(dir, "registry.pub");
}

function registryKeyPath(dir: string): string {
  return join(dir, "registry.key");
}

function signIndex(index: PluginRegistryIndex, privatePem: string) {
  const payload = Buffer.from(canonicalize(index), "utf8");
  const digest = sha256Hex(payload);
  const signature = sign(null, payload, createPrivateKey(privatePem)).toString("base64");
  return pluginRegistryIndexSignatureSchema.parse({
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "registry"
  });
}

function verifyIndex(index: PluginRegistryIndex, sigB64: string, pubPem: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalize(index), "utf8"),
      createPublicKey(pubPem),
      Buffer.from(sigB64, "base64")
    );
  } catch {
    return false;
  }
}

function loadIndex(dir: string): PluginRegistryIndex {
  const indexPath = registryIndexPath(dir);
  if (!pathExists(indexPath)) {
    throw new Error(`registry index missing: ${indexPath}`);
  }
  return pluginRegistryIndexSchema.parse(JSON.parse(readUtf8(indexPath)) as unknown);
}

function saveIndex(dir: string, index: PluginRegistryIndex, privatePem: string): void {
  const indexPath = registryIndexPath(dir);
  const sigPath = registryIndexSigPath(dir);
  writeFileAtomic(indexPath, `${canonicalize(index)}\n`, 0o644);
  const signature = signIndex(index, privatePem);
  writeFileAtomic(sigPath, `${canonicalize(signature)}\n`, 0o644);
}

function packageTargetPath(dir: string, pluginId: string, version: string): string {
  return join(dir, "packages", pluginId, version, "plugin.amcplug");
}

export function initPluginRegistry(params: {
  dir: string;
  registryId?: string;
  registryName?: string;
}): {
  dir: string;
  indexPath: string;
  sigPath: string;
  pubPath: string;
  keyPath: string;
  fingerprint: string;
} {
  const dir = resolve(params.dir);
  ensureDir(dir);
  ensureDir(join(dir, "packages"));
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyPath = registryKeyPath(dir);
  const pubPath = registryPubPath(dir);
  writeFileAtomic(keyPath, privatePem, 0o600);
  writeFileAtomic(pubPath, publicPem, 0o644);

  const index = pluginRegistryIndexSchema.parse({
    v: 1,
    registry: {
      id: params.registryId ?? `amc.registry.${Date.now()}`,
      name: params.registryName ?? "AMC Registry",
      issuerFingerprint: publisherFingerprintFromPublicPem(publicPem),
      updatedTs: Date.now()
    },
    plugins: []
  });
  saveIndex(dir, index, privatePem);
  return {
    dir,
    indexPath: registryIndexPath(dir),
    sigPath: registryIndexSigPath(dir),
    pubPath,
    keyPath,
    fingerprint: index.registry.issuerFingerprint
  };
}

/**
 * Verifies a plugin registry directory. registry.pub and --pubkey only locate the signer; index.sig needs a key the
 * trust context admits for artifact-seal (P0-09). ok equals report.trusted.
 */
export function verifyPluginRegistry(dirRaw: string, trust: TrustContext, pubkeyPath?: string): {
  ok: boolean;
  errors: string[];
  index: PluginRegistryIndex | null;
  report: VerifierReportV1;
} {
  const dir = resolve(dirRaw);
  const errors: string[] = [];
  const signatures: VerifierReportV1["issuerAdmission"]["signatures"] = [];
  const indexPath = registryIndexPath(dir);
  const sigPath = registryIndexSigPath(dir);
  const pubPath = registryPubPath(dir);
  let index: PluginRegistryIndex | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "plugin-registry", path: dir, sha256: pathExists(indexPath) ? sha256Hex(readFileSync(indexPath)) : "0".repeat(64) },
      context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, index, report };
  };
  if (!pathExists(indexPath) || !pathExists(sigPath) || !pathExists(pubPath)) {
    errors.push("registry missing index/index.sig/registry.pub");
    return finish();
  }
  try {
    index = loadIndex(dir);
  } catch (error) {
    errors.push(`invalid index.json: ${String(error)}`);
  }
  try {
    const sig = pluginRegistryIndexSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const parsed = index;
    if (parsed) {
      const payloadDigest = sha256Hex(Buffer.from(canonicalize(parsed), "utf8"));
      if (payloadDigest !== sig.digestSha256) {
        errors.push("index signature digest mismatch");
      }
      const check = checkSignature({ signature: "index.sig", purpose: "artifact-seal", context: trust, claimedSignedAt: sig.signedTs,
        candidates: [pubkeyPath ? readUtf8(resolve(pubkeyPath)) : null, readUtf8(pubPath)], verify: (pem) => verifyIndex(parsed, sig.signature, pem) });
      signatures.push(check.admission);
      if (!check.verified) {
        errors.push("index signature verification failed");
      }
      if (parsed.registry.issuerFingerprint !== check.admission.keyId) {
        errors.push("index issuer fingerprint does not match registry.pub");
      }
    }
  } catch (error) {
    errors.push(`invalid index.sig: ${String(error)}`);
  }
  if (index) {
    for (const plugin of index.plugins) {
      for (const version of plugin.versions) {
        const packagePath = join(dir, version.url);
        const shaPath = `${packagePath}.sha256`;
        if (!pathExists(packagePath)) {
          errors.push(`missing package file: ${version.url}`);
          continue;
        }
        const digest = sha256Hex(readFileSync(packagePath));
        if (digest !== version.sha256) {
          errors.push(`package sha mismatch: ${version.url}`);
        }
        if (pathExists(shaPath)) {
          const shaFile = readUtf8(shaPath).trim();
          if (shaFile !== digest) {
            errors.push(`package sha file mismatch: ${version.url}.sha256`);
          }
        }
      }
    }
  }
  return finish();
}

export function publishPluginToRegistry(params: {
  dir: string;
  pluginFile: string;
  registryKeyPath: string;
}): {
  pluginId: string;
  version: string;
  targetPath: string;
  indexPath: string;
  sigPath: string;
} {
  const dir = resolve(params.dir);
  const pluginFile = resolve(params.pluginFile);
  const registryKey = readUtf8(resolve(params.registryKeyPath));
  // Integrity only: publishing is the registry operator vouching for this publisher, by signing the index that names it.
  const verified = verifyPluginPackage({ file: pluginFile, trust: { ...loadTrustContext(), allowUnpinned: true } });
  if (verdictExitCode(verified.report) === 1 || !verified.manifest || !verified.publisherFingerprint) {
    throw new Error(`plugin verify failed before publish: ${untrustedReasons(verified.report).join("; ")}`);
  }
  const index = loadIndex(dir);
  const pluginId = verified.manifest.plugin.id;
  const version = verified.manifest.plugin.version;
  const target = packageTargetPath(dir, pluginId, version);
  ensureDir(dirname(target));
  copyFileSync(pluginFile, target);
  const digest = sha256Hex(readFileSync(target));
  writeFileAtomic(`${target}.sha256`, `${digest}\n`, 0o644);

  const rel = relative(dir, target).replace(/\\/g, "/");
  const pluginEntry = index.plugins.find((row) => row.id === pluginId);
  if (!pluginEntry) {
    index.plugins.push({
      id: pluginId,
      versions: [
        {
          version,
          sha256: digest,
          url: rel,
          publisherFingerprint: verified.publisherFingerprint,
          riskCategory: verified.manifest.plugin.risk.category
        }
      ]
    });
  } else {
    const existingVersion = pluginEntry.versions.find((row) => row.version === version);
    if (existingVersion) {
      existingVersion.sha256 = digest;
      existingVersion.url = rel;
      existingVersion.publisherFingerprint = verified.publisherFingerprint;
      existingVersion.riskCategory = verified.manifest.plugin.risk.category;
    } else {
      pluginEntry.versions.push({
        version,
        sha256: digest,
        url: rel,
        publisherFingerprint: verified.publisherFingerprint,
        riskCategory: verified.manifest.plugin.risk.category
      });
      pluginEntry.versions.sort((a, b) => a.version.localeCompare(b.version));
    }
  }
  index.plugins.sort((a, b) => a.id.localeCompare(b.id));
  index.registry.updatedTs = Date.now();
  saveIndex(dir, pluginRegistryIndexSchema.parse(index), registryKey);
  return {
    pluginId,
    version,
    targetPath: target,
    indexPath: registryIndexPath(dir),
    sigPath: registryIndexSigPath(dir)
  };
}

function staticContentType(path: string): string {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".sig")) return "application/json; charset=utf-8";
  if (path.endsWith(".pub")) return "text/plain; charset=utf-8";
  if (path.endsWith(".sha256")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export async function servePluginRegistry(params: {
  dir: string;
  port: number;
  host?: string;
}): Promise<{
  host: string;
  port: number;
  close: () => Promise<void>;
}> {
  const dir = resolve(params.dir);
  const host = params.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const normalized = normalize(urlPath.replace(/^\/+/, ""));
    if (normalized.includes("..") || normalized.endsWith("/")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const file = normalized.length === 0 ? join(dir, "index.json") : join(dir, normalized);
    if (!pathExists(file) || statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", staticContentType(file));
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("cache-control", "no-store");
    if (method === "HEAD") {
      res.end();
      return;
    }
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolvePromise) => server.listen(params.port, host, () => resolvePromise()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : params.port;
  return {
    host,
    port,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) =>
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()))
      )
  };
}

export function readRegistryPublicKey(dirRaw: string): string {
  return readUtf8(registryPubPath(resolve(dirRaw)));
}

export function readRegistryIndex(dirRaw: string): PluginRegistryIndex {
  return loadIndex(resolve(dirRaw));
}

export function registryFingerprintFromPub(pubPem: string): string {
  return publisherFingerprintFromPublicPem(pubPem);
}

export function parsePluginRef(input: string): { pluginId: string; version: string | null } {
  const trimmed = input.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) {
    return {
      pluginId: trimmed,
      version: null
    };
  }
  return {
    pluginId: trimmed.slice(0, at),
    version: trimmed.slice(at + 1)
  };
}

export const pluginRegistryBrowseSchema = z.object({
  plugins: z.array(
    z.object({
      id: z.string().min(1),
      versions: z.array(
        z.object({
          version: z.string().min(1),
          sha256: z.string().length(64),
          publisherFingerprint: z.string().length(64),
          riskCategory: z.string().min(1),
          url: z.string().min(1)
        })
      )
    })
  )
});
