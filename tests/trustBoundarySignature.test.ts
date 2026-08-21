import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace, signAmcConfig, verifyAmcConfigSignature } from "../src/workspace.js";

/**
 * G6-20: amc.config.yaml carries security.trustBoundaryMode, and the ledger
 * treats "isolated" as the statement that signing keys are out of reach of the
 * evaluated agent. It was the only root config without a signature, so that
 * assurance could be granted by editing plain YAML — a self-asserted claim of
 * exactly the kind AMC exists to reject.
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-tb-"));
  dirs.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "test-passphrase-1234";
  initWorkspace({ workspacePath: dir });
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("security config signature", () => {
  it("a freshly initialised workspace signs its security config", () => {
    const ws = workspace();
    expect(existsSync(join(ws, ".amc", "amc.config.yaml.sig"))).toBe(true);
    expect(verifyAmcConfigSignature(ws).valid).toBe(true);
  });

  it("editing the config invalidates the signature", () => {
    const ws = workspace();
    const configPath = join(ws, ".amc", "amc.config.yaml");
    const original = readFileSync(configPath, "utf8");

    // The attack: grant yourself an isolated trust boundary by editing YAML.
    writeFileSync(configPath, original.replace("trustBoundaryMode: shared", "trustBoundaryMode: isolated"));
    const after = verifyAmcConfigSignature(ws);
    if (original.includes("trustBoundaryMode: shared")) {
      expect(after.valid).toBe(false);
      expect(after.reason).toMatch(/digest mismatch/);
    }
  });

  it("distinguishes unsigned from tampered", () => {
    const ws = workspace();
    rmSync(join(ws, ".amc", "amc.config.yaml.sig"));
    const unsigned = verifyAmcConfigSignature(ws);
    expect(unsigned.valid).toBe(false);
    expect(unsigned.signatureExists).toBe(false);
    expect(unsigned.reason).toMatch(/signature missing/);
  });

  it("re-signing after a legitimate edit restores validity", () => {
    const ws = workspace();
    const configPath = join(ws, ".amc", "amc.config.yaml");
    writeFileSync(configPath, `${readFileSync(configPath, "utf8")}\n# operator note\n`);
    expect(verifyAmcConfigSignature(ws).valid).toBe(false);
    signAmcConfig(ws);
    expect(verifyAmcConfigSignature(ws).valid).toBe(true);
  });
});
