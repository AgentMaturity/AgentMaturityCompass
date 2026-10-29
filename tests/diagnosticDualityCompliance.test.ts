import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateReport, resolveRunReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("diagnostic duality compliance", () => {
  test("seals unavailable compliance when no EXECUTE action ran and renders legacy missingness consistently", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-duality-compliance-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const report = await runDiagnostic({ workspace, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });

    expect(report.dualityCompliance).toEqual({ executeWithValidTicket: 0, executeAttempted: 0, ratio: null });
    expect(resolveRunReport(workspace, report.runId, "default").report.dualityCompliance?.ratio).toBeNull();
    expect(generateReport(report, "md")).toContain("DualityCompliance: n/a (no EXECUTE attempts)");
    expect(generateReport({ ...report, dualityCompliance: undefined }, "md")).toContain("DualityCompliance: n/a (no EXECUTE attempts)");
    expect(generateReport({ ...report, dualityCompliance: { executeWithValidTicket: 0, executeAttempted: 0, ratio: 1 } }, "md"))
      .toContain("DualityCompliance: n/a (no EXECUTE attempts)");
    expect(generateReport({ ...report, dualityCompliance: { executeWithValidTicket: 1, executeAttempted: 2, ratio: 0.5 } }, "md"))
      .toContain("DualityCompliance: 1/2 (50.0%)");
  });
});
