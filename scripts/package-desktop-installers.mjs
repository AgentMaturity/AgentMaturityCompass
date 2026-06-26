#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outRoot = resolve(root, process.env.AMC_DESKTOP_PACKAGE_OUT || "dist/installers");
const stagingRoot = join(outRoot, "staging");
const packRoot = join(outRoot, "npm-pack");
const workRoot = mkdtempSync(join(tmpdir(), "amc-desktop-package-"));
const packWorkRoot = join(workRoot, "npm-pack");
const archivesRoot = join(outRoot, "archives");
const studioAppName = "Agent Maturity Compass Studio";
const studioMacAppBundleName = "Agent Maturity Compass Studio.app";
const studioWindowsCmdName = "Agent Maturity Compass Studio.cmd";
const studioWindowsPs1Name = "Agent Maturity Compass Studio.ps1";
const studioUrl = "http://127.0.0.1:3212/w/demo/console";
const studioMacOpenCommand = 'open "http://127.0.0.1:3212/w/demo/console"';
const studioWindowsOpenCommand = 'Start-Process "http://127.0.0.1:3212/w/demo/console"';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    timeout: options.timeoutMs ?? 180_000
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${detail}`);
  }
  return result;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileInfo(path) {
  return {
    path: relative(root, path).replace(/\\/g, "/"),
    sha256: sha256(path),
    bytes: statSync(path).size
  };
}

function latestPackedTarball(searchRoot) {
  const files = readdirSync(searchRoot)
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => join(searchRoot, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (files.length === 0) {
    throw new Error(`npm pack did not create a tarball in ${searchRoot}`);
  }
  return files[0];
}

function writeUnixInstaller(targetDir, tarballName) {
  const script = `#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE="$SCRIPT_DIR/${tarballName}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 20 or 22 LTS from https://nodejs.org and rerun this installer." >&2
  exit 1
fi

npm install -g "$PACKAGE"
echo "AMC installed. Run: amc --version && amc doctor"
`;
  const path = join(targetDir, "install.sh");
  writeFileSync(path, script, { mode: 0o755 });
}

function writeWindowsInstaller(targetDir, tarballName) {
  const script = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js 20 or 22 LTS from https://nodejs.org and rerun this installer."
}

npm install -g $Package
Write-Host "AMC installed. Run: amc --version; amc doctor"
`;
  writeFileSync(join(targetDir, "install.ps1"), script);
  writeFileSync(join(targetDir, "install.cmd"), `@echo off\r\npowershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"\r\n`);
}

