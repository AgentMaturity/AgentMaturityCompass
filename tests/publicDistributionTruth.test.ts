import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const root = resolve(process.cwd());
const temporaryDirectories: string[] = [];

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "amc-public-install-"));
  temporaryDirectories.push(path);
  return path;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function withFixtureServer<T>(directory: string, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer((request, response) => {
    const requested = basename(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const path = join(directory, requested);
    if (!existsSync(path)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.end(readFileSync(path));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("fixture server did not expose a TCP port");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}

async function runInstaller(env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn("sh", [resolve(root, "website/install.sh")], {
      cwd: root,
      env: { ...process.env, ...env }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

function writeUnixFixture(directory: string, version: string, digestOverride?: string): {
  marker: string;
  platform: string;
} {
  const platform = "linux-x64";
  const base = `amc-${version}-${platform}`;
  const packageDirectory = join(directory, base);
  mkdirSync(packageDirectory, { recursive: true });
  const installer = join(packageDirectory, "install.sh");
  writeFileSync(installer, "#!/usr/bin/env sh\nset -eu\nprintf 'installed' > \"$AMC_TEST_MARKER\"\n", { mode: 0o755 });
  chmodSync(installer, 0o755);

  const archiveName = `${base}.tar.gz`;
  const archivePath = join(directory, archiveName);
  const tar = spawnSync("tar", ["-czf", archivePath, "-C", directory, base], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(`could not create fixture archive: ${tar.stderr}`);
  }
  const digest = digestOverride ?? sha256(archivePath);
  writeFileSync(join(directory, "SHA256SUMS"), `${digest}  ${archiveName}\n`);
  return { marker: join(directory, "installed.txt"), platform };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("truthful public distribution and brand contract", () => {
  test("declares GitHub release installers as live and registry channels as unavailable", () => {
    const channel = JSON.parse(read("website/install-channel.json"));
    const pkg = JSON.parse(read("package.json"));

    expect(channel.schemaVersion).toBe("2026-07-10");
    expect(channel.packageVersion).toBe(pkg.version);
    expect(channel.primary.unix.command).toBe("curl -fsSL https://agentmaturity.co/install.sh | sh");
    expect(channel.primary.windows.command).toBe("irm https://agentmaturity.co/install.ps1 | iex");
    expect(channel.channels.githubRelease.status).toBe("available");
    expect(channel.channels.npm.status).toBe("unavailable");
    expect(channel.channels.homebrew.status).toBe("unavailable");
  });

  test("keeps the repository-local Homebrew formula bound to a real checksummed release", () => {
    const formula = read("Formula/amc.rb");
    const pkg = JSON.parse(read("package.json"));

    expect(formula).toContain(`releases/download/v${pkg.version}/agent-maturity-compass-${pkg.version}.tgz`);
    expect(formula).toMatch(/sha256 "[a-f0-9]{64}"/);
    expect(formula).not.toContain("registry.npmjs.org");
    expect(formula).not.toContain("PLACEHOLDER_SHA256");
  });

  test("derives the CLI version from the package and gates every release pin", () => {
    const cli = read("src/cli.ts");
    const packageScript = read("scripts/package-desktop-installers.mjs");
    const releaseVerifier = read("scripts/verify-release-version.mjs");
    const workflow = read(".github/workflows/release.yml");

    expect(cli).toContain('import { amcVersion } from "./version.js";');
    expect(cli).toContain(".version(amcVersion)");
    expect(cli).not.toContain('.version("1.0.0")');
    expect(packageScript).toContain('"release:verify-version"');
    expect(releaseVerifier).toContain("release version mismatch");
    expect(releaseVerifier).toContain("release tag mismatch");
    expect(workflow).toContain("npm run release:verify-version");
  });

  test("keeps the README and Docs brand front doors coherent without broken npm claims", () => {
    const readme = read("README.md");
    const docsIndex = read("docs/INDEX.md");
    const dynamicDocs = read("website/docs/docs.js");

    expect(readme.slice(0, 2600)).toContain('src="website/amc-logo.png"');
    expect(readme.slice(0, 2600)).toContain("Run one command. Get the full score. Fix the gaps.");
    expect(readme.slice(0, 2600)).toContain("Evidence over claims.");
    expect(readme).toContain("img.shields.io/github/v/release/AgentMaturity/AgentMaturityCompass");
    expect(readme).not.toContain("img.shields.io/npm/");
    expect(docsIndex.slice(0, 1600)).toContain("Run one command. Get the full score. Fix the gaps.");
    expect(dynamicDocs).toContain("curl -fsSL https://agentmaturity.co/install.sh | sh");
    expect(dynamicDocs).toContain("irm https://agentmaturity.co/install.ps1 | iex");
  });

  test("does not promote unavailable registry commands from public adoption front doors", () => {
    const publicFrontDoors = [
      "README.md",
      "docs/GETTING_STARTED.md",
      "docs/INSTALL.md",
      "docs/INSTALL_PACKAGES.md",
      "docs/QUICKSTART.md",
      "docs/START_HERE.md",
      "website/index.html",
      "website/docs/docs.js",
      "website/docs/getting-started.html",
      "website/install.sh",
      "website/install.ps1",
      "website/llms.txt"
    ];
    for (const path of publicFrontDoors) {
      const content = read(path);
      expect(content, path).not.toMatch(/\bnpx\s+agent-maturity-compass\b/);
      expect(content, path).not.toMatch(/\bnpm\s+(?:i|install)\s+-g\s+agent-maturity-compass\b/);
      expect(content, path).not.toMatch(/\bbrew\s+(?:tap|install)\b.*\b(?:amc|AgentMaturity)\b/i);
    }
  });

  test("pins and verifies release assets before either hosted installer executes them", () => {
    const unix = read("website/install.sh");
    const windows = read("website/install.ps1");
    const workflow = read(".github/workflows/release.yml");

    expect(unix).toContain("AMC_RELEASE_VERSION=");
    expect(unix).toContain("SHA256SUMS");
    expect(unix).toMatch(/sha256sum|shasum -a 256/);
    expect(unix).toContain("checksum mismatch");
    expect(windows).toContain("$AmcReleaseVersion");
    expect(windows).toContain("SHA256SUMS");
    expect(windows).toContain("Get-FileHash");
    expect(windows).toContain("checksum mismatch");
    expect(workflow).toContain("npm run package:desktop");
    expect(workflow).toContain("npm run package:desktop:verify");
    expect(workflow).toContain("dist/release-assets/SHA256SUMS");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("actions/download-artifact@v8");
    expect(workflow).not.toContain("actions/upload-artifact@v4");
    expect(workflow).not.toContain("actions/download-artifact@v4");
    expect(workflow).toContain("secrets.NPM_TOKEN");
    expect(workflow).toMatch(/if \[ -z "\$NODE_AUTH_TOKEN" \]/);
  });

  test("keeps every pending changeset on the canonical package name", () => {
    const changesets = readdirSync(resolve(root, ".changeset"))
      .filter((name) => name.endsWith(".md") && name !== "README.md");
    for (const name of changesets) {
      const header = read(`.changeset/${name}`).split("---", 3)[1] ?? "";
      expect(header, name).toMatch(/^\s*"agent-maturity-compass": (?:patch|minor|major)\s*$/);
    }
  });

  test("installs a checksummed Unix release fixture", async () => {
    const directory = temporaryDirectory();
    const version = "9.9.9";
    const fixture = writeUnixFixture(directory, version);

    const result = await withFixtureServer(directory, async (baseUrl) => await runInstaller({
      AMC_INSTALL_TEST_MODE: "1",
      AMC_RELEASE_BASE_URL: baseUrl,
      AMC_RELEASE_VERSION: version,
      AMC_INSTALL_PLATFORM: fixture.platform,
      AMC_TEST_MARKER: fixture.marker
    }));

    expect(result.code, result.stderr).toBe(0);
    expect(readFileSync(fixture.marker, "utf8")).toBe("installed");
  });

  test("fails closed before execution when the release checksum is invalid", async () => {
    const directory = temporaryDirectory();
    const version = "9.9.8";
    const fixture = writeUnixFixture(directory, version, "0".repeat(64));

    const result = await withFixtureServer(directory, async (baseUrl) => await runInstaller({
      AMC_INSTALL_TEST_MODE: "1",
      AMC_RELEASE_BASE_URL: baseUrl,
      AMC_RELEASE_VERSION: version,
      AMC_INSTALL_PLATFORM: fixture.platform,
      AMC_TEST_MARKER: fixture.marker
    }));

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("checksum mismatch");
    expect(existsSync(fixture.marker)).toBe(false);
  });
});
