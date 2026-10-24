import { verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../../src/storage/sqlitePool.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const PASS = "owned-repair-cli-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => { closeAllSqlitePools(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-repair-cli-"))), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "control-checkpoints")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); const ledger = openLedger(workspace);
  try { ledger.startSession({ sessionId: "cli-repair", runtime: "unknown", binaryPath: "owned", binarySha256: "0".repeat(64) });
    ledger.appendEvidence({ sessionId: "cli-repair", runtime: "unknown", eventType: "stdout", payload: "owned CLI original blob", inline: false }); ledger.sealSession("cli-repair");
  } finally { ledger.close(); closeAllSqlitePools(); }
  const blob = join(workspace, ".amc", "blobs", readdirSync(join(workspace, ".amc", "blobs")).find(name => name.endsWith(".blob"))!);
  const bytes = readFileSync(blob); bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1; writeFileSync(blob, bytes);
  const cli = pathToFileURL(resolve("dist/cli.js")).href, caller = pathToFileURL(resolve("dist/cli-verify-repair.js")).href;
  const signer = pathToFileURL(resolve("dist/crypto/signing/signer.js")).href, file = pathToFileURL(resolve("dist/keys/providers/file.js")).href;
  const purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href, bridge = pathToFileURL(resolve("dist/keys/providerBridge.js")).href;
  const wrapper = join(root, "signer.mjs"), provider = join(root, "file.mjs"), deny = join(root, "bridge.mjs"), loader = join(root, "loader.mjs"), calls = join(root, "calls.jsonl"), bin = join(root, "bin"); mkdirSync(bin); writeFileSync(calls, "");
  writeFileSync(wrapper, `export * from ${JSON.stringify(signer)};export function signDigestWithPolicy(){throw new Error("owned repair CLI denies sync signer");}\n`);
  writeFileSync(provider, `import {appendFileSync} from "node:fs";import {fileKeyProvider as real} from ${JSON.stringify(file)};export function fileKeyProvider(workspace){const p=real(workspace);return {...p,async sign(ref,bytes){const signature=await p.sign(ref,bytes);appendFileSync(process.env.P208_REPAIR_CALLS,JSON.stringify({ref,bytes:Buffer.from(bytes).toString("hex")})+"\\n");return signature;}};}\n`);
  writeFileSync(deny, 'export function callProviderSync(){throw new Error("owned repair CLI denies sync bridge");}export const answerBridgeRequest=callProviderSync;\n');
  writeFileSync(loader, `export async function resolve(specifier,context,next){if(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix)))throw new Error("owned repair CLI denies SDK/native imports");const found=await next(specifier,context);if(found.url===${JSON.stringify(bridge)})return {url:${JSON.stringify(pathToFileURL(deny).href)},shortCircuit:true};if(context.parentURL===${JSON.stringify(caller)}&&found.url===${JSON.stringify(signer)})return {url:${JSON.stringify(pathToFileURL(wrapper).href)},shortCircuit:true};if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(file)})return {url:${JSON.stringify(pathToFileURL(provider).href)},shortCircuit:true};return found;}\n`);
  const run = (args: string[], failReceipt = false, malformedAfterMove = false) => {
    const env = { ...process.env, PATH: bin, NO_COLOR: "1", NODE_OPTIONS: "--experimental-loader=" + pathToFileURL(loader).href, P208_REPAIR_CALLS: calls };
    const boot = `import fs from "node:fs";import {syncBuiltinESMExports} from "node:module";if(${failReceipt}){const rename=fs.renameSync;fs.renameSync=(from,to)=>{if(String(to).endsWith("/repair-receipt.json"))throw new Error("HOST_SECRET_SENTINEL "+to);return rename(from,to);};syncBuiltinESMExports();}if(${malformedAfterMove}){const rename=fs.renameSync;let armed=true;fs.renameSync=(from,to)=>{const result=rename(from,to);if(armed&&String(to).includes("/quarantine/")&&!String(from).includes("/quarantine/")&&!String(from).endsWith(".tmp")){armed=false;fs.writeFileSync(".amc/session-store.json",JSON.stringify({backend:"owned-invalid"}));}return result;};syncBuiltinESMExports();}process.argv=[process.execPath,${JSON.stringify(resolve("dist/cli.js"))},...${JSON.stringify(args)}];await import(${JSON.stringify(cli)});`;
    return spawnOwnedNode(["--input-type=module", "-e", boot], { cwd: workspace, env }).wait(60_000);
  };
  return { root, workspace, run, calls };
}
test.skipIf(process.platform === "win32")("actual verify --repair --apply --yes awaits both real signatures and archives under the original signed receipt wire", async () => {
  const f = fixture(), result = await f.run(["verify", "--repair", "--apply", "--yes"]); expect(result.code, result.stdout + result.stderr).toBe(0); expect(result.signal).toBeNull(); expect(result.error).toBeUndefined();
  expect(result.stdout).toContain("signed as REPAIR_RECEIPT"); const ids = readdirSync(join(f.workspace, ".amc", "quarantine")); expect(ids).toHaveLength(1);
  const dir = join(f.workspace, ".amc", "quarantine", ids[0]!), planBytes = readFileSync(join(dir, "repair-plan.json")), bytes = readFileSync(join(dir, "repair-receipt.json"));
  const receipt = JSON.parse(bytes.toString()), signed = JSON.parse(readFileSync(join(dir, "repair-receipt.json.sig"), "utf8")), digest = sha256Hex(bytes);
  expect(signed.digestSha256).toBe(digest); expect(verify(null, Buffer.from(digest, "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(readFileSync(f.calls, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([
    { ref: { provider: "file", id: "artifact-seal" }, bytes: sha256Hex(planBytes) }, { ref: { provider: "file", id: "artifact-seal" }, bytes: digest }]);
  for (const row of receipt.moved) { expect(existsSync(join(f.workspace, row.from))).toBe(false); expect(sha256Hex(readFileSync(join(f.workspace, row.to)))).toBe(row.sha256); }
}, 90_000);
test.skipIf(process.platform === "win32")("actual CLI post-move marker refusal reports retained partial evidence without a false no-moves diagnostic", async () => {
  const f = fixture(), result = await f.run(["verify", "--repair", "--apply", "--yes"], false, true);
  expect(result.code, result.stdout + result.stderr).toBe(2); expect(result.signal).toBeNull(); expect(result.error).toBeUndefined();
  expect(result.stdout).toContain("Repair aborted: repair publication is incomplete"); expect(result.stdout).toContain("(moved-bytes)");
  expect(result.stdout).toContain("holds a repair plan but no receipt"); expect(result.stdout).not.toContain("no evidence was moved"); expect(result.stdout).not.toContain("Nothing has been changed");
  const ids = readdirSync(join(f.workspace, ".amc", "quarantine")); expect(ids).toHaveLength(1); const dir = join(f.workspace, ".amc", "quarantine", ids[0]!);
  const plan = JSON.parse(readFileSync(join(dir, "repair-plan.json"), "utf8")) as { files: Array<{ path: string; sha256: string }> };
  for (const row of plan.files) { expect(existsSync(join(f.workspace, row.path))).toBe(false); expect(sha256Hex(readFileSync(join(dir, row.path.slice(".amc/".length))))).toBe(row.sha256); }
  expect(existsSync(join(dir, "repair-receipt.json.sig"))).toBe(false); expect(existsSync(join(dir, "repair-receipt.json"))).toBe(false);
  expect(readFileSync(f.calls, "utf8").trim().split("\n").filter(Boolean)).toHaveLength(2);
}, 90_000);
test.skipIf(process.platform === "win32").each([{ label: "plan-only", args: ["verify", "--repair"] }, { label: "no-confirmation", args: ["verify", "--repair", "--apply"] }])("actual unconfirmed diagnostic path $label has no Sign and moves nothing", async ({ args }) => {
  const f = fixture(), original = readFileSync(join(f.workspace, ".amc", "evidence.sqlite")), result = await f.run(args);
  expect(result.code).toBe(args.includes("--apply") ? 2 : 1); expect(readFileSync(f.calls, "utf8")).toBe(""); expect(readFileSync(join(f.workspace, ".amc", "evidence.sqlite"))).toEqual(original); expect(existsSync(join(f.workspace, ".amc", "quarantine"))).toBe(false);
}, 90_000);
test.skipIf(process.platform === "win32")("actual CLI receipt-write failure reports retained partial evidence without false Nothing changed or native host text", async () => {
  const f = fixture(), result = await f.run(["verify", "--repair", "--apply", "--yes"], true);
  expect(result.code, result.stdout + result.stderr).toBe(2); expect(result.stdout).toContain("Repair aborted: repair publication is incomplete"); expect(result.stdout).toContain("holds a repair plan but no receipt");
  expect(result.stdout).not.toContain("Nothing has been changed"); expect(result.stdout).not.toContain("HOST_SECRET_SENTINEL");
  const abort = result.stdout.split("\n").find(line => line.includes("Repair aborted:"))!; expect(abort).not.toContain(f.root); expect(existsSync(join(f.workspace, ".amc", "evidence.sqlite"))).toBe(false);
  const ids = readdirSync(join(f.workspace, ".amc", "quarantine")); expect(ids).toHaveLength(1); const dir = join(f.workspace, ".amc", "quarantine", ids[0]!);
  expect(existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(existsSync(join(dir, "repair-receipt.json.sig"))).toBe(true); expect(existsSync(join(dir, "repair-receipt.json"))).toBe(false);
  expect(readFileSync(f.calls, "utf8").trim().split("\n").filter(Boolean)).toHaveLength(2);
}, 90_000);
