import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { DemoResult } from "../src/demo/demoRun.js";
import {
  buildProspectDemoPlan,
  renderProspectDemoMarkdown,
  writeProspectDemoShareBundle
} from "../src/demo/prospectDemo.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-demo-prospect-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("prospect demo flow", () => {
  test("builds a five-minute sales flow with share, live evidence, compare, and leaderboard surfaces", () => {
    const plan = buildProspectDemoPlan();
    const markdown = renderProspectDemoMarkdown(plan);

    expect(plan.durationMinutes).toBe(5);
    expect(plan.trustLabel).toBe("DEMO_ONLY");
    expect(plan.claimBoundary).toContain("not production audit evidence");
    expect(plan.commands.liveEvidence).toBe("amc demo prospect --live --share");
    expect(plan.steps.map((step) => step.command)).toContain("amc demo run --no-vault");
    expect(plan.steps.map((step) => step.command)).toContain("amc compare-models --agent default --iterations 3");
    expect(plan.steps.map((step) => step.command)).toContain("amc leaderboard show");
    expect(markdown).toContain("amc demo gap --fast");
    expect(markdown).toContain("amc demo share --public-base-url <url>");
  });

  test("writes a hash-manifested static share bundle with a client-facing URL", () => {
    const root = tempRoot();
    const plan = buildProspectDemoPlan();
    const bundle = writeProspectDemoShareBundle({
      outputRoot: root,
      slug: "Q1 Prospect / ACME",
      publicBaseUrl: "https://reports.example.com/amc-demo/",
      plan,
      now: 1234
    });

    expect(bundle.slug).toBe("q1-prospect-acme");
    expect(bundle.shareUrl).toBe("https://reports.example.com/amc-demo/q1-prospect-acme/index.html");
    expect(existsSync(bundle.htmlPath)).toBe(true);
    expect(existsSync(bundle.manifestPath)).toBe(true);

    const html = readFileSync(bundle.htmlPath, "utf8");
    const manifest = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));
    expect(html).toContain("AMC five-minute prospect demo");
    expect(html).toContain("amc demo prospect --live --share");
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      kind: "amc.demo.prospect.share",
      slug: "q1-prospect-acme",
      trustLabel: "DEMO_ONLY",
      liveEvidenceIncluded: false,
      publicUrl: "https://reports.example.com/amc-demo/q1-prospect-acme/index.html"
    });
    expect(manifest.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.demoJsonSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sources).toContain("https://www.ftc.gov/business-guidance/advertising-marketing");
  });

  test("binds live no-vault demo summaries when provided", () => {
    const liveResult: DemoResult = {
      requestsSent: 10,
      evidenceItems: 24,
      gatewayUrl: "http://127.0.0.1:3210",
      durationMs: 1200,
      mode: "no-vault-demo",
      demoOnly: true,
      agentId: "demo-agent",
      maturityScore: 86,
      maturityLevel: "L4",
      trustLabel: "DEMO_ONLY",
      evidenceWorkspace: "/tmp/amc-demo-workspace",
      gatewaySessionId: "session-demo",
      gatewaySignatureValid: true,
      gatewaySignatureExists: true
    };
    const plan = buildProspectDemoPlan(liveResult);
    const root = tempRoot();
    const bundle = writeProspectDemoShareBundle({ outputRoot: root, plan });
    const manifest = JSON.parse(readFileSync(bundle.manifestPath, "utf8"));

    expect(plan.liveResult).toBe(liveResult);
    expect(plan.sampleScore).toEqual({ maturityScore: 86, maturityLevel: "L4" });
    expect(manifest.liveEvidenceIncluded).toBe(true);
    expect(manifest.liveEvidenceWorkspace).toBe("/tmp/amc-demo-workspace");
    expect(manifest.maturityScore).toBe(86);
  });

  test("documents the prospect demo and share commands", () => {
    const cliInventory = readFileSync(join(process.cwd(), "docs", "CLI_COMMAND_INVENTORY.md"), "utf8");
    const apiReference = readFileSync(join(process.cwd(), "docs", "API_REFERENCE.md"), "utf8");
    const quickstart = readFileSync(join(process.cwd(), "docs", "QUICKSTART.md"), "utf8");

    expect(cliInventory).toContain("amc demo prospect");
    expect(cliInventory).toContain("amc demo share");
    expect(apiReference).toContain("#### `amc demo prospect`");
    expect(apiReference).toContain("#### `amc demo share`");
    expect(quickstart).toContain("amc demo share --public-base-url");
  });
});
