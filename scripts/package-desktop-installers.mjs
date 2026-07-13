#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const studioUrl = "http://127.0.0.1:3212/w/demo/console/";
const studioMacBrowserOpenCommand = `open "${studioUrl}"`;
const studioWindowsOpenCommand = 'Start-Process "http://127.0.0.1:3212/w/demo/console/"';

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

function writeUnixInstaller(targetDir, tarballName, tarballDigest) {
  const script = `#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE="$SCRIPT_DIR/${tarballName}"
PACKAGE_SHA256="${tarballDigest}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 20 or 22 LTS from https://nodejs.org and rerun this installer." >&2
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

if [ -n "\${AMC_INSTALL_PREFIX:-}" ]; then
  npm install -g --prefix "$AMC_INSTALL_PREFIX" --no-audit --no-fund "$PACKAGE"
else
  npm install -g --no-audit --no-fund "$PACKAGE"
fi
echo "AMC installed. Run: amc --version && amc doctor"
`;
  const path = join(targetDir, "install.sh");
  writeFileSync(path, script, { mode: 0o755 });
}

function writeWindowsInstaller(targetDir, tarballName, tarballDigest) {
  const script = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"
$PackageSha256 = "${tarballDigest}"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js 20 or 22 LTS from https://nodejs.org and rerun this installer."
}

$ActualSha256 = (Get-FileHash -Algorithm SHA256 -Path $Package).Hash.ToLowerInvariant()
if ($ActualSha256 -ne $PackageSha256) {
  throw "AMC package checksum mismatch; refusing to install."
}

if (-not [string]::IsNullOrWhiteSpace($env:AMC_INSTALL_PREFIX)) {
  npm install -g --prefix $env:AMC_INSTALL_PREFIX --no-audit --no-fund $Package
} else {
  npm install -g --no-audit --no-fund $Package
}
Write-Host "AMC installed. Run: amc --version; amc doctor"
`;
  writeFileSync(join(targetDir, "install.ps1"), script);
  writeFileSync(join(targetDir, "install.cmd"), `@echo off\r\npowershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"\r\n`);
}

