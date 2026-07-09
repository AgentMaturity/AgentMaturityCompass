import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { DiagnosticReport } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  normalizePublicReportBaseUrl,
  publicReportUrl,
  sanitizeReportShareSlug,
  writeDiagnosticReportShareBundle
} from "../src/diagnostic/reportShare.js";

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-report-share-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function reportFixture(): DiagnosticReport {
  return {
    runId: "15f0d361-2c46-411f-8e16-0fb10838258a",
    agentId: "default",
    status: "UNSIGNED",
    verificationPassed: false,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.5,
    trustLabel: "LOW TRUST",
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: { observed: 0.5, attested: 0, selfReported: 0.5 },
    reportJsonSha256: "report-sha"
  } as DiagnosticReport;
}

describe("diagnostic report share bundles", () => {
  test("sanitizes share slugs and builds public report URLs", () => {
    expect(sanitizeReportShareSlug("Q1 Client Assessment")).toBe("q1-client-assessment");
    expect(publicReportUrl("https://reports.example.com/amc/", "q1-client-assessment")).toBe(
      "https://reports.example.com/amc/q1-client-assessment/index.html"
    );
    expect(normalizePublicReportBaseUrl("https://reports.example.com/amc/")).toBe("https://reports.example.com/amc");
    expect(() => normalizePublicReportBaseUrl("file:///tmp/reports")).toThrow(/http or https/i);
  });

  test("writes static HTML and a manifest with local and public URLs", () => {
    const root = tempRoot();
    const html = "<!doctype html><html><body>AMC share</body></html>";
    const bundle = writeDiagnosticReportShareBundle({
      outputRoot: join(root, "share"),
      report: reportFixture(),
      html,
      requestedRunId: "q1-client-assessment",
      resolvedBy: "alias",
      alias: "q1-client-assessment",
      preferredSlug: "Q1 Client Assessment",
      claimBoundary: "Unsigned local preview; regenerate signed evidence for verifier-ready claims.",
      publicBaseUrl: "https://reports.example.com/amc",
      now: 1234
    });

    expect(bundle.slug).toBe("q1-client-assessment");
    expect(bundle.shareUrl).toBe("https://reports.example.com/amc/q1-client-assessment/index.html");
    expect(existsSync(bundle.htmlPath)).toBe(true);
    expect(existsSync(bundle.manifestPath)).toBe(true);
    expect(readFileSync(bundle.htmlPath, "utf8")).toBe(html);
    expect(bundle.manifest).toMatchObject({
      schemaVersion: 1,
      kind: "amc.diagnostic.report.share",
      runId: "15f0d361-2c46-411f-8e16-0fb10838258a",
      requestedRunId: "q1-client-assessment",
      resolvedBy: "alias",
      alias: "q1-client-assessment",
      agentId: "default",
      status: "UNSIGNED",
      artifactStatus: "UNSIGNED",
      evidenceStatus: "UNVERIFIED",
      claimEligible: false,
      reportJsonSha256: "report-sha",
      htmlSha256: sha256Hex(html),
      publicUrl: "https://reports.example.com/amc/q1-client-assessment/index.html"
    });
    expect(bundle.manifest.localUrl).toMatch(/^file:\/\//);
  });
});
