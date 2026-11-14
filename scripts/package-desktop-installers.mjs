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
// The macOS app runs on its own ports (launch-studio.sh), away from the 3210-3212 a terminal `amc up` uses.
const studioMacUrl = "http://127.0.0.1:3232/console/";
const studioMacDemoUrl = "http://127.0.0.1:3232/w/demo/console/";
// AMC_DESKTOP_DEV_BUNDLE=1 builds a test copy with its own bundle id, WebKit profile and support folder.
const studioMacBundleId = process.env.AMC_DESKTOP_DEV_BUNDLE === "1" ? "co.agentmaturity.studio.dev" : "co.agentmaturity.studio";
// STUDIO_URL: the console URL launch-studio.sh printed (the port Studio bound); the default URL when it printed none.
const studioMacBrowserOpenCommand = `open "\${STUDIO_URL:-${studioMacDemoUrl}}"`;
// The console opens on the port Studio bound (state.json apiPort); 3212 only when the state cannot be read.
const studioWindowsOpenCommand = `$StudioPort = 3212
try { $BoundPort = [int](Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json).apiPort; if ($BoundPort -gt 0 -and $BoundPort -lt 65536) { $StudioPort = $BoundPort } } catch { }
Start-Process "http://127.0.0.1:$StudioPort/w/demo/console/"`;
const studioMacStopCommand = 'cd ~/"Library/Application Support/Agent Maturity Compass/workspace" && ../runtime/node_modules/.bin/amc down';
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
echo "AMC installed. Next step: type amc   (to check this machine first: amc --version && amc doctor)"
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
if (-not [string]::IsNullOrWhiteSpace($env:AMC_INSTALL_PREFIX)) {
  Write-Host "Add it to PATH: $env:AMC_INSTALL_PREFIX"
}
Write-Host "AMC installed. Next step: type amc   (to check this machine first: amc --version; amc doctor)"
`;
  writeFileSync(join(targetDir, "install.ps1"), script);
  writeFileSync(join(targetDir, "install.cmd"), windowsCmd("install.ps1"));
}

function writeMacLauncherExecutable(executablePath) {
  const sourcePath = join(workRoot, "amc-macos-studio-launcher.m");
  writeFileSync(sourcePath, `#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// The window shows the Compass Console that launch-studio.sh starts. The script prints KEY=value lines (see its header);
// this app loads only a loopback console URL, and sets the owner session cookie it was handed as a session-only cookie.
static NSString * const AMCAppName = @"${studioAppName}";
static NSString * const AMCWebDataDigestKey = @"AMCWebDataPackageDigest";
static NSString * const AMCQuitChoiceKey = @"AMCQuitChoice"; // 0 ask, 1 stop AMC, 2 keep it running

@interface AMCStudioDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSView *overlay;
@property (strong) NSProgressIndicator *spinner;
@property (strong) NSTextField *statusLabel;
@property (strong) NSButton *retryButton;
@property (strong) NSMenuItem *switchItem;
@property (copy) NSDictionary<NSString *, NSString *> *info;
@property (copy) NSString *mode;
@property (copy) NSString *studioURL;
@property (assign) BOOL busy;
@property (assign) BOOL setupDone;
@property (assign) BOOL startedStudio;
@property (assign) BOOL terminating;
@end

@implementation AMCStudioDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  [self buildMenu];
  [self buildWindow];
  [NSApp activateIgnoringOtherApps:YES];
  [self showProgress:@"Starting Agent Maturity Compass…"];
  NSMutableDictionary<NSString *, NSString *> *info = [NSMutableDictionary dictionary];
  [self runLauncher:@"info" onLine:^(NSString *key, NSString *value) { info[key] = value; } done:^(int status) {
    self.info = info;
    self.setupDone = [info[@"AMC_SETUP_DONE"] isEqualToString:@"1"];
    if (self.setupDone) [self start:@"workspace"];
    else [self showFirstRun];
  }];
}

// ---- Launcher -------------------------------------------------------------------------------------------------------

- (void)runLauncher:(NSString *)mode onLine:(void (^)(NSString *key, NSString *value))onLine done:(void (^)(int status))done {
  NSString *script = [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"launch-studio.sh"];
  NSMutableDictionary<NSString *, NSString *> *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
  if ([[[NSBundle mainBundle] bundleIdentifier] hasSuffix:@".dev"] && env[@"AMC_STUDIO_SUPPORT_DIR"] == nil) {
    env[@"AMC_STUDIO_SUPPORT_DIR"] = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Agent Maturity Compass Dev"];
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      NSTask *task = [[NSTask alloc] init];
      NSPipe *pipe = [NSPipe pipe];
      task.executableURL = [NSURL fileURLWithPath:@"/bin/sh"];
      task.arguments = @[script, mode];
      task.environment = env;
      task.standardInput = [NSFileHandle fileHandleWithNullDevice];
      task.standardOutput = pipe;
      NSError *error = nil;
      if (![task launchAndReturnError:&error]) {
        dispatch_async(dispatch_get_main_queue(), ^{
          onLine(@"AMC_ERROR", [NSString stringWithFormat:@"Could not run the AMC launcher: %@", error.localizedDescription]);
          done(1);
        });
        return;
      }
      // Lines are read as they arrive, so progress shows while the script runs; reading to end of file first means a
      // full pipe can never stall the script.
      NSFileHandle *reader = pipe.fileHandleForReading;
      NSMutableData *buffer = [NSMutableData data];
      NSData *chunk;
      while ((chunk = [reader availableData]).length > 0) {
        [buffer appendData:chunk];
        [self drainLines:buffer into:onLine];
      }
      [task waitUntilExit];
      int status = task.terminationStatus;
      dispatch_async(dispatch_get_main_queue(), ^{ done(status); });
    }
  });
}

