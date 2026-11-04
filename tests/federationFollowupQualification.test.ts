import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import YAML from "yaml";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { exportBenchmarkArtifact } from "../src/benchmarks/benchExport.js";
import { ingestBenchmarks } from "../src/benchmarks/benchImport.js";
import { importedBenchmarksDir } from "../src/benchmarks/benchStore.js";
import { verifyBenchmarkArtifact } from "../src/benchmarks/benchVerify.js";
import { ensureFederationPublisherKey } from "../src/federation/federationIdentity.js";
import { federateInitCli } from "../src/federation/federationCli.js";
import { addFederationPeer, defaultFederationConfig, federationInboxDir, initFederationStore, listFederationPeers,
  loadFederationConfig, verifyFederationConfigSignature } from "../src/federation/federationStore.js";
import { exportFederationPackage, importFederationPackage, verifyFederationPackage } from "../src/federation/federationSync.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { ed25519KeyId, loadTrustContext } from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { operatorTrustHome, pinnedTrust, workspaceKeyPem } from "./helpers/trustContext.js";

const unsafeIds = ["..", "../escape", "sub/../existing-peer", "a/b", "a\\b", "/absolute", "C:/escape", "", ".hidden",
  "-flag", "_leading", "my org", "a\0b", "a\nb", `a${"b".repeat(128)}`];
const validIds = [randomUUID(), "Acme.Corp_2-eu", "0", `a${"b".repeat(127)}`, "a..b"];
const roots: string[] = [], workspaces: string[] = [];
const records: Array<Record<string, unknown>> = [];
const retained: Array<{ path: string; name: string }> = [];
const original = { home: process.env.AMC_HOME, passphrase: process.env.AMC_VAULT_PASSPHRASE };
type Snapshot = Array<Record<string, string | number>>;
let source: string, destination: string, configWorkspace: string, publisherPem: string, auditorPem: string;
let benchmarkFile: string, benchmarkId: string, unpackedBenchmark: string, packageFile: string, manifestId: string;
let seededInbox: string, seededBenchmark: string;
let configFiles: ReturnType<typeof initFederationStore>, config: ReturnType<typeof defaultFederationConfig>;

function ownedRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return root;
}

function workspace(orgName: string): string {
  const root = ownedRoot("amc-federation-followup-");
  workspaces.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  federateInitCli({ workspace: root, orgName });
  return root;
}

/** Names, bytes, inode/link identity and metadata, without following a symlink or collecting vault secrets. */
function snapshot(root: string): Snapshot {
  if (!existsSync(root)) return [{ path: ".", kind: "missing" }];
  const rows: Snapshot = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    const row: Record<string, string | number> = { path: relative(root, path) || ".", mode: stat.mode,
      inode: stat.ino, device: stat.dev, links: stat.nlink, modifiedMs: stat.mtimeMs };
    if (stat.isSymbolicLink()) {
      rows.push({ ...row, kind: "symlink", target: readlinkSync(path) });
    } else if (stat.isDirectory()) {
      rows.push({ ...row, kind: "directory" });
      for (const name of readdirSync(path).sort()) walk(join(path, name));
    } else if (stat.isFile()) {
      rows.push({ ...row, kind: "file", size: stat.size, sha256: sha256Hex(readFileSync(path)) });
    } else {
      throw new Error(`Unexpected fixture file type: ${path}`);
    }
  };
  walk(root); return rows;
}

function linkedSentinels(directory: string): void {
  const dir = join(directory, "owned-sentinels"); mkdirSync(dir, { mode: 0o700 });
  const file = join(dir, "existing.bin");
  writeFileSync(file, "existing signed store fixture sentinel\n", { mode: 0o600 });
  linkSync(file, join(dir, "existing-hardlink.bin"));
  symlinkSync("existing.bin", join(dir, "existing-symlink.bin"));
}

function attempt(run: () => unknown): unknown {
  try { run(); return undefined; } catch (error) { return error; }
}

function errorRecord(error: unknown) {
  const typed = error as { message?: string; issues?: unknown[] } | undefined;
  return { message: typed?.message ?? null, issues: typed?.issues ?? [] };
}

