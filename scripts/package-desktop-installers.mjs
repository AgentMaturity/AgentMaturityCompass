#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { desktopFile, nodeMinMajor } from "./desktop/files.mjs";

const root = resolve(process.cwd());
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outRoot = resolve(root, process.env.AMC_DESKTOP_PACKAGE_OUT || "dist/installers");
const outToRoot = relative(outRoot, root);
// outRoot is deleted below, so it must never be the checkout or one of its parents.
if (!isAbsolute(outToRoot) && outToRoot !== ".." && !outToRoot.startsWith(`..${sep}`)) {
  throw new Error(`AMC_DESKTOP_PACKAGE_OUT must not contain the repository: ${outRoot}`);
}
const stagingRoot = join(outRoot, "staging");
const packRoot = join(outRoot, "npm-pack");
const workRoot = mkdtempSync(join(tmpdir(), "amc-desktop-package-"));
const packWorkRoot = join(workRoot, "npm-pack");
const archivesRoot = join(outRoot, "archives");
const studioAppName = "Agent Maturity Compass Studio";
const studioMacAppBundleName = "Agent Maturity Compass Studio.app";
const studioMacIconName = "amc-studio.icns";
const studioWindowsCmdName = "Agent Maturity Compass Studio.cmd";
const studioWindowsPs1Name = "Agent Maturity Compass Studio.ps1";
// The one Node.js rule (package.json engines.node) every installer and launcher states and checks.
const nodeMajor = nodeMinMajor(pkg);
// Windows and Linux open the console of your own workspace on the app's ports, like the macOS app.
const studioUrl = "http://127.0.0.1:3232/console/";
// The macOS app runs on its own ports (launch-studio.sh), away from the 3210-3212 a terminal `amc up` uses.
const studioMacUrl = "http://127.0.0.1:3232/console/";
const studioMacDemoUrl = "http://127.0.0.1:3232/w/demo/console/";
// AMC_DESKTOP_DEV_BUNDLE=1 builds a test copy with its own bundle id, WebKit profile and support folder.
const studioMacBundleId = process.env.AMC_DESKTOP_DEV_BUNDLE === "1" ? "co.agentmaturity.studio.dev" : "co.agentmaturity.studio";
// STUDIO_URL: the console URL launch-studio.sh printed (the port Studio bound); the default URL when it printed none.
const studioMacBrowserOpenCommand = `open "\${STUDIO_URL:-${studioMacDemoUrl}}"`;
const studioMacStopCommand = 'cd ~/"Library/Application Support/Agent Maturity Compass/workspace" && ../runtime/node_modules/.bin/amc down';
const studioWindowsStopCommand = `& ".\\${studioWindowsCmdName}" -Stop`;
const studioLinuxStopCommand = "sh ./amc-studio.sh --stop";

