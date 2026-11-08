#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

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
const studioWindowsCmdName = "Agent Maturity Compass Studio.cmd";
const studioWindowsPs1Name = "Agent Maturity Compass Studio.ps1";
const studioUrl = "http://127.0.0.1:3212/w/demo/console/";
// STUDIO_URL: the console URL launch-studio.sh printed (the port Studio bound); the default URL when it printed none.
const studioMacBrowserOpenCommand = `open "\${STUDIO_URL:-${studioUrl}}"`;
// The console opens on the port Studio bound (state.json apiPort); 3212 only when the state cannot be read.
const studioWindowsOpenCommand = `$StudioPort = 3212
try { $BoundPort = [int](Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json).apiPort; if ($BoundPort -gt 0 -and $BoundPort -lt 65536) { $StudioPort = $BoundPort } } catch { }
Start-Process "http://127.0.0.1:$StudioPort/w/demo/console/"`;
const studioMacStopCommand = 'cd ~/"Library/Application Support/Agent Maturity Compass/studio-workspace" && ../runtime/node_modules/.bin/amc down';
const studioWindowsStopCommand = 'cd "$env:LOCALAPPDATA\\Agent Maturity Compass\\studio-workspace"; ..\\runtime\\node_modules\\.bin\\amc.cmd down';

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

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js 22 or 24 LTS from https://nodejs.org and rerun this installer." >&2
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
echo "AMC installed. Run: amc --version && amc doctor"
`;
  const path = join(targetDir, "install.sh");
  writeFileSync(path, script, { mode: 0o755 });
}

// A double-clicked console closes on exit, so pause on failure and keep the exit code for scripted callers.
function windowsCmd(ps1Name) {
  return `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${ps1Name}"\r\nif errorlevel 1 (pause & exit /b 1)\r\n`;
}

function writeWindowsInstaller(targetDir, tarballName, tarballDigest) {
  const script = `$ErrorActionPreference = "Stop"

$Package = Join-Path $PSScriptRoot "${tarballName}"
$PackageSha256 = "${tarballDigest}"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm is required. Install Node.js 22 or 24 LTS from https://nodejs.org and rerun this installer."
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
Write-Host "AMC installed. Run: amc --version; amc doctor"
`;
  writeFileSync(join(targetDir, "install.ps1"), script);
  writeFileSync(join(targetDir, "install.cmd"), windowsCmd("install.ps1"));
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
      NSPipe *pipe = [NSPipe pipe];
      [task setLaunchPath:@"/bin/sh"];
      [task setArguments:@[script]];
      [task setStandardOutput:pipe];
      NSData *output = nil;
      @try {
        [task launch];
        // Read to end of file before waiting, so a full pipe can never stall the script.
        output = [[pipe fileHandleForReading] readDataToEndOfFile];
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
      // The script prints the console URL on the port Studio bound; only that loopback console URL is accepted.
      NSString *studioURL = AMCStudioURL;
      NSString *text = output ? [[NSString alloc] initWithData:output encoding:NSUTF8StringEncoding] : @"";
      for (NSString *line in [text componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]]) {
        if ([line hasPrefix:@"AMC_STUDIO_URL=http://127.0.0.1:"]) {
          NSString *candidate = [line substringFromIndex:[@"AMC_STUDIO_URL=" length]];
          if ([candidate hasSuffix:@"/w/demo/console/"]) studioURL = candidate;
        }
      }
      dispatch_async(dispatch_get_main_queue(), ^{
        [self loadStudio:studioURL];
      });
    }
  });
}

