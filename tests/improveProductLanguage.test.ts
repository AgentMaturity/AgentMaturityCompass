import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function runCli(args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8"
  });
}

describe("improve product-language roadmap", () => {
  test("explains what L3 means in product and customer terms", () => {
    const result = runCli(["improve"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("What L3 means for your product:");
    expect(result.stdout).toContain("evidence-backed and reviewable");
    expect(result.stdout).toContain("customers can trust the agent's behavior");
    expect(result.stdout).toContain("PM translation:");
    expect(result.stdout).toContain("L3 examples by agent archetype:");
    expect(result.stdout).toContain("Chatbot:");
    expect(result.stdout).toContain("Copilot:");
    expect(result.stdout).toContain("Workflow agent:");
    expect(result.stdout).toContain("Research agent:");
    expect(result.stdout).toContain("Product outcome:");
    expect(result.stdout).toContain("customer-reviewable control");
    expect(result.stdout).not.toContain("..");
  });

  test("keeps the UX audit aligned with the PM-readable improve flow", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R24 — improve roadmap explains L3 in product language");
    expect(audit).toContain("`amc improve` now explains what L3 means for the product");
    expect(audit).toContain("R34 — improve shows product-specific L3 archetype examples");
    expect(audit).toContain("| 9 | Maya | PM | ⭐⭐ 2/5 | ⭐⭐⭐⭐⭐ 5/5 | +3 | Template variables fixed, L-scale defined inline, improve explains L3 and shows archetype-specific examples |");
    expect(audit).toContain("### Post-Fix Friction Point Review (all current blockers resolved)");
    expect(audit).not.toContain("Connect `improve` roadmap to PM-readable language; add \"what does L3 mean for my product?\"");
    expect(audit).not.toContain("Maya (⭐⭐⭐⭐) | Add product-specific L3 examples for common agent archetypes");
    expect(audit).not.toContain("**Average: 2.1/5**");
    expect(audit).not.toContain("Fix these five before the tool goes to any new audience.");
    expect(audit).not.toContain("### Remaining Friction Points (❌ Still broken or insufficient)");
  });
});
