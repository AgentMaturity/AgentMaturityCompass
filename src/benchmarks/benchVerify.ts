import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildVerifierReport, checkDigestSignature, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import { fileSha256 } from "../trust/signatureCheck.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { benchmarkSchema, type BenchmarkArtifact } from "./benchSchema.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


interface BenchSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function runTarExtract(bundleFile: string, outputDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outputDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

/**
 * Verifies an exported benchmark (.amcbench from `amc benchmark export`) offline. public-keys/auditor.pub and --pubkey
 * only locate the signer; bench.sig needs a key the trust context admits for artifact-seal (P0-09). ok equals
 * report.trusted.
 */
export function verifyBenchmarkArtifact(file: string, trust: TrustContext, pubkeyPath?: string): {
  ok: boolean;
  bench: BenchmarkArtifact | null;
  errors: string[];
  report: VerifierReportV1;
} {
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-verify-"));
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let bench: BenchmarkArtifact | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "benchmark", path: resolve(file), sha256: fileSha256(resolve(file)) }, context: trust,
      integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, bench, errors, report };
  };
  try {
    runTarExtract(file, tmp);
    const benchPath = join(tmp, "bench.json");
    const sigPath = join(tmp, "bench.sig");
    const pubPath = join(tmp, "public-keys", "auditor.pub");
    if (!pathExists(benchPath)) {
      errors.push("bench.json missing");
      return finish();
    }
    if (!pathExists(sigPath)) {
      errors.push("bench.sig missing");
      return finish();
    }
    bench = benchmarkSchema.parse(JSON.parse(readUtf8(benchPath)) as unknown);
    const signature = JSON.parse(readUtf8(sigPath)) as BenchSignature;
    const digest = sha256Hex(readFileSync(benchPath));
    if (digest !== signature.digestSha256) {
      errors.push("bench digest mismatch");
    }
    const check = checkDigestSignature({ signature: "bench.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: String(signature.signature),
      candidates: [pubkeyPath ? readUtf8(resolve(pubkeyPath)) : null, pathExists(pubPath) ? readUtf8(pubPath) : null],
      context: trust, claimedSignedAt: signature.signedTs });
    signatures.push(check.admission);
    if (!check.verified) {
      errors.push("signature verification failed");
    }
    return finish();
  } catch (error) {
    errors.push(String(error));
    return finish();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
