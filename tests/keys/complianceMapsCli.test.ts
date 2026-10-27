// Actual compiled CLI and package-root SDK. Requires root's normal build; no SDK/cloud/native provider import.
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { verifyComplianceMapsSignature } from "../../src/compliance/complianceEngine.js";
import { lockVault } from "../../src/vault/vault.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const roots: Array<{ root: string; workspace: string }> = [], PASS = "maps-compiled-owner-passphrase";
afterEach(() => { for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-maps-compiled-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  // The child's process.cwd() is the real path (macOS tmpdir is under the /var -> /private/var symlink).
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); return { root, workspace, path: join(realpathSync(workspace), ".amc", "compliance-maps.yaml") };
}
test.skipIf(process.platform === "win32")("actual maintained compliance init command awaits a real file provider and reports its published paths", async () => {
  const f = fixture(), child = spawnOwnedNode([resolve("dist/cli.js"), "compliance", "init"], { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1" } });
  try {
    const result = await child.wait(30_000); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Compliance maps created: ${f.path}`); expect(result.stdout).toContain(`Signature: ${f.path}.sig`);
    expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
  } finally { await child.stop(); }
  const before = { body: readFileSync(f.path), sidecar: readFileSync(f.path + ".sig") };
  const refused = spawnOwnedNode([resolve("dist/cli.js"), "compliance", "init"], { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1", AMC_NO_SIGN: "1" } });
  try {
    const result = await refused.wait(30_000); expect(result.signal).toBeNull(); expect(result.code).not.toBe(0); expect(result.stdout).not.toContain("Compliance maps created:");
    expect({ body: readFileSync(f.path), sidecar: readFileSync(f.path + ".sig") }).toEqual(before);
  } finally { await refused.stop(); }
});
test.skipIf(process.platform === "win32")("actual package-root SDK exports and awaits both new compliance maps producers", async () => {
  const f = fixture(), index = pathToFileURL(resolve("dist/index.js")).href;
  const child = spawnOwnedNode(["--input-type=module", "-e", `
    import { initComplianceMapsAsync, initComplianceMapsCliAsync, verifyComplianceMapsSignature } from ${JSON.stringify(index)};
    const a = await initComplianceMapsAsync(process.cwd());
    const b = await initComplianceMapsCliAsync(process.cwd());
    console.log(JSON.stringify({a,b,valid:verifyComplianceMapsSignature(process.cwd()).valid}));
  `], { cwd: f.workspace, env: process.env });
  try {
    const result = await child.wait(30_000); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ a: { path: f.path, sigPath: f.path + ".sig" }, b: { path: f.path, sigPath: f.path + ".sig" }, valid: true });
    expect(existsSync(f.path + ".sig")).toBe(true);
  } finally { await child.stop(); }
});