- (void)drainLines:(NSMutableData *)buffer into:(void (^)(NSString *key, NSString *value))onLine {
  NSData *newline = [NSData dataWithBytes:"\\n" length:1];
  NSRange end;
  while ((end = [buffer rangeOfData:newline options:0 range:NSMakeRange(0, buffer.length)]).location != NSNotFound) {
    NSString *line = [[NSString alloc] initWithData:[buffer subdataWithRange:NSMakeRange(0, end.location)] encoding:NSUTF8StringEncoding] ?: @"";
    [buffer replaceBytesInRange:NSMakeRange(0, end.location + 1) withBytes:NULL length:0];
    NSRange equals = [line rangeOfString:@"="];
    if (![line hasPrefix:@"AMC_"] || equals.location == NSNotFound) continue;
    NSString *key = [line substringToIndex:equals.location];
    NSString *value = [line substringFromIndex:equals.location + 1];
    dispatch_async(dispatch_get_main_queue(), ^{ onLine(key, value); });
  }
}

// ---- Starting, switching and stopping --------------------------------------------------------------------------------

- (void)showFirstRun {
  [self showProgress:@"Welcome."];
  [self.spinner stopAnimation:nil];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"Welcome to Agent Maturity Compass";
  alert.informativeText = [NSString stringWithFormat:@"AMC keeps its records on this Mac, in %@.\\n\\nSetting up creates your own workspace there, a signing vault whose passphrase AMC keeps in your macOS Keychain, and an owner account named %@ that this app signs in with for you.\\n\\nYou can look around a sample workspace first. The demo is view only.",
    [self workspaceDir], NSUserName()];
  [alert addButtonWithTitle:@"Set Up My Workspace"];
  [alert addButtonWithTitle:@"Try the Demo"];
  [alert addButtonWithTitle:@"Quit"];
  [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse response) {
    if (response == NSAlertFirstButtonReturn) [self start:@"workspace"];
    else if (response == NSAlertSecondButtonReturn) [self start:@"demo"];
    else [NSApp terminate:nil];
  }];
}

- (void)start:(NSString *)mode {
  if (self.busy) return;
  self.busy = YES;
  self.mode = mode;
  self.studioURL = nil;
  [self showProgress:[mode isEqualToString:@"demo"] ? @"Starting the demo workspace…" : @"Starting AMC…"];
  NSMutableDictionary<NSString *, NSString *> *out = [NSMutableDictionary dictionary];
  [self runLauncher:mode onLine:^(NSString *key, NSString *value) {
    if ([key isEqualToString:@"AMC_STATUS"]) [self showProgress:value];
    else out[key] = value;
  } done:^(int status) {
    self.busy = NO;
    if ([out[@"AMC_STARTED"] isEqualToString:@"1"]) self.startedStudio = YES;
    NSURL *url = [self consoleURL:out[@"AMC_STUDIO_URL"]];
    if (status != 0 || url == nil) {
      [self showProblem:out[@"AMC_ERROR"] ?: [NSString stringWithFormat:@"AMC could not start. Details are in %@.", [self logPath]] action:@"Retry"];
      return;
    }
    if ([mode isEqualToString:@"workspace"]) self.setupDone = YES;
    self.studioURL = url.absoluteString;
    NSString *title = out[@"AMC_TITLE"];
    self.window.title = title.length > 0 ? [NSString stringWithFormat:@"%@ — %@", AMCAppName, title] : AMCAppName;
    self.switchItem.title = [mode isEqualToString:@"demo"] ? @"Open My Workspace" : @"Try the Demo";
    [self showProgress:@"Opening the Compass Console…"];
    [self clearStaleWebData:out[@"AMC_PACKAGE_DIGEST"] then:^{
      [self setSessionCookie:out[@"AMC_SESSION"] forURL:url then:^{
        [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
      }];
    }];
  }];
}

// Only the console on loopback, as the launcher prints it, is ever loaded.
- (NSURL *)consoleURL:(NSString *)text {
  NSPredicate *console = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"http://127[.]0[.]0[.]1:[0-9]{1,5}/(w/demo/)?console/"];
  return text != nil && [console evaluateWithObject:text] ? [NSURL URLWithString:text] : nil;
}

- (void)retry:(id)sender {
  if (self.mode == nil && !self.setupDone) [self showFirstRun];
  else [self start:self.mode ?: @"workspace"];
}

