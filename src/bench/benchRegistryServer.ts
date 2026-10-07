import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { copyFileSync, readFileSync, statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import {
  benchRegistryIndexSchema,
  benchRegistryIndexSignatureSchema,
  type BenchRegistryIndex
} from "./benchRegistrySchema.js";
import { inspectBenchArtifact } from "./benchArtifact.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";
import {
  buildVerifierReport, checkSignature, loadTrustContext, untrustedReasons, verdictExitCode,
  type IssuerAdmission, type TrustContext, type VerifierReportV1
} from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";

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

function fingerprintForPublicPem(publicPem: string): string {
  return sha256Hex(Buffer.from(publicPem, "utf8"));
}

function signIndex(index: BenchRegistryIndex, privatePem: string) {
  const payload = Buffer.from(canonicalize(index), "utf8");
  const digest = sha256Hex(payload);
  const signature = sign(null, payload, privatePem).toString("base64");
  return benchRegistryIndexSignatureSchema.parse({
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "registry"
  });
}

function verifyIndex(index: BenchRegistryIndex, sigRaw: string, pubPem: string): {
  ok: boolean;
  reason: string | null;
} {
  try {
    const parsed = benchRegistryIndexSignatureSchema.parse(JSON.parse(sigRaw) as unknown);
    const payload = Buffer.from(canonicalize(index), "utf8");
    const digest = sha256Hex(payload);
    if (digest !== parsed.digestSha256) {
      return { ok: false, reason: "digest mismatch" };
    }
    const valid = verify(null, payload, createPublicKey(pubPem), Buffer.from(parsed.signature, "base64"));
    return {
      ok: valid,
      reason: valid ? null : "signature verification failed"
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(error)
    };
  }
}

function loadIndex(dir: string): BenchRegistryIndex {
  return benchRegistryIndexSchema.parse(JSON.parse(readUtf8(registryIndexPath(dir))) as unknown);
}

function saveIndex(dir: string, index: BenchRegistryIndex, privatePem: string): void {
  const normalized = benchRegistryIndexSchema.parse(index);
  writeFileAtomic(registryIndexPath(dir), `${canonicalize(normalized)}\n`, 0o644);
  const sig = signIndex(normalized, privatePem);
  writeFileAtomic(registryIndexSigPath(dir), `${canonicalize(sig)}\n`, 0o644);
}

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b);
}

function deriveRiskCategory(benchTrustLabel: "LOW" | "MEDIUM" | "HIGH"): "LOW" | "MEDIUM" | "HIGH" {
  if (benchTrustLabel === "LOW") {
    return "HIGH";
  }
  if (benchTrustLabel === "MEDIUM") {
    return "MEDIUM";
  }
  return "LOW";
}

export function initBenchRegistry(params: {
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
  ensureDir(join(dir, "benches"));
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  writeFileAtomic(registryKeyPath(dir), privatePem, 0o600);
  writeFileAtomic(registryPubPath(dir), publicPem, 0o644);

  const index = benchRegistryIndexSchema.parse({
    v: 1,
    registry: {
      id: params.registryId ?? `amc.bench.registry.${Date.now()}`,
      name: params.registryName ?? "AMC Bench Registry",
      issuerFingerprint: fingerprintForPublicPem(publicPem),
      updatedTs: Date.now()
    },
    benches: []
  });
  saveIndex(dir, index, privatePem);
  return {
    dir,
    indexPath: registryIndexPath(dir),
    sigPath: registryIndexSigPath(dir),
    pubPath: registryPubPath(dir),
    keyPath: registryKeyPath(dir),
    fingerprint: index.registry.issuerFingerprint
  };
}

/** registry.pub and --pubkey only locate the index signer; admitKey decides whether it is pinned for artifact-seal (P0-51). */
export function verifyBenchRegistry(dirRaw: string, trust: TrustContext, pubkeyPath?: string): {
  ok: boolean;
  errors: string[];
  index: BenchRegistryIndex | null;
  report: VerifierReportV1;
} {
  const dir = resolve(dirRaw);
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let index: BenchRegistryIndex | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "bench-registry", path: dir, sha256: fileSha256(registryIndexPath(dir)) },
      context: trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, index, report };
  };
  if (!pathExists(registryIndexPath(dir)) || !pathExists(registryIndexSigPath(dir)) || !pathExists(registryPubPath(dir))) {
    errors.push("registry missing index/index.sig/registry.pub");
    return finish();
  }
  try {
    index = loadIndex(dir);
  } catch (error) {
    errors.push(`invalid index.json: ${String(error)}`);
  }
  const pubPem = readUtf8(registryPubPath(dir));
  if (index) {
    const parsed = index;
    const sigRaw = readUtf8(registryIndexSigPath(dir));
    try {
      const sig = benchRegistryIndexSignatureSchema.parse(JSON.parse(sigRaw) as unknown);
      const check = checkSignature({ signature: "index.sig", purpose: "artifact-seal", context: trust, claimedSignedAt: sig.signedTs,
        candidates: [pubkeyPath ? readUtf8(resolve(pubkeyPath)) : null, pubPem], verify: (pem) => verifyIndex(parsed, sigRaw, pem).ok });
      signatures.push(check.admission);
      if (!check.verified) {
        errors.push(`index signature invalid: ${verifyIndex(parsed, sigRaw, pubPem).reason ?? "unknown"}`);
      }
      if (parsed.registry.issuerFingerprint !== check.admission.keyId) {
        errors.push("registry fingerprint mismatch");
      }
    } catch (error) {
      errors.push(`invalid index.sig: ${String(error)}`);
    }
    for (const bench of index.benches) {
      for (const version of bench.versions) {
        const file = join(dir, version.url);
        const shaFile = `${file}.sha256`;
        if (!pathExists(file)) {
          errors.push(`missing bench artifact: ${version.url}`);
          continue;
        }
        const digest = sha256Hex(readFileSync(file));
        if (digest !== version.sha256) {
          errors.push(`sha mismatch for ${version.url}`);
        }
        if (pathExists(shaFile) && readUtf8(shaFile).trim() !== digest) {
          errors.push(`sha file mismatch for ${version.url}.sha256`);
        }
      }
    }
  }
  return finish();
}

