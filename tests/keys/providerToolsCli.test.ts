// Requires the root-owned normal build. Only the actual SDK transport edge is replaced.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { toolsConfigPath, toolsConfigSigPath, verifyToolsConfigSignature } from "../../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, fakeKey, publicPem } from "./providerFakes.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const roots: Array<{ root: string; workspace: string }> = [], PASS = "actual-tools-cli-owner-passphrase";
afterEach(() => { for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });

test.skipIf(process.platform === "win32")("real tools init/sign/verify CLI awaits the bound provider and preserves reviewed grants", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-tools-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const key = fakeKey("p256"), id = AWS_ARN(basename(root)), pub = publicPem(key);
  const config = YAML.parse(readFileSync(join(workspace, ".amc", "amc.config.yaml"), "utf8"));
  config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  const candidate = join(root, "candidate.yaml"), material = join(root, "transport-key.json"), requests = join(root, "requests.jsonl");
  writeFileSync(candidate, YAML.stringify(config)); writeFileSync(requests, "");
  writeFileSync(material, JSON.stringify({ id, publicKeyPem: pub, privateKeyPem: key.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }), { mode: 0o600 });
  const actual = pathToFileURL(resolve("dist/keys/providers/awsKms.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href;
  const replacement = join(root, "provider-boundary.mjs"), denyBridge = join(root, "deny-sync-bridge.mjs"), loader = join(root, "provider-loader.mjs");
  writeFileSync(denyBridge, 'export function callProviderSync() { throw new Error("owned tools CLI refuses synchronous provider bridge invocation"); }\nexport const answerBridgeRequest = callProviderSync;\n');
  writeFileSync(replacement, `import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { awsKmsProvider as actual } from ${JSON.stringify(actual)};
const material = JSON.parse(readFileSync(process.env.P208_TOOLS_TRANSPORT_KEY, "utf8"));
const privateKey = createPrivateKey(material.privateKeyPem), publicKey = createPublicKey(material.publicKeyPem);
export function awsKmsProvider() { return actual(async (operation, input) => {
  if (existsSync(join(process.cwd(), ".amc", ".tools-config.lock"))) throw new Error("actual tools provider signing ran under the publication lock");
  appendFileSync(process.env.P208_TOOLS_REQUESTS, JSON.stringify({operation, keyId: input.KeyId, size: input.Message?.length}) + "\\n");
  if (input.KeyId !== material.id) throw new Error("owned tools CLI key mismatch");
  if (operation === "GetPublicKey") return {KeyId:input.KeyId,PublicKey:publicKey.export({format:"der",type:"spki"}),KeyUsage:"SIGN_VERIFY",KeySpec:"ECC_NIST_P256",SigningAlgorithms:["ECDSA_SHA_256"]};
  if (operation === "DescribeKey") return {KeyMetadata:{KeyId:input.KeyId,KeyState:"Enabled",Origin:"AWS_KMS"}};
  if (operation === "Sign") return {Signature:sign("sha256",input.Message,privateKey)};
  throw new Error("owned tools CLI operation unsupported");
}); }
`);
  writeFileSync(loader, `import { pathToFileURL } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) throw new Error("owned tools CLI refuses every real SDK/native import");
  const found = await nextResolve(specifier, context);
  if (found.url === ${JSON.stringify(bridge)}) return {url:${JSON.stringify(pathToFileURL(denyBridge).href)},shortCircuit:true};
  if (context.parentURL === ${JSON.stringify(purpose)} && found.url === ${JSON.stringify(actual)}) return {url:pathToFileURL(process.env.P208_TOOLS_PROVIDER_BOUNDARY).href,shortCircuit:true};
  return found;
}
`);
  const env = { ...process.env, NO_COLOR: "1", NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loader).href}`,
    P208_TOOLS_TRANSPORT_KEY: material, P208_TOOLS_REQUESTS: requests, P208_TOOLS_PROVIDER_BOUNDARY: replacement };
  const denied = await spawnOwnedNode(["--input-type=module", "--eval", `import { callProviderSync } from ${JSON.stringify(bridge)}; callProviderSync();`], { cwd: workspace, env }).wait(10_000);
  expect(denied.code).toBe(1); expect(denied.stderr).toContain("owned tools CLI refuses synchronous provider bridge invocation"); expect(readFileSync(requests, "utf8")).toBe("");
  const run = async (...args: string[]) => {
    // The loader also protects any accidental synchronous grandchild. Owned process-group close is awaited.
    const owned = spawnOwnedNode([resolve("dist/cli.js"), ...args], { cwd: workspace, env }), result = await owned.wait(30_000);
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0); return result;
  };
  const calls = () => readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.operation === "Sign");
  const assertPair = () => {
    const bytes = readFileSync(toolsConfigPath(workspace)), sidecar = JSON.parse(readFileSync(toolsConfigSigPath(workspace), "utf8"));
    expect(Object.keys(sidecar).sort()).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
    expect(sidecar.digestSha256).toBe(sha256Hex(bytes));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.digestSha256, "hex"), pub, Buffer.from(sidecar.signature, "base64"))).toBe(true);
    expect(verifyToolsConfigSignature(workspace).valid).toBe(true);
  };
  await run("keys", "rotate", "--purpose", "config-signature", "--config-candidate", candidate);
  expect(boundProviderKey(workspace, "config-signature")!.binding.id).toBe(id);
  let before = calls().length;
  await run("tools", "init"); assertPair(); expect(calls().length).toBe(before + 1);
  const reviewed = Buffer.from("# exact reviewed tools bytes\n" + readFileSync(toolsConfigPath(workspace), "utf8")); writeFileSync(toolsConfigPath(workspace), reviewed);
  before = calls().length;
  expect(JSON.parse((await run("tools", "sign", "--json")).stdout)).toMatchObject({ ok: true }); assertPair(); expect(calls().length).toBe(before + 1);
  expect(readFileSync(toolsConfigPath(workspace))).toEqual(reviewed);
  expect((await run("tools", "verify")).stdout).toContain("Tools config signature valid:");
  expect(calls().slice(-2).every(row => row.keyId === id && row.size === 32)).toBe(true);
}, 120_000);
