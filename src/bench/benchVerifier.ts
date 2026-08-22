import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { benchArtifactSchema, benchPiiScanSchema, benchSignatureSchema, type BenchArtifact } from "./benchSchema.js";
import { verifyBenchDigestSignature, digestFile } from "./benchSigner.js";
import { verifyBenchProofBundle, type BenchInclusionProof } from "./benchProofs.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
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


interface BenchVerifyError {
  code: string;
  message: string;
}

function cleanup(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolveRoot(dir: string): string {
  const direct = join(dir, "amc-bench");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = join(dir, entry.name);
    if (pathExists(join(child, "bench.json")) && pathExists(join(child, "bench.sig"))) {
      return child;
    }
  }
  return dir;
}

function parseInclusionProofs(root: string): BenchInclusionProof[] {
  const dir = join(root, "proofs", "inclusion");
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => JSON.parse(readUtf8(join(dir, name))) as BenchInclusionProof);
}

export interface BenchVerifyResult {
  ok: boolean;
  bench: BenchArtifact | null;
  errors: BenchVerifyError[];
  fileSha256: string;
}

export function verifyBenchArtifactFile(params: {
  file: string;
  publicKeyPath?: string;
}): BenchVerifyResult {
  const file = resolve(params.file);
  const errors: BenchVerifyError[] = [];
  const fileSha256 = digestFile(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-verify-"));
  let bench: BenchArtifact | null = null;
  try {
    tarExtract(file, tmp);
    const root = resolveRoot(tmp);
    const benchPath = join(root, "bench.json");
    const sigPath = join(root, "bench.sig");
    const pubPath = join(root, "signer.pub");
    if (!pathExists(benchPath)) {
      errors.push({ code: "MISSING_BENCH_JSON", message: "bench.json missing" });
      return { ok: false, bench: null, errors, fileSha256 };
    }
    if (!pathExists(sigPath)) {
      errors.push({ code: "MISSING_BENCH_SIG", message: "bench.sig missing" });
      return { ok: false, bench: null, errors, fileSha256 };
    }
    bench = benchArtifactSchema.parse(JSON.parse(readUtf8(benchPath)) as unknown);
    const signature = benchSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(benchPath));
    if (digest !== signature.digestSha256) {
      errors.push({ code: "DIGEST_MISMATCH", message: "bench.json digest mismatch with bench.sig" });
    }
    const pubPem = params.publicKeyPath ? readUtf8(resolve(params.publicKeyPath)) : pathExists(pubPath) ? readUtf8(pubPath) : undefined;
    const sigOk = verifyBenchDigestSignature({
      digestHex: digest,
      signature,
      publicKeyPem: pubPem
    });
    if (!sigOk) {
      errors.push({ code: "SIGNATURE_INVALID", message: "bench signature verification failed" });
    }

    const piiPath = join(root, "checks", "pii-scan.json");
    if (pathExists(piiPath)) {
      const pii = benchPiiScanSchema.parse(JSON.parse(readUtf8(piiPath)) as unknown);
      if (pii.status !== "PASS") {
        errors.push({ code: "PII_SCAN_FAILED", message: "bench pii scan status is FAIL" });
      }
      const piiShaPath = join(root, "checks", "pii-scan.sha256");
      if (pathExists(piiShaPath)) {
        const expected = readUtf8(piiShaPath).trim();
        const actual = digestFile(piiPath);
        if (expected !== actual) {
          errors.push({ code: "PII_SHA_MISMATCH", message: "pii-scan.sha256 mismatch" });
        }
      }
    } else {
      errors.push({ code: "MISSING_PII_SCAN", message: "checks/pii-scan.json missing" });
    }

    const inclusion = parseInclusionProofs(root);
    const proofBundle = verifyBenchProofBundle({
      transparencyRoot: null,
      merkleRoot: null,
      proofs: inclusion
    });
    if (!proofBundle.ok) {
      for (const err of proofBundle.errors) {
        errors.push({ code: "PROOF_INVALID", message: err });
      }
    }
    if (
      bench.proofBindings.includedEventProofIds.length > 0 &&
      inclusion.length !== bench.proofBindings.includedEventProofIds.length
    ) {
      errors.push({
        code: "PROOF_COUNT_MISMATCH",
        message: "proofBindings.includedEventProofIds count does not match included proof files"
      });
    }

    return {
      ok: errors.length === 0,
      bench,
      errors,
      fileSha256
    };
  } catch (error) {
    errors.push({
      code: "VERIFY_EXCEPTION",
      message: String(error)
    });
    return {
      ok: false,
      bench,
      errors,
      fileSha256
    };
  } finally {
    cleanup(tmp);
  }
}

