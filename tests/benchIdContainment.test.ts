import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { exportBenchmarkArtifact } from "../src/benchmarks/benchExport.js";
import { ingestBenchmarks } from "../src/benchmarks/benchImport.js";
import { benchmarkSchema } from "../src/benchmarks/benchSchema.js";
import { importedBenchPath } from "../src/bench/benchRegistryStore.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { ensureFederationPublisherKey, signFederationDigest } from "../src/federation/federationIdentity.js";
import { addFederationPeer, federationInboxDir } from "../src/federation/federationStore.js";
import { exportFederationPackage, importFederationPackage } from "../src/federation/federationSync.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { pinnedTrust, workspaceKeyPem } from "./helpers/trustContext.js";

// A benchmark is signed content, not trusted content: its benchId names the directory it is imported into (P0-52).

const roots: string[] = [];
const priorHome = process.env.AMC_HOME;
const UNSAFE_IDS = ["../../../POC_ESCAPED", "..", "../x", "a/b", "/abs", ".hidden", "a\\b", "x".repeat(129)];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function newWorkspace(orgName: string): string {
  const dir = tempDir("amc-benchid-");
  process.env.AMC_VAULT_PASSPHRASE = "federation-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  federateInitCli({ workspace: dir, orgName });
  return dir;
}