function writeMacLauncherExecutable(executablePath) {
  const sourcePath = join(workRoot, "amc-macos-studio-launcher.m");
  writeFileSync(sourcePath, `#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString * const AMCStudioURL = @"${studioUrl}";

@interface AMCStudioDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSTextField *statusLabel;
@end

@implementation AMCStudioDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [self buildWindow];
  [self startStudioAndLoad];
  [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 1280, 820);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  [self.window setTitle:@"${studioAppName}"];
  [self.window setMinSize:NSMakeSize(980, 640)];
  [self.window center];

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.preferences.javaScriptCanOpenWindowsAutomatically = YES;
  self.webView = [[WKWebView alloc] initWithFrame:[[self.window contentView] bounds] configuration:configuration];
  [self.webView setNavigationDelegate:self];
  [self.webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

  self.statusLabel = [NSTextField labelWithString:@"Starting local AMC Studio…"];
  [self.statusLabel setFrame:NSMakeRect(0, 0, frame.size.width, frame.size.height)];
  [self.statusLabel setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
  [self.statusLabel setAlignment:NSTextAlignmentCenter];
  [self.statusLabel setTextColor:[NSColor colorWithCalibratedRed:0.29 green:0.94 blue:0.47 alpha:1.0]];
  [self.statusLabel setBackgroundColor:[NSColor colorWithCalibratedWhite:0.04 alpha:1.0]];
  [self.statusLabel setFont:[NSFont monospacedSystemFontOfSize:18 weight:NSFontWeightSemibold]];
  [self.statusLabel setSelectable:NO];
  [self.statusLabel setBezeled:NO];
  [self.statusLabel setDrawsBackground:YES];

  [[self.window contentView] addSubview:self.webView];
  [[self.window contentView] addSubview:self.statusLabel];
  [self.window makeKeyAndOrderFront:nil];
}

- (void)startStudioAndLoad {
  NSString *script = [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"launch-studio.sh"];
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSTask *task = [[NSTask alloc] init];
      [task setLaunchPath:@"/bin/sh"];
      [task setArguments:@[script]];
      @try {
        [task launch];
        [task waitUntilExit];
      } @catch (NSException *exception) {
        dispatch_async(dispatch_get_main_queue(), ^{
          [self.statusLabel setStringValue:[NSString stringWithFormat:@"Could not start AMC Studio: %@", [exception reason]]];
        });
        return;
      }
      if ([task terminationStatus] != 0) {
        dispatch_async(dispatch_get_main_queue(), ^{
          [self.statusLabel setHidden:NO];
          [self.statusLabel setStringValue:@"Could not start AMC Studio. See the launcher log in ~/Library/Logs/Agent Maturity Compass."];
        });
        return;
      }
      dispatch_async(dispatch_get_main_queue(), ^{
        [self loadStudio];
      });
    }
  });
}

- (void)loadStudio {
  NSURL *url = [NSURL URLWithString:AMCStudioURL];
  if (!url) {
    [self.statusLabel setStringValue:@"Invalid AMC Studio URL."];
    return;
  }
  [self.statusLabel setStringValue:@"Loading Compass Console…"];
  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  [self.statusLabel setHidden:YES];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self.statusLabel setHidden:NO];
  [self.statusLabel setStringValue:[NSString stringWithFormat:@"AMC Studio is not ready yet. %@", [error localizedDescription]]];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self.statusLabel setHidden:NO];
  [self.statusLabel setStringValue:[NSString stringWithFormat:@"AMC Studio is not ready yet. %@", [error localizedDescription]]];
}

@end

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    NSApplication *application = [NSApplication sharedApplication];
    [application setActivationPolicy:NSApplicationActivationPolicyRegular];
    AMCStudioDelegate *delegate = [[AMCStudioDelegate alloc] init];
    [application setDelegate:delegate];
    [application run];
  }
  return 0;
}
`);

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

  writeFileSync(executablePath, `#!/usr/bin/env sh
set -eu
APP_BIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
/bin/sh "$APP_BIN_DIR/../Resources/launch-studio.sh"
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

  const launchScript = `#!/usr/bin/env sh
set -eu

APP_RESOURCES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE_DIR=$(CDPATH= cd -- "$APP_RESOURCES_DIR/../../.." && pwd)
PACKAGE="$PACKAGE_DIR/${tarballName}"
PACKAGE_DIGEST="${tarballDigest}"
LOG_DIR="$HOME/Library/Logs/Agent Maturity Compass"
LOG_FILE="$LOG_DIR/studio-launcher.log"
RUNTIME_DIR="$HOME/Library/Application Support/Agent Maturity Compass/runtime"
WORKSPACE_DIR="$HOME/Library/Application Support/Agent Maturity Compass/studio-workspace"
DIGEST_FILE="$RUNTIME_DIR/package.sha256"
AMC_BIN="$RUNTIME_DIR/node_modules/.bin/amc"

# Finder/LaunchServices apps do not inherit an interactive shell PATH. Include
# the common Homebrew/npm locations so the desktop app behaves like Terminal.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

mkdir -p "$LOG_DIR"

if [ ! -f "$PACKAGE" ]; then
  printf '%s\n' "Included AMC package is missing: $PACKAGE" >>"$LOG_FILE"
  exit 1
fi
ACTUAL_PACKAGE_DIGEST=$(shasum -a 256 "$PACKAGE" | awk '{print $1}')
if [ "$ACTUAL_PACKAGE_DIGEST" != "$PACKAGE_DIGEST" ]; then
  printf '%s\n' "AMC package checksum mismatch; refusing to launch." >>"$LOG_FILE"
  osascript -e 'display dialog "The included AMC package failed integrity verification. Re-download the desktop archive." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
  exit 1
fi

CURRENT_DIGEST=""
if [ -f "$DIGEST_FILE" ]; then
  CURRENT_DIGEST=$(cat "$DIGEST_FILE")
fi

if [ "$CURRENT_DIGEST" != "$PACKAGE_DIGEST" ] || [ ! -x "$AMC_BIN" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    osascript -e 'display dialog "Node.js 20 or 22 LTS with npm is required before launching Agent Maturity Compass Studio." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
    exit 1
  fi
  mkdir -p "$RUNTIME_DIR"
  npm install --prefix "$RUNTIME_DIR" --no-audit --no-fund "$PACKAGE" >>"$LOG_FILE" 2>&1
  printf '%s\n' "$PACKAGE_DIGEST" > "$DIGEST_FILE"
fi

mkdir -p "$WORKSPACE_DIR"
cd "$WORKSPACE_DIR"
"$AMC_BIN" up --demo --no-open >>"$LOG_FILE" 2>&1
`;
  writeFileSync(join(resourcesDir, "launch-studio.sh"), launchScript, { mode: 0o755 });
  const macRuntime = writeMacLauncherExecutable(join(macosDir, studioAppName));
  writeFileSync(join(resourcesDir, "README.md"), `# ${studioAppName}

This lightweight macOS app installs the included AMC package into a version-pinned per-user runtime and starts local demo-mode Studio from a separate persistent per-user workspace. ${macRuntime === "native-webkit"
    ? `It renders ${studioUrl} inside a native WebKit window.`
    : `This cross-build fallback opens ${studioUrl} in the macOS system browser.`}

It does not bundle Electron, Chromium, WebKit content, or any third-party source snapshot.
`);
  if (process.platform === "darwin") {
    run("codesign", ["--force", "--deep", "--sign", "-", appRoot]);
  }

  return [{
    name: studioMacAppBundleName,
    kind: "macos-app-bundle",
    entrypoint: `${studioMacAppBundleName}/Contents/MacOS/${studioAppName}`,
    opens: studioUrl,
    runtime: macRuntime
  }];
}

function writeWindowsStudioApp(targetDir, tarballName, tarballDigest) {
  const ps1Name = studioWindowsPs1Name;
  const cmdName = studioWindowsCmdName;
  const ps1 = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"
$PackageDigest = "${tarballDigest}"
$LogDir = Join-Path $env:LOCALAPPDATA "Agent Maturity Compass\\Logs"
$LogFile = Join-Path $LogDir "studio-launcher.log"
$RuntimeDir = Join-Path $env:LOCALAPPDATA "Agent Maturity Compass\\runtime"
$WorkspaceDir = Join-Path $env:LOCALAPPDATA "Agent Maturity Compass\\studio-workspace"
$DigestFile = Join-Path $RuntimeDir "package.sha256"
$AmcBin = Join-Path $RuntimeDir "node_modules\\.bin\\amc.cmd"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Host ""
Write-Host "Agent Maturity Compass Studio" -ForegroundColor Green
Write-Host "Evidence over claims." -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path -LiteralPath $Package -PathType Leaf)) {
  throw "Included AMC package is missing: $Package"
}
$ActualPackageDigest = (Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualPackageDigest -ne $PackageDigest.ToLowerInvariant()) {
  throw "AMC package checksum mismatch; refusing to launch. Re-download the desktop archive."
}

$CurrentDigest = if (Test-Path $DigestFile) { (Get-Content $DigestFile -Raw).Trim() } else { "" }
if ($CurrentDigest -ne $PackageDigest -or -not (Test-Path $AmcBin)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 20 or 22 LTS with npm is required before launching Agent Maturity Compass Studio."
  }
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  npm install --prefix $RuntimeDir --no-audit --no-fund $Package *>> $LogFile
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install the packaged AMC runtime. See $LogFile."
  }
  Set-Content -Path $DigestFile -Value $PackageDigest -NoNewline
}

New-Item -ItemType Directory -Force -Path $WorkspaceDir | Out-Null
Set-Location $WorkspaceDir
& $AmcBin up --demo --no-open *>> $LogFile
if ($LASTEXITCODE -ne 0) {
  throw "Could not start AMC Studio. See $LogFile."
}
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

function writePackageReadme(targetDir, platform, tarballName, appLaunchers) {
  const installCommand = platform.kind === "windows"
    ? ".\\install.ps1"
    : "sh ./install.sh";
  const appCommand = platform.id === "macos-universal"
    ? `open "${studioMacAppBundleName}"`
    : platform.kind === "windows"
      ? `.\\${studioWindowsCmdName}`
      : null;
  const macRuntime = appLaunchers.find((launcher) => launcher.kind === "macos-app-bundle")?.runtime;
  writeFileSync(join(targetDir, "README.md"), `# Agent Maturity Compass ${platform.label} Installer

This package installs AMC from the included npm tarball: \`${tarballName}\`.

The Studio launcher uses the archive's exact package digest and installs that version into an isolated per-user runtime. It never falls back to an older global \`amc\` executable.

Mutable demo data is stored in a separate persistent \`studio-workspace\` directory, not beside the extracted archive.

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

${platform.id === "macos-universal"
    ? macRuntime === "native-webkit"
      ? `The ${studioAppName} native app starts local demo-mode Studio and renders ${studioUrl} in a macOS WebKit window. It does not bundle Electron, Chromium, or a browser runtime.`
      : `The ${studioAppName} cross-build fallback starts local demo-mode Studio and opens ${studioUrl} in the macOS system browser. It does not bundle Electron or a browser runtime.`
    : `The ${studioAppName} launcher starts local demo-mode Studio and opens ${studioUrl} in the system browser. It does not bundle Electron or a browser runtime.`}

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
run("npm", ["run", "release:verify-version"], { stdio: "inherit", timeoutMs: 60_000 });
mkdirSync(packWorkRoot, { recursive: true });
run("npm", ["pack", "--ignore-scripts", "--pack-destination", packWorkRoot], { stdio: "inherit", timeoutMs: 180_000 });

const packedTarball = latestPackedTarball(packWorkRoot);
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
      packages.find((item) => item.platform === "macos-universal")?.appLaunchers?.some((launcher) => launcher.runtime === "native-webkit")
        ? "The macOS Studio app uses the system WebKit framework to render local AMC Studio without bundling a browser runtime."
        : "The cross-built macOS Studio fallback opens local AMC Studio in the system browser without bundling a browser runtime.",
      "The Windows Studio launcher starts local AMC Studio and opens it in the user's system browser.",
      "Research artifacts must remain source-attributed and must not copy protected implementation text or code."
    ]
  },
  packages
};

writeFileSync(join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(workRoot, { recursive: true, force: true });
console.log(JSON.stringify(manifest, null, 2));
