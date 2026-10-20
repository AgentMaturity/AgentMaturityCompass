import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { getSigningKey, getPublicKeyHistory, signHexDigest } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadAgentConfig } from "../fleet/registry.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { benchmarkSchema, type BenchmarkArtifact } from "./benchSchema.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";

interface BenchSignature {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function runTarCreate(sourceDir: string, outputFile: string): void {
  const out = spawnSync("tar", ["-czf", outputFile, "-C", sourceDir, "."], {
    encoding: "utf8"
  });
  if (out.status !== 0) {
    throw new Error(`Failed to create benchmark artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function stableTrustLabel(label: string): "LOW TRUST" | "MEDIUM TRUST" | "HIGH TRUST" {
  if (label === "HIGH TRUST") {
    return "HIGH TRUST";
  }
  if (label.startsWith("UNRELIABLE")) {
    return "LOW TRUST";
  }
  return "MEDIUM TRUST";
}

function hashAgentId(agentId: string): string {
  return createHash("sha256").update(agentId).digest("hex").slice(0, 24);
}

export interface BenchmarkExportInput {
  workspace: string;
  agentId?: string;
  runId: string;
  outFile: string;
  publisherOrgName?: string;
  publisherContact?: string;
  publicAgentId?: string | null;
  notes?: string | null;
}

function prepareBenchmarkArtifact(params: BenchmarkExportInput) {
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId);
  const run = loadRunReport(workspace, params.runId, agentId);
  const agent = loadAgentConfig(workspace, agentId);
  const assurance = latestAssuranceByPack({
    workspace,
    agentId,
    windowStartTs: run.windowStartTs,
    windowEndTs: run.windowEndTs
  });
  const indices = computeFailureRiskIndices({
    run,
    assuranceByPack: assurance
  });

  const runPath = join(getAgentPaths(workspace, agentId).runsDir, `${run.runId}.json`);
  const reportSha256 = pathExists(runPath) ? sha256Hex(readFileSync(runPath)) : null;
  let bomSha256: string | null = null;
  const bomPath = join(workspace, "amc-bom.json");
  if (pathExists(bomPath)) {
    bomSha256 = sha256Hex(readFileSync(bomPath));
  }

  const bench = benchmarkSchema.parse({
    v: 1,
    benchId: `bench_${randomUUID().replace(/-/g, "")}`,
    createdTs: Date.now(),
    publisher: {
      orgName: params.publisherOrgName ?? "AMC Publisher",
      contact: params.publisherContact ?? null
    },
    agent: {
      agentId: params.publicAgentId && params.publicAgentId.length > 0 ? params.publicAgentId : hashAgentId(agentId),
      archetypeId: null,
      riskTier: agent.riskTier,
      role: agent.role ?? null
    },
    run: {
      runId: run.runId,
      windowDays: Math.max(1, Math.round((run.windowEndTs - run.windowStartTs) / 86_400_000)),
      overall:
        run.layerScores.length > 0 ? Number((run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / run.layerScores.length).toFixed(4)) : 0,
      layers: Object.fromEntries(run.layerScores.map((row) => [row.layerName, row.avgFinalLevel])),
      questions: Object.fromEntries(run.questionScores.map((row) => [row.questionId, row.finalLevel])),
      integrityIndex: run.integrityIndex,
      trustLabel: stableTrustLabel(run.trustLabel),
      assurance: Object.fromEntries([...assurance.entries()].map(([packId, pack]) => [packId, pack.score0to100])),
      indices: Object.fromEntries(indices.indices.map((item) => [item.id, Number(item.score0to100.toFixed(2))]))
    },
    hashes: {
      reportSha256,
      bomSha256
    },
    notes: params.notes ?? null
  });
  return { workspace, agentId, bench };
}

export function exportBenchmarkArtifact(params: BenchmarkExportInput): { outFile: string; bench: BenchmarkArtifact } {
  const { workspace, agentId, bench } = prepareBenchmarkArtifact(params);

  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-"));
  const outFile = resolve(workspace, params.outFile);
  ensureDir(dirname(outFile));
  ensureDir(join(tmp, "public-keys"));
  try {
    const benchPath = join(tmp, "bench.json");
    writeFileAtomic(benchPath, JSON.stringify(bench, null, 2), 0o644);
    const digest = sha256Hex(readFileSync(benchPath));
    const signature: BenchSignature = {
      digestSha256: digest,
      signature: signHexDigest(digest, getSigningKey(workspace, "artifact-seal")),
      signedTs: Date.now(),
      signer: "auditor"
    };
    writeFileAtomic(join(tmp, "bench.sig"), JSON.stringify(signature, null, 2), 0o644);
    const auditorPub = getPublicKeyHistory(workspace, "auditor")[0];
    if (!auditorPub) {
      throw new Error("Missing auditor public key.");
    }
    writeFileAtomic(join(tmp, "public-keys", "auditor.pub"), auditorPub, 0o644);
    runTarCreate(tmp, outFile);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  appendTransparencyEntry({
    workspace,
    type: "BENCHMARK_EXPORTED",
    agentId,
    artifact: {
      kind: "amcbench",
      sha256: sha256Hex(readFileSync(outFile)),
      id: bench.benchId
    }
  });
  return {
    outFile,
    bench
  };
}

type BenchmarkFileState = { bytes: Buffer; mode: number } | null;
class BenchmarkTransparencyPublicationError extends Error {
  readonly code = "BENCHMARK_TRANSPARENCY_PUBLICATION_INCOMPLETE";
  constructor(readonly outFile: string, readonly sha256: string, cause: unknown) {
    super("Benchmark archive was published; transparency publication is incomplete", { cause });
    this.name = "BenchmarkTransparencyPublicationError";
  }
}

function benchmarkFileState(path: string): BenchmarkFileState {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error("benchmark input or output must be a regular file");
    return { bytes: readFileSync(path), mode: stat.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("benchmark input or output is not a readable regular file");
  }
}
function sameBenchmarkFile(a: BenchmarkFileState, b: BenchmarkFileState): boolean {
  return a === null ? b === null : b !== null && a.mode === b.mode && a.bytes.equals(b.bytes);
}

/** Maintained awaitable producer. The raw four-field signature wire and direct artifact purpose remain unchanged. */
export async function exportBenchmarkArtifactAsync(input: BenchmarkExportInput, options: { beforePublish?: () => void } = {}): Promise<{ outFile: string; bench: BenchmarkArtifact }> {
  const params = { ...input }, beforePublish = options.beforePublish, workspace = params.workspace;
  const assertSigningAllowed = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize benchmark signing"); };
  beforePublish?.(); assertSigningAllowed();
  const captured = capturePurposePublication(workspace, "artifact-seal");
  const agentId = resolveAgentId(workspace, params.agentId), paths = getAgentPaths(workspace, agentId), pathRef = JSON.stringify(paths);
  const reportsDir = join(paths.reportsDir, "assurance"), outFile = resolve(workspace, params.outFile);
  const inputFiles = [...new Set([join(paths.runsDir, `${params.runId}.json`), join(workspace, ".amc", "runs", `${params.runId}.json`),
    paths.agentConfig, join(workspace, "amc-bom.json")])];
  const readInputs = () => {
    if (JSON.stringify(getAgentPaths(workspace, agentId)) !== pathRef) throw new Error("benchmark input references changed while preparing");
    const reports = pathExists(reportsDir) ? readdirSync(reportsDir).filter(name => name.endsWith(".json")).sort().map(name => join(reportsDir, name)) : [];
    return new Map([...inputFiles, ...reports].map(path => [path, benchmarkFileState(path)] as const));
  };
  const original = readInputs(), outputBefore = benchmarkFileState(outFile);
  if (original.has(outFile)) throw new Error("benchmark output cannot replace a source input");
  const assertInputsCurrent = () => {
    const current = readInputs();
    if (current.size !== original.size || [...original].some(([path, value]) => !current.has(path) || !sameBenchmarkFile(value, current.get(path)!))) {
      throw new Error("benchmark inputs changed while preparing");
    }
  };
  const prepared = prepareBenchmarkArtifact({ ...params, agentId });
  if (prepared.bench.run.runId !== params.runId) throw new Error("benchmark run reference does not match the requested record");
  assertInputsCurrent();
  const bench = prepared.bench, bytes = Buffer.from(JSON.stringify(bench, null, 2), "utf8"), digest = sha256Hex(bytes);
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-async-"));
  try {
    const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"));
    assertInputsCurrent();
    const content = join(tmp, "content"), archive = join(tmp, "prepared.amcbench");
    ensureDir(join(content, "public-keys"));
    writeFileAtomic(join(content, "bench.json"), bytes, 0o644);
    const signature: BenchSignature = { digestSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" };
    writeFileAtomic(join(content, "bench.sig"), JSON.stringify(signature, null, 2), 0o644);
    writeFileAtomic(join(content, "public-keys", "auditor.pub"), signed.publicKeyPem, 0o644);
    runTarCreate(content, archive);
    const archiveBytes = readFileSync(archive), archiveMode = lstatSync(archive).mode & 0o777;
    withControlFileLock({ root: dirname(outFile), name: `benchmark-export-${sha256Hex(outFile).slice(0, 24)}`, operation: () => {
      beforePublish?.(); assertSigningAllowed();
      assertPurposePublicationCurrent(workspace, captured, signed);
      assertInputsCurrent();
      if (!sameBenchmarkFile(outputBefore, benchmarkFileState(outFile))) throw new Error("benchmark output changed while preparing");
      writeFileAtomic(outFile, archiveBytes, outputBefore?.mode ?? archiveMode);
    } });
    // Archive publication already succeeded. Only local current/input/output checks enter the final log gate.
    const archiveSha256 = sha256Hex(archiveBytes), published = { bytes: archiveBytes, mode: outputBefore?.mode ?? archiveMode };
    try {
      await appendTransparencyEntryAsync({ workspace, type: "BENCHMARK_EXPORTED", agentId,
        artifact: { kind: "amcbench", sha256: archiveSha256, id: bench.benchId } }, { beforeCommit: () => {
          withControlFileLock({ root: dirname(outFile), name: `benchmark-export-${sha256Hex(outFile).slice(0, 24)}`, operation: () => {
            beforePublish?.(); assertSigningAllowed(); assertPurposePublicationCurrent(workspace, captured, signed); assertInputsCurrent();
            if (!sameBenchmarkFile(published, benchmarkFileState(outFile))) throw new Error("benchmark published output changed while preparing transparency");
          } });
        } });
    } catch (error) { throw new BenchmarkTransparencyPublicationError(outFile, archiveSha256, error); }
    return { outFile, bench };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
