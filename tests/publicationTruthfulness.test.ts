import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function text(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function currentGuideFiles(root: string): string[] {
  return readdirSync(resolve(root), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:md|sh|ya?ml)$/.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name));
}

describe("public distribution and pricing truthfulness", () => {
  test("publishes one machine-readable channel status manifest", () => {
    const status = JSON.parse(text("website/publication-status.json")) as {
      schemaVersion: string;
      asOf: string;
      sourceRevision: string;
      sourceVersion: string;
      channels: Record<string, { status: string; evidence: string; version?: string }>;
    };

    expect(status.schemaVersion).toBe("amc.publication-status.v1");
    expect(status.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status.sourceRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(status.sourceVersion).toBe(JSON.parse(text("package.json")).version);
    expect(status.channels.githubRelease?.status).toBe("live");
    expect(status.channels.website?.status).toBe("live");
    expect(status.channels.npm?.status).toBe("live_stale");
    expect(status.channels.npm?.version).toBe("1.1.1");
    expect(status.channels.npm?.version).not.toBe(status.sourceVersion);
    expect(status.channels.homebrew?.status).toBe("not_live");
    expect(status.channels.industryPacksCheckout?.status).toBe("not_live");
    expect(status.channels.npm?.evidence).toMatch(/HTTP 200 with version 1\.1\.1/i);
    expect(status.channels.industryPacksCheckout?.evidence).toMatch(/404|not configured/i);
  });

  test.each(["README.md", "docs/PRICING.md", "website/index.html"])(
    "%s states that paid checkout is not publicly live",
    (path) => {
      const content = text(path);
      expect(content).toMatch(/checkout.{0,80}not (yet )?(publicly )?(live|available|configured)/is);
    },
  );

  test("public copy does not present unavailable checkout as live", () => {
    const combined = [
      text("README.md"),
      text("docs/PRICING.md"),
      text("website/index.html"),
      text("src/dashboard/templates/components/domains.js"),
      text("src/console/assets/app.js"),
    ].join("\n");
    expect(combined).not.toContain("Run `amc domain pack checkout` to open the subscription flow");
    expect(combined).not.toContain("One $9.99/month subscription unlocks all 41 packs");
    expect(combined).not.toContain("$9.99/month unlock");
  });

  test("current examples and integration guides keep using reviewed source installation", () => {
    const files = [
      ...currentGuideFiles("examples"),
      ...currentGuideFiles("integrations"),
      ...currentGuideFiles("sdk"),
      ...currentGuideFiles("vscode-extension"),
    ];
    const offenders = files.filter((file) => /\bnpm\s+(?:i|install)\s+-g[^\n]*\bagent-maturity-compass\b/.test(text(file)));
    expect(offenders).toEqual([]);
  });

  test("support, issue, and action surfaces do not default to unavailable distribution channels", () => {
    const action = text("amc-action/action.yml");
    const actionReadme = text("amc-action/README.md");
    const support = text("docs/SUPPORT_POLICY.md");
    const bugTemplate = text(".github/ISSUE_TEMPLATE/bug_report.yml");
    const readme = text("README.md");

    expect(action).not.toMatch(/npm\s+(?:i|install)\s+-g\s+agent-maturity-compass/);
    expect(action).not.toContain("default: 'latest'");
    expect(actionReadme).not.toContain("GitHub Marketplace](");
    expect(support).not.toContain("Published via npm and GitHub Releases");
    expect(bugTemplate).not.toMatch(/npm\s+(?:i|install)\s+-g\s+agent-maturity-compass/);
    expect(readme).not.toContain("AgentMaturity/AgentMaturityCompass/amc-action@main");
  });
});
