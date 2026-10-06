import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReleaseBundle } from "../src/release/releaseBundle.js";
import { verifyReleaseBundle } from "../src/release/releaseVerifier.js";
import { signReleaseManifest } from "../src/release/releaseSigner.js";
import { fileSha256, runTarCreate, runTarExtract } from "../src/release/releaseUtils.js";
import type { ReleaseManifest } from "../src/release/releaseSchema.js";
import { canonicalize } from "../src/utils/json.js";
import { pinnedTrust } from "./helpers/trustContext.js";

const releaseTrust = (publicKeyPath: string) => pinnedTrust([{ publicKeyPem: readFileSync(publicKeyPath, "utf8"), purposes: ["release"] }]);

const temporary: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(content = "export const clean = true;\n") {
  const dir = mkdtempSync(join(tmpdir(), "amc-release-authority-"));
  temporary.push(dir);
  const workspace = join(dir, "source");
  mkdirSync(join(workspace, "dist"), { recursive: true });
  writeFileSync(join(workspace, "package.json"), JSON.stringify({
    name: "agent-maturity-compass", version: "1.0.0", license: "MIT", files: ["dist"],
    scripts: { build: "node -e \"require('fs').writeFileSync('dist/built.txt', 'built')\"" }
  }));
  writeFileSync(join(workspace, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  writeFileSync(join(workspace, "dist", "index.js"), content);
  const pair = generateKeyPairSync("ed25519");
  const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const privateKeyPath = join(dir, "signing.pem");
  const publicKeyPath = join(dir, "signing.pub");
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, pair.publicKey.export({ format: "pem", type: "spki" }));
  return { dir, workspace, privateKey, privateKeyPath, publicKeyPath, outFile: join(dir, "release.amcrelease"), skipInstallBuild: true };
}

function resign(f: ReturnType<typeof fixture>, root: string, manifest: ReleaseManifest, output: string) {
  writeFileSync(join(root, "manifest.json"), canonicalize(manifest));
  writeFileSync(join(root, "manifest.sig"), signReleaseManifest(manifest, f.privateKey));
  runTarCreate(join(root, ".."), output);
}

describe("release scan authority", () => {
  it("refuses a HIGH finding by default without producing a signed release", () => {
    const f = fixture(`export const synthetic = '${"sk-" + "fixtureOnlyNotIssued123456789"}';\n`);
    expect(() => createReleaseBundle(f)).toThrow(/secret scan/i);
    expect(existsSync(f.outFile)).toBe(false);
  });

  it("cannot opt a release into a skipped scan", () => {
    const f = fixture();
    expect(() => createReleaseBundle({ ...f, skipSecretScan: true })).toThrow(/secret scan/i);
    expect(existsSync(f.outFile)).toBe(false);
  });

  it("refuses secrets introduced by final provenance metadata before producing an archive", () => {
    const f = fixture();
    vi.stubEnv("GITHUB_WORKFLOW", "sk-" + "fixtureOnlyNotIssued123456789");
    expect(() => createReleaseBundle(f)).toThrow(/secret scan/i);
    expect(existsSync(f.outFile)).toBe(false);
  });

  it("independently refuses secret-bearing npm members despite valid hashes, signature and a PASS report", () => {
    const f = fixture();
    createReleaseBundle(f);
    expect(verifyReleaseBundle(f.outFile, releaseTrust(f.publicKeyPath), f.publicKeyPath).ok).toBe(true);
    const extracted = join(f.dir, "extract");
    mkdirSync(extracted);
    runTarExtract(f.outFile, extracted);
    const root = join(extracted, "amc-release");
    const npmPath = join(root, "artifacts", "npm", "agent-maturity-compass-1.0.0.tgz");
    const npmRoot = join(f.dir, "npm-content");
    mkdirSync(npmRoot);
    runTarExtract(npmPath, npmRoot);
    writeFileSync(join(npmRoot, "package", "dist", "index.js"), "sk-" + "fixtureOnlyNotIssued123456789");
    runTarCreate(npmRoot, npmPath);
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as ReleaseManifest;
    manifest.artifacts.npmTgzSha256 = fileSha256(npmPath);
    const changed = join(f.dir, "changed.amcrelease");
    resign(f, root, manifest, changed);
    const verified = verifyReleaseBundle(changed, releaseTrust(f.publicKeyPath), f.publicKeyPath);
    expect(verified.ok).toBe(false);
    expect(verified.errors.some(error => /content secret scan/i.test(error))).toBe(true);
    expect(verified.errors.some(error => /signature|sha mismatch/i.test(error))).toBe(false);
  });

  it.each([
    { status: "PASS" },
    { v: 1, status: "PASS", findings: [{ severity: "HIGH", type: "fixture", path: "index.js", pattern: "fixture", snippetRedacted: "<REDACTED>" }] }
  ])("refuses an invalid or contradictory signed scan report: %j", report => {
    const f = fixture();
    createReleaseBundle(f);
    const extracted = join(f.dir, "extract");
    mkdirSync(extracted);
    runTarExtract(f.outFile, extracted);
    const root = join(extracted, "amc-release");
    const reportPath = join(root, "checks", "secret-scan.json");
    writeFileSync(reportPath, JSON.stringify(report));
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as ReleaseManifest;
    manifest.artifacts.secretScanSha256 = fileSha256(reportPath);
    const changed = join(f.dir, "changed.amcrelease");
    resign(f, root, manifest, changed);
    const verified = verifyReleaseBundle(changed, releaseTrust(f.publicKeyPath), f.publicKeyPath);
    expect(verified.ok).toBe(false);
    expect(verified.errors.some(error => /signature|sha mismatch/i.test(error))).toBe(false);
  });

  it("builds a pnpm source workspace using its frozen lockfile before packing", () => {
    const f = fixture();
    rmSync(join(f.workspace, "package-lock.json"));
    writeFileSync(join(f.workspace, "pnpm-workspace.yaml"), "packages: []\n");
    const install = spawnSync("pnpm", ["install", "--lockfile-only"], { cwd: f.workspace, encoding: "utf8", timeout: 30_000 });
    expect(install.status).toBe(0);
    const packed = createReleaseBundle({ ...f, skipInstallBuild: false });
    expect(existsSync(join(f.workspace, "dist", "built.txt"))).toBe(true);
    expect(verifyReleaseBundle(packed.outFile, releaseTrust(f.publicKeyPath), f.publicKeyPath).ok).toBe(true);
  });
});