export function publishBenchToRegistry(params: {
  dir: string;
  benchFile: string;
  registryKeyPath: string;
  version?: string;
}): {
  benchId: string;
  version: string;
  targetPath: string;
  sha256: string;
  indexPath: string;
  sigPath: string;
} {
  const dir = resolve(params.dir);
  const benchFile = resolve(params.benchFile);
  const registryKey = readUtf8(resolve(params.registryKeyPath));
  // Integrity only: publishing is the registry operator vouching for this signer, by signing the index that names it.
  const verifyResult = verifyBenchArtifactFile({ file: benchFile, trust: { ...loadTrustContext(), allowUnpinned: true } });
  if (verdictExitCode(verifyResult.report) === 1 || !verifyResult.bench) {
    throw new Error(`bench verification failed before publish: ${untrustedReasons(verifyResult.report).join("; ")}`);
  }
  const inspected = inspectBenchArtifact(benchFile);
  const benchId = inspected.bench.benchId;
  const version = params.version ?? new Date(inspected.bench.generatedTs).toISOString();
  const targetDir = join(dir, "benches", benchId, version);
  ensureDir(targetDir);
  const targetPath = join(targetDir, "bench.amcbench");
  copyFileSync(benchFile, targetPath);
  const digest = sha256Hex(readFileSync(targetPath));
  writeFileAtomic(`${targetPath}.sha256`, `${digest}\n`, 0o644);

  const signerFingerprint = inspected.signature.envelope?.fingerprint ?? sha256Hex(readUtf8(join(resolve(params.dir), "registry.pub")));
  const index = loadIndex(dir);
  const rel = relative(dir, targetPath).replace(/\\/g, "/");
  const existing = index.benches.find((row) => row.benchId === benchId);
  if (!existing) {
    index.benches.push({
      benchId,
      scopeType: inspected.bench.scope.type,
      labels: inspected.bench.labels,
      evidence: {
        integrityIndex: inspected.bench.evidence.integrityIndex,
        trustLabel: inspected.bench.evidence.trustLabel
      },
      versions: [
        {
          version,
          sha256: digest,
          url: rel,
          signerFingerprint,
          risk: deriveRiskCategory(inspected.bench.evidence.trustLabel)
        }
      ]
    });
  } else {
    existing.scopeType = inspected.bench.scope.type;
    existing.labels = inspected.bench.labels;
    existing.evidence = {
      integrityIndex: inspected.bench.evidence.integrityIndex,
      trustLabel: inspected.bench.evidence.trustLabel
    };
    const match = existing.versions.find((row) => row.version === version);
    if (match) {
      match.sha256 = digest;
      match.url = rel;
      match.signerFingerprint = signerFingerprint;
      match.risk = deriveRiskCategory(inspected.bench.evidence.trustLabel);
    } else {
      existing.versions.push({
        version,
        sha256: digest,
        url: rel,
        signerFingerprint,
        risk: deriveRiskCategory(inspected.bench.evidence.trustLabel)
      });
      existing.versions.sort((a, b) => compareVersions(a.version, b.version));
    }
  }
  index.benches.sort((a, b) => a.benchId.localeCompare(b.benchId));
  index.registry.updatedTs = Date.now();
  saveIndex(dir, index, registryKey);

  return {
    benchId,
    version,
    targetPath,
    sha256: digest,
    indexPath: registryIndexPath(dir),
    sigPath: registryIndexSigPath(dir)
  };
}

function contentType(path: string): string {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".sig")) return "application/json; charset=utf-8";
  if (path.endsWith(".pub")) return "text/plain; charset=utf-8";
  if (path.endsWith(".sha256")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export async function serveBenchRegistry(params: {
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
  const server = createHttpServer((req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }
    const raw = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const normalized = normalize(raw.replace(/^\/+/, ""));
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
    res.setHeader("content-type", contentType(file));
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    if (method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(params.port, host, () => resolvePromise());
  });
  return {
    host,
    port: params.port,
    close: async () =>
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      })
  };
}
