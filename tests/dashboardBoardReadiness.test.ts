import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const indexHtml = readFileSync(resolve(root, "src/dashboard/templates/index.html"), "utf8");
const appJs = readFileSync(resolve(root, "src/dashboard/templates/app.js"), "utf8");
const stylesCss = readFileSync(resolve(root, "src/dashboard/templates/styles.css"), "utf8");
const uxAudit = readFileSync(resolve(root, "docs/UX_AUDIT_REPORT.md"), "utf8");

describe("dashboard board readiness overview", () => {
  test("adds a first-screen board brief with trend and drill-down mounts", () => {
    expect(indexHtml).toContain("Board-Ready Trends");
    expect(indexHtml).toContain("board-readiness-panel");
    expect(indexHtml).toContain("board-readiness-metrics");
    expect(indexHtml).toContain("board-readiness-drilldowns");
    expect(indexHtml).toContain("Drill-down Panels");
  });

  test("renders board metrics from live dashboard data instead of static copy", () => {
    expect(appJs).toContain("function renderBoardReadiness(d)");
    expect(appJs).toContain("board-readiness-metrics");
    expect(appJs).toContain("Run Trend");
    expect(appJs).toContain("Weakest Dimension");
    expect(appJs).toContain("Evidence Coverage");
    expect(appJs).toContain("Next Board Action");
    expect(appJs).toContain("renderBoardReadiness(G.data)");
  });

  test("keeps the board brief responsive and visually integrated", () => {
    expect(stylesCss).toContain(".board-readiness-panel");
    expect(stylesCss).toContain(".board-metrics");
    expect(stylesCss).toContain(".board-drilldowns");
    expect(stylesCss).toContain("@media (max-width: 900px)");
    expect(stylesCss).toContain(".board-metrics { grid-template-columns: 1fr; }");
  });

  test("keeps the UX audit aligned with Elena's dashboard fix", () => {
    expect(uxAudit).toContain("R29 — dashboard includes board-ready trends and drill-down panels");
    expect(uxAudit).toContain("| 5 | Elena | CTO | ⭐⭐ 2/5 | ⭐⭐⭐⭐⭐ 5/5 | +3 | Fleet overview and first-run dashboard now give executive trend, drill-down, and next-action context |");
    expect(uxAudit).toMatch(/\*\*New average: (?:4\.[5-9]|5\.0)\/5\*\*/);
    expect(uxAudit).not.toContain("Elena (⭐⭐⭐⭐) | Improve first-run dashboard content with board-ready trends and drill-down panels");
    expect(uxAudit).not.toContain("dashboard content depth remains a follow-up");
  });
});