- (void)switchWorkspace:(id)sender {
  if (self.busy) return;
  if ([self.mode isEqualToString:@"demo"] || self.mode == nil) {
    if (self.setupDone) [self start:@"workspace"];
    else [self showFirstRun];
  } else {
    [self start:@"demo"];
  }
}

- (void)stopStudio:(id)sender {
  if (self.busy) return;
  self.busy = YES;
  [self showProgress:@"Stopping AMC…"];
  [self runLauncher:@"stop" onLine:^(NSString *key, NSString *value) {} done:^(int status) {
    self.busy = NO;
    self.studioURL = nil;
    self.startedStudio = NO;
    [self.webView loadHTMLString:@"" baseURL:nil];
    [self showProblem:[NSString stringWithFormat:@"AMC is stopped. Your records stay in %@.", [self workspaceDir]] action:@"Start AMC"];
  }];
}

// ---- Web data ------------------------------------------------------------------------------------------------------

// A new AMC version: service workers and caches from the old one would serve old scripts under the new pages, so they go
// before the first load. Cookies and local storage stay.
- (void)clearStaleWebData:(NSString *)digest then:(void (^)(void))next {
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  if (digest.length == 0 || [[defaults stringForKey:AMCWebDataDigestKey] isEqualToString:digest]) { next(); return; }
  NSSet<NSString *> *types = [NSSet setWithArray:@[WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache,
    WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeOfflineWebApplicationCache]];
  [self.webView.configuration.websiteDataStore removeDataOfTypes:types modifiedSince:[NSDate distantPast] completionHandler:^{
    [defaults setObject:digest forKey:AMCWebDataDigestKey];
    next();
  }];
}

// A session cookie (no expiry): WebKit keeps it in memory only, and the launcher signs in again at the next start.
- (void)setSessionCookie:(NSString *)session forURL:(NSURL *)url then:(void (^)(void))next {
  NSPredicate *token = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"[A-Za-z0-9%._~-]{16,4096}"];
  NSHTTPCookie *cookie = session != nil && [token evaluateWithObject:session] ? [NSHTTPCookie cookieWithProperties:@{
    NSHTTPCookieName: @"amc_session", NSHTTPCookieValue: session, NSHTTPCookieDomain: url.host, NSHTTPCookiePath: @"/",
    @"HttpOnly": @"TRUE", NSHTTPCookieSameSitePolicy: NSHTTPCookieSameSiteStrict }] : nil;
  if (cookie == nil) { next(); return; }
  [self.webView.configuration.websiteDataStore.httpCookieStore setCookie:cookie completionHandler:next];
}

// ---- Navigation: the console stays in the window, every other site opens in the default browser -----------------------

- (BOOL)isConsoleURL:(NSURL *)url {
  return [url.scheme isEqualToString:@"http"] && [url.host isEqualToString:@"127.0.0.1"];
}

- (void)openOutside:(NSURL *)url {
  if ([@[@"http", @"https", @"mailto"] containsObject:url.scheme.lowercaseString ?: @""]) [[NSWorkspace sharedWorkspace] openURL:url];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSURL *url = action.request.URL;
  NSString *scheme = url.scheme.lowercaseString ?: @"";
  if (!action.targetFrame.isMainFrame || [self isConsoleURL:url] || [@[@"about", @"blob", @"data"] containsObject:scheme]) {
    decisionHandler(WKNavigationActionPolicyAllow);
    return;
  }
  [self openOutside:url];
  decisionHandler(WKNavigationActionPolicyCancel);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
  if ([self isConsoleURL:action.request.URL]) [webView loadRequest:action.request];
  else [self openOutside:action.request.URL];
  return nil;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  if (self.studioURL != nil) self.overlay.hidden = YES;
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self consoleDidNotLoad:error];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self consoleDidNotLoad:error];
}

- (void)consoleDidNotLoad:(NSError *)error {
  // A cancelled load (another one replaced it, or a link went to the browser) is not a failure.
  if (error.code == NSURLErrorCancelled || error.code == 102) return;
  [self showProblem:[NSString stringWithFormat:@"The Compass Console did not load: %@ Click Retry to start AMC again.", error.localizedDescription] action:@"Retry"];
}

// ---- Menu actions --------------------------------------------------------------------------------------------------

- (void)reload:(id)sender {
  if (self.studioURL == nil) [self retry:sender];
  else if (self.webView.URL != nil && [self isConsoleURL:self.webView.URL]) [self.webView reload];
  else [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:self.studioURL]]];
}

- (void)openInBrowser:(id)sender {
  NSURL *url = self.webView.URL != nil && [self isConsoleURL:self.webView.URL] ? self.webView.URL : (self.studioURL ? [NSURL URLWithString:self.studioURL] : nil);
  if (url != nil) [[NSWorkspace sharedWorkspace] openURL:url];
  else [self tell:@"AMC is not running" detail:@"Start AMC first, then open the console in your browser."];
}