function run(command, args, options = {}) {
  // Windows starts npm.cmd only through a shell (CVE-2024-27980); one quoted command string avoids Node's DEP0190.
  const viaShell = process.platform === "win32" && command === "npm";
  const shellCommand = [command, ...args].map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
  const result = spawnSync(viaShell ? shellCommand : command, viaShell ? [] : args, {
    shell: viaShell,
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

function writeUnixInstaller(targetDir, tarballName, tarballDigest) {
  const script = `#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE="$SCRIPT_DIR/${tarballName}"
PACKAGE_SHA256="${tarballDigest}"

# The one Node.js rule (package.json engines): an older node would install an amc that fails when it runs.
NODE_FOUND=$(command -v node 2>/dev/null || true)
if [ -z "$NODE_FOUND" ]; then
  echo "AMC needs Node.js ${nodeMajor} or newer, and none was found on this computer. Install Node.js from https://nodejs.org and rerun this installer." >&2
  exit 1
fi
NODE_VERSION=$(node --version 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9.+-' | cut -c1-40)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if ! [ "$NODE_MAJOR" -ge ${nodeMajor} ] 2>/dev/null; then
  echo "AMC needs Node.js ${nodeMajor} or newer, and the one found on this computer is Node.js \${NODE_VERSION:-unknown} ($NODE_FOUND). Install a newer Node.js from https://nodejs.org and rerun this installer." >&2
  exit 1
fi
echo "Using Node.js $NODE_VERSION ($NODE_FOUND)"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js ${nodeMajor} or newer (npm comes with it) from https://nodejs.org and rerun this installer." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA256=$(sha256sum "$PACKAGE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA256=$(shasum -a 256 "$PACKAGE" | awk '{print $1}')
else
  echo "sha256sum or shasum is required." >&2
  exit 1
fi
if [ "$ACTUAL_SHA256" != "$PACKAGE_SHA256" ]; then
  echo "AMC package checksum mismatch; refusing to install." >&2
  exit 1
fi

if [ -z "\${AMC_INSTALL_PREFIX:-}" ]; then
  GLOBAL_LIB="$(npm prefix -g)/lib/node_modules"
  [ -d "$GLOBAL_LIB" ] || GLOBAL_LIB="$(npm prefix -g)/lib"
  if [ ! -w "$GLOBAL_LIB" ]; then
    printf 'The global npm folder %s is not writable by %s.\n' "$GLOBAL_LIB" "$(id -un)" >&2
    printf 'Rerun as: AMC_INSTALL_PREFIX="$HOME/.local" sh ./install.sh   (then add $HOME/.local/bin to PATH)\n' >&2
    printf 'Last resort: sudo sh ./install.sh. It runs the package postinstall and the native build as root.\n' >&2
    exit 1
  fi
fi

if [ -n "\${AMC_INSTALL_PREFIX:-}" ]; then
  npm install -g --prefix "$AMC_INSTALL_PREFIX" --no-audit --no-fund "$PACKAGE"
else
  npm install -g --no-audit --no-fund "$PACKAGE"
fi
if [ -n "\${AMC_INSTALL_PREFIX:-}" ]; then
  printf 'Add it to PATH: export PATH="%s/bin:$PATH"\n' "$AMC_INSTALL_PREFIX"
fi
echo "AMC installed. Next step: type amc   (to check this machine first: amc --version && amc doctor)"
`;
  const path = join(targetDir, "install.sh");
  writeFileSync(path, script, { mode: 0o755 });
}

// A double-clicked console closes on exit, so pause on failure and keep the exit code for scripted callers. %* passes
// options on (the Studio launcher's -Demo and -Stop).
function windowsCmd(ps1Name) {
  return `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${ps1Name}" %*\r\nif errorlevel 1 (pause & exit /b 1)\r\n`;
}

/** A launcher file from scripts/desktop with this package's values filled in. */
function launchStudioScript(studioOs, tarballName, tarballDigest) {
  return desktopFile("launch-studio.sh", { STUDIO_OS: studioOs, PACKAGE_NAME: tarballName, PACKAGE_SHA256: tarballDigest, NODE_MIN_MAJOR: nodeMajor });
}

function writeWindowsInstaller(targetDir, tarballName, tarballDigest) {
  const script = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"
$PackageSha256 = "${tarballDigest}"

# The one Node.js rule (package.json engines): an older node would install an amc that fails when it runs.
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  throw "AMC needs Node.js ${nodeMajor} or newer, and none was found on this computer. Install Node.js from https://nodejs.org and rerun this installer."
}
$NodeVersion = (& $Node.Source --version) -replace '[^A-Za-z0-9.+-]', ''
$NodeMajor = 0
[void][int]::TryParse(($NodeVersion.TrimStart("v") -split "\\.")[0], [ref]$NodeMajor)
if ($NodeMajor -lt ${nodeMajor}) {
  throw "AMC needs Node.js ${nodeMajor} or newer, and the one found on this computer is Node.js $NodeVersion ($($Node.Source)). Install a newer Node.js from https://nodejs.org and rerun this installer."
}
Write-Host "Using Node.js $NodeVersion ($($Node.Source))"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js ${nodeMajor} or newer (npm comes with it) from https://nodejs.org and rerun this installer."
}

$ActualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Package).Hash.ToLowerInvariant()
if ($ActualSha256 -ne $PackageSha256) {
  throw "AMC package checksum mismatch; refusing to install."
}

if (-not [string]::IsNullOrWhiteSpace($env:AMC_INSTALL_PREFIX)) {
  npm install -g --prefix $env:AMC_INSTALL_PREFIX --no-audit --no-fund $Package
} else {
  npm install -g --no-audit --no-fund $Package
}
$InstallExitCode = $LASTEXITCODE
if ($InstallExitCode -ne 0) {
  throw "AMC installation failed (npm exit code $InstallExitCode). Resolve the npm error above and rerun this installer."
}
if (-not [string]::IsNullOrWhiteSpace($env:AMC_INSTALL_PREFIX)) {
  Write-Host "Add it to PATH: $env:AMC_INSTALL_PREFIX"
}
Write-Host "AMC installed. Next step: type amc   (to check this machine first: amc --version; amc doctor)"
`;
  writeFileSync(join(targetDir, "install.ps1"), script);
  writeFileSync(join(targetDir, "install.cmd"), windowsCmd("install.ps1"));
}

function writeMacLauncherExecutable(executablePath) {
  // The app's source is scripts/desktop/StudioApp.m.
  const sourcePath = join(root, "scripts", "desktop", "StudioApp.m");
  if (process.platform === "darwin") {
    run("clang", [
      "-fobjc-arc",
      "-framework", "Cocoa",
      "-framework", "WebKit",
      "-mmacosx-version-min=12.0",
      "-arch", "arm64",
      "-arch", "x86_64",
      sourcePath,
      "-o", executablePath
    ], { timeoutMs: 180_000 });
    chmodSync(executablePath, 0o755);
    return "native-webkit";
  }

  // The cross-build fallback has no window to sign in with, so it opens the view-only demo in the system browser.
  writeFileSync(executablePath, `#!/usr/bin/env sh
set -eu
APP_BIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT=$(/bin/sh "$APP_BIN_DIR/../Resources/launch-studio.sh" demo)
STUDIO_URL=$(printf '%s\\n' "$OUTPUT" | sed -n 's/^AMC_STUDIO_URL=//p' | tail -n 1)
${studioMacBrowserOpenCommand}
`, { mode: 0o755 });
  return "system-browser";
}

function writeMacStudioApp(targetDir, tarballName, tarballDigest) {
  const appRoot = join(targetDir, studioMacAppBundleName);
  const contentsDir = join(appRoot, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  // The app carries its own copy so it still starts after it is moved out of the extracted folder.
  cpSync(join(targetDir, tarballName), join(resourcesDir, tarballName));
  cpSync(join(root, "scripts", "brand", studioMacIconName), join(resourcesDir, studioMacIconName));

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
  <key>CFBundleIconFile</key>
  <string>${studioMacIconName}</string>
  <key>CFBundleIdentifier</key>
  <string>${studioMacBundleId}</string>
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
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
  <key>NSHighResolutionCapable</key>
  <true/>
  </dict>
</plist>
`);
  writeFileSync(join(contentsDir, "PkgInfo"), "APPL????");

  writeFileSync(join(resourcesDir, "launch-studio.sh"), launchStudioScript("mac", tarballName, tarballDigest), { mode: 0o755 });
  const macRuntime = writeMacLauncherExecutable(join(macosDir, studioAppName));
  writeFileSync(join(resourcesDir, "README.md"), `# ${studioAppName}

This lightweight macOS app installs the included AMC package into a version-pinned per-user runtime. ${macRuntime === "native-webkit"
    ? `On first launch it creates your own workspace in ~/Library/Application Support/Agent Maturity Compass/workspace, with its vault passphrase and an owner account password kept in your macOS Keychain, signs you in, and renders ${studioMacUrl} inside a native WebKit window. Studio > Try the Demo shows a view-only sample workspace.`
    : `This cross-build fallback starts the view-only demo workspace and opens ${studioMacDemoUrl} in the macOS system browser.`}

It does not bundle Electron, Chromium, WebKit content, or any third-party source snapshot.
`);
  if (process.platform === "darwin") {
    run("codesign", ["--force", "--deep", "--sign", "-", appRoot]);
  }

  return [{
    name: studioMacAppBundleName,
    kind: "macos-app-bundle",
    entrypoint: `${studioMacAppBundleName}/Contents/MacOS/${studioAppName}`,
    opens: macRuntime === "native-webkit" ? studioMacUrl : studioMacDemoUrl,
    runtime: macRuntime
  }];
}

