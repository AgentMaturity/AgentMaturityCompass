import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "node:crypto";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../../src/ops/policy.js";
import { listRetentionSegments, verifyPrunedRows } from "../../src/ops/retention/retentionArchive.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-retention-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
    lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-retention-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const policy = loadOpsPolicy(workspace); policy.opsPolicy.maintenance.autoVacuumOnRetention = false;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy)); signOpsPolicy(workspace);
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "retention-cli", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
    ledger.appendEvidence({ id: "retention-cli-event", ts: Date.now() - 20 * 86_400_000, sessionId: "retention-cli", runtime: "unknown",
      eventType: "stdout", payload: "owned CLI payload", inline: false, meta: {} }); ledger.sealSession("retention-cli");
  } finally { ledger.close(); }
  const cli = pathToFileURL(resolve("dist/cli.js")).href, actualCli = pathToFileURL(resolve("dist/ops/retention/retentionCli.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, actualFile = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href, wrapper = join(root, "retention.mjs"), fileWrapper = join(root, "file.mjs");
  const deny = join(root, "bridge.mjs"), loader = join(root, "loader.mjs"), requests = join(root, "requests.jsonl"), bin = join(root, "bin");
  mkdirSync(bin); writeFileSync(requests, "");
  writeFileSync(wrapper, `export * from ${JSON.stringify(actualCli)};\nexport function retentionRunCli() { throw new Error("owned retention CLI denies legacy sync producer"); }\n`);
  writeFileSync(fileWrapper, `import {appendFileSync} from "node:fs";import {fileKeyProvider as actual} from ${JSON.stringify(actualFile)};\nexport function fileKeyProvider(workspace){const provider=actual(workspace);return {...provider,async sign(ref,bytes){const signature=await provider.sign(ref,bytes);appendFileSync(process.env.P208_RETENTION_REQUESTS,JSON.stringify({ref,size:bytes.length})+"\\n");return signature;}};}\n`);
  writeFileSync(deny, 'export function callProviderSync(){throw new Error("owned retention CLI denies provider bridge invocation");}\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier,context,nextResolve){\nif(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned retention CLI denies real SDK/native imports");\nconst found=await nextResolve(specifier,context);\nif(found.url===${JSON.stringify(bridge)})return {url:${JSON.stringify(pathToFileURL(deny).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(cli)}&&found.url===${JSON.stringify(actualCli)})return {url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actualFile)})return {url:${JSON.stringify(pathToFileURL(fileWrapper).href)},shortCircuit:true};return found;}\n`);
  const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_RETENTION_REQUESTS: requests };
  return { root, workspace, wrapper, requests, env };
}
test.skipIf(process.platform === "win32")("actual retention run CLI awaits raw file-provider signatures and persists independently valid archive and prune proofs", async () => {
  const f = fixture();
  const control = spawnOwnedNode(["--input-type=module", "-e", `import {retentionRunCli} from ${JSON.stringify(pathToFileURL(f.wrapper).href)};retentionRunCli();`], { cwd: f.workspace, env: f.env });
  const denied = await control.wait(30_000); expect(denied.code).not.toBe(0); expect(denied.stderr).toContain("denies legacy sync producer");
  const child = spawnOwnedNode([resolve("dist/cli.js"), "retention", "run"], { cwd: f.workspace, env: f.env });
  const actual = await child.wait(60_000); expect(actual.signal).toBeNull(); expect(actual.error).toBeUndefined(); expect(actual.code, actual.stderr).toBe(0);
  const result = JSON.parse(actual.stdout); expect(result).toMatchObject({ dryRun: false, archivedEventCount: 1, prunedEventCount: 1, prunedBlobCount: 1 });
  const [segment] = listRetentionSegments(f.workspace); expect(segment).toBeDefined();
  const manifest = readFileSync(segment!.manifestPath), sidecar = JSON.parse(readFileSync(segment!.sigPath, "utf8"));
  expect(sidecar.digestSha256).toBe(sha256Hex(manifest)); expect(Object.keys(sidecar)).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
  expect(verify(null, Buffer.from(sidecar.digestSha256, "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(sidecar.signature, "base64"))).toBe(true);
  expect(verifyPrunedRows(f.workspace).ok).toBe(true);
  expect(readFileSync(f.requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)))
    .toEqual(expect.arrayContaining([{ ref: { provider: "file", id: "artifact-seal" }, size: 32 }]));
}, 90_000);

test.skipIf(process.platform === "win32")("actual retention dry-run CLI uses the async caller while retaining its real audit and no archive effect", async () => {
  const f = fixture(), child = spawnOwnedNode([resolve("dist/cli.js"), "retention", "run", "--dry-run"], { cwd: f.workspace, env: f.env });
  const actual = await child.wait(60_000); expect(actual.signal).toBeNull(); expect(actual.error).toBeUndefined(); expect(actual.code, actual.stderr).toBe(0);
  expect(JSON.parse(actual.stdout)).toMatchObject({ dryRun: true, archivedEventCount: 1, prunedEventCount: 1, segmentPath: null, manifestPath: null });
  expect(listRetentionSegments(f.workspace)).toEqual([]);
  const ledger = openLedger(f.workspace, { readonly: true });
  try {
    expect(ledger.getAllEvents().find(row => row.id === "retention-cli-event")?.payload_pruned).toBe(0);
    expect(ledger.getAllEvents().some(row => JSON.parse(row.meta_json).auditType === "RETENTION_DRY_RUN")).toBe(true);
  } finally { ledger.close(); }
  expect(readFileSync(f.requests, "utf8")).toBe("");
}, 90_000);
