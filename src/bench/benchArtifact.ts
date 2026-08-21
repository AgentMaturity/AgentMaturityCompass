import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { signBenchJson, digestFile } from "./benchSigner.js";
import { collectBenchData } from "./benchCollector.js";
import { scanBenchForPii } from "./benchRedaction.js";
import { buildBenchProofs, writeBenchProofFiles } from "./benchProofs.js";
import { benchBuildMetaSchema, benchPiiScanSchema, benchArtifactSchema, benchSignatureSchema, type BenchArtifact, type BenchBuildMeta } from "./benchSchema.js";
import { loadBenchPolicy, verifyBenchPolicySignature, benchExportsDir } from "./benchPolicyStore.js";
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


function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
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

function tarCreateDeterministic(sourceDir: string, outFile: string): void {
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create bench artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
  const out = { status: 0, stderr: "", stdout: "" };
  if (out.status !== 0) {
    throw new Error(`failed to extract bench artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function resolveBenchRoot(dir: string): string {
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

function normalizeScope(params: {
  scope: "workspace" | "node" | "agent";
  id?: string | null;
}): { scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string } {
  if (params.scope === "agent") {
    return {
      scopeType: "AGENT",
      scopeId: (params.id ?? "").trim() || "default"
    };
  }
  if (params.scope === "node") {
    const id = (params.id ?? "").trim();
    if (!id) {
      throw new Error("node scope requires --id <nodeId>");
    }
    return {
      scopeType: "NODE",
      scopeId: id
    };
  }
  return {
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  };
}

function valueOrDefault<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

export interface BenchCreateResult {
  outFile: string;
  sha256: string;
  bench: BenchArtifact;
  signature: z.infer<typeof benchSignatureSchema>;
  piiScan: z.infer<typeof benchPiiScanSchema>;
  buildMeta: BenchBuildMeta;
  transparencyHash: string;
}

export function createBenchArtifact(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string | null;
  outFile: string;
  windowDays?: number;
  named?: boolean;
  labels?: {
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  };
}): BenchCreateResult {
  const signature = verifyBenchPolicySignature(params.workspace);
  if (!signature.valid) {
    throw new Error(`bench policy signature invalid: ${signature.reason ?? "unknown"}`);
  }
  const policy = loadBenchPolicy(params.workspace);
  const scope = normalizeScope({
    scope: params.scope,
    id: params.id
  });
  const collected = collectBenchData({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    windowDays: Math.max(1, params.windowDays ?? 30),
    policy,
    named: params.named,
    labels: params.labels
  });
  const proofs = buildBenchProofs({
    workspace: params.workspace,
    includeEventKinds: collected.includedEventKinds
  });
  const calculationManifest = collected.calculationManifest;
  const calculationManifestSha256 = sha256Hex(canonicalize(calculationManifest));

  let bench = benchArtifactSchema.parse({
    ...collected.bench,
    proofBindings: {
      ...collected.bench.proofBindings,
      includedEventProofIds: proofs.proofs.map((row) => row.proofId).sort((a, b) => a.localeCompare(b)),
      calculationManifestSha256
    }
  });
  if (!proofs.transparencyRoot || !proofs.merkleRoot) {
    bench = benchArtifactSchema.parse({
      ...bench,
      evidence: {
        ...bench.evidence,
        trustLabel: "LOW"
      },
      metrics: {
        ...bench.metrics,
        forecastSummary: {
          ...bench.metrics.forecastSummary,
          status: "INSUFFICIENT_EVIDENCE",
          confidenceLabel: "NONE",
          reasons: [...new Set([...bench.metrics.forecastSummary.reasons, "PROOFS_UNAVAILABLE"])].sort((a, b) =>
            a.localeCompare(b)
          )
        }
      }
    });
  }

  const piiScan = benchPiiScanSchema.parse(scanBenchForPii(bench));
  if (piiScan.status !== "PASS") {
    const top = piiScan.findings.filter((row) => row.severity === "HIGH").slice(0, 6);
    throw new Error(`bench pii scan failed: ${top.map((row) => `${row.type}:${row.path}`).join(", ")}`);
  }

  const signed = benchSignatureSchema.parse(signBenchJson(params.workspace, bench));
  const signerPub = valueOrDefault(
    signed.envelope ? Buffer.from(signed.envelope.pubkeyB64, "base64").toString("utf8") : null,
    getPublicKeyHistory(params.workspace, "auditor")[0] ?? ""
  );
  if (!signerPub) {
    throw new Error("missing signer public key");
  }

  const buildMeta = benchBuildMetaSchema.parse(collected.buildMeta);
  let finalSignature = signed;
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-artifact-"));
  try {
    const root = join(tmp, "amc-bench");
    ensureDir(root);
    ensureDir(join(root, "checks"));
    ensureDir(join(root, "meta"));
    ensureDir(join(root, "proofs"));

    const benchJsonPath = join(root, "bench.json");
    writeFileAtomic(benchJsonPath, JSON.stringify(bench), 0o644);
    const benchSigPath = join(root, "bench.sig");
    writeFileAtomic(benchSigPath, `${canonicalize(signed)}\n`, 0o644);
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);

    const proofFiles = writeBenchProofFiles({
      outDir: root,
      bundle: proofs
    });
    bench = benchArtifactSchema.parse({
      ...bench,
      proofBindings: {
        ...bench.proofBindings,
        transparencyRootSha256: proofFiles.transparencyRootSha256,
        merkleRootSha256: proofFiles.merkleRootSha256,
        includedEventProofIds: proofFiles.proofIds
      }
    });
    writeFileAtomic(benchJsonPath, JSON.stringify(bench), 0o644);
    finalSignature = benchSignatureSchema.parse(signBenchJson(params.workspace, bench));
    writeFileAtomic(benchSigPath, `${canonicalize(finalSignature)}\n`, 0o644);

    const calcPath = join(root, "meta", "calculation-manifest.json");
    writeFileAtomic(calcPath, `${canonicalize(calculationManifest)}\n`, 0o644);
    const piiPath = join(root, "checks", "pii-scan.json");
    writeFileAtomic(piiPath, `${canonicalize(piiScan)}\n`, 0o644);
    writeFileAtomic(join(root, "checks", "pii-scan.sha256"), `${digestFile(piiPath)}\n`, 0o644);
    const buildPath = join(root, "meta", "build.json");
    writeFileAtomic(buildPath, `${canonicalize(buildMeta)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "build.sha256"), `${digestFile(buildPath)}\n`, 0o644);

    tarCreateDeterministic(tmp, outFile);
  } finally {
    cleanupDir(tmp);
  }

  const sha256 = digestFile(outFile);
  writeFileAtomic(`${outFile}.sha256`, `${sha256}\n`, 0o644);
  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type: "BENCH_CREATED",
    agentId: scope.scopeType === "AGENT" ? scope.scopeId : "workspace",
    artifact: {
      kind: "amcbench",
      sha256,
      id: bench.benchId
    }
  });

  return {
    outFile,
    sha256,
    bench,
    signature: finalSignature,
    piiScan,
    buildMeta,
    transparencyHash: transparency.hash
  };
}