function writeWindowsStudioApp(targetDir, tarballName, tarballDigest) {
  const ps1Name = studioWindowsPs1Name;
  const cmdName = studioWindowsCmdName;
  const ps1 = desktopFile("studio-windows.ps1", { PACKAGE_NAME: tarballName, PACKAGE_SHA256: tarballDigest, NODE_MIN_MAJOR: nodeMajor });
  // Windows PowerShell 5.1 reads a file without a byte order mark as the ANSI code page; the text is ASCII.
  writeFileSync(join(targetDir, ps1Name), ps1);
  writeFileSync(join(targetDir, cmdName), windowsCmd(ps1Name));
  // The Start menu shortcut the launcher makes carries this icon.
  cpSync(join(root, "scripts", "brand", "amc-studio.ico"), join(targetDir, "amc-studio.ico"));
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

// Linux: the shared launcher, a terminal front end that opens the browser, and menu icons (--add-to-menu installs them
// with a .desktop file).
function writeLinuxStudioApp(targetDir, tarballName, tarballDigest) {
  writeFileSync(join(targetDir, "launch-studio.sh"), launchStudioScript("linux", tarballName, tarballDigest), { mode: 0o755 });
  writeFileSync(join(targetDir, "amc-studio.sh"), desktopFile("amc-studio-linux.sh", {}), { mode: 0o755 });
  for (const [size, source] of [[48, "amc-studio-48.png"], [128, "amc-studio-128.png"], [256, "amc-studio-256.png"], [512, "amc-studio.png"]]) {
    const iconDir = join(targetDir, "icons", "hicolor", `${size}x${size}`, "apps");
    mkdirSync(iconDir, { recursive: true });
    cpSync(join(root, "scripts", "brand", source), join(iconDir, "agent-maturity-compass-studio.png"));
  }
  return [{
    name: "amc-studio.sh",
    kind: "linux-terminal-launcher",
    entrypoint: "amc-studio.sh",
    opens: studioUrl,
    runtime: "system-browser"
  }];
}

// install.cmd runs install.ps1 with -ExecutionPolicy Bypass, which the default Windows client policy requires.
function installCommandFor(platform) {
  return platform.kind === "windows" ? ".\\install.cmd" : "sh ./install.sh";
}

function writePackageReadme(targetDir, platform, tarballName, appLaunchers) {
  const installCommand = installCommandFor(platform);
  const fence = platform.kind === "windows" ? "powershell" : "sh";
  const macRuntime = appLaunchers.find((launcher) => launcher.kind === "macos-app-bundle")?.runtime;
  const launch = {
    "macos-universal": {
      command: `open "${studioMacAppBundleName}"`,
      about: macRuntime === "native-webkit"
        ? `The ${studioAppName} app shows the Compass Console in its own window. On first launch it says where AMC keeps its records, creates your own workspace and owner account, keeps their secrets in your macOS Keychain, and signs you in; later launches open the console directly. Studio > Try the Demo shows a view-only sample workspace. It does not bundle Electron, Chromium, or a browser runtime.

The app is not notarized. If macOS says it cannot verify the app, open System Settings > Privacy & Security and choose Open Anyway.

When you quit the app it offers to stop AMC, and stops the one it started unless you choose otherwise. Quitting while AMC is still starting stops what it started. Studio > Stop AMC stops it at any time. From Terminal:`
        : `The ${studioAppName} cross-build fallback starts the view-only demo workspace and opens ${studioMacDemoUrl} in the macOS system browser. It does not bundle Electron or a browser runtime. Stop it from Terminal:`,
      stop: studioMacStopCommand
    },
    "windows-x64": {
      command: `& ".\\${studioWindowsCmdName}"`,
      about: `The ${studioAppName} launcher starts AMC in your own workspace and opens ${studioUrl} in your browser. On first launch it creates the workspace in %LOCALAPPDATA%\\Agent Maturity Compass, asks you in its window for the password of your owner account, and adds a Start menu shortcut with the AMC icon. Add \`-Demo\` for the view-only demo. It uses the app's own ports (3230 to 3232), so a Studio started with \`amc up\` in a terminal can run beside it. It does not bundle Electron or a browser runtime. Not yet tested on a Windows machine.

AMC keeps running after you close the browser tab or the launcher window. Stop it with:`,
      stop: studioWindowsStopCommand
    },
    "linux-x64": {
      command: "sh ./amc-studio.sh",
      about: `\`amc-studio.sh\` starts AMC in your own workspace (in ~/.local/share/agent-maturity-compass) and opens ${studioUrl} in your browser. On first launch it asks in the terminal for the password of your owner account. Add \`--demo\` for the view-only demo. \`sh ./amc-studio.sh --add-to-menu\` adds Agent Maturity Compass Studio, with its icon, to your applications menu. It does not bundle Electron or a browser runtime. Not yet tested on a Linux desktop.

AMC keeps running after you close the browser tab or the terminal. Stop it with:`,
      stop: studioLinuxStopCommand
    }
  }[platform.id];
  writeFileSync(join(targetDir, "README.md"), `# Agent Maturity Compass ${platform.label} Installer

This package installs AMC from the included npm tarball: \`${tarballName}\`.

The Studio launcher uses the archive's exact package digest and installs that version into an isolated per-user runtime. It never falls back to an older global \`amc\` executable. Your records live in a per-user folder, not beside the extracted archive.

## Requirements

- Node.js ${nodeMajor} or newer, with npm (it comes with Node.js)
- An internet connection on first launch: AMC downloads its parts from the npm registry (15 minutes at most, then it stops and says so)
${platform.id === "linux-x64" ? `
The archive is architecture-neutral (npm tarball + sh installer). On arm64, or whenever prebuilt \`better-sqlite3\` binaries cannot be downloaded, npm builds the native module and needs \`python3\`, \`make\` and \`g++\`.
` : ""}
## Launch Studio

\`\`\`${fence}
${launch.command}
\`\`\`

${launch.about}

\`\`\`${fence}
${launch.stop}
\`\`\`

## Install the amc command (optional)

For the \`amc\` command in a terminal:

\`\`\`${fence}
${installCommand}
\`\`\`

${platform.kind === "unix" ? `When the global npm folder is not writable by your user, the installer stops before npm runs. Install into a folder you own, then add its \`bin\` directory to PATH:

\`\`\`sh
AMC_INSTALL_PREFIX="$HOME/.local" sh ./install.sh
export PATH="$HOME/.local/bin:$PATH"
\`\`\`

\`sudo sh ./install.sh\` is the last resort: it runs the package postinstall and the native build as root.

` : ""}Then check it:

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
  // bsdtar on macOS (the release runner) adds AppleDouble ._* entries and com.apple.* xattr pax headers unless told not to.
  run("tar", [...(process.platform === "darwin" ? ["--no-mac-metadata", "--no-xattrs"] : []), "-czf", archivePath, "-C", stagingRoot, basename(packageDir)],
    { timeoutMs: 120_000, env: { COPYFILE_DISABLE: "1" } });
  return archivePath;
}

