/** Temp workspaces for the Layer 0 executed harnesses (P1-14). Keys live in the temp dir only, never in tracked .amc/. */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, vi } from "vitest";
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
