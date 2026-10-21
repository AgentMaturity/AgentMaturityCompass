import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { submitFPReport, resetFPTrackerState } from "../../src/assurance/falsePositiveTracker.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-fp-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  resetFPTrackerState(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-workspace-record-cli-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  resetFPTrackerState(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const cli = pathToFileURL(resolve("dist/cli.js")).href, actualFp = pathToFileURL(resolve("dist/assurance/falsePositiveTracker.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, actualFile = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href, wrapper = join(root, "fp.mjs"), fileWrapper = join(root, "file.mjs");
  const deny = join(root, "bridge.mjs"), loader = join(root, "loader.mjs"), requests = join(root, "requests.jsonl"), bin = join(root, "bin"); mkdirSync(bin); writeFileSync(requests, "");
  writeFileSync(wrapper, `export * from ${JSON.stringify(actualFp)};\nexport function submitFPReport(){throw new Error("owned FP CLI denies sync submit");}\nexport function resolveFPReport(){throw new Error("owned FP CLI denies sync resolve");}\n`);
  writeFileSync(fileWrapper, `import{appendFileSync}from"node:fs";import{fileKeyProvider as actual}from${JSON.stringify(actualFile)};\nexport function fileKeyProvider(workspace){const provider=actual(workspace);return{...provider,async sign(ref,bytes){const signature=await provider.sign(ref,bytes);appendFileSync(process.env.P208_FP_REQUESTS,JSON.stringify({ref,hex:Buffer.from(bytes).toString("hex")})+"\\n");return signature;}};}\n`);
  writeFileSync(deny, 'export function callProviderSync(){throw new Error("owned FP CLI denies provider bridge invocation");}\nexport const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier,context,nextResolve){\nif(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned FP CLI denies SDK/native imports");\nconst found=await nextResolve(specifier,context);\nif(found.url===${JSON.stringify(bridge)})return{url:${JSON.stringify(pathToFileURL(deny).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(cli)}&&found.url===${JSON.stringify(actualFp)})return{url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};\nif(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actualFile)})return{url:${JSON.stringify(pathToFileURL(fileWrapper).href)},shortCircuit:true};\nreturn found;}\n`);
  const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_FP_REQUESTS: requests };
  const run = async (args: string[]) => {
    const child = spawnOwnedNode([resolve("dist/cli.js"), ...args], { cwd: workspace, env }), result = await child.wait(30_000);
    expect(result.signal).toBeNull(); expect(result.error).toBeUndefined(); expect(result.code, result.stderr).toBe(0); return result;
  };
  const read = (id: string) => JSON.parse(readFileSync(join(workspace, ".amc", "assurance", "false-positives", id + ".json"), "utf8"));
  const signed = (record: Record<string, unknown>, body: Record<string, unknown>, parent: string) => {
    const digest = sha256Hex(canonicalize({ ...body, prev_record_hash: parent }));
    expect(record.prev_record_hash).toBe(parent); expect(record.record_hash).toBe(digest);
    expect(verify(null, Buffer.from(digest, "hex"), getSigningPublicKeyPem(workspace, "artifact-seal"), Buffer.from(String(record.signature), "base64"))).toBe(true);
    expect(readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: digest }]);
  };
  return { root, workspace, run, read, signed, wrapper, env };
}

test.skipIf(process.platform === "win32")("actual fp-submit CLI awaits the file signer and preserves the existing durable report wire", async () => {
  const f = fixture(), control = spawnOwnedNode(["--input-type=module", "-e", `import{submitFPReport}from${JSON.stringify(pathToFileURL(f.wrapper).href)};submitFPReport();`], { cwd: f.workspace, env: f.env });
  const denied = await control.wait(30_000); expect(denied.code).not.toBe(0); expect(denied.stderr).toContain("denies sync submit");
  const out = await f.run(["fp-submit", "--scenario", "owned-scenario", "--pack", "owned-pack", "--run", "owned-run", "--justification", "owned CLI reason", "--reporter", "owned CLI reporter"]);
  const id = /FP report submitted: (fp_[^\s]+)/.exec(out.stdout)?.[1]; expect(id).toBeDefined(); const record = f.read(id!);
  const body = { reportId: id, scenarioId: "owned-scenario", packId: "owned-pack", assuranceRunId: "owned-run", response: "", justification: "owned CLI reason", reportedBy: "owned CLI reporter", ts: record.ts, status: "open" };
  f.signed(record, body, "GENESIS_FALSE_POSITIVES"); expect(Object.keys(record)).toEqual([...Object.keys(body), "prev_record_hash", "record_hash", "signature", "storedTs"]); expect(record.storedTs).toBe(record.ts);
}, 60_000);

test.skipIf(process.platform === "win32")("actual fp-resolve CLI awaits real signing over the durable old-envelope replacement preimage", async () => {
  const f = fixture(), report = submitFPReport({ scenarioId: "owned-scenario", packId: "owned-pack", assuranceRunId: "owned-run", response: "", justification: "owned original", reportedBy: "owned reporter" }, f.workspace);
  const original = f.read(report.reportId); resetFPTrackerState();
  const control = spawnOwnedNode(["--input-type=module", "-e", `import{resolveFPReport}from${JSON.stringify(pathToFileURL(f.wrapper).href)};resolveFPReport();`], { cwd: f.workspace, env: f.env });
  const denied = await control.wait(30_000); expect(denied.code).not.toBe(0); expect(denied.stderr).toContain("denies sync resolve");
  const out = await f.run(["fp-resolve", "--id", report.reportId, "--status", "confirmed", "--reason", "owned durable resolution"]);
  expect(out.stdout).toContain(`Report ${report.reportId} resolved as confirmed.`); const record = f.read(report.reportId);
  f.signed(record, { ...original, status: "confirmed", resolution: "owned durable resolution" }, original.record_hash);
  expect(record.status).toBe("confirmed"); expect(record.resolution).toBe("owned durable resolution"); expect(record.signature).not.toBe("unsigned");
}, 60_000);
