/** P2-26 slice B: the kill-switch drill's signed receipt has every field and shows zero effects after activation. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { killSwitchStatus } from "../../src/runtime/killSwitch.js";
import { runKillSwitchDrill, verifyDrillReceipt } from "../../src/runtime/killSwitchDrill.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-drill-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

test("every receipt field is present, zero effects after activation, the kill is lifted and the receipt verifies", async () => {
  const receipt = await runKillSwitchDrill({ workspace, actions: 3 });
  expect(Object.keys(receipt.body).sort()).toEqual(["actionsAttempted", "actionsDenied", "activatedAt", "drillId", "effectsAfterActivation",
    "firstDeniedAt", "killId", "kind", "liftedAt", "manualFallbackRehearsal", "result", "schema"]);
  expect(receipt.body).toMatchObject({ schema: "amc.drill/1", kind: "kill_switch", actionsAttempted: 3, actionsDenied: 3,
    effectsAfterActivation: 0, result: "pass", manualFallbackRehearsal: { status: "pending" } });
  expect(killSwitchStatus(workspace).active).toBe(false);
  expect(verifyDrillReceipt(workspace, receipt)).toBe(true);
  expect(verifyDrillReceipt(workspace, { ...receipt, body: { ...receipt.body, effectsAfterActivation: 1 } })).toBe(false);
});
