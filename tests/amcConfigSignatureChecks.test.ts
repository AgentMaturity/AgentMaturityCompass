import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { amcConfigSignatureProblem } from "../src/config/amcConfigSignature.js";

/**
 * M-3: `amc run` refuses an edited amc.config.yaml ("signature is not valid (config digest mismatch)"), so the doctor and
 * fix-signatures must say so too, with the one command that repairs it, instead of PASS / "All config signatures are valid".
 */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE = "amc-config-signature-checks";
  const dir = mkdtempSync(join(tmpdir(), "amc-config-sig-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "shared" });
  return dir;
}

describe("amc.config.yaml signature in doctor and fix-signatures", () => {
  it("passes while the signature matches", async () => {
    const dir = workspace();
    expect(amcConfigSignatureProblem(dir)).toBeNull();
    expect((await runDoctorRules(dir)).checks.find((check) => check.id === "sig-amc-config")).toMatchObject({ status: "PASS" });
  });

  it("fails an edited config with the same reason amc run gives, and names amc verify --sign-config", async () => {
    const dir = workspace();
    const path = join(dir, ".amc", "amc.config.yaml");
    writeFileSync(path, readFileSync(path, "utf8").replace("trustBoundaryMode: shared", "trustBoundaryMode: isolated"));
    expect(amcConfigSignatureProblem(dir)).toMatch(/amc\.config\.yaml signature is not valid \(config digest mismatch\).*amc verify --sign-config/);
    expect((await runDoctorRules(dir)).checks.find((check) => check.id === "sig-amc-config"))
      .toMatchObject({ status: "FAIL", fixHint: expect.stringContaining("amc verify --sign-config") });
  });
});
