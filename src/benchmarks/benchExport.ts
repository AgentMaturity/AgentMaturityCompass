import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import { appendTransparencyEntry } from "../transparency/logChain.js";

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

export function exportBenchmarkArtifact(params: {
  workspace: string;
  agentId?: string;
  runId: string;
  outFile: string;
  publisherOrgName?: string;
  publisherContact?: string;
  publicAgentId?: string | null;
  notes?: string | null;
}): {
  outFile: string;
  bench: BenchmarkArtifact;
} {
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
