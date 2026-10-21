import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { resetCanaryRegisters } from "../../src/governor/canaryRegisters.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-rollback-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  resetCanaryRegisters(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-rollback-pack-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  resetCanaryRegisters(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const cli = pathToFileURL(resolve("dist/cli.js")).href, actualCanary = pathToFileURL(resolve("dist/governor/policyCanary.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, actualFile = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href, wrapper = join(root, "canary.mjs"), fileWrapper = join(root, "file.mjs");
  const deny = join(root, "bridge.mjs"), loader = join(root, "loader.mjs"), requests = join(root, "requests.jsonl"), bin = join(root, "bin"); mkdirSync(bin); writeFileSync(requests, "");
  writeFileSync(wrapper, `export * from ${JSON.stringify(actualCanary)};\nexport function createRollbackPack(){throw new Error("owned rollback CLI denies sync producer");}\n`);
  writeFileSync(fileWrapper, `import{appendFileSync}from"node:fs";import{fileKeyProvider as actual}from${JSON.stringify(actualFile)};\nexport function fileKeyProvider(workspace){const provider=actual(workspace);return{...provider,async sign(ref,bytes){const signature=await provider.sign(ref,bytes);appendFileSync(process.env.P208_ROLLBACK_REQUESTS,JSON.stringify({ref,hex:Buffer.from(bytes).toString("hex"),signature:signature.toString("base64")})+"\\n");return signature;}};}\n`);
  writeFileSync(deny, 'export function callProviderSync(){throw new Error("owned rollback CLI denies provider bridge invocation");}\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier,context,nextResolve){\nif(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned rollback CLI denies SDK/native imports");\nconst found=await nextResolve(specifier,context);\nif(found.url===${JSON.stringify(bridge)})return{url:${JSON.stringify(pathToFileURL(deny).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(cli)}&&found.url===${JSON.stringify(actualCanary)})return{url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actualFile)})return{url:${JSON.stringify(pathToFileURL(fileWrapper).href)},shortCircuit:true};\nreturn found;}\n`);
  const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_ROLLBACK_REQUESTS: requests };
  return { root, workspace, wrapper, env, requests };
}
async function exercise(policyFile: boolean) {
  const f = fixture(), policy = "# keep exact policy content\npolicy: { rules: [] }\n", reason = "owned pre-deploy snapshot";
  const control = spawnOwnedNode(["--input-type=module", "-e", `import{createRollbackPack}from${JSON.stringify(pathToFileURL(f.wrapper).href)};createRollbackPack();`], { cwd: f.workspace, env: f.env });
  const denied = await control.wait(30_000); expect(denied.code).not.toBe(0); expect(denied.stderr).toContain("denies sync producer");
  if (policyFile) writeFileSync(join(f.workspace, "amc-policy.yml"), policy);
  const child = spawnOwnedNode([resolve("dist/cli.js"), "rollback-create", "--reason", reason], { cwd: f.workspace, env: f.env }), out = await child.wait(30_000);
  expect(out.signal).toBeNull(); expect(out.error).toBeUndefined(); expect(out.code, out.stderr).toBe(0);
  const id = /Rollback pack created: (rbp_[^\s]+)/.exec(out.stdout)?.[1]; expect(id).toBeDefined();
  const record = JSON.parse(readFileSync(join(f.workspace, ".amc", "governor", "rollback-packs", id! + ".json"), "utf8"));
  const content = policyFile ? policy : "{}", body = { packId: id, agentId: "default", policyFileSha256: sha256Hex(content), reason, createdTs: record.createdTs };
  const seen: Array<{ ref: { provider: string; id: string }; hex: string; signature: string }> = readFileSync(f.requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(seen).toHaveLength(2); const digest = sha256Hex(canonicalize(body)), pack = { ...body, policyContent: content, signature: seen[0]!.signature };
  const hash = sha256Hex(canonicalize({ ...pack, prev_record_hash: "GENESIS_ROLLBACK_PACKS" })), pem = getSigningPublicKeyPem(f.workspace, "artifact-seal");
  expect(seen.map(({ ref, hex }) => ({ ref, hex }))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: digest }, { ref: { provider: "file", id: "artifact-seal" }, hex: hash }]);
  expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(seen[0]!.signature, "base64"))).toBe(true);
  expect(verify(null, Buffer.from(hash, "hex"), pem, Buffer.from(seen[1]!.signature, "base64"))).toBe(true);
  expect(record).toEqual({ ...pack, prev_record_hash: "GENESIS_ROLLBACK_PACKS", record_hash: hash, signature: seen[1]!.signature, storedTs: record.createdTs });
  expect(out.stdout).toContain(`Policy SHA256: ${body.policyFileSha256.slice(0, 16)}`);
}

test.skipIf(process.platform === "win32")("actual rollback-create CLI awaits both checked signatures and preserves policy-file bytes", async () => { await exercise(true); }, 60_000);
test.skipIf(process.platform === "win32")("actual rollback-create CLI retains its missing-policy-file fallback while using both checked signatures", async () => { await exercise(false); }, 60_000);
