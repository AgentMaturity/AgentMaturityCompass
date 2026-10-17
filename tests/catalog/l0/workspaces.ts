/** Temp workspaces for the Layer 0 executed harnesses (P1-14). Keys live in the temp dir only, never in tracked .amc/. */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, vi } from "vitest";
import { loadToolsConfig, signToolsConfig, toolsConfigPath } from "../../../src/toolhub/toolhubValidators.js";
import type { ActionClass } from "../../../src/types.js";
import { lockVault } from "../../../src/vault/vault.js";
import { initWorkspace } from "../../../src/workspace.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { lockVault(root); } catch { /* not unlocked */ }
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function tempDir(prefix: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}

/** A fresh isolated workspace with signed default configs (tools, budgets, action policy) and agent "default". */
export function newWorkspace(prefix = "amc-l0-"): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "layer0-fixture-passphrase");
  const root = tempDir(prefix);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}

/** Signs a payment tool into the workspace's tools.yaml, binding amount, currency and recipient as FINANCIAL tools must. */
export function signPayTool(ws: string, name: string, actionClass: ActionClass): void {
  const config = loadToolsConfig(ws);
  config.tools.allowedTools.push({ name, actionClass,
    bindingFields: { amount: "amount", currency: "currency", recipient: "recipient" } } as (typeof config.tools.allowedTools)[number]);
  writeFileSync(toolsConfigPath(ws), YAML.stringify(config));
  signToolsConfig(ws);
}
