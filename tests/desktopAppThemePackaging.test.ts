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
    expect(script).toContain("amc up --demo");
    expect(script).toContain("open \"http://127.0.0.1:3212/w/demo/console\"");
    expect(script).toContain("writeWindowsStudioApp");
    expect(script).toContain("Agent Maturity Compass Studio.cmd");
    expect(script).toContain("Start-Process \"http://127.0.0.1:3212/w/demo/console\"");
    expect(script).toContain("appLaunchers");
  });

  test("desktop verifier checks app launcher files inside platform archives", () => {
    const verifier = read("scripts/verify-desktop-installers.mjs");

    expect(verifier).toContain("Agent Maturity Compass Studio.app/Contents/Info.plist");
    expect(verifier).toContain("Agent Maturity Compass Studio.app/Contents/MacOS/Agent Maturity Compass Studio");
    expect(verifier).toContain("Agent Maturity Compass Studio.ps1");
    expect(verifier).toContain("Agent Maturity Compass Studio.cmd");
    expect(verifier).toContain("appLaunchers");
  });

  test("Studio dashboard uses the shared website-aligned console shell", () => {
    const dashboard = read("src/console/pages/dashboard.html");
    const home = read("src/console/pages/home.html");
    const styles = read("src/console/assets/styles.css");
    const app = read("src/console/assets/app.js");

    expect(dashboard).toContain('<link rel="manifest" href="./assets/manifest.json" />');
    expect(dashboard).toContain('<link rel="stylesheet" href="./assets/styles.css" />');
    expect(dashboard).toContain('data-page="home"');
    expect(dashboard).toContain('<script type="module" src="./assets/app.js"></script>');
    expect(dashboard).not.toContain("<style>body{font-family:system-ui");
    expect(home).toContain("Compass Console - AMC Studio");
    expect(styles).toContain("--accent: #4AEF79");
    expect(styles).toContain("--bg-terminal: #2a2a2a");
    expect(styles).toContain(".studio-desktop-note");
    expect(app).toContain("Desktop app");
    expect(app).toContain("147 assurance packs");
    expect(app).toContain("1,144 CLI paths");
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
    expect(desktopDocs).toContain("does not bundle Electron");
    expect(desktopDocs).toContain("opens the same local Studio console");
    expect(website).toContain("macOS and Windows launcher apps");
  });
});