- (void)loadStudio:(NSString *)studioURL {
  NSURL *url = [NSURL URLWithString:studioURL];
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
    // AppKit routes Cmd+Q and the editing shortcuts through main-menu key equivalents.
    NSMenu *mainMenu = [[NSMenu alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"Quit ${studioAppName}" action:@selector(terminate:) keyEquivalent:@"q"];
    [[mainMenu addItemWithTitle:@"" action:nil keyEquivalent:@""] setSubmenu:appMenu];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
    [[mainMenu addItemWithTitle:@"Edit" action:nil keyEquivalent:@""] setSubmenu:editMenu];
    [application setMainMenu:mainMenu];
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
OUTPUT=$(/bin/sh "$APP_BIN_DIR/../Resources/launch-studio.sh")
STUDIO_URL=$(printf '%s\n' "$OUTPUT" | sed -n 's/^AMC_STUDIO_URL=//p' | tail -n 1)
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
PACKAGE="$APP_RESOURCES_DIR/${tarballName}"
PACKAGE_DIGEST="${tarballDigest}"
LOG_DIR="$HOME/Library/Logs/Agent Maturity Compass"
LOG_FILE="$LOG_DIR/studio-launcher.log"
RUNTIME_DIR="$HOME/Library/Application Support/Agent Maturity Compass/runtime"
WORKSPACE_DIR="$HOME/Library/Application Support/Agent Maturity Compass/studio-workspace"
DIGEST_FILE="$RUNTIME_DIR/package.sha256"
AMC_BIN="$RUNTIME_DIR/node_modules/.bin/amc"
STATE_FILE="$WORKSPACE_DIR/.amc/studio/state.json"

# Preserve an explicitly selected Node/npm runtime. Finder/LaunchServices have
# a minimal PATH, so append the common installation locations as fallbacks.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

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
    osascript -e 'display dialog "Node.js 22 or 24 LTS with npm is required before launching Agent Maturity Compass Studio." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
    exit 1
  fi
  if [ -x "$AMC_BIN" ] && [ -f "$STATE_FILE" ]; then
    # Stop the Studio that the previous runtime started, so the upgraded runtime serves the console.
    # AMC_NO_AUTO_REBUILD: the old runtime is about to be replaced, so it must not repair its database engine first.
    OLD_PID=$(node -e 'try { const pid = require(process.argv[1]).pid; console.log(Number.isSafeInteger(pid) && pid > 0 ? pid : "") } catch {}' "$STATE_FILE" 2>/dev/null || true)
    # The old runtime's amc down signals any live pid in the state file; a stale file's pid may now be another program's.
    if [ -n "$OLD_PID" ] && ps -ww -o command= -p "$OLD_PID" 2>/dev/null | grep -q '_studio-daemon'; then
      (cd "$WORKSPACE_DIR" && AMC_NO_AUTO_REBUILD=1 "$AMC_BIN" down) >>"$LOG_FILE" 2>&1 || true
      # amc down only signals the daemon, which can take up to 10 s to release its port.
      WAITED=0
      while kill -0 "$OLD_PID" 2>/dev/null && [ "$WAITED" -lt 15 ]; do
        sleep 1
        WAITED=$((WAITED + 1))
      done
    else
      # No Studio daemon runs under that pid, so the state file is stale; the new runtime must not trust it.
      rm -f "$STATE_FILE"
    fi
  fi
  mkdir -p "$RUNTIME_DIR"
  npm install --prefix "$RUNTIME_DIR" --no-audit --no-fund "$PACKAGE" >>"$LOG_FILE" 2>&1
  printf '%s\n' "$PACKAGE_DIGEST" > "$DIGEST_FILE"
fi

mkdir -p "$WORKSPACE_DIR"
cd "$WORKSPACE_DIR"
if ! "$AMC_BIN" up --demo --no-open >>"$LOG_FILE" 2>&1; then
  # Studio did not start, so a listener on its port belongs to another program.
  if node -e 'require("node:net").connect(Number(process.argv[1]), "127.0.0.1").on("connect", () => process.exit(0)).on("error", () => process.exit(1))' "\${AMC_HOST_PORT:-3212}" >/dev/null 2>&1; then
    osascript -e 'display dialog "AMC Studio could not start because another program is using its port on 127.0.0.1 (3212 unless AMC_HOST_PORT is set). Stop that program, for example with amc down in the folder where amc up was run, and open the app again." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
  fi
  exit 1
fi
# The console URL on the port Studio bound (state.json apiPort), for the app to open; 3212 when the state cannot be read.
STUDIO_PORT=$(node -e 'try { const port = require(process.argv[1]).apiPort; console.log(Number.isInteger(port) && port > 0 && port < 65536 ? port : 3212) } catch { console.log(3212) }' "$STATE_FILE" 2>/dev/null || printf '3212')
printf 'AMC_STUDIO_URL=http://127.0.0.1:%s/w/demo/console/\n' "$STUDIO_PORT"
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
$StateFile = Join-Path $WorkspaceDir ".amc\\studio\\state.json"
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

# Windows PowerShell 5.1 turns redirected native stderr (npm warnings) into terminating errors under "Stop",
# so every native call below runs under "Continue" and is judged by its exit code.
$CurrentDigest = if (Test-Path -LiteralPath $DigestFile) { (Get-Content -LiteralPath $DigestFile -Raw).Trim() } else { "" }
if ($CurrentDigest -ne $PackageDigest -or -not (Test-Path -LiteralPath $AmcBin)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 22 or 24 LTS with npm is required before launching Agent Maturity Compass Studio."
  }
  if ((Test-Path -LiteralPath $AmcBin) -and (Test-Path -LiteralPath $StateFile)) {
    # Stop the Studio that the previous runtime started, so the upgraded runtime serves the console.
    # AMC_NO_AUTO_REBUILD: the old runtime is about to be replaced, so it must not repair its database engine first.
    $OldPid = try { [int](Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json).pid } catch { 0 }
    # The old runtime's amc down signals any live pid in the state file; a stale file's pid may now be another program's.
    $OldCommandLine = if ($OldPid -gt 0) { try { (Get-CimInstance Win32_Process -Filter "ProcessId=$OldPid" -ErrorAction Stop).CommandLine } catch { $null } } else { $null }
    if ($OldCommandLine -and $OldCommandLine.Contains("_studio-daemon")) {
      Push-Location -LiteralPath $WorkspaceDir
      $NoAutoRebuild = $env:AMC_NO_AUTO_REBUILD
      $env:AMC_NO_AUTO_REBUILD = "1"
      $ErrorActionPreference = "Continue"
      & $AmcBin down *>> $LogFile
      $ErrorActionPreference = "Stop"
      $env:AMC_NO_AUTO_REBUILD = $NoAutoRebuild
      Pop-Location
      Wait-Process -Id $OldPid -Timeout 15 -ErrorAction SilentlyContinue
    } else {
      # No Studio daemon runs under that pid, so the state file is stale; the new runtime must not trust it.
      Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
    }
  }
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  $ErrorActionPreference = "Continue"
  npm install --prefix $RuntimeDir --no-audit --no-fund $Package *>> $LogFile
  $InstallExitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($InstallExitCode -ne 0) {
    throw "Could not install the packaged AMC runtime. See $LogFile."
  }
  Set-Content -LiteralPath $DigestFile -Value $PackageDigest -NoNewline
}

New-Item -ItemType Directory -Force -Path $WorkspaceDir | Out-Null
Set-Location $WorkspaceDir
$ErrorActionPreference = "Continue"
& $AmcBin up --demo --no-open *>> $LogFile
$StartExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($StartExitCode -ne 0) {
  throw "Could not start AMC Studio. See $LogFile."
}
${studioWindowsOpenCommand}
`;
  writeFileSync(join(targetDir, ps1Name), ps1);
  writeFileSync(join(targetDir, cmdName), windowsCmd(ps1Name));
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

// install.cmd runs install.ps1 with -ExecutionPolicy Bypass, which the default Windows client policy requires.
function installCommandFor(platform) {
  return platform.kind === "windows" ? ".\\install.cmd" : "sh ./install.sh";
}

function writePackageReadme(targetDir, platform, tarballName, appLaunchers) {
  const installCommand = installCommandFor(platform);
  const appCommand = platform.id === "macos-universal"
    ? `open "${studioMacAppBundleName}"`
    : platform.kind === "windows"
      ? `& ".\\${studioWindowsCmdName}"`
      : null;
  const macRuntime = appLaunchers.find((launcher) => launcher.kind === "macos-app-bundle")?.runtime;
  writeFileSync(join(targetDir, "README.md"), `# Agent Maturity Compass ${platform.label} Installer

This package installs AMC from the included npm tarball: \`${tarballName}\`.

${appLaunchers.length > 0 ? `The Studio launcher uses the archive's exact package digest and installs that version into an isolated per-user runtime. It never falls back to an older global \`amc\` executable.

Mutable demo data is stored in a separate persistent \`studio-workspace\` directory, not beside the extracted archive.

` : ""}## Requirements

