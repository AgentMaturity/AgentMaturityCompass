import { distrustAt, listsAt } from "../trust/admissionRule.js";
import { captureRegistryFiles, registryFileBytes, assertRegistryFiles, withBenchRegistryLock, writeRegistryMembers, type BenchRegistryOptions } from "./benchRegistryPublication.js";
import { containedPath, physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { tmpdir } from "node:os";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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
    const valid = verifyWithKey(payload, pubPem, Buffer.from(parsed.signature, "base64"));
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

function preparedIndex(index: BenchRegistryIndex, privatePem: string, publicPem: string) {
  const normalized = benchRegistryIndexSchema.parse(index), signature = signIndex(normalized, privatePem);
  const body = Buffer.from(`${canonicalize(normalized)}\n`), sidecar = Buffer.from(`${canonicalize(signature)}\n`);
  if (!verifyIndex(normalized, sidecar.toString("utf8"), publicPem).ok) throw new Error("selected registry key does not sign for registry.pub");
  return { normalized, body, sidecar };
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
}, options: BenchRegistryOptions = {}): {
  dir: string;
  indexPath: string;
  sigPath: string;
  pubPath: string;
  keyPath: string;
  fingerprint: string;
} {
  const { dir: rawDir, registryId, registryName } = params, beforePublish = options.beforePublish;
  const dir = resolve(rawDir); beforePublish?.();
  const before = captureRegistryFiles([registryKeyPath(dir), registryPubPath(dir), registryIndexPath(dir), registryIndexSigPath(dir)]);
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
  const index = benchRegistryIndexSchema.parse({
    v: 1,
    registry: {
      id: registryId ?? `amc.bench.registry.${Date.now()}`,
      name: registryName ?? "AMC Bench Registry",
      issuerFingerprint: fingerprintForPublicPem(publicPem),
      updatedTs: Date.now()
    },
    benches: []
  });
  const prepared = preparedIndex(index, privatePem, publicPem);
  withBenchRegistryLock(dir, () => { beforePublish?.(); assertRegistryFiles(before); ensureDir(join(dir, "benches"));
    writeRegistryMembers(dir, [{ path: registryKeyPath(dir), bytes: Buffer.from(privatePem), mode: 0o600 },
      { path: registryPubPath(dir), bytes: Buffer.from(publicPem), mode: 0o644 },
      { path: registryIndexPath(dir), bytes: prepared.body, mode: 0o644 }, { path: registryIndexSigPath(dir), bytes: prepared.sidecar, mode: 0o644 }]);
  });
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

export function publishBenchToRegistry(params: { dir: string; benchFile: string; registryKeyPath: string; version?: string }, options: BenchRegistryOptions = {}) {
  return prepareBenchRegistryPublish(params, options).publish().result;
}

/** Internal actual approval caller retains the prepared/public members through its later log phase. */
export function prepareBenchRegistryPublish(params: { dir: string; benchFile: string; registryKeyPath: string; version?: string }, options: BenchRegistryOptions = {}) {
  const input = { ...params }, beforePublish = options.beforePublish, dir = resolve(input.dir), benchFile = resolve(input.benchFile), keyFile = resolve(input.registryKeyPath);
  beforePublish?.();
  const initial = captureRegistryFiles([keyFile, registryPubPath(dir), registryIndexPath(dir), registryIndexSigPath(dir), benchFile]);
  const required = (path: string) => { const bytes = registryFileBytes(initial, path); if (bytes === null) throw new Error("required registry publication input is missing"); return bytes; };
  const registryKey = required(keyFile).toString("utf8"), publicPem = required(registryPubPath(dir)).toString("utf8");
  const index = benchRegistryIndexSchema.parse(JSON.parse(required(registryIndexPath(dir)).toString("utf8")) as unknown);
  if (index.registry.issuerFingerprint !== fingerprintForPublicPem(publicPem) || !verifyIndex(index, required(registryIndexSigPath(dir)).toString("utf8"), publicPem).ok)
    throw new Error("selected registry predecessor signature is invalid");
  const bytes = required(benchFile), digest = sha256Hex(bytes);
  // Verify/inspect a private copy of the captured bytes, never a second mutable caller path.
  const operator = loadTrustContext(), trustState = (value: TrustContext) => canonicalize({ ...value, asOf: null }), operatorState = trustState(operator);
  const stage = mkdtempSync(join(tmpdir(), "amc-bench-registry-")); let failure: unknown;
  let admissions: IssuerAdmission[] = [];
  let inspected: ReturnType<typeof inspectBenchArtifact>;
  try { const file = join(stage, "candidate.amcbench"); writeFileAtomic(file, bytes, 0o600);
    const verifyResult = verifyBenchArtifactFile({ file, trust: { ...operator, allowUnpinned: true } });
    if (verdictExitCode(verifyResult.report) === 1 || !verifyResult.bench) throw new Error(`bench verification failed before publish: ${untrustedReasons(verifyResult.report).join("; ")}`);
    admissions = verifyResult.report.issuerAdmission.signatures.map(row => ({ ...row }));
    inspected = inspectBenchArtifact(file);
    if (verifyResult.fileSha256 !== digest || inspected.sha256 !== digest) throw new Error("selected registry artifact changed during verification");
  } catch (cause) { failure = cause; throw cause; } finally { try { rmSync(stage, { recursive: true, force: true }); } catch (cleanup) {
    // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
    throw new Error("registry private staging cleanup did not complete", { cause: failure === undefined ? cleanup : new AggregateError([failure, cleanup]) });
  } }
  const benchId = inspected.bench.benchId, version = input.version ?? new Date(inspected.bench.generatedTs).toISOString();
  const targetDir = containedPath(join(dir, "benches"), "the registry benches directory", benchId, version), targetPath = join(targetDir, "bench.amcbench");
  const targets = captureRegistryFiles([targetPath, `${targetPath}.sha256`]);
  // A legacy no-envelope archive still names its real math-valid bench signer in the actual verifier result.
  const signerFingerprint = admissions.find(row => row.signature === "bench.sig")?.keyId;
  if (!signerFingerprint) throw new Error("verified benchmark signer identity is missing");
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
  const prepared = preparedIndex(index, registryKey, publicPem);
  const writes = [{ path: targetPath, bytes, mode: initial.find(row => row.path === benchFile)!.mode ?? 0o644 }, { path: `${targetPath}.sha256`, bytes: Buffer.from(`${digest}\n`), mode: 0o644 },
    { path: registryIndexPath(dir), bytes: prepared.body, mode: 0o644 }, { path: registryIndexSigPath(dir), bytes: prepared.sidecar, mode: 0o644 }];
  for (const keyPath of [keyFile, registryPubPath(dir)]) {
    const key = initial.find(row => row.path === keyPath)!;
    for (const row of writes) { const existing = [...initial, ...targets].find(member => member.path === row.path);
      if (row.path === keyPath || physicalPathWithMissingSuffix(row.path) === key.physicalPath
        || (key.identity !== null && existing?.identity === key.identity)) throw new Error("registry publication cannot replace its selected key"); }
  }
  const externalCurrent = () => { const now = loadTrustContext();
    if (trustState(now) !== operatorState || now.asOf.getTime() < operator.asOf.getTime()) throw new Error("original registry publication trust policy or clock changed");
    for (const row of admissions) {
      if (row.keyId === null || distrustAt(now.distrust, row.keyId, now.asOf.getTime())) throw new Error("benchmark issuer is currently refused");
      if (now.explicitPins.some(pin => pin.keyId === row.keyId && pin.purposes.includes(row.purpose))) continue;
      const listed = listsAt(now.lists, row.keyId, row.purpose, now.asOf.getTime());
      if ((listed !== null && listed.status !== "admitted") || (listed === null && row.status === "admitted")) throw new Error("benchmark issuer is no longer admitted");
    }
  };
  const result = Object.freeze({ benchId, version, targetPath, sha256: digest, indexPath: registryIndexPath(dir), sigPath: registryIndexSigPath(dir) });
  return Object.freeze({ result, publish() {
    return withBenchRegistryLock(dir, () => { beforePublish?.(); externalCurrent(); assertRegistryFiles(initial); assertRegistryFiles(targets);
      const published = writeRegistryMembers(dir, writes), updated = new Set(writes.map(row => row.path));
      // After our own replacements, unmodified inputs and exact published members remain the current local identity.
      const retained = initial.filter(row => !updated.has(row.path));
      return { result, completedPaths: published.completedPaths, assertPublishedFiles() { externalCurrent(); assertRegistryFiles(retained); published.assertPublishedFiles(); } };
    });
  } });
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