const platforms = [
  { id: "macos-universal", label: "macOS", kind: "unix" },
  // The id stays linux-x64 (SHA256SUMS, the hosted installer and the matrix consume it); the archive is an npm tarball and
  // an sh installer, so it is architecture-neutral.
  { id: "linux-x64", label: "Linux (x64, arm64)", kind: "unix" },
  { id: "windows-x64", label: "Windows x64", kind: "windows" }
];

rmSync(outRoot, { recursive: true, force: true });

// P0-34: a release packages the gated npm tarball (AMC_DESKTOP_NPM_TARBALL) as is; only a local run builds and packs.
const gatedTarball = process.env.AMC_DESKTOP_NPM_TARBALL;
if (!gatedTarball) {
  run("npm", ["run", "build"], { stdio: "inherit", timeoutMs: 300_000 });
  run("npm", ["run", "release:verify-version"], { stdio: "inherit", timeoutMs: 60_000 });
  mkdirSync(packWorkRoot, { recursive: true });
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", packWorkRoot], { stdio: "inherit", timeoutMs: 180_000 });
}

const packedTarball = gatedTarball ? resolve(gatedTarball) : latestPackedTarball(packWorkRoot);
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(packRoot, { recursive: true });
mkdirSync(archivesRoot, { recursive: true });
const tarball = join(packRoot, basename(packedTarball));
cpSync(packedTarball, tarball);
const tarballName = basename(tarball);
const tarballDigest = sha256(tarball);
const packages = [];

