import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BenchInclusionProof } from "../bench/benchProofs.js";
import { pathExists, readUtf8 } from "./fs.js";
import { sha256Hex } from "./hash.js";

/** Verification cleanup is best effort, including after a refused archive. */
export function cleanupSignedArtifactVerification(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

/** Prefer the canonical directory before inspecting immediate children in native order. */
export function resolveSignedArtifactRoot(dir: string, directory: string, jsonFile: string, signatureFile: string): string {
  const direct = join(dir, directory);
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = join(dir, entry.name);
    if (pathExists(join(child, jsonFile)) && pathExists(join(child, signatureFile))) {
      return child;
    }
  }
  return dir;
}

/** Loading preserves lexical filename order; proof admission remains with the caller. */
export function readSignedArtifactInclusionProofs(root: string): BenchInclusionProof[] {
  const dir = join(root, "proofs", "inclusion");
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => JSON.parse(readUtf8(join(dir, name))) as BenchInclusionProof);
}

export function verifySignedArtifactPiiScan(params: {
  root: string;
  artifact: "binder" | "passport";
  readScan: (path: string) => { status: "PASS" | "FAIL" };
  requireChecksum: boolean;
  errors: Array<{ code: string; message: string }>;
}): void {
  const piiPath = join(params.root, "checks", "pii-scan.json");
  if (!pathExists(piiPath)) {
    params.errors.push({ code: "MISSING_PII_SCAN", message: "checks/pii-scan.json missing" });
    return;
  }
  const pii = params.readScan(piiPath);
  if (pii.status !== "PASS") {
    params.errors.push({ code: "PII_SCAN_FAILED", message: `${params.artifact} pii scan status is FAIL` });
  }
  const piiSha = join(params.root, "checks", "pii-scan.sha256");
  if (pathExists(piiSha)) {
    const expected = readUtf8(piiSha).trim();
    const actual = sha256Hex(readFileSync(piiPath));
    if (expected !== actual) {
      params.errors.push({ code: "PII_SHA_MISMATCH", message: "checks/pii-scan.sha256 mismatch" });
    }
  } else if (params.requireChecksum) {
    params.errors.push({ code: "MISSING_PII_SHA", message: "checks/pii-scan.sha256 missing" });
  }
}