- Node.js 22 or 24 LTS
- npm available on PATH
${platform.id === "linux-x64" ? `
The archive is architecture-neutral (npm tarball + sh installer). On arm64, or whenever prebuilt \`better-sqlite3\` binaries cannot be downloaded, npm builds the native module and needs \`python3\`, \`make\` and \`g++\`.
` : ""}
## Install

\`\`\`${platform.kind === "windows" ? "powershell" : "sh"}
${installCommand}
\`\`\`

${platform.kind === "unix" ? `## Install without root

When the global npm folder is not writable by your user, the installer stops before npm runs. Install into a folder you own, then add its \`bin\` directory to PATH:

\`\`\`sh
AMC_INSTALL_PREFIX="$HOME/.local" sh ./install.sh
export PATH="$HOME/.local/bin:$PATH"
\`\`\`

\`sudo sh ./install.sh\` is the last resort: it runs the package postinstall and the native build as root.

` : ""}${appCommand ? `## Launch Studio

\`\`\`${platform.kind === "windows" ? "powershell" : "sh"}
${appCommand}
\`\`\`

${platform.id === "macos-universal"
    ? macRuntime === "native-webkit"
      ? `The ${studioAppName} native app starts local demo-mode Studio and renders ${studioUrl} in a macOS WebKit window. It does not bundle Electron, Chromium, or a browser runtime.`
      : `The ${studioAppName} cross-build fallback starts local demo-mode Studio and opens ${studioUrl} in the macOS system browser. It does not bundle Electron or a browser runtime.`
    : `The ${studioAppName} launcher starts local demo-mode Studio and opens ${studioUrl} in the system browser. It does not bundle Electron or a browser runtime.`}
${platform.id === "macos-universal"
    ? `
The app is not notarized. If macOS says it cannot verify the app, open System Settings > Privacy & Security and choose Open Anyway.
`
    : ""}
Studio keeps running after you close the ${platform.id === "macos-universal" ? "window" : "browser tab"}. Stop it with:

\`\`\`${platform.kind === "windows" ? "powershell" : "sh"}
${platform.kind === "windows" ? studioWindowsStopCommand : studioMacStopCommand}
\`\`\`

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
      "The Windows Studio launcher starts local AMC Studio and opens it in the user's system browser.",
      "Research artifacts must remain source-attributed and must not copy protected implementation text or code."
    ]
  },
  packages
};

writeFileSync(join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(workRoot, { recursive: true, force: true });
console.log(JSON.stringify(manifest, null, 2));