- (void)showLogs:(id)sender {
  NSString *log = [self logPath];
  if ([[NSFileManager defaultManager] fileExistsAtPath:log]) [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:log]];
  else [self tell:@"No log yet" detail:[NSString stringWithFormat:@"The launcher writes its log to %@ once AMC starts.", log]];
}

- (void)showAbout:(id)sender {
  NSString *version = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"unknown";
  NSString *user = self.info[@"AMC_CONSOLE_USER"].length > 0 ? self.info[@"AMC_CONSOLE_USER"] : @"not created yet";
  [self tell:[NSString stringWithFormat:@"%@ %@", AMCAppName, version] detail:[NSString stringWithFormat:
    @"AMC runtime: %@\\nYour workspace: %@\\nLauncher log: %@\\nConsole account: %@ (its password is in your Keychain as amc-console; you need it only to sign in from a browser)\\n\\nRendered with the macOS WebKit framework. No browser runtime is bundled.",
    self.info[@"AMC_RUNTIME_DIR"] ?: @"unknown", [self workspaceDir], [self logPath], user]];
}

- (void)tell:(NSString *)message detail:(NSString *)detail {
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = message;
  alert.informativeText = detail;
  [alert runModal];
}

- (NSString *)logPath {
  return self.info[@"AMC_LOG_FILE"] ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/Agent Maturity Compass/studio-launcher.log"];
}

- (NSString *)workspaceDir {
  return self.info[@"AMC_WORKSPACE_DIR"] ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Agent Maturity Compass/workspace"];
}

// ---- Quitting: offer to stop Studio, and stop it by default when this app started it --------------------------------

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  return YES;
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
  if (self.terminating || (self.studioURL == nil && !self.startedStudio)) return NSTerminateNow;
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSInteger choice = [defaults integerForKey:AMCQuitChoiceKey];
  if (choice == 0) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Stop AMC when you quit?";
    alert.informativeText = self.startedStudio
      ? @"This app started AMC. Stopping it closes the local console and frees its ports. Your records stay on this Mac."
      : @"AMC was already running when this app opened. Stopping it closes the local console. Your records stay on this Mac.";
    NSString *stop = @"Stop AMC and Quit", *keep = @"Keep It Running and Quit";
    [alert addButtonWithTitle:self.startedStudio ? stop : keep];
    [alert addButtonWithTitle:self.startedStudio ? keep : stop];
    [alert addButtonWithTitle:@"Cancel"];
    alert.showsSuppressionButton = YES;
    alert.suppressionButton.title = @"Do not ask again";
    NSModalResponse response = [alert runModal];
    if (response == NSAlertThirdButtonReturn) return NSTerminateCancel;
    BOOL stopChosen = (response == NSAlertFirstButtonReturn) == self.startedStudio;
    choice = stopChosen ? 1 : 2;
    if (alert.suppressionButton.state == NSControlStateValueOn) [defaults setInteger:choice forKey:AMCQuitChoiceKey];
  }
  if (choice == 2) return NSTerminateNow;
  self.terminating = YES;
  [self showProgress:@"Stopping AMC…"];
  [self runLauncher:@"stop" onLine:^(NSString *key, NSString *value) {} done:^(int status) {
    [NSApp replyToApplicationShouldTerminate:YES];
  }];
  return NSTerminateLater;
}

// ---- Window, progress and problems ----------------------------------------------------------------------------------

- (void)buildWindow {
  NSRect frame = NSMakeRect(0, 0, 1280, 820);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  [self.window setTitle:AMCAppName];
  [self.window setMinSize:NSMakeSize(980, 640)];
  [self.window center];

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.preferences.javaScriptCanOpenWindowsAutomatically = YES;
  self.webView = [[WKWebView alloc] initWithFrame:[[self.window contentView] bounds] configuration:configuration];
  [self.webView setNavigationDelegate:self];
  [self.webView setUIDelegate:self];
  [self.webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

  [[self.window contentView] addSubview:self.webView];
  [[self.window contentView] addSubview:[self buildOverlay:[[self.window contentView] bounds]]];
  [self.window makeKeyAndOrderFront:nil];
}

- (NSView *)buildOverlay:(NSRect)bounds {
  self.overlay = [[NSView alloc] initWithFrame:bounds];
  self.overlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.overlay.wantsLayer = YES;
  self.overlay.layer.backgroundColor = [NSColor colorWithCalibratedWhite:0.04 alpha:1.0].CGColor;
  self.overlay.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];

  self.spinner = [[NSProgressIndicator alloc] init];
  self.spinner.style = NSProgressIndicatorStyleSpinning;
  self.statusLabel = [NSTextField wrappingLabelWithString:@""];
  self.statusLabel.alignment = NSTextAlignmentCenter;
  self.statusLabel.selectable = YES; // so a log path or command can be copied
  self.statusLabel.textColor = [NSColor colorWithCalibratedRed:0.29 green:0.94 blue:0.47 alpha:1.0];
  self.statusLabel.font = [NSFont systemFontOfSize:17 weight:NSFontWeightMedium];
  [self.statusLabel.widthAnchor constraintLessThanOrEqualToConstant:640].active = YES;
  self.retryButton = [NSButton buttonWithTitle:@"Retry" target:self action:@selector(retry:)];
  NSButton *logs = [NSButton buttonWithTitle:@"Show Logs" target:self action:@selector(showLogs:)];
  NSStackView *buttons = [NSStackView stackViewWithViews:@[self.retryButton, logs]];
  NSStackView *stack = [NSStackView stackViewWithViews:@[self.spinner, self.statusLabel, buttons]];
  stack.orientation = NSUserInterfaceLayoutOrientationVertical;
  stack.spacing = 18;
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  [self.overlay addSubview:stack];
  [NSLayoutConstraint activateConstraints:@[
    [stack.centerXAnchor constraintEqualToAnchor:self.overlay.centerXAnchor],
    [stack.centerYAnchor constraintEqualToAnchor:self.overlay.centerYAnchor]
  ]];
  return self.overlay;
}

