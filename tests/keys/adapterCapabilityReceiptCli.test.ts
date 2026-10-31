import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { adaptersConfigureCli, adaptersInitCli } from "../../src/adapters/adapterCli.js";
import { verifyAdapterCapabilityReceipt } from "../../src/passport/adapterCapabilityReceipt.js";
import { getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { lockVault } from "../../src/vault/vault.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-adapter-receipt-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
test.skipIf(process.platform === "win32")("real adapters capabilities CLI awaits checked signing and writes the existing independently verifiable receipt", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-async-adapter-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  adaptersInitCli(workspace);
  adaptersConfigureCli({ workspace, agentId: "default", adapterId: "generic-cli", route: "/openai", model: "owned", mode: "SUPERVISE" });
  const pub = getSigningPublicKeyPem(workspace, "artifact-seal"), bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "sh"), "#!" + process.execPath + "\nprocess.stdout.write('owned sh 1.2.3\\n');\n", { mode: 0o755 });
  const actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, signer = pathToFileURL(resolve("dist/crypto/signing/signer.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href;
  const wrapper = join(root, "actual-file-provider.mjs"), denyBridge = join(root, "deny-bridge.mjs"), denyHttp = join(root, "deny-sync-http.mjs");
  const loader = join(root, "loader.mjs"), requests = join(root, "requests.jsonl"), output = join(root, "receipt.json"); writeFileSync(requests, "");
  writeFileSync(wrapper, `import { appendFileSync } from "node:fs";
import { fileKeyProvider as actual } from ${JSON.stringify(actual)};
export function fileKeyProvider(workspace) { const provider = actual(workspace); return { ...provider, async sign(ref, bytes) {
  const signature = await provider.sign(ref, bytes);
  appendFileSync(process.env.P208_ADAPTER_RECEIPT_REQUESTS, JSON.stringify({ref,size:bytes.length})+"\\n"); return signature;
} }; }
`);
  writeFileSync(denyBridge, 'export function callProviderSync() { throw new Error("owned adapter CLI denies synchronous provider bridge invocation"); }\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(denyHttp, `import { spawnSync as actual } from "node:child_process";
export function spawnSync(...args) { const argv=args[1]; if(Array.isArray(argv)&&argv[0]==="-e"&&typeof argv[1]==="string"&&argv[1].includes("const params = JSON.parse(process.argv[1])")) throw new Error("owned adapter CLI denies synchronous notary HTTP bridge"); return actual(...args); }
`);
  writeFileSync(loader, `import { pathToFileURL } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix))) throw new Error("owned adapter CLI denies every real SDK/native import");
  if(context.parentURL===${JSON.stringify(signer)}&&specifier==="node:child_process") return {url:${JSON.stringify(pathToFileURL(denyHttp).href)},shortCircuit:true};
  const found=await nextResolve(specifier,context);
  if(found.url===${JSON.stringify(bridge)}) return {url:${JSON.stringify(pathToFileURL(denyBridge).href)},shortCircuit:true};
  if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actual)}) return {url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};
  return found;
}
`);
  const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_ADAPTER_RECEIPT_REQUESTS: requests };
  const child = spawnOwnedNode([resolve("dist/cli.js"), "adapters", "capabilities", "--agent", "default", "--adapter", "generic-cli", "--out", output, "--json"],
    { cwd: workspace, env });
  const result = await child.wait(30_000); // wait drains pipes and always awaits bounded owned process-group closure.
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
  const receipt = JSON.parse(readFileSync(output, "utf8")); expect(JSON.parse(result.stdout)).toEqual(receipt);
  expect(receipt.inspection.runtime).toEqual({ status: "detected", command: "sh", version: "1.2.3" });
  expect(verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys: [pub] })).toEqual({ valid: true, reasons: [] });
  expect(verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys: [] }).valid).toBe(false);
  const calls = readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(calls).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, size: 32 }]);
}, 60_000);
