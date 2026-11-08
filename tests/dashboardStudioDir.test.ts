import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { agentDashboardDir, buildDashboard } from "../src/dashboard/build.js";
import { serveDashboard } from "../src/dashboard/serve.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the dashboard Studio serves", () => {
  test("amc dashboard build and serve default to the directory Studio serves", async () => {
    // A new workspace keeps the default agent at the .amc root, where the old CLI default (.amc/dashboard) left Studio's page stale.
    const workspace = mkdtempSync(join(tmpdir(), "amc-dashboard-dir-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });

    const built = buildDashboard({ workspace });
    expect(built.outDir).toBe(join(workspace, ".amc", "agents", "default", "dashboard"));
    expect(built.outDir).toBe(agentDashboardDir(workspace));

    const server = await serveDashboard({ workspace, port: 0 });
    try {
      expect(server.rootDir).toBe(built.outDir);
      const data = await (await fetch(`${server.url}/data.json`)).json() as { latestRun: { runId: string } };
      expect(data.latestRun.runId).toBe(run.runId);
    } finally {
      await server.close();
    }
  });

  test("a first run that scored 0.0/5 is not asked to run its first score", () => {
    // The production renderer, evaluated with the few globals it reads.
    const appJs = readFileSync(resolve(process.cwd(), "src/dashboard/templates/app.js"), "utf8");
    const source = appJs.match(/function renderNextActions\(d\) \{[\s\S]*?\n\}\n/)?.[0];
    expect(source).toBeDefined();
    const mount = { innerHTML: "" };
    const render = new Function("document", "esc", "escJs", "DIM_SHORT", `${source}\nreturn renderNextActions;`)(
      { getElementById: (id: string) => (id === "task-grid-mount" ? mount : null) }, String, String, {}
    ) as (data: unknown) => void;

    render({
      overall: 0,
      evidenceGaps: [{ questionId: "AMC-1.1", reason: "No evidence events linked." }],
      latestRun: { questionScores: [{ questionId: "AMC-1.1" }], layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 0 }] }
    });
    expect(mount.innerHTML).not.toContain("Run your first full score");
    expect(mount.innerHTML).toContain("Fix 1 evidence gap");

    render({ overall: 0 });
    expect(mount.innerHTML).toContain("Run your first full score");
  });
});