function tree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      out.push(relative(root, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return out.sort();
}

let source = "";
let goodBench = "";
let goodBenchJson: Record<string, unknown> = {};

beforeAll(async () => {
  source = newWorkspace("Source Org");
  const run = await runDiagnostic({ workspace: source, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
  goodBench = join(tempDir("amc-benchid-good-"), "good.amcbench");
  exportBenchmarkArtifact({ workspace: source, runId: run.runId, agentId: "default", outFile: goodBench });
  const unpacked = tempDir("amc-benchid-unpack-");
  expect(spawnSync("tar", ["-xzf", goodBench, "-C", unpacked]).status).toBe(0);
  goodBenchJson = JSON.parse(readFileSync(join(unpacked, "bench.json"), "utf8")) as Record<string, unknown>;
}, 60_000);

beforeEach(() => {
  process.env.AMC_HOME = tempDir("amc-benchid-home-");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (priorHome === undefined) delete process.env.AMC_HOME;
  else process.env.AMC_HOME = priorHome;
});

afterAll(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The real exported benchmark with another benchId, re-signed the way its signer would (so only the benchId is wrong). */
function benchmarkWithId(benchId: string, signer: "auditor" | "publisher"): string {
  const dir = tempDir("amc-benchid-craft-");
  mkdirSync(join(dir, "public-keys"));
  writeFileSync(join(dir, "bench.json"), JSON.stringify({ ...goodBenchJson, benchId }, null, 2));
  const digest = sha256Hex(readFileSync(join(dir, "bench.json")));
  const signature = signer === "auditor" ? signHexDigest(digest, getPrivateKeyPem(source, "auditor")) : signFederationDigest(source, digest);
  writeFileSync(join(dir, "bench.sig"), JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" }, null, 2));
  writeFileSync(join(dir, "public-keys", "auditor.pub"), signer === "auditor" ? workspaceKeyPem(source, "auditor") : ensureFederationPublisherKey(source).publicKeyPem);
  const out = join(tempDir("amc-benchid-out-"), "crafted.amcbench");
  expect(spawnSync("tar", ["-czf", out, "-C", dir, "."]).status).toBe(0);
  return out;
}

const auditorTrust = () => pinnedTrust([{ publicKeyPem: workspaceKeyPem(source, "auditor"), purposes: ["artifact-seal"] }]);

describe("benchmark schema benchId", () => {
  test.each(["bench_0123456789abcdef0123456789abcdef", "bench-1", "Acme.Bench_2"])("accepts %s", (benchId) => {
    expect(benchmarkSchema.safeParse({ ...goodBenchJson, benchId }).success).toBe(true);
  });

  test("accepts the benchId a real export produces", () => {
    expect(benchmarkSchema.safeParse(goodBenchJson).success).toBe(true);
    expect(String(goodBenchJson.benchId)).toMatch(/^bench_[0-9a-f]{32}$/);
  });

  test.each(UNSAFE_IDS.concat([""]))("rejects the benchId %j", (benchId) => {
    expect(benchmarkSchema.safeParse({ ...goodBenchJson, benchId }).success).toBe(false);
  });
});

describe("ingestBenchmarks with a benchmark signed by an operator-pinned key", () => {
  test("still imports a genuine benchmark into imported/<benchId>", () => {
    const dest = newWorkspace("Dest Org");
    const { imported } = ingestBenchmarks(dest, goodBench, auditorTrust());
    expect(imported).toHaveLength(1);
    expect(imported[0]!.dir).toBe(join(dest, ".amc", "benchmarks", "imported", String(goodBenchJson.benchId)));
    expect(existsSync(join(imported[0]!.dir, "bench.json"))).toBe(true);
  });

  test.each(UNSAFE_IDS)("refuses the benchId %j and writes nothing", (benchId) => {
    const dest = newWorkspace("Dest Org");
    const before = tree(dest);
    expect(() => ingestBenchmarks(dest, benchmarkWithId(benchId, "auditor"), auditorTrust())).toThrow(/Invalid benchmark/);
    expect(tree(dest)).toEqual(before);
  });

  test("refuses on its own, without the schema, when the target would leave imported/", () => {
    const dest = newWorkspace("Dest Org");
    const before = tree(dest);
    const evil = benchmarkWithId("../../../POC_ESCAPED", "auditor");
    vi.spyOn(benchmarkSchema, "parse").mockImplementation((value: unknown) => value as never);
    expect(() => ingestBenchmarks(dest, evil, auditorTrust())).toThrow(/escapes the imported benchmarks directory/);
    expect(tree(dest)).toEqual(before);
    expect(existsSync(join(dest, "POC_ESCAPED"))).toBe(false);
  });
});

describe("federation import of a benchmark signed by an admitted peer", () => {
  test("a peer-signed benchmark whose benchId climbs out of imported/ is refused and nothing lands outside the inbox", () => {
    const dest = newWorkspace("Dest Org");
    addFederationPeer({ workspace: dest, peerId: "peer-a", name: "A", publisherPublicKeyPem: ensureFederationPublisherKey(source).publicKeyPem });
    const evilFile = join(source, ".amc", "benchmarks", "evil.amcbench");
    mkdirSync(dirname(evilFile), { recursive: true });
    copyFileSync(benchmarkWithId("../../../POC_ESCAPED", "publisher"), evilFile);
    let bundle: string;
    try {
      bundle = exportFederationPackage({ workspace: source, outFile: join(tempDir("amc-benchid-fed-"), "evil.amcfed") }).outFile;
    } finally {
      rmSync(evilFile, { force: true });
    }
    const outsideInbox = (paths: string[]): string[] => paths.filter((path) => !path.startsWith(relative(dest, federationInboxDir(dest))));
    const before = outsideInbox(tree(dest));
    expect(() => importFederationPackage({ workspace: dest, bundleFile: bundle })).toThrow(/Invalid benchmark/);
    expect(outsideInbox(tree(dest))).toEqual(before);
    expect(existsSync(join(dest, "POC_ESCAPED"))).toBe(false);
  });
});

describe("importedBenchPath (registry imports, src/bench)", () => {
  const workspace = "/tmp/amc-benchid-workspace";

  test("keeps a registry benchId and version under the imports directory", () => {
    const path = importedBenchPath(workspace, "bench_0123abcd", "2026-10-07T08:00:00.000Z");
    expect(path.dir).toBe(join(workspace, ".amc", "bench", "imports", "benches", "bench_0123abcd", "2026-10-07T08:00:00.000Z"));
    expect(path.artifactPath).toBe(join(path.dir, "bench.amcbench"));
  });

  test.each([
    ["a parent benchId", "../../../escaped", "1.0.0"],
    ["a parent version", "bench_0123abcd", "../../../../escaped"],
    ["an absolute benchId", "/etc", "1.0.0"],
    ["a benchId and version that name the imports directory itself", ".", "."]
  ])("refuses %s", (_label, benchId, version) => {
    expect(() => importedBenchPath(workspace, benchId, version)).toThrow(/escapes the imported benches directory/);
  });
});
