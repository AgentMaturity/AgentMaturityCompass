/** P0-55 case 9 (5fe47ebe): under AMC_NO_SIGN=1 a delegated foreign child is read back from the unsigned store it was written to. */
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createForeignRunner } from "../../src/agent/foreignSubagentRunner.js";
import { initWorkspace } from "../../src/workspace.js";

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-p055-foreign-")));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p055-foreign-fixture");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(dir, "checkpoints"));
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_NO_SIGN", "1");
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

test("AMC_NO_SIGN=1: a foreign child that prints ok answers { ok: true, text: 'ok' }", async () => {
  const script = join(dir, "fake-agent");
  writeFileSync(script, "#!/bin/sh\necho ok\n"); chmodSync(script, 0o755);
  const runner = createForeignRunner({ workspace: dir, spawn: (goal) => ({ command: script, args: [goal] }),
    governedEnv: () => ({ env: { AMC_LEASE: "lease-token-abc" }, lease: "lease-token-abc" }) });
  const result = await runner({ continuable: false, toolsetAgentId: "payments-agent", childSessionId: "foreign-child-1", goal: "say ok",
    identity: { governedAs: "payments-agent", runAs: "researcher", depth: 1, parent: "payments-agent" } });
  expect(result.ok, result.ok ? "" : result.reason).toBe(true);
  expect(result.text.trim()).toBe("ok");
});
