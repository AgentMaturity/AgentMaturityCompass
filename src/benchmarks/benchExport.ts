import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { getSigningKey, getPublicKeyHistory, signHexDigest } from "../crypto/keys.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadAgentConfig, agentConfigSchema } from "../fleet/registry.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { benchmarkSchema, type BenchmarkArtifact } from "./benchSchema.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { trustConfigPath, trustConfigSigPath } from "../trust/trustConfig.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureOrgFiles, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { highWaterPath } from "../keys/highWater.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import type { AssuranceReport, AssurancePackResult } from "../types.js";
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
    throw new Error(`Failed to create benchmark artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`, out.error === undefined ? undefined : { cause: out.error });
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

function prepareBenchmarkArtifact(params: BenchmarkExportInput, selected?: { run: ReturnType<typeof loadRunReport>; agent: ReturnType<typeof loadAgentConfig>; assurance: Map<string, AssurancePackResult>; reportSha256: string | null; bomSha256: string | null }) {
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId);
  const run = selected?.run ?? loadRunReport(workspace, params.runId, agentId);
  const agent = selected?.agent ?? loadAgentConfig(workspace, agentId);
  const assurance = selected?.assurance ?? latestAssuranceByPack({
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
  const reportSha256 = selected === undefined ? (pathExists(runPath) ? sha256Hex(readFileSync(runPath)) : null) : selected.reportSha256;
  let bomSha256: string | null = selected?.bomSha256 ?? null;
  const bomPath = join(workspace, "amc-bom.json");
  if (selected === undefined && pathExists(bomPath)) {
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

class BenchmarkTransparencyPublicationError extends Error {
  readonly code = "BENCHMARK_TRANSPARENCY_PUBLICATION_INCOMPLETE";
  constructor(readonly outFile: string, readonly sha256: string, cause: unknown, readonly transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null) {
    super("Benchmark archive was published; transparency publication is incomplete", { cause }); this.name = "BenchmarkTransparencyPublicationError";
  }
}
class BenchmarkArchivePublicationError extends Error {
  readonly code = "BENCHMARK_ARCHIVE_PUBLICATION_INCOMPLETE";
  constructor(readonly outFile: string, readonly sha256: string, readonly writeReturned: boolean, cause: unknown) {
    super(writeReturned ? "Benchmark archive write returned; acknowledgment failed" : "Benchmark archive writer threw; inspect the uncertain destination", { cause }); this.name = "BenchmarkArchivePublicationError";
  }
}
/** Finite used-input/authority/log aliases only; no host output authorization policy. */
function BenchmarkProtectionPaths(workspace: string, inputs: readonly string[]): string[] {
  const keyset = assertKeysetComplete(workspace);
  return [...new Set([...inputs, ...Object.keys(keyset?.files ?? {}).map(path => join(workspace, ".amc", path)),
    trustConfigPath(workspace), trustConfigSigPath(workspace), highWaterPath(),
    ...["amc.config.yaml", "amc.config.yaml.sig", "mode.json", "vault.amcvault", "vault.amcvault.meta.json",
      "keys/keyset.json", "keys/keyset.pending.json", "keys/revocations.signed.json", "keys/artifact-seal.pub", "keys/artifact-seal_history.json", "keys/auditor_ed25519.pub", "keys/auditor_history.json",
      "transparency/log.jsonl", "transparency/log.seal.json", "transparency/log.seal.sig", "transparency/.workspace-transparency.lock", "transparency/.workspace-transparency-locks",
      "transparency/merkle/current.root.json", "transparency/merkle/current.root.sig", "transparency/merkle/leaves.jsonl", "transparency/merkle/roots.jsonl",
      "transparency/merkle/frontier.json", "transparency/merkle/pending.json", "transparency/merkle/migration.json", "transparency/merkle/migration.sig"].map(path => join(workspace, ".amc", path))])];
}
function assertBenchmarkOutputSafe(output: string, physical: string, protectedPaths: readonly string[]): void {
  if (physicalPathWithMissingSuffix(output) !== physical) throw new Error("Benchmark output physical selection changed while preparing");
  const target = captureOrgFiles([output]).members[0]!;
  for (const source of protectedPaths) {
    if (physicalPathWithMissingSuffix(source) === physical) throw new Error("Benchmark output aliases a used input, authority or later log destination");
    if (target.identity !== null) {
      try { const stat = lstatSync(source); if (`${stat.dev}:${stat.ino}` === target.identity) throw new Error("Benchmark output hardlinks a used input, authority or later log destination"); }
      catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    }
  }
}

/** Maintained awaitable producer. The raw four-field signature wire and direct artifact purpose remain unchanged. */
export async function exportBenchmarkArtifactAsync(input: BenchmarkExportInput, options: { beforePublish?: () => void } = {}): Promise<{ outFile: string; bench: BenchmarkArtifact }> {
  const params = { ...input }, beforePublish = options.beforePublish, workspace = resolve(params.workspace);
  const actor = () => { beforePublish?.(); if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize benchmark signing"); };
  actor();
  const captured = capturePurposePublication(workspace, "artifact-seal"), originalAuthority = captureRunHashAuthority(workspace, false);
  const logAuthority = captureWorkspaceLogAuthority(workspace, actor);
  const agentId = resolveAgentId(workspace, params.agentId), paths = getAgentPaths(workspace, agentId), pathRef = JSON.stringify(paths);
  const reportsDir = join(paths.reportsDir, "assurance"), outFile = resolve(workspace, params.outFile);
  const scopedRunPath = join(paths.runsDir, `${params.runId}.json`), legacyRunPath = join(workspace, ".amc", "runs", `${params.runId}.json`);
  const inputFiles = [...new Set([scopedRunPath, legacyRunPath, paths.agentConfig, join(workspace, "amc-bom.json")])];
  const reports = () => pathExists(reportsDir) ? readdirSync(reportsDir).filter(name => name.endsWith(".json")).map(name => join(reportsDir, name)).sort((a, b) => a.localeCompare(b)) : [];
  const reportPaths = reports(), original = captureOrgFiles([...inputFiles, ...reportPaths]);
  const read = (path: string) => original.members.find(row => row.path === path)!.bytes;
  const runBytes = read(scopedRunPath) ?? read(legacyRunPath);
  if (runBytes === null) throw new Error("benchmark run report not found");
  const run = JSON.parse(runBytes.toString("utf8")) as ReturnType<typeof loadRunReport>, agentBytes = read(paths.agentConfig);
  if (agentBytes === null) throw new Error(`Agent config not found: ${paths.agentConfig}`);
  const agent = agentConfigSchema.parse(YAML.parse(agentBytes.toString("utf8")) as unknown);
  ensureDir(reportsDir); // Retain latestAssuranceByPack's existing initialization, before the first wait.
  const latest = new Map<string, { ts: number; pack: AssurancePackResult }>();
  for (const path of reportPaths) {
    const report = JSON.parse(read(path)!.toString("utf8")) as AssuranceReport;
    if (report.agentId !== agentId || report.ts < run.windowStartTs || report.ts > run.windowEndTs) continue;
    for (const pack of report.packResults) { const prior = latest.get(pack.packId); if (!prior || report.ts > prior.ts) latest.set(pack.packId, { ts: report.ts, pack }); }
  }
  const prepared = prepareBenchmarkArtifact({ ...params, workspace, agentId }, { run, agent, assurance: new Map([...latest].map(([id, row]) => [id, row.pack])),
    reportSha256: read(scopedRunPath) === null ? null : sha256Hex(read(scopedRunPath)!), bomSha256: read(join(workspace, "amc-bom.json")) === null ? null : sha256Hex(read(join(workspace, "amc-bom.json"))!) });
  if (prepared.bench.run.runId !== params.runId) throw new Error("benchmark run reference does not match the requested record");
  let expectedOutput = captureOrgFiles([outFile]), expectedReportPaths = reportPaths;
  const physical = physicalPathWithMissingSuffix(outFile), lockName = `benchmark-export-${sha256Hex(outFile).slice(0, 24)}`;
  const protectedPaths = BenchmarkProtectionPaths(workspace, [...original.members.map(row => row.path), join(dirname(outFile), `.${lockName}.lock`), join(dirname(outFile), `.${lockName}-locks`)]);
  const assertInputsCurrent = () => {
    if (resolveAgentId(workspace, params.agentId) !== agentId || JSON.stringify(getAgentPaths(workspace, agentId)) !== pathRef
      || JSON.stringify(reports()) !== JSON.stringify(expectedReportPaths)) throw new Error("benchmark input references changed while preparing");
    assertOrgPairsCurrent(original);
  };
  const assertCurrent = () => { actor(); originalAuthority(); logAuthority.assertCurrent(); assertInputsCurrent();
    assertBenchmarkOutputSafe(outFile, physical, protectedPaths); assertOrgPairsCurrent(expectedOutput); };
  assertCurrent();
  const bench = prepared.bench, bytes = Buffer.from(JSON.stringify(bench, null, 2), "utf8"), digest = sha256Hex(bytes);
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-async-"));
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: dirname(outFile), name: lockName, operation });
  let failed = false, primary: unknown, archiveWriteAttempted = false, archiveWriteReturned = false, archiveSha256: string | null = null;
  let transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null = null;
  try {
    const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"), { beforeSign: assertCurrent });
    assertCurrent(); assertPurposePublicationCurrent(workspace, captured, signed);
    const content = join(tmp, "content"), archive = join(tmp, "prepared.amcbench");
    ensureDir(join(content, "public-keys"));
    writeFileAtomic(join(content, "bench.json"), bytes, 0o644);
    const signature: BenchSignature = { digestSha256: digest, signature: signed.signature.toString("base64"), signedTs: Date.now(), signer: "auditor" };
    writeFileAtomic(join(content, "bench.sig"), JSON.stringify(signature, null, 2), 0o644);
    writeFileAtomic(join(content, "public-keys", "auditor.pub"), signed.publicKeyPem, 0o644);
    runTarCreate(content, archive);
    const archiveBytes = readFileSync(archive), mode = expectedOutput.members[0]!.mode ?? (lstatSync(archive).mode & 0o777);
    const preparedArchiveSha256 = sha256Hex(archiveBytes); archiveSha256 = preparedArchiveSha256;
    const assertSignedCurrent = () => { assertCurrent(); assertPurposePublicationCurrent(workspace, captured, signed); assertOrgPairsCurrent(expectedOutput); };
    locked(() => {
      assertSignedCurrent(); archiveWriteAttempted = true;
      try {
        writeFileAtomic(outFile, archiveBytes, mode); archiveWriteReturned = true;
        const acknowledged = captureOrgFiles([outFile]), row = acknowledged.members[0]!;
        if (row.bytes === null || !row.bytes.equals(archiveBytes) || row.mode !== mode) throw new Error("benchmark archive differs from its exact prepared bytes or mode");
        expectedOutput = acknowledged;
        if (dirname(outFile) === reportsDir && outFile.endsWith(".json") && !reportPaths.includes(outFile)) expectedReportPaths = [...reportPaths, outFile].sort((a, b) => a.localeCompare(b));
      } catch (cause) { throw new BenchmarkArchivePublicationError(outFile, preparedArchiveSha256, archiveWriteReturned, cause); }
    });
    try {
      transparency = await appendTransparencyEntryAsync({ workspace, type: "BENCHMARK_EXPORTED", agentId,
        artifact: { kind: "amcbench", sha256: preparedArchiveSha256, id: bench.benchId } }, { beforeCommit: () => locked(assertSignedCurrent) });
      assertSignedCurrent();
    } catch (cause) { throw new BenchmarkTransparencyPublicationError(outFile, preparedArchiveSha256, cause, transparency); }
    return { outFile, bench };
  } catch (cause) { failed = true; primary = cause; throw cause; }
  finally { try { rmSync(tmp, { recursive: true, force: true }); } catch (cleanup) {
    const error = new AggregateError(failed ? [primary, cleanup] : [cleanup], "Benchmark temporary cleanup failed", { cause: failed ? primary : cleanup });
    Object.assign(error, { outFile, archiveSha256, archiveWriteAttempted, archiveWriteReturned, transparency }); throw error;
  } }
}