function expectOrgIdRefusal(error: unknown): void {
  expect(error).toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ path: ["federation", "orgId"] })]) });
}

beforeAll(async () => {
  if (!["22", "24"].includes(process.versions.node.split(".")[0]!)) throw new Error("Use a qualified Node 22 or 24 fixture runtime.");
  process.env.AMC_VAULT_PASSPHRASE = "owned-federation-followup-passphrase";
  source = workspace("Owned source"); destination = workspace("Owned destination"); configWorkspace = workspace("Owned config");
  // Capture independent operator pins at fixture creation, before any artifact is exported or inspected.
  publisherPem = ensureFederationPublisherKey(source).publicKeyPem; auditorPem = workspaceKeyPem(source, "auditor");
  expect(ed25519KeyId(publisherPem)).not.toBe(ed25519KeyId(auditorPem));
  records.push({ phase: "operator-pins-before-export", publisherKeyId: ed25519KeyId(publisherPem), auditorKeyId: ed25519KeyId(auditorPem) });
  const home = operatorTrustHome([{ publicKeyPem: publisherPem, purposes: ["artifact-seal"] }]);
  roots.push(home); process.env.AMC_HOME = home;
  addFederationPeer({ workspace: destination, peerId: "source", name: "Owned source", publisherPublicKeyPem: publisherPem });
  const run = await runDiagnostic({ workspace: source, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
  const artifacts = ownedRoot("amc-federation-followup-artifacts-");
  // A genuine existing benchmark and inbox package make silent overwrites observable, as well as new ghost paths.
  const seedFile = exportBenchmarkArtifact({ workspace: source, runId: run.runId, outFile: join(artifacts, "seed.amcbench") }).outFile;
  seededBenchmark = ingestBenchmarks(destination, seedFile, pinnedTrust([{ publicKeyPem: auditorPem, purposes: ["artifact-seal"] }])).imported[0]!.dir;
  const seedPackage = exportFederationPackage({ workspace: source, outFile: join(artifacts, "seed.amcfed") });
  expect(seedPackage.benchmarkCount).toBe(0);
  seededInbox = importFederationPackage({ workspace: destination, bundleFile: seedPackage.outFile }).importedPath;
  linkedSentinels(seededInbox); linkedSentinels(seededBenchmark);
  const benchmark = exportBenchmarkArtifact({ workspace: source, runId: run.runId, outFile: ".amc/benchmarks/inner.amcbench" });
  benchmarkFile = benchmark.outFile; benchmarkId = benchmark.bench.benchId;
  unpackedBenchmark = ownedRoot("amc-federation-followup-unpacked-");
  const tar = spawnSync("tar", ["-xzf", benchmarkFile, "-C", unpackedBenchmark], { encoding: "utf8" });
  expect(tar.error).toBeUndefined(); expect(tar.status).toBe(0);
  const exported = exportFederationPackage({ workspace: source, outFile: join(artifacts, "inner.amcfed") });
  packageFile = exported.outFile; manifestId = exported.manifest.manifestId;
  expect(exported.benchmarkCount).toBe(1);
  retained.push({ path: packageFile, name: "inner.amcfed" }, { path: benchmarkFile, name: "inner.amcbench" },
    { path: seedFile, name: "seed.amcbench" }, { path: seedPackage.outFile, name: "seed.amcfed" });
  records.push({ phase: "genuine-export", packageSha256: sha256Hex(readFileSync(packageFile)), benchmarkSha256: sha256Hex(readFileSync(benchmarkFile)),
    benchmarkId, manifestId, packageBenchmarkCount: exported.benchmarkCount });
  addFederationPeer({ workspace: configWorkspace, peerId: "existing-peer", name: "Existing peer", publisherPublicKeyPem: publisherPem });
  config = defaultFederationConfig({ orgName: "Owned configuration", publisherKeyFingerprint: ensureFederationPublisherKey(configWorkspace).fingerprint });
  configFiles = initFederationStore(configWorkspace, config);
}, 60_000);

afterAll(() => {
  try {
    const dir = process.env.AMC_P0_52_FOLLOWUP_EFFECTS_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (const item of retained) if (existsSync(item.path)) copyFileSync(item.path, join(dir, item.name));
      writeFileSync(join(dir, "followup-effects.json"), JSON.stringify(records, null, 2) + "\n", { mode: 0o600 });
    }
  } finally {
    for (const root of workspaces) lockVault(root);
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    for (const [key, value] of [["AMC_HOME", original.home], ["AMC_VAULT_PASSPHRASE", original.passphrase]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

describe("federation follow-up 3: pre-admit the real inner benchmark", () => {
  test("an admitted outer signature with an unadmitted inner issuer leaves inbox and benchmark snapshots unchanged", () => {
    const trust = loadTrustContext({});
    const outer = verifyFederationPackage(packageFile, trust), inner = verifyBenchmarkArtifact(benchmarkFile, trust);
    expect(outer).toMatchObject({ ok: true, report: { trusted: true, integrity: { status: "pass" } } });
    expect(inner.report).toMatchObject({ trusted: false, integrity: { status: "pass" }, issuerAdmission: { status: "fail" } });
    expect(inner.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
    const before = { inbox: snapshot(federationInboxDir(destination)), benchmarks: snapshot(importedBenchmarksDir(destination)) };
    const error = attempt(() => importFederationPackage({ workspace: destination, bundleFile: packageFile }));
    const after = { inbox: snapshot(federationInboxDir(destination)), benchmarks: snapshot(importedBenchmarksDir(destination)) };
    records.push({ phase: "unadmitted-inner-refusal", outerReport: outer.report, innerReport: inner.report, error: errorRecord(error), before, after });
    expect(error).toBeInstanceOf(Error); expect(String(error)).toMatch(/Invalid benchmark.*not-pinned/s);
    expect(after).toEqual(before);
    expect(existsSync(join(federationInboxDir(destination), "source", manifestId))).toBe(false);
    expect(existsSync(join(importedBenchmarksDir(destination), benchmarkId))).toBe(false);
  });

  test("independently admitting both captured keys imports the package and exact inner benchmark bytes", () => {
    const home = operatorTrustHome([{ publicKeyPem: publisherPem, purposes: ["artifact-seal"] },
      { publicKeyPem: auditorPem, purposes: ["artifact-seal"] }]);
    roots.push(home); process.env.AMC_HOME = home;
    const trust = loadTrustContext({}), verified = verifyBenchmarkArtifact(benchmarkFile, trust);
    expect(verified.report).toMatchObject({ trusted: true, integrity: { status: "pass" }, issuerAdmission: { status: "pass" }, overrides: [] });
    const seededBefore = { inbox: snapshot(seededInbox), benchmark: snapshot(seededBenchmark) };
    const imported = importFederationPackage({ workspace: destination, bundleFile: packageFile });
    expect(imported.benchmarkCount).toBe(1);
    expect(imported.importedPath).toBe(join(federationInboxDir(destination), "source", manifestId));
    const benchmarkDir = join(importedBenchmarksDir(destination), benchmarkId);
    for (const file of ["bench.json", "bench.sig", "public-keys/auditor.pub"]) {
      expect(readFileSync(join(benchmarkDir, file))).toEqual(readFileSync(join(unpackedBenchmark, file)));
    }
    expect(readFileSync(join(imported.importedPath, "manifest.json"), "utf8")).toContain(manifestId);
    expect({ inbox: snapshot(seededInbox), benchmark: snapshot(seededBenchmark) }).toEqual(seededBefore);
    records.push({ phase: "independent-inner-admission", imported, report: verified.report, benchmark: snapshot(benchmarkDir) });
  });
});

describe("federation follow-up 4: peer IDs are refused before paths or writes", () => {
  test.each(unsafeIds)("refuses peerId %j without creating a peer directory or replacing existing signed peers", peerId => {
    const virgin = ownedRoot("amc-federation-virgin-peer-");
    const beforeVirgin = snapshot(virgin), before = snapshot(join(configWorkspace, ".amc", "federation"));
    const virginError = attempt(() => addFederationPeer({ workspace: virgin, peerId, name: "Rejected peer", publisherPublicKeyPem: publisherPem }));
    const error = attempt(() => addFederationPeer({ workspace: configWorkspace, peerId, name: "Forbidden replacement", publisherPublicKeyPem: publisherPem }));
    const afterVirgin = snapshot(virgin), after = snapshot(join(configWorkspace, ".amc", "federation"));
    records.push({ phase: "unsafe-peer-refusal", peerId, virginError: errorRecord(virginError), error: errorRecord(error), beforeVirgin, afterVirgin, before, after });
    expect(String(virginError)).toMatch(/invalid peer id/); expect(String(error)).toMatch(/invalid peer id/);
    expect(afterVirgin).toEqual(beforeVirgin); expect(after).toEqual(before);
    expect(listFederationPeers(configWorkspace).find(row => row.peer.peerId === "existing-peer")).toMatchObject({ valid: true, peer: { name: "Existing peer" } });
  });

  test.each(validIds)("still writes and signs valid peerId %j", peerId => {
    const added = addFederationPeer({ workspace: configWorkspace, peerId, name: "Valid peer", publisherPublicKeyPem: publisherPem });
    expect(added.path).toBe(join(configWorkspace, ".amc", "federation", "peers", `${peerId}.json`));
    expect(added.sigPath).toBe(`${added.path}.sig`);
    expect(listFederationPeers(configWorkspace).find(row => row.peer.peerId === peerId)).toMatchObject({ valid: true, peer: { peerId } });
  });
});

describe("federation follow-up 5: config orgId is constrained on write and load", () => {
  test("a normal generated UUID config writes, loads and verifies its real auditor signature", () => {
    expect(config.federation.orgId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(loadFederationConfig(configWorkspace)).toEqual(config);
    expect(verifyFederationConfigSignature(configWorkspace)).toMatchObject({ valid: true, reason: null });
  });

  test.each(unsafeIds)("refuses writing orgId %j without replacing existing config or signature bytes", orgId => {
    const before = snapshot(join(configWorkspace, ".amc", "federation"));
    const error = attempt(() => initFederationStore(configWorkspace, { federation: { ...config.federation, orgId } }));
    const after = snapshot(join(configWorkspace, ".amc", "federation"));
    records.push({ phase: "unsafe-config-write", orgId, error: errorRecord(error), before, after });
    expectOrgIdRefusal(error); expect(after).toEqual(before);
    expect(loadFederationConfig(configWorkspace)).toEqual(config);
    expect(verifyFederationConfigSignature(configWorkspace).valid).toBe(true);
  });

  test.each(unsafeIds)("refuses loading a genuinely signed config with orgId %j without rewriting it", orgId => {
    const originalConfig = readFileSync(configFiles.path), originalSignature = readFileSync(configFiles.sigPath);
    try {
      // The fixture signer can authenticate malformed content; authentication never exempts schema constraints.
      writeFileSync(configFiles.path, YAML.stringify({ federation: { ...config.federation, orgId } }));
      const digest = sha256Hex(readFileSync(configFiles.path));
      writeFileSync(configFiles.sigPath, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(configWorkspace, "auditor")),
        signedTs: Date.now(), signer: "auditor" }));
      expect(verifyFederationConfigSignature(configWorkspace).valid).toBe(true);
      const before = snapshot(join(configWorkspace, ".amc", "federation"));
      const error = attempt(() => loadFederationConfig(configWorkspace));
      const after = snapshot(join(configWorkspace, ".amc", "federation"));
      records.push({ phase: "unsafe-config-load", orgId, independentlyValidSignature: true, error: errorRecord(error), before, after });
      expectOrgIdRefusal(error); expect(after).toEqual(before);
    } finally {
      writeFileSync(configFiles.path, originalConfig); writeFileSync(configFiles.sigPath, originalSignature);
    }
    expect(readFileSync(configFiles.path)).toEqual(originalConfig); expect(readFileSync(configFiles.sigPath)).toEqual(originalSignature);
    expect(verifyFederationConfigSignature(configWorkspace).valid).toBe(true);
  });
});
