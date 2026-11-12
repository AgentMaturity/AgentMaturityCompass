import { afterEach, describe, expect, test, vi } from "vitest";
import { runSmoke } from "../src/e2e/smoke.js";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { smokeCliEntrypoint } from "../src/e2e/smokeSteps.js";

// The first step stops the smoke right after recording what it saw, so no Studio or vault is started.
const seen = vi.hoisted(() => [] as { env?: string; sealedWith?: string }[]);
vi.mock("../src/bootstrap/bootstrap.js", () => ({
  runBootstrap: vi.fn(async (params: { vaultPassphrase: string }) => {
    seen.push({ env: process.env.AMC_VAULT_PASSPHRASE, sealedWith: params.vaultPassphrase });
    throw new Error("stop after recording the passphrase");
  })
}));

const suitePassphrase = process.env.AMC_VAULT_PASSPHRASE;
afterEach(() => {
  seen.length = 0;
  if (suitePassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = suitePassphrase;
});

describe("amc e2e smoke --mode local vault passphrase", () => {
  test("in-process steps unlock with the smoke vault's passphrase, not one exported for another workspace", async () => {
    process.env.AMC_VAULT_PASSPHRASE = "passphrase-of-another-workspace";
    const report = await runSmoke({ mode: "local" });
    expect(report.steps[0]).toMatchObject({ id: "workspace-bootstrap", status: "FAIL" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.env).toBe(seen[0]!.sealedWith);
    expect(seen[0]!.env).not.toBe("passphrase-of-another-workspace");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("passphrase-of-another-workspace");
  });

  test("leaves AMC_VAULT_PASSPHRASE unset afterwards when it was unset", async () => {
    delete process.env.AMC_VAULT_PASSPHRASE;
    await runSmoke({ mode: "local" });
    expect(seen[0]!.env).toBe(seen[0]!.sealedWith);
    expect("AMC_VAULT_PASSPHRASE" in process.env).toBe(false);
  });
});

describe("amc e2e smoke finds the CLI it runs from (run `npm run build` first)", () => {
  test("outside the repository root, it resolves the running package's dist/cli.js, not one under the cwd", () => {
    const cli = smokeCliEntrypoint("/nonexistent-repo-root");
    expect(cli).toBe(join(resolve("."), "dist", "cli.js"));
    expect(existsSync(cli)).toBe(true);
  });
});