for (const platform of platforms) {
  const packageDir = join(stagingRoot, `amc-${pkg.version}-${platform.id}`);
  mkdirSync(packageDir, { recursive: true });
  cpSync(tarball, join(packageDir, tarballName));
  const appLaunchers = [];
  if (platform.kind === "windows") {
    writeWindowsInstaller(packageDir, tarballName, tarballDigest);
    appLaunchers.push(...writeWindowsStudioApp(packageDir, tarballName, tarballDigest));
  } else {
    writeUnixInstaller(packageDir, tarballName, tarballDigest);
    if (platform.id === "macos-universal") {
      appLaunchers.push(...writeMacStudioApp(packageDir, tarballName, tarballDigest));
    } else {
      appLaunchers.push(...writeLinuxStudioApp(packageDir, tarballName, tarballDigest));
    }
  }
  writePackageReadme(packageDir, platform, tarballName, appLaunchers);
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
    installCommand: installCommandFor(platform),
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
      packages.find((item) => item.platform === "macos-universal")?.appLaunchers?.some((launcher) => launcher.runtime === "native-webkit")
        ? "The macOS Studio app uses the system WebKit framework to render local AMC Studio without bundling a browser runtime."
        : "The cross-built macOS Studio fallback opens local AMC Studio in the system browser without bundling a browser runtime.",
      "The Windows and Linux Studio launchers start local AMC Studio and open it in the user's system browser.",
      "Research artifacts must remain source-attributed and must not copy protected implementation text or code."
    ]
  },
  packages
};

writeFileSync(join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(workRoot, { recursive: true, force: true });
console.log(JSON.stringify(manifest, null, 2));
