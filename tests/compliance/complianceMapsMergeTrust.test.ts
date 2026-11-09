import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initComplianceMapsCliAsync } from "../../src/compliance/complianceCli.js";
import { ComplianceMapsUntrustedError, loadVerifiedComplianceMaps, verifyComplianceMapsSignature } from "../../src/compliance/complianceEngine.js";
import { complianceMapsPath } from "../../src/compliance/complianceMapPublication.js";

/**
 * fix3 S11: `amc compliance init --merge` must never launder an unsigned or tampered maps file into a re-signed trusted
 * one. The merge reads the existing maps from the very bytes whose signature verified; anything else is refused and the
 * file is left exactly as it was.
 */
const PASS = "maps-merge-trust-passphrase";
const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-maps-merge-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = PASS;
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}
const bytes = (ws: string) => readFileSync(complianceMapsPath(ws));
const tamper = (ws: string) => writeFileSync(complianceMapsPath(ws), `${readFileSync(complianceMapsPath(ws), "utf8")}\n# attacker edit\n`);

describe("compliance maps merge trusts verified bytes only", () => {
  test("a tampered maps file is refused by --merge and left untouched; a missing one starts from the built-in set", async () => {
    const ws = workspace();
    // No file yet: --merge starts from the built-in defaults and signs them.
    await initComplianceMapsCliAsync(ws, { merge: true });
    expect(verifyComplianceMapsSignature(ws).valid).toBe(true);
    const signed = bytes(ws);
    expect(loadVerifiedComplianceMaps(ws).complianceMaps.mappings.length).toBeGreaterThan(0);

    tamper(ws);
    const tampered = bytes(ws);
    expect(verifyComplianceMapsSignature(ws).valid).toBe(false);
    await expect(initComplianceMapsCliAsync(ws, { merge: true })).rejects.toBeInstanceOf(ComplianceMapsUntrustedError);
    await expect(initComplianceMapsCliAsync(ws, { merge: true })).rejects.toThrow(/COMPLIANCE_MAPS_UNTRUSTED/);
    expect(bytes(ws).equals(tampered)).toBe(true); // nothing merged, nothing re-signed
    expect(verifyComplianceMapsSignature(ws).valid).toBe(false);

    // An unsigned file (signature removed) is refused the same way.
    writeFileSync(complianceMapsPath(ws), signed);
    unlinkSync(`${complianceMapsPath(ws)}.sig`);
    await expect(initComplianceMapsCliAsync(ws, { merge: true })).rejects.toThrow(/signature missing/);
    expect(bytes(ws).equals(signed)).toBe(true);
  });

  test("the CLI refuses --merge over a tampered file with a non-zero exit and leaves the file as it was", () => {
    const ws = workspace();
    const cli = resolve(process.cwd(), "dist/cli.js");
    const env = { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS };
    const init = spawnSync(process.execPath, [cli, "compliance", "init"], { cwd: ws, env, encoding: "utf8" });
    expect(init.status, init.stderr).toBe(0);
    tamper(ws);
    const tampered = bytes(ws);
    const merge = spawnSync(process.execPath, [cli, "compliance", "init", "--merge"], { cwd: ws, env, encoding: "utf8" });
    expect(merge.status).not.toBe(0);
    expect(merge.stderr).toMatch(/COMPLIANCE_MAPS_UNTRUSTED/);
    expect(merge.stdout).not.toMatch(/Compliance maps created/);
    expect(bytes(ws).equals(tampered)).toBe(true);
  }, 60_000);
});