- (void)showProgress:(NSString *)text {
  self.overlay.hidden = NO;
  self.spinner.hidden = NO;
  [self.spinner startAnimation:nil];
  self.statusLabel.stringValue = text;
  self.retryButton.superview.hidden = YES;
}

- (void)showProblem:(NSString *)text action:(NSString *)actionTitle {
  self.overlay.hidden = NO;
  [self.spinner stopAnimation:nil];
  self.spinner.hidden = YES;
  self.statusLabel.stringValue = text;
  self.retryButton.title = actionTitle;
  self.retryButton.superview.hidden = NO;
}

// ---- Menu bar ------------------------------------------------------------------------------------------------------

- (NSMenuItem *)addItem:(NSString *)title action:(SEL)action key:(NSString *)key to:(NSMenu *)menu {
  NSMenuItem *item = [menu addItemWithTitle:title action:action keyEquivalent:key];
  item.target = self;
  return item;
}

// AppKit routes Cmd+Q, Cmd+R and the editing shortcuts through main-menu key equivalents.
- (void)buildMenu {
  NSMenu *mainMenu = [[NSMenu alloc] init];
  NSMenu *appMenu = [[NSMenu alloc] init];
  [self addItem:[@"About " stringByAppendingString:AMCAppName] action:@selector(showAbout:) key:@"" to:appMenu];
  [appMenu addItem:[NSMenuItem separatorItem]];
  [appMenu addItemWithTitle:[@"Quit " stringByAppendingString:AMCAppName] action:@selector(terminate:) keyEquivalent:@"q"];
  [[mainMenu addItemWithTitle:@"" action:nil keyEquivalent:@""] setSubmenu:appMenu];
  NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
  [editMenu addItemWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
  [editMenu addItemWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
  [editMenu addItemWithTitle:@"Cut" action:@selector(cut:) keyEquivalent:@"x"];
  [editMenu addItemWithTitle:@"Copy" action:@selector(copy:) keyEquivalent:@"c"];
  [editMenu addItemWithTitle:@"Paste" action:@selector(paste:) keyEquivalent:@"v"];
  [editMenu addItemWithTitle:@"Select All" action:@selector(selectAll:) keyEquivalent:@"a"];
  [[mainMenu addItemWithTitle:@"Edit" action:nil keyEquivalent:@""] setSubmenu:editMenu];
  NSMenu *studioMenu = [[NSMenu alloc] initWithTitle:@"Studio"];
  [self addItem:@"Reload" action:@selector(reload:) key:@"r" to:studioMenu];
  [self addItem:@"Open in Browser" action:@selector(openInBrowser:) key:@"o" to:studioMenu];
  self.switchItem = [self addItem:@"Try the Demo" action:@selector(switchWorkspace:) key:@"" to:studioMenu];
  [studioMenu addItem:[NSMenuItem separatorItem]];
  [self addItem:@"Stop AMC" action:@selector(stopStudio:) key:@"" to:studioMenu];
  [self addItem:@"Show Logs" action:@selector(showLogs:) key:@"" to:studioMenu];
  [studioMenu addItem:[NSMenuItem separatorItem]];
  [studioMenu addItemWithTitle:@"Close Window" action:@selector(performClose:) keyEquivalent:@"w"];
  [[mainMenu addItemWithTitle:@"Studio" action:nil keyEquivalent:@""] setSubmenu:studioMenu];
  [NSApp setMainMenu:mainMenu];
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

  const launchScript = `#!/usr/bin/env sh
# Agent Maturity Compass Studio launcher: launch-studio.sh [info|workspace|demo|stop] (default demo).
# The app reads KEY=value lines on stdout: AMC_STATUS (progress), AMC_ERROR (why it stopped), AMC_STUDIO_URL,
# AMC_SESSION (the owner's console session cookie), AMC_TITLE, AMC_STARTED, AMC_PACKAGE_DIGEST, and the info paths.
# No secret goes to the log, to a file or into a process's arguments: secrets move through pipes, the environment of
# amc itself, and the macOS Keychain (security -i reads its command from stdin).
set -eu

MODE=\${1:-demo}
APP_RESOURCES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE="$APP_RESOURCES_DIR/${tarballName}"
PACKAGE_DIGEST="${tarballDigest}"
# AMC_STUDIO_SUPPORT_DIR moves all app data elsewhere (a test, or the dev build); the log then lives beside it.
SUPPORT_DIR="\${AMC_STUDIO_SUPPORT_DIR:-$HOME/Library/Application Support/Agent Maturity Compass}"
LOG_DIR="$HOME/Library/Logs/Agent Maturity Compass"
[ -z "\${AMC_STUDIO_SUPPORT_DIR:-}" ] || LOG_DIR="$SUPPORT_DIR/Logs"
LOG_FILE="$LOG_DIR/studio-launcher.log"
RUNTIME_DIR="$SUPPORT_DIR/runtime"
WORKSPACE_DIR="$SUPPORT_DIR/workspace"
DEMO_DIR="$SUPPORT_DIR/studio-workspace"
USER_FILE="$SUPPORT_DIR/console-user"
DIGEST_FILE="$RUNTIME_DIR/package.sha256"
AMC_BIN="$RUNTIME_DIR/node_modules/.bin/amc"

# The app's own ports, away from the defaults a terminal amc up uses (3210-3212, 4173, 9464), so both can run at once.
# A variable already set wins. The demo and your workspace never run together, so they share them.
export AMC_STUDIO_PORT="\${AMC_STUDIO_PORT:-3232}" AMC_HOST_PORT="\${AMC_HOST_PORT:-3232}" AMC_GATEWAY_PORT="\${AMC_GATEWAY_PORT:-3230}"
export AMC_PROXY_PORT="\${AMC_PROXY_PORT:-3231}" AMC_DASHBOARD_PORT="\${AMC_DASHBOARD_PORT:-4193}" AMC_METRICS_PORT="\${AMC_METRICS_PORT:-9484}"

# Preserve an explicitly selected Node/npm runtime. Finder/LaunchServices have
# a minimal PATH, so append the common installation locations as fallbacks.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"

say() { printf '%s\\n' "$1"; }
log() { printf '%s %s\\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG_FILE"; }
fail() { log "$1"; say "AMC_ERROR=$1"; exit 1; }

# True when a workspace's state.json names a live Studio daemon (its pid in DAEMON_PID); a stale file's pid may now be another program's.
live_daemon() {
  DAEMON_PID=$(node -e 'try { const pid = require(process.argv[1]).pid; console.log(Number.isSafeInteger(pid) && pid > 0 ? pid : "") } catch {}' "$1/.amc/studio/state.json" 2>/dev/null || true)
  [ -n "$DAEMON_PID" ] && ps -ww -o command= -p "$DAEMON_PID" 2>/dev/null | grep -q '_studio-daemon'
}

# Stops the Studio of one workspace and waits for it to release its ports (amc down only signals it, and it can take
# up to 10 s). AMC_NO_AUTO_REBUILD: an old runtime about to be replaced must not repair its database engine first.
stop_studio() {
  if live_daemon "$1"; then
    (cd "$1" && AMC_NO_AUTO_REBUILD=1 "$AMC_BIN" down) >>"$LOG_FILE" 2>&1 || true
    WAITED=0
    while kill -0 "$DAEMON_PID" 2>/dev/null && [ "$WAITED" -lt 15 ]; do
      sleep 1
      WAITED=$((WAITED + 1))
    done
  else
    # No Studio daemon runs under that pid, so the state file is stale; the runtime must not trust it.
    rm -f "$1/.amc/studio/state.json"
  fi
}

# Installs the included package into the version-pinned runtime when its digest changed (first launch or an upgrade).
ensure_runtime() {
  [ -f "$PACKAGE" ] || fail "This app is missing its AMC package ($PACKAGE). Download the app again."
  ACTUAL_PACKAGE_DIGEST=$(shasum -a 256 "$PACKAGE" | awk '{print $1}')
  if [ "$ACTUAL_PACKAGE_DIGEST" != "$PACKAGE_DIGEST" ]; then
    fail "The AMC package inside this app failed its integrity check, so it was not installed. Download the app again."
  fi
  say "AMC_PACKAGE_DIGEST=$PACKAGE_DIGEST"
  CURRENT_DIGEST=$(cat "$DIGEST_FILE" 2>/dev/null || true)
  if ! command -v node >/dev/null 2>&1; then
    fail "AMC needs Node.js 22 or 24 with npm, and none was found on this Mac. Install Node.js from https://nodejs.org (or run brew install node@22 in Terminal), then click Retry."
  fi
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if ! [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null; then
    fail "AMC needs Node.js 22 or 24, and this Mac has Node.js $(node --version 2>/dev/null || echo unknown). Install Node.js 22 or 24 from https://nodejs.org, then click Retry."
  fi
  [ "$CURRENT_DIGEST" != "$PACKAGE_DIGEST" ] || [ ! -x "$AMC_BIN" ] || return 0
  command -v npm >/dev/null 2>&1 || fail "AMC needs npm, which comes with Node.js, and it was not found on this Mac. Reinstall Node.js 22 or 24 from https://nodejs.org, then click Retry."
  if [ -z "$CURRENT_DIGEST" ]; then say "AMC_STATUS=Installing AMC (first launch only). This takes a minute or two."; else say "AMC_STATUS=Updating AMC to the version in this app."; fi
  if [ -x "$AMC_BIN" ]; then
    # Stop the Studios the previous runtime started, so the upgraded runtime serves the console.
    stop_studio "$WORKSPACE_DIR"
    stop_studio "$DEMO_DIR"
  fi
  mkdir -p "$RUNTIME_DIR"
  log "Installing $PACKAGE into $RUNTIME_DIR"
  if ! npm install --prefix "$RUNTIME_DIR" --no-audit --no-fund "$PACKAGE" >>"$LOG_FILE" 2>&1; then
    fail "Installing AMC failed: npm could not finish, often because this Mac is offline. Details are in $LOG_FILE. Check the network connection, then click Retry."
  fi
  printf '%s\\n' "$PACKAGE_DIGEST" > "$DIGEST_FILE"
}

# Starts Studio in one workspace (extra amc up options follow). On failure it names a port of the app that another
# program holds, else the last line amc wrote.
start_studio() {
  DIR=$1
  shift
  if live_daemon "$DIR"; then STARTED=0; else STARTED=1; fi
  mkdir -p "$DIR"
  if ! (cd "$DIR" && "$AMC_BIN" up --no-open "$@") >>"$LOG_FILE" 2>&1; then
    for PORT in "$AMC_STUDIO_PORT" "$AMC_HOST_PORT" "$AMC_GATEWAY_PORT" "$AMC_PROXY_PORT" "$AMC_DASHBOARD_PORT" "$AMC_METRICS_PORT"; do
      if node -e 'require("node:net").connect(Number(process.argv[1]), "127.0.0.1").on("connect", () => process.exit(0)).on("error", () => process.exit(1))' "$PORT" >/dev/null 2>&1; then
        fail "AMC could not start because another program on this Mac uses port $PORT, often an AMC Studio started from Terminal. Stop it (amc down in its folder), then click Retry."
      fi
    done
    fail "AMC could not start: $(grep -v '^ *$' "$LOG_FILE" | tail -n 1 | cut -c1-300) Details are in $LOG_FILE."
  fi
  say "AMC_STARTED=$STARTED"
}

# The port Studio bound (state.json apiPort), else the configured one.
studio_port() {
  PORT=$(node -e 'try { const port = require(process.argv[1]).apiPort; console.log(Number.isInteger(port) && port > 0 && port < 65536 ? port : "") } catch {}' "$1/.amc/studio/state.json" 2>/dev/null || true)
  printf '%s\\n' "\${PORT:-$2}"
}

# The account of the remembered-passphrase store (src/vault/passphraseStore.ts workspaceKey): the first 32 hex digits of
# the SHA-256 of the workspace's resolved path, as amc run in that folder computes it.
workspace_key() {
  (cd "$WORKSPACE_DIR" && node -e 'console.log(require("node:crypto").createHash("sha256").update(process.cwd()).digest("hex").slice(0, 32))')
}

keychain_read() {
  security find-generic-password -a "$2" -s "$1" -w 2>/dev/null
}

# security -i reads the command from stdin, so the secret is in no process's arguments; read back to confirm.
keychain_write() {
  printf 'add-generic-password -U -a %s -s %s -w %s\\n' "$2" "$1" "$3" | security -i >/dev/null 2>&1 || return 1
  [ "$(keychain_read "$1" "$2")" = "$3" ]
}

new_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
}

# First start of your own workspace: a vault passphrase into the Keychain entry amc up reads (service amc-vault), the
# vault and policies (amc up), then the owner account with a generated password kept in the Keychain (service
# amc-console). amc gets the passphrase in its environment and the password on stdin, never in an argument or a file.
first_run_setup() {
  say "AMC_STATUS=Creating your workspace (first launch only)."
  VAULT_PASSPHRASE=$(keychain_read amc-vault "$KEY" || true)
  if [ -z "$VAULT_PASSPHRASE" ]; then
    if [ -f "$WORKSPACE_DIR/.amc/vault.amcvault" ]; then
      fail "Your workspace has a vault, but its passphrase is not in your macOS Keychain (service amc-vault). Run amc up in $WORKSPACE_DIR from Terminal once, then open the app again."
    fi
    VAULT_PASSPHRASE=$(new_secret)
    keychain_write amc-vault "$KEY" "$VAULT_PASSPHRASE" \\
      || fail "AMC could not save a vault passphrase in your macOS Keychain, so it did not create the vault. Unlock your login keychain, then click Retry."
  fi
  export AMC_VAULT_PASSPHRASE="$VAULT_PASSPHRASE"
  start_studio "$WORKSPACE_DIR"
  say "AMC_STATUS=Creating your owner account."
  CONSOLE_USER=$(id -un | LC_ALL=C tr -cd 'A-Za-z0-9._-')
  [ -n "$CONSOLE_USER" ] || CONSOLE_USER=owner
  CONSOLE_PASSWORD=$(new_secret)
  keychain_write amc-console "$KEY" "$CONSOLE_PASSWORD" \\
    || fail "AMC could not save your console password in your macOS Keychain. Unlock your login keychain, then click Retry."
  if ! printf '%s' "$CONSOLE_PASSWORD" | (cd "$WORKSPACE_DIR" && "$AMC_BIN" user init --username "$CONSOLE_USER" --password-file /dev/stdin) >>"$LOG_FILE" 2>&1; then
    fail "AMC could not create your owner account. Details are in $LOG_FILE."
  fi
  unset AMC_VAULT_PASSPHRASE VAULT_PASSPHRASE CONSOLE_PASSWORD
  printf '%s\\n' "$CONSOLE_USER" > "$USER_FILE"
}

# Signs the owner in through the console's own POST /auth/login. The password goes from the Keychain to node on a pipe;
# only the session cookie comes back. When that fails the console shows its sign-in page.
sign_in() {
  CONSOLE_USER=$(cat "$USER_FILE" 2>/dev/null || true)
  [ -n "$CONSOLE_USER" ] || return 0
  SESSION=$(keychain_read amc-console "$KEY" | node -e '
let password = "";
process.stdin.on("data", (chunk) => { password += chunk; }).on("end", async () => {
  const response = await fetch(process.argv[1] + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.argv[2], password: password.trim() }) });
  const cookie = response.headers.getSetCookie().map((line) => /^amc_session=([A-Za-z0-9%._~-]+)/.exec(line)?.[1]).find(Boolean);
  if (!cookie) { console.error("Console sign-in refused: HTTP " + response.status); process.exit(1); }
  console.log(cookie);
});' "$1" "$CONSOLE_USER" 2>>"$LOG_FILE" || true)
  if [ -n "$SESSION" ]; then say "AMC_SESSION=$SESSION"; else log "Signing in as $CONSOLE_USER did not work; the console shows its sign-in page."; fi
}

run_workspace() {
  ensure_runtime
  stop_studio "$DEMO_DIR"
  mkdir -p "$WORKSPACE_DIR"
  chmod 700 "$WORKSPACE_DIR"
  KEY=$(workspace_key)
  if [ -f "$WORKSPACE_DIR/.amc/users.yaml" ]; then start_studio "$WORKSPACE_DIR"; else first_run_setup; fi
  PORT=$(studio_port "$WORKSPACE_DIR" "$AMC_STUDIO_PORT")
  sign_in "http://127.0.0.1:$PORT"
  say "AMC_TITLE=My workspace"
  say "AMC_STUDIO_URL=http://127.0.0.1:$PORT/console/"
}

run_demo() {
  ensure_runtime
  stop_studio "$WORKSPACE_DIR"
  start_studio "$DEMO_DIR" --demo
  PORT=$(studio_port "$DEMO_DIR" "$AMC_HOST_PORT")
  say "AMC_TITLE=Demo workspace (view only)"
  say "AMC_STUDIO_URL=http://127.0.0.1:$PORT/w/demo/console/"
}

case "$MODE" in
  info)
    say "AMC_LOG_FILE=$LOG_FILE"
    say "AMC_RUNTIME_DIR=$RUNTIME_DIR"
    say "AMC_WORKSPACE_DIR=$WORKSPACE_DIR"
    say "AMC_CONSOLE_USER=$(cat "$USER_FILE" 2>/dev/null || true)"
    if [ -f "$WORKSPACE_DIR/.amc/users.yaml" ]; then say "AMC_SETUP_DONE=1"; else say "AMC_SETUP_DONE=0"; fi
    ;;
  workspace) run_workspace ;;
  demo) run_demo ;;
  stop)
    if [ -x "$AMC_BIN" ]; then
      stop_studio "$WORKSPACE_DIR"
      stop_studio "$DEMO_DIR"
    fi
    ;;
  *) fail "Unknown launcher mode: $MODE" ;;
esac
`;
  writeFileSync(join(resourcesDir, "launch-studio.sh"), launchScript, { mode: 0o755 });
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
      ? `The ${studioAppName} native app renders the Compass Console in a macOS WebKit window. On first launch it says where AMC keeps its records, creates your own workspace and owner account, and signs you in; later launches open the console directly. Studio > Try the Demo shows a view-only sample workspace. It does not bundle Electron, Chromium, or a browser runtime.`
      : `The ${studioAppName} cross-build fallback starts the view-only demo workspace and opens ${studioMacDemoUrl} in the macOS system browser. It does not bundle Electron or a browser runtime.`
    : `The ${studioAppName} launcher starts local demo-mode Studio and opens ${studioUrl} in the system browser. It does not bundle Electron or a browser runtime.`}
${platform.id === "macos-universal"
    ? `
The app is not notarized. If macOS says it cannot verify the app, open System Settings > Privacy & Security and choose Open Anyway.
`
    : ""}
${platform.id === "macos-universal"
    ? "When you quit the app it offers to stop Studio, and stops the one it started unless you choose otherwise. Studio > Stop AMC stops it at any time. From Terminal:"
    : "Studio keeps running after you close the browser tab. Stop it with:"}

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
