import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPublishedInstallerVersion } from "../scripts/lib/published-installer-version.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-published-version-"));
  roots.push(root);
  mkdirSync(join(root, "website"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(root, "dist/cli.js"), 'console.log("2.0.0");\n');
  writeFileSync(join(root, "website/install-channel.json"), JSON.stringify({
    packageVersion: "2.0.0", channels: { githubRelease: { status: "available", version: "1.1.1" } },
  }));
  writeFileSync(join(root, "website/publication-status.json"), JSON.stringify({
    channels: { githubRelease: { status: "live", version: "1.1.1" } },
  }));
  writeFileSync(join(root, "install.sh"), 'PINNED_AMC_RELEASE_VERSION="1.1.1"\n');
  writeFileSync(join(root, "website/install.sh"), readFileSync(join(root, "install.sh")));
  writeFileSync(join(root, "website/install.ps1"), '$PinnedAmcReleaseVersion = "1.1.1"\n');
  return root;
}

function verifyCandidate(root: string, tag: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, AMC_RELEASE_TAG: tag };
  delete env.GITHUB_REF_NAME;
  return spawnSync(process.execPath, [resolve("scripts/verify-release-version.mjs")], { cwd: root, env, encoding: "utf8" });
}

describe("published installer selection", () => {
  it("permits source development without promoting its version into hosted release URLs", () => {
    const root = fixture();
    expect(verifyPublishedInstallerVersion(root).version).toBe("1.1.1");
    const result = verifyCandidate(root, "v2.0.0");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ version: "2.0.0", publishedInstallers: { version: "1.1.1" } });
    expect(verifyCandidate(root, "v1.1.1").stderr).toContain("release tag mismatch");
  });

  it.each(["website/install.sh", "website/install.ps1"])("rejects a source-version pin in %s before building Pages", (path) => {
    const root = fixture();
    writeFileSync(join(root, path), readFileSync(join(root, path), "utf8").replace("1.1.1", "2.0.0"));
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(/Published installer version mismatch/);
  });

  it("requires explicit published metadata instead of falling back to packageVersion", () => {
    const root = fixture();
    writeFileSync(join(root, "website/install-channel.json"), JSON.stringify({ packageVersion: "2.0.0" }));
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(/explicit available GitHub release version/);
  });

  it("rejects a channel version without corresponding publication evidence", () => {
    const root = fixture();
    writeFileSync(join(root, "website/publication-status.json"), JSON.stringify({
      channels: { githubRelease: { status: "live", version: "1.0.0" } },
    }));
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(/no matching live GitHub release/);
  });

  it("rejects drift between raw and hosted Unix installer copies", () => {
    const root = fixture();
    writeFileSync(join(root, "install.sh"), "different installer\n");
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(/Unix installers differ/);
  });
});
