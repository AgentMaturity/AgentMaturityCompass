import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleComplianceRoute } from "../../src/api/complianceRouter.js";
import { complianceFleetReportCli } from "../../src/compliance/complianceCli.js";
import { generateComplianceReport, initComplianceMaps } from "../../src/compliance/complianceEngine.js";
import { generateCoverageMatrix, renderCoverageMatrixMarkdown } from "../../src/compliance/complianceMatrix.js";
import { familyReview } from "../../src/compliance/frameworks.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P1-45: the experimental, unreviewed status and the family flags (HTI-1 at risk, Colorado source-context review pending) travel with every
 * compliance surface as an additive `familyReview` field, not only in the single-report Markdown.
 */

const EXPERIMENTAL = { status: "experimental", expertSignOff: null };
let workspace: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-family-review-"));
  process.env.AMC_VAULT_PASSPHRASE = "family-review-surfaces-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initComplianceMaps(workspace);
});
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe("familyReview on every compliance surface", () => {
  test("report JSON carries the family's review status and flags", () => {
    const report = generateComplianceReport({ workspace, framework: "HHS_HTI_1", window: "14d" });
    expect(report.familyReview).toEqual(familyReview("HHS_HTI_1"));
    expect(report.familyReview).toMatchObject(EXPERIMENTAL);
    expect(report.familyReview!.flags.join(" ")).toContain("At risk: an HTI-5 final rule may delete model-card requirements");
  });

  test("the fleet report carries it", () => {
    const fleet = complianceFleetReportCli({ workspace, framework: "CO_AI_ACT", window: "14d" });
    expect(fleet.familyReview).toEqual(familyReview("CO_AI_ACT"));
    expect(fleet.familyReview.flags.join(" ")).toContain("SB26-189");
  });

  test("the coverage matrix carries it per framework, in JSON and Markdown", () => {
    const matrix = generateCoverageMatrix({ workspace, window: "14d", frameworks: ["HHS_HTI_1", "SOC2"] });
    expect(matrix.frameworks.map((row) => row.familyReview)).toEqual([familyReview("HHS_HTI_1"), familyReview("SOC2")]);
    const markdown = renderCoverageMatrixMarkdown(matrix);
    expect(markdown).toContain("## Mapping status");
    expect(markdown).toContain("experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending)");
    expect(markdown).toContain("At risk: an HTI-5 final rule may delete model-card requirements");
  });

  test("the API report response carries it", async () => {
    const req = Readable.from([JSON.stringify({ framework: "HHS_HTI_1", window: "14d", outFile: "out/hti1.json" })]) as unknown as IncomingMessage;
    let status = 0;
    let body = "";
    const res = { headersSent: false, writeHead(code: number) { status = code; return this; }, end(chunk: string) { body = chunk; } } as unknown as ServerResponse;
    expect(await handleComplianceRoute("/api/v1/compliance/report", "POST", req, res, workspace)).toBe(true);
    expect(status).toBe(201);
    expect(JSON.parse(body).data.familyReview).toEqual(familyReview("HHS_HTI_1"));
  });

  test("Studio's compliance page prints the status and flags from the report JSON", () => {
    const app = readFileSync(new URL("../../src/console/assets/app.js", import.meta.url), "utf8");
    const view = app.slice(app.indexOf("async function renderCompliance"), app.indexOf("\n}\n", app.indexOf("async function renderCompliance")));
    expect(view).toContain("report.familyReview");
    expect(view).toContain("htmlEscape(flag)");
  });

  test("every generated report in docs/compliance carries the experimental line", () => {
    const dir = new URL("../../docs/compliance/", import.meta.url);
    const reports = readdirSync(dir).filter((name) => /^compliance-.*\.md$/.test(name))
      .map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8") }))
      .filter(({ text }) => text.startsWith("# AMC Compliance Report"));
    expect(reports.length).toBeGreaterThan(5);
    for (const { name, text } of reports) {
      expect(text, name).toContain("- Mappings: experimental: drafted and refuted by AI agents, not signed off by a named expert (D-08 pending).");
    }
  });
});
