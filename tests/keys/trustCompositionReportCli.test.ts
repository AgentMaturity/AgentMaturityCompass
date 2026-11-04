import { verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initTrustComposition, renderTrustCompositionMarkdown } from "../../src/fleet/trustComposition.js";
import { getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { lockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-trust-report-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture(fail: boolean) {
  const root = mkdtempSync(join(tmpdir(), "amc-trust-report-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initTrustComposition(workspace);
  const publicKey = getSigningPublicKeyPem(workspace, "artifact-seal"), inputFile = join(root, "precomputed-diagnostic-input.json");
  // Only the upstream INPUT is fixed. The actual CLI, composition math, checked signer and both output writes run.
  writeFileSync(inputFile, JSON.stringify({ agentId: "default", runId: "owned_precomputed_diagnostic_input", ts: 1, windowStartTs: 0, windowEndTs: 1,
    status: "UNSIGNED", verificationPassed: false, trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: 0,
    trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS", targetProfileId: null, layerScores: [], questionScores: [], inflationAttempts: [],
    unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 0, invalidReceiptsCount: 0,
    correlationWarnings: ["owned precomputed diagnostic INPUT; no diagnostic qualification"], evidenceCoverage: 0,
    evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 }, targetDiff: [], prioritizedUpgradeActions: [],
    evidenceToCollectNext: [], runSealSig: "unsigned", reportJsonSha256: "" }));
  const actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const providerModule = pathToFileURL(resolve("dist/keys/provider.js")).href, runner = pathToFileURL(resolve("dist/diagnostic/runner.js")).href;
  const cli = pathToFileURL(resolve("dist/cli.js")).href, bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href;
  const wrapper = join(root, "actual-file-provider.mjs"), inputModule = join(root, "owned-diagnostic-input.mjs"), denyBridge = join(root, "deny-bridge.mjs");
  const loader = join(root, "loader.mjs"), requests = join(root, "requests.jsonl"); writeFileSync(requests, "");
  writeFileSync(wrapper, `import { appendFileSync } from "node:fs";
import { fileKeyProvider as actual } from ${JSON.stringify(actual)};
import { KeyProviderError } from ${JSON.stringify(providerModule)};
export function fileKeyProvider(workspace) { const provider = actual(workspace); return { ...provider, async sign(ref, bytes) {
  appendFileSync(process.env.P208_TRUST_REQUESTS, JSON.stringify({ref,size:bytes.length})+"\\n");
  if(process.env.P208_TRUST_FAIL==="1") throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE","file","owned fixed CLI failure");
  return await provider.sign(ref, bytes);
} }; }
`);
  writeFileSync(inputModule, `export * from ${JSON.stringify(runner)};
import { readFileSync, appendFileSync } from "node:fs";
export async function runDiagnostic(options) {
  const input=JSON.parse(readFileSync(process.env.P208_TRUST_INPUT,"utf8"));
  if(options.agentId!==input.agentId) throw new Error("owned diagnostic INPUT agent mismatch");
  appendFileSync(process.env.P208_TRUST_INPUT_READS, JSON.stringify({agentId:options.agentId})+"\\n"); return input;
}
`);
  writeFileSync(denyBridge, 'export function callProviderSync() { throw new Error("owned trust CLI denies synchronous provider bridge invocation"); }\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier, context, nextResolve) {
  if(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix))) throw new Error("owned trust CLI denies every real SDK/native import");
  const found=await nextResolve(specifier,context);
  if(found.url===${JSON.stringify(bridge)}) return {url:${JSON.stringify(pathToFileURL(denyBridge).href)},shortCircuit:true};
  if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actual)}) return {url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};
  if(context.parentURL===${JSON.stringify(cli)}&&found.url===${JSON.stringify(runner)}) return {url:${JSON.stringify(pathToFileURL(inputModule).href)},shortCircuit:true};
  return found;
}
`);
  const reads = join(root, "input-reads.jsonl"); writeFileSync(reads, "");
  return { root, workspace, publicKey, requests, reads, env: { ...process.env, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href,
    P208_TRUST_REQUESTS: requests, P208_TRUST_INPUT: inputFile, P208_TRUST_INPUT_READS: reads, P208_TRUST_FAIL: fail ? "1" : "0" } };
}

describe.skipIf(process.platform === "win32")("actual trust-report CLI with an owned precomputed diagnostic INPUT", () => {
  test("awaits the real file provider and publishes the existing independently verifiable report and Markdown", async () => {
    const f = fixture(false), child = spawnOwnedNode([resolve("dist/cli.js"), "fleet", "trust-report", "--output", "trust.md"], { cwd: f.workspace, env: f.env });
    const result = await child.wait(30_000); // Existing owned helper awaits bounded group termination and drains both pipes.
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
    const path = result.stdout.match(/Trust composition report \(JSON\): (.+)/)?.[1]?.trim(); expect(path).toBeTruthy();
    const report = JSON.parse(readFileSync(path!, "utf8")), { reportJsonSha256, reportSealSig, ...body } = report;
    const digest = sha256Hex(Buffer.from(canonicalize(body), "utf8")); expect(reportJsonSha256).toBe(digest);
    expect(verify(null, Buffer.from(digest, "hex"), f.publicKey, Buffer.from(reportSealSig, "base64"))).toBe(true);
    expect(readFileSync(join(f.workspace, "trust.md"), "utf8")).toBe(renderTrustCompositionMarkdown(report));
    expect(readFileSync(f.requests, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, size: 32 }]);
    expect(readFileSync(f.reads, "utf8").trim()).toBe(JSON.stringify({ agentId: "default" }));
    expect(report.agentResults[0].ownIntegrityIndex).toBe(0); expect(result.stdout).not.toContain("HIGH TRUST");
  }, 60_000);

  test("propagates real provider-boundary failure instead of publishing an unsigned CLI success", async () => {
    const f = fixture(true), child = spawnOwnedNode([resolve("dist/cli.js"), "fleet", "trust-report", "--output", "trust.md"], { cwd: f.workspace, env: f.env });
    const result = await child.wait(30_000); expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("KEY_PROVIDER_UNAVAILABLE"); expect(existsSync(join(f.workspace, "trust.md"))).toBe(false);
    const reports = join(f.workspace, ".amc", "reports");
    expect(existsSync(reports) ? readdirSync(reports).filter(name => name.startsWith("trust-composition-")) : []).toEqual([]);
    expect(readFileSync(f.requests, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, size: 32 }]);
    expect(readFileSync(f.reads, "utf8").trim()).toBe(JSON.stringify({ agentId: "default" }));
  }, 60_000);
});
