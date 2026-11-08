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
  writeFileSync(join(root, "website/index.html"), [
    '<a href="https://github.com/AgentMaturity/AgentMaturityCompass/releases/tag/v1.1.1" class="btn" rel="noopener">Download 1.1.1 for macOS →</a>',
    '<a class="btn" href="https://github.com/AgentMaturity/AgentMaturityCompass/releases/tag/v1.1.1">Download 1.1.1 for Windows →</a>',
    '<a href="https://github.com/AgentMaturity/AgentMaturityCompass/releases" target="_blank">GitHub Releases</a>',
  ].join("\n"));
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

  it("checks every homepage download button against the pinned release", () => {
    expect(verifyPublishedInstallerVersion(fixture()).websiteDownloads).toBe(2);
    // The real homepage: a regex that silently matched no button would check nothing.
    expect(verifyPublishedInstallerVersion(resolve(".")).websiteDownloads).toBeGreaterThan(0);
  });

  it.each([
    ["names another version", "Download 1.1.1 for macOS", "Download 2.0.0 for macOS", /Published installer version mismatch/],
    ["links another release tag", "releases/tag/v1.1.1\" class=\"btn\" rel", "releases/tag/v2.0.0\" class=\"btn\" rel", /Published installer version mismatch/],
    ["links releases/latest", "releases/tag/v1.1.1\" class=\"btn\" rel", "releases/latest\" class=\"btn\" rel", /releases\/latest/],
  ])("rejects a homepage download button that %s", (_case, from, to, error) => {
    const root = fixture();
    const page = join(root, "website/index.html");
    writeFileSync(page, readFileSync(page, "utf8").replace(from, to));
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(error);
  });

  it("rejects drift between raw and hosted Unix installer copies", () => {
    const root = fixture();
    writeFileSync(join(root, "install.sh"), "different installer\n");
    expect(() => verifyPublishedInstallerVersion(root)).toThrow(/Unix installers differ/);
  });
});