function writeMacStudioApp(targetDir, tarballName) {
  const appRoot = join(targetDir, studioMacAppBundleName);
  const contentsDir = join(appRoot, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  writeFileSync(join(contentsDir, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${studioAppName}</string>
  <key>CFBundleExecutable</key>
  <string>${studioAppName}</string>
  <key>CFBundleIdentifier</key>
  <string>co.agentmaturity.studio</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${studioAppName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${pkg.version}</string>
  <key>CFBundleVersion</key>
  <string>${pkg.version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`);
  writeFileSync(join(contentsDir, "PkgInfo"), "APPL????");
  writeFileSync(join(resourcesDir, "README.md"), `# ${studioAppName}

This lightweight macOS launcher installs AMC from the included npm tarball when needed, starts local demo-mode Studio, and opens ${studioUrl}.

It does not bundle Electron, Chromium, WebKit content, or any third-party source snapshot.
`);

  const executable = `#!/usr/bin/env sh
set -eu

APP_BIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_DIR=$(CDPATH= cd -- "$APP_BIN_DIR/../../.." && pwd)
PACKAGE="$PACKAGE_DIR/${tarballName}"
LOG_DIR="$HOME/Library/Logs/Agent Maturity Compass"
LOG_FILE="$LOG_DIR/studio-launcher.log"

mkdir -p "$LOG_DIR"
cd "$PACKAGE_DIR"

if ! command -v amc >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    osascript -e 'display dialog "Node.js 20 or 22 LTS with npm is required before launching Agent Maturity Compass Studio." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
    exit 1
  fi
  npm install -g "$PACKAGE" >>"$LOG_FILE" 2>&1
fi

amc up --demo --no-open >>"$LOG_FILE" 2>&1 || true
${studioMacOpenCommand}
`;
  writeFileSync(join(macosDir, studioAppName), executable, { mode: 0o755 });

  return [{
    name: studioMacAppBundleName,
    kind: "macos-app-bundle",
    entrypoint: `${studioMacAppBundleName}/Contents/MacOS/${studioAppName}`,
    opens: studioUrl,
    runtime: "system-browser"
  }];
}

function writeWindowsStudioApp(targetDir, tarballName) {
  const ps1Name = studioWindowsPs1Name;
  const cmdName = studioWindowsCmdName;
  const ps1 = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"
$LogDir = Join-Path $env:LOCALAPPDATA "Agent Maturity Compass\\Logs"
$LogFile = Join-Path $LogDir "studio-launcher.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Agent Maturity Compass Studio" -ForegroundColor Green
Write-Host "Evidence over claims." -ForegroundColor DarkGray
Write-Host ""

if (-not (Get-Command amc -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 20 or 22 LTS with npm is required before launching Agent Maturity Compass Studio."
  }
  npm install -g $Package *>> $LogFile
}

amc up --demo --no-open *>> $LogFile
${studioWindowsOpenCommand}
`;
  writeFileSync(join(targetDir, ps1Name), ps1);
  writeFileSync(join(targetDir, cmdName), `@echo off\r\npowershell -ExecutionPolicy Bypass -File "%~dp0${ps1Name}"\r\n`);
  return [{
    name: cmdName,
    kind: "windows-command-launcher",
    entrypoint: cmdName,
    opens: studioUrl,
    runtime: "system-browser"
  }, {
    name: ps1Name,
    kind: "windows-powershell-launcher",
    entrypoint: ps1Name,
    opens: studioUrl,
    runtime: "system-browser"
  }];
}

function writePackageReadme(targetDir, platform, tarballName) {
  const installCommand = platform.kind === "windows"
    ? ".\\install.ps1"
    : "sh ./install.sh";
  const appCommand = platform.id === "macos-universal"
    ? `open "${studioMacAppBundleName}"`
    : platform.kind === "windows"
      ? `.\\${studioWindowsCmdName}`
      : null;
  writeFileSync(join(targetDir, "README.md"), `# Agent Maturity Compass ${platform.label} Installer

This package installs AMC from the included npm tarball: \`${tarballName}\`.

## Requirements

- Node.js 20 or 22 LTS
- npm available on PATH

## Install

\`\`\`${platform.kind === "windows" ? "powershell" : "sh"}
${installCommand}
\`\`\`

${appCommand ? `## Launch Studio

\`\`\`${platform.kind === "windows" ? "powershell" : "sh"}
${appCommand}
\`\`\`

The ${studioAppName} launcher starts local demo-mode Studio and opens ${studioUrl} in the system browser. It does not bundle Electron or a browser runtime.

` : ""}
## Verify

\`\`\`sh
amc --version
amc doctor
\`\`\`

## Legal and provenance notes

- This package contains AMC's own npm package tarball built from this repository.
- It does not bundle competitor code, GitHub repository source code, paper text, arXiv/PDF content, Electron, Chromium, or a browser runtime.
- Research-derived improvements must remain implementation-original and source-attributed.
- Dependency licensing is governed by AMC's package lock and release SBOM process.
`);
}

function createArchive(platform, packageDir) {
  const archiveBase = `amc-${pkg.version}-${platform.id}`;
  if (platform.kind === "windows") {
    const archivePath = join(archivesRoot, `${archiveBase}.zip`);
    run("zip", ["-qry", archivePath, basename(packageDir)], { cwd: stagingRoot, timeoutMs: 120_000 });
    return archivePath;
  }
  const archivePath = join(archivesRoot, `${archiveBase}.tar.gz`);
  run("tar", ["-czf", archivePath, "-C", stagingRoot, basename(packageDir)], { timeoutMs: 120_000 });
  return archivePath;
}

const platforms = [
  { id: "macos-universal", label: "macOS", kind: "unix" },
  { id: "linux-x64", label: "Linux x64", kind: "unix" },
  { id: "windows-x64", label: "Windows x64", kind: "windows" }
];

rmSync(outRoot, { recursive: true, force: true });

run("npm", ["run", "build"], { stdio: "inherit", timeoutMs: 300_000 });
mkdirSync(packWorkRoot, { recursive: true });
run("npm", ["pack", "--ignore-scripts", "--pack-destination", packWorkRoot], { stdio: "inherit", timeoutMs: 180_000 });

const packedTarball = latestPackedTarball(packWorkRoot);
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(packRoot, { recursive: true });
mkdirSync(archivesRoot, { recursive: true });
const tarball = join(packRoot, basename(packedTarball));
cpSync(packedTarball, tarball);
const tarballName = basename(tarball);
const packages = [];

for (const platform of platforms) {
  const packageDir = join(stagingRoot, `amc-${pkg.version}-${platform.id}`);
  mkdirSync(packageDir, { recursive: true });
  cpSync(tarball, join(packageDir, tarballName));
  const appLaunchers = [];
  if (platform.kind === "windows") {
    writeWindowsInstaller(packageDir, tarballName);
    appLaunchers.push(...writeWindowsStudioApp(packageDir, tarballName));
  } else {
    writeUnixInstaller(packageDir, tarballName);
    if (platform.id === "macos-universal") {
      appLaunchers.push(...writeMacStudioApp(packageDir, tarballName));
    }
  }
  writePackageReadme(packageDir, platform, tarballName);
  writeFileSync(join(packageDir, "LEGAL_NOTICE.md"), `# Legal Notice

This installer package is generated from Agent Maturity Compass source code.

No competitor implementation code, GitHub repository source snapshots, academic paper full text, arXiv/PDF content, Electron runtime, Chromium bundle, or browser engine is included. Research references are used only as source-attributed signals for AMC-original implementation work.
`);
  const archivePath = createArchive(platform, packageDir);
  packages.push({
    platform: platform.id,
    label: platform.label,
    kind: platform.kind,
    archive: fileInfo(archivePath),
    installer: platform.kind === "windows" ? "install.ps1" : "install.sh",
    installCommand: platform.kind === "windows" ? ".\\install.ps1" : "sh ./install.sh",
    appLaunchers
  });
}

const manifest = {
  schemaVersion: "2026-06-13",
  generatedAt: new Date().toISOString(),
  packageName: pkg.name,
  packageVersion: pkg.version,
  npmTarball: fileInfo(tarball),
  requirements: {
    node: pkg.engines?.node ?? ">=20",
    npm: "available on PATH"
  },
  legalPosture: {
    includesCompetitorCode: false,
    includesGitHubRepoSourceSnapshots: false,
    includesAcademicPaperText: false,
    includesArxivPdfContent: false,
    includesElectronRuntime: false,
    includesBundledBrowserRuntime: false,
    notes: [
      "Packages are generated from AMC source plus its npm package tarball.",
      "Desktop app launchers start local AMC Studio and open it in the user's system browser.",
      "Research artifacts must remain source-attributed and must not copy protected implementation text or code."
    ]
  },
  packages
};

writeFileSync(join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(workRoot, { recursive: true, force: true });
console.log(JSON.stringify(manifest, null, 2));
