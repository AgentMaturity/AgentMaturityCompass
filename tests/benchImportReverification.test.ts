import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { sign } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createBenchArtifact } from "../src/bench/benchArtifact.js";
import { createBenchComparison, createBenchComparisonAsync, loadImportedBenchObjects } from "../src/bench/benchComparer.js";
import { initBenchPolicy, saveBenchRegistriesConfig } from "../src/bench/benchPolicyStore.js";
import { importBenchFromRegistry } from "../src/bench/benchRegistryClient.js";
import { initBenchRegistry, publishBenchToRegistry } from "../src/bench/benchRegistryServer.js";
import type { BenchRegistryIndex } from "../src/bench/benchRegistrySchema.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];

async function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), "amc-bench-reverify-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initBenchPolicy(workspace);
  const created = createBenchArtifact({ workspace, scope: "workspace", outFile: "source.amcbench", windowDays: 30 });
  const registry = initBenchRegistry({ dir: join(workspace, "registry"), registryId: "fixture", registryName: "Fixture" });
  const published = publishBenchToRegistry({ dir: join(workspace, "registry"), benchFile: created.outFile, registryKeyPath: registry.keyPath });
  saveBenchRegistriesConfig(workspace, { benchRegistries: { version: 1, registries: [{
    id: "fixture", type: "file", base: join(workspace, "registry"), pinnedRegistryFingerprint: registry.fingerprint,
    allowSignerFingerprints: [], allowTrustLabels: ["HIGH", "MEDIUM", "LOW"], requireBenchProofs: false, autoUpdate: false
  }] } });
  const imported = await importBenchFromRegistry({ workspace, registryId: "fixture", benchRef: `${published.benchId}@${published.version}` });
  const cache = join(workspace, ".amc", "bench", "imports", "cache", "fixture");
  return { workspace, created, registry, imported, cache };
}

function cacheIndex(f: Awaited<ReturnType<typeof fixture>>, change: (index: BenchRegistryIndex) => void, resign = false) {
  const file = join(f.cache, "index.json");
  const index = JSON.parse(readFileSync(file, "utf8")) as BenchRegistryIndex;
  change(index);
  const payload = canonicalize(index);
  writeFileSync(file, payload);
  if (resign) writeFileSync(join(f.cache, "index.sig"), JSON.stringify({
    digestSha256: sha256Hex(payload), signature: sign(null, Buffer.from(payload), readFileSync(f.registry.keyPath, "utf8")).toString("base64"),
    signedTs: Date.now(), signer: "registry"
  }));
}

function rewriteArchive(f: Awaited<ReturnType<typeof fixture>>, member: string, change: (value: Record<string, unknown>) => Record<string, unknown>) {
  const stage = mkdtempSync(join(tmpdir(), "amc-bench-reverify-archive-"));
  roots.push(stage);
  expect(spawnSync("tar", ["-xzf", f.imported.filePath, "-C", stage]).status).toBe(0);
  const file = join(stage, "amc-bench", member);
  writeFileSync(file, JSON.stringify(change(JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)));
  expect(spawnSync("tar", ["-czf", f.imported.filePath, "-C", stage, "amc-bench"]).status).toBe(0);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("AXE-22 imported bench verification on load", () => {
  test("admits an unchanged signed import into synchronous and asynchronous percentiles", async () => {
    const f = await fixture();
    expect(loadImportedBenchObjects(f.workspace)).toHaveLength(1);
    expect(createBenchComparison({ workspace: f.workspace, scope: "workspace", id: "workspace" }).comparison.population.count).toBe(1);
    expect((await createBenchComparisonAsync({ workspace: f.workspace, scope: "workspace", id: "workspace" })).comparison.population.count).toBe(1);
  });

  test("refuses edited extracted JSON before synchronous or asynchronous comparison", async () => {
    const f = await fixture();
    const file = join(dirname(f.imported.filePath), "bench.json");
    const bench = JSON.parse(readFileSync(file, "utf8")) as { generatedTs: number };
    writeFileSync(file, JSON.stringify({ ...bench, generatedTs: bench.generatedTs + 1 }));
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/extracted bench.*verified/i);
    expect(() => createBenchComparison({ workspace: f.workspace, scope: "workspace", id: "workspace" })).toThrow(/extracted bench.*verified/i);
    await expect(createBenchComparisonAsync({ workspace: f.workspace, scope: "workspace", id: "workspace" })).rejects.toThrow(/extracted bench.*verified/i);
  });

  test("rechecks the artifact signature even when the signed index admits its current digest", async () => {
    const f = await fixture();
    rewriteArchive(f, "bench.sig", signature => ({ ...signature, signature: Buffer.alloc(64).toString("base64") }));
    cacheIndex(f, index => { index.benches[0]!.versions[0]!.sha256 = sha256Hex(readFileSync(f.imported.filePath)); }, true);
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/bench artifact verify failed/i);
  });

  test("binds a valid replacement artifact to the digest in the authenticated index", async () => {
    const f = await fixture();
    const replacement = createBenchArtifact({ workspace: f.workspace, scope: "workspace", outFile: "replacement.amcbench", windowDays: 30 });
    copyFileSync(replacement.outFile, f.imported.filePath);
    writeFileSync(join(dirname(f.imported.filePath), "bench.json"), JSON.stringify(replacement.bench));
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/signed registry item/i);
  });

  test("does not admit a cached index edited without the registry signature", async () => {
    const f = await fixture();
    cacheIndex(f, index => { index.benches[0]!.versions[0]!.signerFingerprint = "f".repeat(64); });
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/registry signature invalid/i);
  });

  test("refuses missing archives and malformed import metadata instead of silently dropping them", async () => {
    const f = await fixture();
    const bytes = readFileSync(f.imported.filePath);
    rmSync(f.imported.filePath);
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/bench import artifact or extracted JSON missing/i);
    writeFileSync(f.imported.filePath, bytes);
    const meta = join(dirname(f.imported.filePath), "meta.json");
    const originalMeta = JSON.parse(readFileSync(meta, "utf8")) as Record<string, unknown>;
    rmSync(meta);
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/import metadata/i);
    writeFileSync(meta, "not json");
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/import metadata/i);
    writeFileSync(meta, JSON.stringify({ ...originalMeta, benchId: "bench_other" }));
    expect(() => loadImportedBenchObjects(f.workspace)).toThrow(/import metadata/i);
  });
});
