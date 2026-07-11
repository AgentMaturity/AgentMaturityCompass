import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("desktop app packaging and visual identity", () => {
  test("desktop package script creates macOS and Windows Studio app launchers", () => {
    const script = read("scripts/package-desktop-installers.mjs");

    expect(script).toContain("writeMacStudioApp");
    expect(script).toContain("Agent Maturity Compass Studio.app");
    expect(script).toContain("CFBundleIdentifier");
    expect(script).toContain("co.agentmaturity.studio");
    expect(script).toContain("NSAllowsLocalNetworking");
    expect(script).toContain("writeMacLauncherExecutable");
    expect(script).toContain("studioMacBrowserOpenCommand");
    expect(script).toContain("const macRuntime = writeMacLauncherExecutable");
    expect(script).toContain("runtime: macRuntime");
    expect(script).toContain('run("codesign"');
    expect(script).toContain("launch-studio.sh");
    expect(script).toContain("WebKit/WebKit.h");
    expect(script).toContain("WKWebView");
    expect(script).toContain("native-webkit");
    expect(script).toContain("[task terminationStatus] != 0");
    expect(script).toContain("Could not start AMC Studio. See the launcher log");
    expect(script).toContain("/opt/homebrew/bin:/usr/local/bin");
    expect(script).toContain("PACKAGE_DIGEST");
    expect(script).toContain("PACKAGE_SHA256");
    expect(script).toContain("AMC package checksum mismatch");
    expect(script).toContain("Get-FileHash");
    expect(script).toContain("npm install --prefix");
    expect(script).toContain("node_modules/.bin/amc");
    expect(script).toContain(String.raw`node_modules\\.bin\\amc.cmd`);
    expect(script).toContain("studio-workspace");
    expect(script).toContain('cd "$WORKSPACE_DIR"');
    expect(script).toContain("Set-Location $WorkspaceDir");
    expect(script).toContain('"$AMC_BIN" up --demo');
    expect(script).toContain("& $AmcBin up --demo");
    expect(script).toContain("Could not start AMC Studio. See $LogFile.");
    expect(script).not.toContain('up --demo --no-open >>"$LOG_FILE" 2>&1 || true');
    expect(script).not.toContain("open \\\"http://127.0.0.1:3212/w/demo/console/\\\"");
    expect(script).toContain("writeWindowsStudioApp");
    expect(script).toContain("Agent Maturity Compass Studio.cmd");
    expect(script).toContain("Start-Process \"http://127.0.0.1:3212/w/demo/console/\"");
    expect(script).toContain("appLaunchers");
  });

  test("desktop verifier checks app launcher files inside platform archives", () => {
    const verifier = read("scripts/verify-desktop-installers.mjs");

    expect(verifier).toContain("Agent Maturity Compass Studio.app/Contents/Info.plist");
    expect(verifier).toContain("Agent Maturity Compass Studio.app/Contents/MacOS/Agent Maturity Compass Studio");
    expect(verifier).toContain("Agent Maturity Compass Studio.app/Contents/Resources/launch-studio.sh");
    expect(verifier).toContain("Agent Maturity Compass Studio.ps1");
    expect(verifier).toContain("Agent Maturity Compass Studio.cmd");
    expect(verifier).toContain("appLaunchers");
    expect(verifier).toContain("nested npm tarball hash mismatch");
    expect(verifier).toContain("installer does not pin the nested npm tarball hash");
  });

  test("Studio dashboard uses the shared website-aligned console shell", () => {
    const dashboard = read("src/console/pages/dashboard.html");
    const home = read("src/console/pages/home.html");
    const styles = read("src/console/assets/styles.css");
    const app = read("src/console/assets/app.js");

    expect(dashboard).toContain('<link rel="manifest" href="./assets/manifest.json" />');
    expect(dashboard).toContain('<link rel="stylesheet" href="./assets/styles.css?v=20260711a" />');
    expect(dashboard).toContain('data-page="home"');
    expect(dashboard).toContain('<script type="module" src="./assets/app.js?v=20260711a"></script>');
    expect(dashboard).not.toContain("<style>body{font-family:system-ui");
    expect(home).toContain("Compass Console - AMC Studio");
    expect(styles).toContain("--accent: #4AEF79");
    expect(styles).toContain("--bg-terminal: #2a2a2a");
    expect(styles).toContain(".studio-desktop-note");
    expect(styles).toContain(".topbar");
    expect(styles).toContain(".quick-action-grid");
    expect(styles).toContain(".mobile-nav-toggle");
    expect(styles).toContain("nav.mobile-nav-open a");
    expect(app).toContain("Desktop app");
    expect(app).toContain("native WebKit");
    expect(app).toContain("142 assurance packs");
    expect(app).toContain("1,159 CLI paths");
    expect(app).toContain("workspace-authenticated trust boundary");
    expect(app).toContain("mutable local data");
    expect(app).toContain("status.policyCommitted");
    expect(app).toContain("status.mirrorExists");
    expect(app).toContain("const launchCommand = demoMode");
    expect(app).toContain('setAttribute("aria-label", "Toggle navigation")');
    expect(app).toContain('nav.classList.toggle("mobile-nav-open"');
    expect(read("src/console/assets/sw.js")).toContain('CACHE_NAME = "amc-console-v6"');
    expect(read("src/console/assets/sw.js")).toContain("self.skipWaiting()");
    expect(read("src/console/assets/sw.js")).toContain('req.mode === "navigate"');
  });

  test("CLI format uses the same public website green and tagline", () => {
    const brand = read("src/brand/visualIdentity.ts");
    const cliFormat = read("src/cliFormat.ts");

    expect(brand).toContain('accent: "#4AEF79"');
    expect(brand).toContain("Evidence over claims.");
    expect(cliFormat).toContain("AMC_VISUAL_IDENTITY");
    expect(cliFormat).toContain("AMC_VISUAL_IDENTITY.colors.accent");
    expect(cliFormat).not.toContain("#00ff41");
  });

  test("desktop docs describe real launcher boundaries without claiming a bundled browser runtime", () => {
    const desktopDocs = read("docs/DESKTOP_PACKAGES.md");
    const installDocs = read("docs/INSTALL.md");
    const readme = read("README.md");
    const website = read("website/index.html");

    for (const content of [desktopDocs, installDocs, readme, website]) {
      expect(content).toContain("Agent Maturity Compass Studio");
      expect(content).toContain("macOS");
      expect(content).toContain("Windows");
    }
    expect(desktopDocs).toContain("launcher app");
    expect(desktopDocs).toContain("version-pinned per-user runtime");
    expect(desktopDocs).toContain("native WebKit");
    expect(desktopDocs).toContain("does not bundle Electron");
    expect(desktopDocs).toContain("opens the same local Studio console");
    expect(readme).toContain("version-pinned per-user runtime");
    expect(website).toContain("native WebKit");
    expect(website).toContain("macOS and Windows launcher apps");
  });
});
