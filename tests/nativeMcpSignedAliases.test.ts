import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { loadNativeMcpConfiguration, requireReviewedNativeMcpGrants } from "../src/setup/nativeMcpConfig.js";
import { prepareFileSignatureWithAuditor } from "../src/org/orgSigner.js";

const folders: string[] = [];
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), "amc-signed-mcp-alias-")); folders.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const tools = loadToolsConfig(workspace);
  initToolsConfig(workspace, { ...tools, tools: { ...tools.tools, allowedTools: [
    { name: "tool_search", actionClass: "READ_ONLY" }, { name: nativeMcpToolName("fixture", "lookup"), actionClass: "READ_ONLY" }
  ] } });
  const path = join(workspace, "mcp.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, server: { id: "fixture", command: process.execPath },
    expectedCatalogDigest: "a".repeat(64), grants: [{ name: "lookup", actionClass: "READ_ONLY", alias: "mcp_fixture_lookup" }] }));
  return { workspace, path, review: () => requireReviewedNativeMcpGrants(loadNativeMcpConfiguration(path), workspace, "READ_ONLY") };
}
async function sign(workspace: string, path: string) {
  const signature = await prepareFileSignatureWithAuditor(workspace, path, readFileSync(path), "BUNDLE");
  signature.assertCurrent(); writeFileSync(`${path}.sig`, signature.signatureBytes);
}

test("operator aliases require the config's authentic BUNDLE signature over exact bytes", async () => {
  const f = fixture();
  expect(f.review).toThrow(/alias.*signature/i);
  writeFileSync(`${f.path}.sig`, JSON.stringify({ digestSha256: loadNativeMcpConfiguration(f.path).sha256, signature: "forged", signedTs: Date.now(), signer: "auditor" }));
  expect(f.review).toThrow(/alias.*signature/i);
  await sign(f.workspace, f.path);
  expect(f.review().grants[0]!.alias).toBe("mcp_fixture_lookup");
  writeFileSync(f.path, readFileSync(f.path, "utf8").replace("mcp_fixture_lookup", "mcp_changed_lookup"));
  expect(f.review).toThrow(/alias.*signature/i);
});

test("an alias config signed by another workspace is refused", async () => {
  const f = fixture(), other = fixture();
  await sign(other.workspace, f.path);
  expect(f.review).toThrow(/alias.*signature/i);
});

test("alias signature files must be bounded regular files", async () => {
  const f = fixture();
  writeFileSync(`${f.path}.sig`, "x".repeat(256 * 1024 + 1));
  expect(f.review).toThrow(/alias.*signature/i);
  rmSync(`${f.path}.sig`);
  const { mkdirSync } = await import("node:fs"); mkdirSync(`${f.path}.sig`);
  expect(f.review).toThrow(/alias.*signature/i);
});

test("a loaded alias config cannot be changed after its signed bytes were read", async () => {
  const f = fixture(); await sign(f.workspace, f.path);
  const loaded = loadNativeMcpConfiguration(f.path);
  expect(() => { (loaded.config.grants![0]! as { alias?: string }).alias = "forged_after_read"; }).toThrow();
  expect(requireReviewedNativeMcpGrants(loaded, f.workspace, "READ_ONLY").grants[0]!.alias).toBe("mcp_fixture_lookup");
  expect(() => requireReviewedNativeMcpGrants({ ...loaded }, f.workspace, "READ_ONLY")).toThrow(/alias.*signature/i);
});
