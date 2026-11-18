import { appendFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initBudgets } from "../src/budgets/budgets.js";
import { actionPolicyPath, initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { codingActionPolicy } from "../src/setup/starterProfiles.js";
import { actionPolicyOutcomes } from "../src/tools/guards/actionPolicyGuard.js";
import { initWorkspace } from "../src/workspace.js";

/** UX-06: the Governor page states what really happens per kind of action, from the verdict the agent's tools apply. */
const dirs: string[] = [];
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] ??= "governor-outcomes";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-governor-outcomes-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  initActionPolicy(dir, codingActionPolicy());
  return dir;
}

const outcomeOf = (dir: string) => Object.fromEntries(actionPolicyOutcomes(dir, "default", ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY"])
  .map((row) => [row.actionClass, row.outcome]));

describe("Governor outcomes", () => {
  it("a coding workspace: reads run, changes ask a person (executeOnApproval), the rest is a dry run or blocked", () => {
    const outcomes = outcomeOf(workspace());
    expect(outcomes.READ_ONLY).toBe("runs");
    expect(outcomes.WRITE_LOW).toBe("asks a person");
    expect(outcomes.WRITE_HIGH).toBe("asks a person");
    expect(["dry run", "blocked"]).toContain(outcomes.DEPLOY);
    expect(["dry run", "blocked"]).toContain(outcomes.SECURITY);
  });

  it("a policy edited after signing blocks every kind", () => {
    const dir = workspace();
    appendFileSync(actionPolicyPath(dir), "# edited after signing\n");
    expect(new Set(Object.values(outcomeOf(dir)))).toEqual(new Set(["blocked"]));
  });
});