export function inspectBenchArtifact(file: string): {
  bench: BenchArtifact;
  signature: z.infer<typeof benchSignatureSchema>;
  piiScan: z.infer<typeof benchPiiScanSchema> | null;
  sha256: string;
} {
  const bundle = resolve(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-inspect-"));
  try {
    tarExtract(bundle, tmp);
    const root = resolveBenchRoot(tmp);
    const bench = benchArtifactSchema.parse(JSON.parse(readUtf8(join(root, "bench.json"))) as unknown);
    const signature = benchSignatureSchema.parse(JSON.parse(readUtf8(join(root, "bench.sig"))) as unknown);
    const piiPath = join(root, "checks", "pii-scan.json");
    const piiScan = pathExists(piiPath) ? benchPiiScanSchema.parse(JSON.parse(readUtf8(piiPath)) as unknown) : null;
    return {
      bench,
      signature,
      piiScan,
      sha256: digestFile(bundle)
    };
  } finally {
    cleanupDir(tmp);
  }
}

export function listExportedBenchArtifacts(workspace: string): Array<{
  file: string;
  sha256: string;
  benchId: string;
  generatedTs: number;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  trustLabel: "LOW" | "MEDIUM" | "HIGH";
}> {
  const dir = benchExportsDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  const out: Array<{
    file: string;
    sha256: string;
    benchId: string;
    generatedTs: number;
    scopeType: "WORKSPACE" | "NODE" | "AGENT";
    trustLabel: "LOW" | "MEDIUM" | "HIGH";
  }> = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".amcbench")) {
        continue;
      }
      try {
        const inspected = inspectBenchArtifact(full);
        out.push({
          file: full,
          sha256: inspected.sha256,
          benchId: inspected.bench.benchId,
          generatedTs: inspected.bench.generatedTs,
          scopeType: inspected.bench.scope.type,
          trustLabel: inspected.bench.evidence.trustLabel
        });
      } catch {
        // skip broken export listing entries
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => b.generatedTs - a.generatedTs || a.file.localeCompare(b.file));
}
