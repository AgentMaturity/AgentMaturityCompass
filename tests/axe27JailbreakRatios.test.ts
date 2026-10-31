import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { renderJailbreakMarkdown, runJailbreakTests } from "../src/redteam/jailbreak/runner.js";

test("AXE-27 no jailbreak trials cannot report perfect defense", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "axe27-jailbreak-"));
  try {
    const report = await runJailbreakTests({ workspace, agentId: "axe27", payloads: [], respondFn: async () => "unused" });
    expect(report.summary).toMatchObject({ overallScore0to100: null, jailbreakRate: null, outcome: "not_evaluated", sampleSize: 0 });
    for (const row of Object.values(report.summary.bySeveritySummary)) expect(row).toMatchObject({ rate: null, outcome: "not_evaluated" });
    expect(renderJailbreakMarkdown(report)).toContain("not evaluated");
    expect(renderJailbreakMarkdown(report)).not.toContain("null/100");
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
