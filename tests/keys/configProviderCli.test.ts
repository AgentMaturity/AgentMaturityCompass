// Requires root's normal build. These are real dist/cli.js commands, with only the AWS SDK transport replaced.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace, loadAMCConfig } from "../../src/workspace.js";
import { verifyAmcConfigSignature } from "../../src/config/amcConfigSignature.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, fakeKey, publicPem } from "./providerFakes.js";
import { createWorkOrder, listWorkOrders, verifyWorkOrder } from "../../src/workorders/workorderEngine.js";
import { verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { outcomeContractPath, verifyOutcomeContractSignature } from "../../src/outcomes/outcomeContractEngine.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { getActiveOverrides as getActiveGovernorOverrides, verifyOverrideEntry } from "../../src/governor/emergencyOverride.js";
import { getActiveOverrides as getActiveCanaryOverrides, generatePolicyCanaryReport } from "../../src/governor/policyCanary.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { verifyPluginWorkspace } from "../../src/plugins/pluginApi.js";

const roots: Array<{ root: string; workspace: string }> = [], PASS = "config-main-cli-passphrase";
afterEach(() => { for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });

test("real keys rotate, config, ticket, outcome, work-order, governor, canary and plugin commands await actual purpose-provider signatures", () => {
  const root = mkdtempSync(join(tmpdir(), "amc-config-main-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const workOrder = createWorkOrder({ workspace, agentId: "default", title: "CLI ticket approval", description: "Actual previously approved work order",
    riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] });
  const key = fakeKey("p256"), id = AWS_ARN("actual-cli-" + root.split("/").at(-1)), configPath = join(workspace, ".amc", "amc.config.yaml");
  const config = YAML.parse(readFileSync(configPath, "utf8")); config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  const candidate = join(root, "candidate.yaml"), material = join(root, "transport-key.json"), requests = join(root, "requests.jsonl");
  writeFileSync(candidate, YAML.stringify(config));
  writeFileSync(material, JSON.stringify({ id, kind: "p256", publicKeyPem: publicPem(key),
    privateKeyPem: key.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }), { mode: 0o600 });
  const actual = pathToFileURL(resolve("dist/keys/providers/awsKms.js")).href;
  const replacement = join(root, "provider-boundary.mjs"), loader = join(root, "provider-loader.mjs");
  writeFileSync(replacement, `import { readFileSync, appendFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { awsKmsProvider as actual } from ${JSON.stringify(actual)};
const material = JSON.parse(readFileSync(process.env.P208_CONFIG_TRANSPORT_KEY, "utf8"));
const privateKey = createPrivateKey(material.privateKeyPem), publicKey = createPublicKey(material.publicKeyPem);
export function awsKmsProvider() { return actual(async (operation, input) => {
  appendFileSync(process.env.P208_CONFIG_REQUESTS, JSON.stringify({operation, keyId: input.KeyId}) + "\\n");
  if (input.KeyId !== material.id) throw new Error("owned config CLI key mismatch");
  if (operation === "GetPublicKey") return {KeyId: input.KeyId, PublicKey: publicKey.export({format:"der",type:"spki"}), KeyUsage:"SIGN_VERIFY", KeySpec:"ECC_NIST_P256", SigningAlgorithms:["ECDSA_SHA_256"]};
  if (operation === "DescribeKey") return {KeyMetadata:{KeyId:input.KeyId,KeyState:"Enabled",Origin:"AWS_KMS"}};
  if (operation === "Sign") return {Signature:sign("sha256",input.Message,privateKey)};
  throw new Error("owned config CLI operation unsupported");
}); }
`);
  writeFileSync(loader, `import { pathToFileURL } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) {
    throw new Error("owned CLI witness refuses every real SDK/native import");
  }
  const found = await nextResolve(specifier, context);
  if (context.parentURL === ${JSON.stringify(pathToFileURL(resolve("dist/keys/purposeProviders.js")).href)} && found.url === ${JSON.stringify(actual)}) {
    return {url: pathToFileURL(process.env.P208_CONFIG_PROVIDER_BOUNDARY).href, shortCircuit: true};
  }
  return found;
}
`);
  const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-loader", loader, resolve("dist/cli.js"), ...args],
    { cwd: workspace, env: { ...process.env, NO_COLOR: "1", P208_CONFIG_TRANSPORT_KEY: material,
      P208_CONFIG_REQUESTS: requests, P208_CONFIG_PROVIDER_BOUNDARY: replacement }, encoding: "utf8", timeout: 30_000 });
  const bind = run("keys", "rotate", "--purpose", "config-signature", "--config-candidate", candidate);
  expect(bind.error).toBeUndefined(); expect(bind.signal).toBeNull(); expect(bind.status, bind.stderr).toBe(0);
  expect(boundProviderKey(workspace, "config-signature")!.binding.id).toBe(id); expect(verifyAmcConfigSignature(workspace).valid).toBe(true);
  const signed = run("verify", "--sign-config");
  expect(signed.error).toBeUndefined(); expect(signed.signal).toBeNull(); expect(signed.status, signed.stderr).toBe(0); expect(signed.stdout).toContain("Signed amc.config.yaml:");
  let record = JSON.parse(readFileSync(configPath + ".sig", "utf8"));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(record.configSha256, "hex"), publicPem(key), Buffer.from(record.signature, "base64"))).toBe(true);
  const profile = run("config", "profile", "ci");
  expect(profile.error).toBeUndefined(); expect(profile.signal).toBeNull(); expect(profile.status, profile.stderr).toBe(0);
  expect(loadAMCConfig(workspace).profile).toBe("ci"); expect(verifyAmcConfigSignature(workspace).valid).toBe(true);
  record = JSON.parse(readFileSync(configPath + ".sig", "utf8"));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(record.configSha256, "hex"), publicPem(key), Buffer.from(record.signature, "base64"))).toBe(true);
  // First bind: next-key PoP + next-key P1-08 signature. The old-key config/statement endorsements are local.
  // Two config commands and the actual ticket command each ask the provider to sign exactly once.
  const ticket = run("ticket", "issue", "--workorder", workOrder.workOrder.workOrderId, "--action", "WRITE_HIGH", "--tool", "fs.write");
  expect(ticket.error).toBeUndefined(); expect(ticket.signal).toBeNull(); expect(ticket.status, ticket.stderr).toBe(0);
  const raw = ticket.stdout.trim(); expect(raw.split(".")).toHaveLength(2);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(raw.split(".")[0]!, "base64url"), publicPem(key), Buffer.from(raw.split(".")[1]!, "base64url"))).toBe(true);
  expect(verifyExecTicket({ workspace, ticket: raw, expectedWorkOrderId: workOrder.workOrder.workOrderId, expectedToolName: "fs.write" }).ok).toBe(true);
  const outcome = run("outcomes", "init", "--agent", "default");
  expect(outcome.error).toBeUndefined(); expect(outcome.signal).toBeNull(); expect(outcome.status, outcome.stderr).toBe(0);
  expect(outcome.stdout).toContain("Outcome contract created:"); expect(verifyOutcomeContractSignature(workspace, "default").valid).toBe(true);
  const outcomeSignature = JSON.parse(readFileSync(outcomeContractPath(workspace, "default") + ".sig", "utf8"));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(outcomeSignature.digestSha256, "hex"), publicPem(key), Buffer.from(outcomeSignature.signature, "base64"))).toBe(true);
  const ledger = openLedger(workspace);
  try { expect(ledger.listOutcomeContracts("default").at(-1)?.signer_fpr).toBe(signingKeyId(publicPem(key))!.slice(0, 16)); }
  finally { ledger.close(); }
  const create = run("workorder", "create", "--title", "Post-provider CLI work order", "--description", "Owned compiled runtime request", "--risk", "low", "--mode", "execute", "--allow", "WRITE_HIGH");
  expect(create.error).toBeUndefined(); expect(create.signal).toBeNull(); expect(create.status, create.stderr).toBe(0);
  const created = listWorkOrders({ workspace, agentId: "default" }).find(row => row.title === "Post-provider CLI work order")!; expect(created).toBeDefined();
  const admitted = verifyWorkOrder({ workspace, workOrderId: created.workOrderId }); expect(admitted).toMatchObject({ valid: true, expired: false });
  const workOrderSignature = JSON.parse(readFileSync(admitted.sigPath, "utf8"));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(workOrderSignature.digestSha256, "hex"), publicPem(key), Buffer.from(workOrderSignature.signature, "base64"))).toBe(true);
  const followup = run("ticket", "issue", "--workorder", created.workOrderId, "--action", "WRITE_HIGH");
  expect(followup.error).toBeUndefined(); expect(followup.signal).toBeNull(); expect(followup.status, followup.stderr).toBe(0);
  expect(verifyExecTicket({ workspace, ticket: followup.stdout.trim(), expectedWorkOrderId: created.workOrderId }).ok).toBe(true);
  const expiry = run("workorder", "expire", created.workOrderId, "--reason", "Actual owner runtime expiry");
  expect(expiry.error).toBeUndefined(); expect(expiry.signal).toBeNull(); expect(expiry.status, expiry.stderr).toBe(0);
  expect(verifyWorkOrder({ workspace, workOrderId: created.workOrderId })).toMatchObject({ valid: true, expired: true });
  const revocation = JSON.parse(readFileSync(admitted.path.replace(/\.json$/, ".revocation.json") + ".sig", "utf8"));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(revocation.digestSha256, "hex"), publicPem(key), Buffer.from(revocation.signature, "base64"))).toBe(true);
  expect(verifyExecTicket({ workspace, ticket: followup.stdout.trim() }).ok).toBe(false);
  const override = run("governor-override", "--agent", "default", "--reason", "Actual owner runtime incident bypass", "--ttl", "1h", "--mode", "dry-run");
  expect(override.error).toBeUndefined(); expect(override.signal).toBeNull(); expect(override.status, override.stderr).toBe(0);
  const active = getActiveGovernorOverrides(workspace, "default"); expect(active).toHaveLength(1); expect(verifyOverrideEntry(workspace, active[0]!)).toEqual({ valid: true });
  const domain = Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]), Buffer.from(active[0]!.override_hash, "hex")]);
  expect(verifyCanonical("ecdsa-p256-sha256", domain, publicPem(key), Buffer.from(active[0]!.signature, "base64"))).toBe(true);
  const canary = run("emergency-override", "--agent", "default", "--reason", "Actual canary runtime recovery", "--action", "allow DEPLOY during incident response", "--ttl", "3600000");
  expect(canary.error).toBeUndefined(); expect(canary.signal).toBeNull(); expect(canary.status, canary.stderr).toBe(0);
  const canaryActive = getActiveCanaryOverrides("default", workspace); expect(canaryActive).toHaveLength(1);
  const { overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs } = canaryActive[0]!;
  const canaryDomain = Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]), Buffer.from(sha256Hex(canonicalize({ overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs })), "hex")]);
  expect(verifyCanonical("ecdsa-p256-sha256", canaryDomain, publicPem(key), Buffer.from(canaryActive[0]!.signature, "base64"))).toBe(true);
  const savedCanary = JSON.parse(readFileSync(join(workspace, ".amc", "governor", "emergency-overrides", `${overrideId}.json`), "utf8"));
  expect(savedCanary.override_signature).toBe(canaryActive[0]!.signature); expect(savedCanary.signature).not.toBe("unsigned");
  expect(verifyCanonical("ed25519", Buffer.from(savedCanary.record_hash, "hex"), getSigningPublicKeyPem(workspace, "artifact-seal"), Buffer.from(savedCanary.signature, "base64"))).toBe(true);
  expect(generatePolicyCanaryReport("default", workspace)).toMatchObject({ activeOverrides: 1, invalidOverrides: 0 });
  const plugins = run("plugin", "init");
  expect(plugins.error).toBeUndefined(); expect(plugins.signal).toBeNull(); expect(plugins.status, plugins.stderr).toBe(0);
  expect(plugins.stdout).toContain("Plugin workspace initialized"); expect(verifyPluginWorkspace({ workspace }).ok).toBe(true);
  const installedPath = join(workspace, ".amc", "plugins", "installed.lock.json"), installed = JSON.parse(readFileSync(installedPath + ".sig", "utf8"));
  expect(installed.digestSha256).toBe(sha256Hex(readFileSync(installedPath))); expect(installed.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", signer: { type: "VAULT" } });
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(installed.digestSha256, "hex"), publicPem(key), Buffer.from(installed.signature, "base64"))).toBe(true);
  expect(readFileSync(requests, "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(row => row.operation === "Sign").length).toBe(12);
}, 120_000);
