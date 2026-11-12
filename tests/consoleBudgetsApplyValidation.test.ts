import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

/** M8: an invalid budgets config is refused with 400 and the validation error, never a 500, and nothing is signed. */
let workspace: string;
let api: Awaited<ReturnType<typeof startStudioApiServer>>;
beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), "amc-budgets-apply-"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "budgets-apply");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "budget-token" });
}, 60_000);
afterAll(async () => {
  await api?.close();
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

test("a config that fails the budgets schema is a 400 naming the problem", async () => {
  const res = await fetch(`${api.url}/budgets/apply`, {
    method: "POST", headers: { "x-amc-admin-token": "budget-token", "content-type": "application/json" },
    body: JSON.stringify({ config: { foo: 1 } })
  });
  expect(res.status).toBe(400);
  expect((await res.json() as { error: string }).error).toMatch(/^budgets config is invalid: .+: /);
});
