import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createPassportArtifact, tarCreateDeterministic } from "../src/passport/passportArtifact.js";
import { verifyPassportArtifactFile } from "../src/passport/passportVerifier.js";
import { passportHarnessSchema } from "../src/passport/passportHarness.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { savePassportPolicy } from "../src/passport/passportStore.js";
import { workspaceSelfTrust } from "../src/trust/index.js";

/**
 * SH-TRUST-05: an AGENT passport carries a separately signed `harness/harness.json` companion naming the agent's
 * model route, tools, signed policies and the sealed runs its scores come from. passport.json itself is unchanged
 * (v1), so a verifier that ignores the companion still verifies the passport; one that knows it checks the binding.
 */
describe("passport harness companion", () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });
  function workspace(): string {
    const dir = mkdtempSync(join(tmpdir(), "amc-passport-harness-"));
    roots.push(dir);
    process.env.AMC_VAULT_PASSPHRASE = "passport-harness-passphrase";
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    savePassportPolicy(dir, defaultPassportPolicy());
    return dir;
  }
  const create = (ws: string) => createPassportArtifact({ workspace: ws, scopeType: "AGENT", scopeId: "default", outFile: join(".amc", "passport", "exports", "agent", "default", "latest.amcpass") });
  const extract = (file: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "amc-passport-harness-x-"));
    roots.push(dir);
    expect(spawnSync("tar", ["-xzf", file, "-C", dir]).status).toBe(0);
    return join(dir, "amc-passport");
  };

  test("the companion is signed, bound to passport.json by digest, verified, and passport.json has no harness key", () => {
    const ws = workspace();
    const created = create(ws);
    expect("harness" in created.passport).toBe(false);
    const root = extract(created.outFile);
    const harness = passportHarnessSchema.parse(JSON.parse(readFileSync(join(root, "harness", "harness.json"), "utf8")));
    expect(harness.passportId).toBe(created.passport.passportId);
    expect(harness.agentId).toBe("default");
    // Values come from signed files or are null and named: nothing is 0 for "not measured".
    expect(harness.scores.assurance).toBeNull();
    expect(harness.scores.redteam).toBeNull();
    expect(harness.unknown.some((row) => row.startsWith("assurance:"))).toBe(true);
    expect(harness.policy.signedFiles.length).toBeGreaterThan(0);
    expect(harness.policy.signedFiles.every((row) => /^[0-9a-f]{64}$/.test(row.sha256))).toBe(true);
    const verified = verifyPassportArtifactFile({ file: created.outFile, workspace: ws, trust: workspaceSelfTrust(ws) });
    expect(verified.ok, JSON.stringify(verified.errors)).toBe(true);
    expect(verified.harness?.passportSha256).toBe(harness.passportSha256);
  });

  test("a re-stated companion fails verification, as does one copied from another passport", () => {
    const ws = workspace();
    const created = create(ws);
    const root = extract(created.outFile);
    const harnessPath = join(root, "harness", "harness.json");
    const harness = JSON.parse(readFileSync(harnessPath, "utf8")) as { tools: unknown };
    harness.tools = { names: ["bash"], actionClasses: ["EXECUTE"], mcpServers: [], catalogDigest: "a".repeat(64) };
    writeFileSync(harnessPath, `${JSON.stringify(harness)}\n`);
    const restated = join(roots[roots.length - 1]!, "restated.amcpass");
    tarCreateDeterministic(join(root, ".."), restated);
    const verdict = verifyPassportArtifactFile({ file: restated, workspace: ws, trust: workspaceSelfTrust(ws) });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.map((row) => row.code)).toContain("HARNESS_SIGNATURE_INVALID");
    expect(verdict.harness).toBeUndefined();

    // A genuine companion of another passport: its signature verifies, its binding does not.
    const other = create(ws);
    const otherRoot = extract(other.outFile);
    for (const name of ["harness.json", "harness.sig"]) writeFileSync(join(root, "harness", name), readFileSync(join(otherRoot, "harness", name)));
    const swapped = join(roots[roots.length - 1]!, "swapped.amcpass");
    tarCreateDeterministic(join(root, ".."), swapped);
    const swappedVerdict = verifyPassportArtifactFile({ file: swapped, workspace: ws, trust: workspaceSelfTrust(ws) });
    expect(swappedVerdict.errors.map((row) => row.code)).toContain("HARNESS_BINDING_MISMATCH");
  });
});
